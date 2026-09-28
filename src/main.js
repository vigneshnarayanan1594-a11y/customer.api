'use strict';

require('reflect-metadata');
const cluster = require('node:cluster');
const { loadConfig } = require('./config/configuration');
const { createLogger } = require('./common/logger/logger');

// Entry point.
//   CLUSTER_ENABLED=true (default): the primary becomes the CPU supervisor (Task 2.1) and forks the
//   HTTP server; each forked worker runs the NestJS app.
//   CLUSTER_ENABLED=false: a single process runs the app directly (no auto-restart).
let config;
try {
  config = loadConfig();
} catch (err) {
  createLogger().fatal(err.message);
  process.exit(1);
}

if (config.cluster.enabled && cluster.isPrimary) {
  require('./cluster/supervisor').startSupervisor(config);
} else {
  require('./bootstrap')
    .bootstrap(config)
    .catch((err) => {
      createLogger({ level: config.logLevel }).fatal({ err }, 'server failed to start');
      process.exit(1);
    });
}
