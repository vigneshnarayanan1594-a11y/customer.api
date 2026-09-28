'use strict';

// Task 1.1 worker thread: parse → normalise → bulk upsert, off the API's event loop.
// Keep this file's import graph decorator-free: in dev and tests Node loads it without Babel.

const { parentPort, workerData } = require('node:worker_threads');
const mongoose = require('mongoose');
const { MODEL_DEFINITIONS } = require('../../../common/schemas/model-definitions');
const { readRows } = require('../import/read-rows');
const { importRows } = require('../import/import-rows');

async function run() {
  const { filePath, ext, mongoUri, dbName, batchSize } = workerData;
  let connection;
  try {
    // A worker thread is a separate V8 isolate: it can't share the main thread's connection.
    connection = await mongoose.createConnection(mongoUri, { dbName, maxPoolSize: 5, autoIndex: false }).asPromise();
  } catch (err) {
    parentPort.postMessage({ type: 'failed', error: { status: 503, message: 'Database unavailable', detail: err.message } });
    return;
  }

  try {
    const models = Object.fromEntries(MODEL_DEFINITIONS.map(({ name, schema }) => [name, connection.model(name, schema)]));
    const summary = await importRows(readRows(filePath, ext), {
      models,
      batchSize,
      onProgress: (rows) => parentPort.postMessage({ type: 'progress', rows }),
    });
    parentPort.postMessage({ type: 'done', summary });
  } catch (err) {
    // Malformed CSV (csv-parse CSV_* errors) is the client's problem, not a server failure.
    const isCsvError = String(err.code ?? '').startsWith('CSV_');
    const status = err.status ?? (isCsvError ? 422 : 500);
    const message = isCsvError ? `Could not parse the CSV file: ${err.message}` : err.message;
    parentPort.postMessage({
      type: 'failed',
      error: { status, message: status < 500 ? message : 'Import failed', detail: err.message },
    });
  } finally {
    await connection.close();
  }
}

run();
