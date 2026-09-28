'use strict';

const pino = require('pino');

// Structured JSON logs. Every line carries the pid, so a CPU restart is visible as
// "old pid → reason → new pid" in the log stream.
function createLogger({ level = 'info', name = 'customer-api' } = {}) {
  return pino({
    name,
    level,
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

module.exports = { createLogger };
