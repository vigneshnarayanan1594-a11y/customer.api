'use strict';

// Upsert many documents by their natural key in one round trip and return Map(key → _id) for every
// document in the batch. Decorator-free on purpose: it runs inside the import worker thread.

const keyOf = (doc, keyFields) => keyFields.map((f) => String(doc[f])).join('\u0000');

async function bulkUpsert(Model, docs, keyFields) {
  const byKey = new Map(docs.map((d) => [keyOf(d, keyFields), d]));   // de-dupe inside the batch (last wins)
  if (!byKey.size) return { ids: new Map(), inserted: 0, matched: 0 };

  const ops = [...byKey.values()].map((d) => {
    const filter = Object.fromEntries(keyFields.map((f) => [f, d[f]]));
    const rest = Object.fromEntries(Object.entries(d).filter(([f]) => !keyFields.includes(f)));
    const update = { $setOnInsert: filter };
    if (Object.keys(rest).length) update.$set = rest;
    return { updateOne: { filter, update, upsert: true } };
  });

  let result;
  try {
    result = await Model.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // Two concurrent imports can race to insert the same new key. A second pass matches the
    // document that now exists, so retry once when every write error is a duplicate key.
    const writeErrors = err?.writeErrors ?? [];
    if (!writeErrors.length || !writeErrors.every((e) => e.code === 11000)) throw err;
    result = await Model.bulkWrite(ops, { ordered: false });
  }

  // bulkWrite only reports _ids of *inserted* docs, so read the whole batch back by key.
  const [first] = keyFields;
  const found = await Model.find({ [first]: { $in: [...byKey.values()].map((d) => d[first]) } })
    .select(keyFields.join(' '))
    .lean();
  const ids = new Map(found.map((d) => [keyOf(d, keyFields), d._id]).filter(([k]) => byKey.has(k)));

  return { ids, inserted: result.upsertedCount, matched: result.matchedCount };
}

module.exports = { bulkUpsert, keyOf };
