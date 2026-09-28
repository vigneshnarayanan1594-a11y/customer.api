'use strict';

require('reflect-metadata');
const cluster = require('node:cluster');
const { randomUUID } = require('node:crypto');
const { RequestMethod } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const helmet = require('@fastify/helmet');
const multipart = require('@fastify/multipart');
const { AppModule } = require('./app.module');
const { PinoLoggerService } = require('./common/logger/pino-logger.service');

const API_PREFIX = 'api';
const JSON_BODY_LIMIT = 1024 * 1024;

// Builds the NestJS + Fastify app without listening. Used by bootstrap() and by the e2e tests.
async function createApp(config) {
  const adapter = new FastifyAdapter({
    bodyLimit: JSON_BODY_LIMIT,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    logger: false,
  });
  const app = await NestFactory.create(AppModule.forRoot(config), adapter, { bufferLogs: true });
  const logger = app.get(PinoLoggerService);
  app.useLogger(logger);

  await app.register(helmet);
  await app.register(multipart, { limits: { fileSize: config.upload.maxBytes, files: 1, fields: 10 } });
  // CORS is off unless an allow-list is configured; never '*'.
  if (config.corsOrigins.length) app.enableCors({ origin: config.corsOrigins, methods: ['GET', 'POST'] });

  // Errors Fastify raises before a handler runs (bad JSON, oversized body) are routed by Nest's own
  // Fastify error handler through AllExceptionsFilter, so they get the same envelope.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    done(null, payload);
  });
  fastify.addHook('onResponse', (request, reply, done) => {
    logger.pino.info(
      { reqId: request.id, method: request.method, url: request.url, statusCode: reply.statusCode, ms: Math.round(reply.elapsedTime) },
      'request completed',
    );
    done();
  });

  app.setGlobalPrefix(API_PREFIX, { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  return app;
}

// One shutdown path for every trigger: the supervisor's IPC request, Ctrl+C / SIGTERM, or the
// supervisor disappearing. app.close() stops accepting connections, lets in-flight requests and the
// dispatcher's current tick finish, then closes MongoDB.
function installShutdownHandlers(app, config, logger) {
  let closing = false;
  const shutdown = async (reason) => {
    if (closing) return;
    closing = true;
    logger.log({ msg: 'shutting down', reason }, 'Bootstrap');
    setTimeout(() => process.exit(1), config.restart.shutdownTimeoutMs).unref();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      logger.error({ msg: 'shutdown failed', err }, 'Bootstrap');
      process.exit(1);
    }
  };

  if (cluster.isWorker) {
    process.on('message', (message) => {
      if (message?.type === 'shutdown') shutdown('supervisor request');
    });
    process.on('disconnect', () => shutdown('supervisor gone'));
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function bootstrap(config) {
  const app = await createApp(config);
  const logger = app.get(PinoLoggerService);
  installShutdownHandlers(app, config, logger);
  await app.listen(config.port, config.host);
  logger.log({ msg: 'server listening', host: config.host, port: config.port }, 'Bootstrap');
  return app;
}

module.exports = { createApp, bootstrap, API_PREFIX };
