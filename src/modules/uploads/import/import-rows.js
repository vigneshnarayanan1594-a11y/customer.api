'use strict';

const { bulkUpsert, keyOf } = require('../../../common/database/bulk-upsert');
const { ModelName } = require('../../../common/schemas/model-names');
const { missingColumns, normalizeRow } = require('./normalize');

const MAX_REPORTED_ERRORS = 100;

const importError = (status, message) => Object.assign(new Error(message), { status });

function tally(summary, name, { inserted, matched }) {
  const entry = (summary.collections[name] ??= { inserted: 0, matched: 0 });
  entry.inserted += inserted;
  entry.matched += matched;
}

// Reference collections are upserted once per job: the job keeps a name → _id cache.
async function upsertRefs(Model, field, names, cache, summary, label) {
  const fresh = [...new Set(names)].filter((name) => !cache.has(name));
  const result = await bulkUpsert(Model, fresh.map((name) => ({ [field]: name })), [field]);
  for (const [key, id] of result.ids) cache.set(key, id);
  tally(summary, label, result);
}

// One batch, in dependency order: a policy needs the _ids of its user, LOB, carrier and agent.
async function flush(rows, models, refs, summary) {
  await upsertRefs(models[ModelName.Agent], 'name', rows.map((r) => r.agent), refs.agents, summary, 'agents');
  await upsertRefs(models[ModelName.Lob], 'categoryName', rows.map((r) => r.lob), refs.lobs, summary, 'lobs');
  await upsertRefs(models[ModelName.Carrier], 'companyName', rows.map((r) => r.carrier), refs.carriers, summary, 'carriers');

  const userKey = ['firstName', 'email'];
  const users = await bulkUpsert(models[ModelName.User], rows.map((r) => r.user), userKey);
  tally(summary, 'users', users);
  const userIdOf = (row) => users.ids.get(keyOf(row.user, userKey));

  const [accounts, policies] = await Promise.all([
    bulkUpsert(
      models[ModelName.Account],
      rows.map((r) => ({ ...r.account, userId: userIdOf(r) })),
      ['userId', 'accountName'],
    ),
    bulkUpsert(
      models[ModelName.Policy],
      rows.map((r) => ({
        ...r.policy,
        userId: userIdOf(r),
        agentId: refs.agents.get(r.agent),
        policyCategoryId: refs.lobs.get(r.lob),
        companyId: refs.carriers.get(r.carrier),
      })),
      ['policyNumber'],
    ),
  ]);
  tally(summary, 'accounts', accounts);
  tally(summary, 'policies', policies);
  summary.rowsImported += rows.length;
}

async function importRows(records, { models, batchSize = 1000, onProgress = () => {} }) {
  const summary = { rowsRead: 0, rowsImported: 0, rowsSkipped: 0, collections: {}, errors: [] };
  const refs = { agents: new Map(), lobs: new Map(), carriers: new Map() };
  let batch = [];

  for await (const record of records) {
    if (summary.rowsRead === 0) {
      const missing = missingColumns(Object.keys(record));
      if (missing.length) throw importError(400, `Missing required columns: ${missing.join(', ')}`);
    }
    summary.rowsRead += 1;

    const { value, error } = normalizeRow(record, summary.rowsRead + 1);   // the header is row 1
    if (error) {
      summary.rowsSkipped += 1;
      if (summary.errors.length < MAX_REPORTED_ERRORS) summary.errors.push(error);
      continue;
    }

    batch.push(value);
    if (batch.length >= batchSize) {
      await flush(batch, models, refs, summary);
      batch = [];
      onProgress(summary.rowsRead);
    }
  }
  if (batch.length) await flush(batch, models, refs, summary);

  if (summary.rowsRead === 0) throw importError(422, 'The file has no data rows');
  if (summary.rowsImported === 0) throw importError(422, 'No valid rows in file');
  return summary;
}

module.exports = { importRows };
