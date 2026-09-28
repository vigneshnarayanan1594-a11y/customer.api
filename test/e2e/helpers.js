'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { getConnectionToken } = require('@nestjs/mongoose');
const { loadConfig } = require('../../src/config/configuration');
const { createApp } = require('../../src/bootstrap');

const SAMPLE_CSV = path.join(__dirname, '..', '..', 'data', 'sample.csv');

// A real mongod per test file: mongodb-memory-server by default, or TEST_MONGO_URI.
// Tests always get their own customer_test* database (dropped afterwards), never the real "customer".
async function startDatabase() {
  if (process.env.TEST_MONGO_URI) {
    return { uri: process.env.TEST_MONGO_URI, dbName: `customer_test_${randomUUID().slice(0, 8)}`, stop: async () => {} };
  }
  const server = await MongoMemoryServer.create();
  return { uri: server.getUri(), dbName: 'customer_test', stop: () => server.stop() };
}

async function startTestApp(env = {}) {
  const db = await startDatabase();
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    MONGO_URI: db.uri,
    MONGO_DB_NAME: db.dbName,
    CLUSTER_ENABLED: 'false',
    SCHEDULER_ENABLED: 'false',   // tests drive the dispatcher with explicit ticks
    ...env,
  });
  const app = await createApp(config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const connection = app.get(getConnectionToken());

  return {
    app,
    config,
    connection,
    http: () => request(app.getHttpServer()),
    async close() {
      await connection.dropDatabase().catch(() => {});
      await app.close();
      await db.stop();
    },
  };
}

async function collectionCounts(connection) {
  const names = ['agents', 'lobs', 'carriers', 'users', 'accounts', 'policies'];
  const counts = await Promise.all(names.map((name) => connection.collection(name).countDocuments()));
  return Object.fromEntries(names.map((name, i) => [name, counts[i]]));
}

const excelSerial = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
};

// Builds an XLSX version of a CSV the way Excel would store it: dates as date cells (numeric
// serials with a date format), amounts and plain phone numbers as numbers.
function csvToRealisticXlsx(csvPath, xlsxPath) {
  const rows = parse(fs.readFileSync(csvPath), { columns: true, bom: true });
  const header = Object.keys(rows[0]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows.map((r) => header.map((h) => r[h]))]);
  rows.forEach((row, i) => {
    const cell = (column) => XLSX.utils.encode_cell({ r: i + 1, c: header.indexOf(column) });
    for (const column of ['policy_start_date', 'policy_end_date', 'dob']) {
      sheet[cell(column)] = { t: 'n', v: excelSerial(row[column]), z: 'm/d/yy' };
    }
    for (const column of ['premium_amount', 'policy_mode']) sheet[cell(column)] = { t: 'n', v: Number(row[column]) };
    if (/^\d{10}$/.test(row.phone)) sheet[cell('phone')] = { t: 'n', v: Number(row.phone) };
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  XLSX.writeFile(book, xlsxPath);
  return xlsxPath;
}

const tempFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'customer-api-test-')), name);

module.exports = { SAMPLE_CSV, startTestApp, collectionCounts, csvToRealisticXlsx, tempFile };
