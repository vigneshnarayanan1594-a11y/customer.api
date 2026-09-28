'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { Dependencies, HttpException, HttpStatus, Injectable, Logger } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');

const WORKER_FILE = path.join(__dirname, 'workers', 'import.worker.js');

// Task 1.1: every upload is parsed and written by its own worker thread, so the CPU-heavy parsing
// never blocks the API's event loop. Awaiting the worker is non-blocking: other requests keep flowing.
@Injectable()
@Dependencies(AppConfigService)
class UploadsService {
  constructor(config) {
    this.config = config;
    this.running = 0;
    this.logger = new Logger(UploadsService.name);
  }

  async importFile({ path: filePath, originalName, ext }) {
    const startedAt = Date.now();
    try {
      const summary = await this.runImportWorker({ filePath, ext });
      const durationMs = Date.now() - startedAt;
      this.logger.log({ msg: 'import finished', file: originalName, durationMs, rowsImported: summary.rowsImported, rowsSkipped: summary.rowsSkipped });
      return { resp_msg: 'Import completed', file: originalName, durationMs, ...summary };
    } finally {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }

  runImportWorker({ filePath, ext }) {
    const { maxConcurrency, timeoutMs, batchSize } = this.config.import;
    if (this.running >= maxConcurrency) {
      return Promise.reject(new HttpException('Too many imports in progress, retry shortly', HttpStatus.TOO_MANY_REQUESTS));
    }
    this.running += 1;

    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_FILE, {
        workerData: { filePath, ext, mongoUri: this.config.mongo.uri, dbName: this.config.mongo.dbName, batchSize },
        execArgv: [],                                        // config travels in workerData, not flags
        resourceLimits: { maxOldGenerationSizeMb: 512 },     // a runaway import can't take the API down
      });

      let settled = false;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        worker.terminate();
      }, timeoutMs);
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.running -= 1;
        fn(value);
      };

      worker.on('message', (message) => {
        if (message.type === 'progress') {
          this.logger.debug({ msg: 'import progress', rows: message.rows });
        } else if (message.type === 'done') {
          settle(resolve, message.summary);
        } else if (message.type === 'failed') {
          const { status, message: text, detail } = message.error;
          if (status >= 500) this.logger.error({ msg: 'import worker failed', detail });
          settle(reject, new HttpException(text, status));
        }
      });
      worker.on('error', (err) => {                          // uncaught exception inside the worker
        this.logger.error({ msg: 'import worker crashed', err });
        settle(reject, new HttpException('Import failed', HttpStatus.INTERNAL_SERVER_ERROR));
      });
      worker.on('exit', (code) => {
        settle(reject, new HttpException(timedOut ? 'Import timed out' : `Import worker exited with code ${code}`, HttpStatus.INTERNAL_SERVER_ERROR));
      });
    });
  }
}

module.exports = { UploadsService };
