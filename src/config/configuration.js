'use strict';

const Joi = require('joi');

// The ONLY place that reads process.env. Everything else receives the frozen config object
// (NestJS through AppConfigService, the cluster supervisor and worker threads as a plain value).

const isIanaZone = (value, helpers) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
};

const ms = (def) => Joi.number().integer().min(1).default(def);

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  HOST: Joi.string().default('0.0.0.0'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),

  MONGO_URI: Joi.string().pattern(/^mongodb(\+srv)?:\/\//).required()
    .messages({ 'string.pattern.base': 'MONGO_URI must start with mongodb:// or mongodb+srv://' }),
  // Always the database used, even if MONGO_URI names another one (or none, which would mean "test").
  MONGO_DB_NAME: Joi.string().pattern(/^[^/\\. "$*<>:|?]+$/).max(63).default('customer')
    .messages({ 'string.pattern.base': 'MONGO_DB_NAME must be a valid MongoDB database name' }),
  MONGO_AUTO_INDEX: Joi.boolean().default(true),

  CLUSTER_ENABLED: Joi.boolean().default(true),
  WEB_CONCURRENCY: Joi.number().integer().min(1).max(64).default(1),

  UPLOAD_MAX_BYTES: Joi.number().integer().min(1024).default(10 * 1024 * 1024),
  IMPORT_BATCH_SIZE: Joi.number().integer().min(1).max(10000).default(1000),
  IMPORT_MAX_CONCURRENCY: Joi.number().integer().min(1).max(16).default(2),
  IMPORT_TIMEOUT_MS: ms(120000),

  CPU_SAMPLE_MS: ms(1000),
  CPU_THRESHOLD_PCT: Joi.number().min(1).max(6400).default(70),
  CPU_SUSTAIN_SAMPLES: Joi.number().integer().min(1).default(3),
  CPU_HEARTBEAT_TIMEOUT_MS: ms(5000),
  CPU_WARMUP_MS: Joi.number().integer().min(0).default(10000),
  SHUTDOWN_TIMEOUT_MS: ms(10000),
  RESTART_MAX: Joi.number().integer().min(1).default(5),
  RESTART_WINDOW_MS: ms(60000),

  APP_TIMEZONE: Joi.string().custom(isIanaZone, 'IANA time zone').default('Asia/Kolkata')
    .messages({ 'any.invalid': 'APP_TIMEZONE must be a valid IANA time zone, e.g. Asia/Kolkata' }),
  SCHEDULER_ENABLED: Joi.boolean().default(true),
  SCHEDULER_POLL_MS: ms(1000),
  SCHEDULER_BATCH: Joi.number().integer().min(1).max(1000).default(50),
  SCHEDULER_LOCK_TTL_MS: ms(30000),
  SCHEDULER_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),

  ENABLE_DEBUG_ROUTES: Joi.boolean().default(false),
}).unknown(true);

function loadConfig(env = process.env) {
  const { value: v, error } = schema.validate(env, { abortEarly: false, convert: true });
  if (error) {
    throw new Error(`Invalid configuration: ${error.details.map((d) => d.message).join('; ')}`);
  }

  return deepFreeze({
    env: v.NODE_ENV,
    isProduction: v.NODE_ENV === 'production',
    host: v.HOST,
    port: v.PORT,
    corsOrigins: v.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    logLevel: v.LOG_LEVEL,
    mongo: { uri: v.MONGO_URI, dbName: v.MONGO_DB_NAME, autoIndex: v.MONGO_AUTO_INDEX },
    cluster: { enabled: v.CLUSTER_ENABLED, workers: v.WEB_CONCURRENCY },
    upload: { maxBytes: v.UPLOAD_MAX_BYTES },
    import: { batchSize: v.IMPORT_BATCH_SIZE, maxConcurrency: v.IMPORT_MAX_CONCURRENCY, timeoutMs: v.IMPORT_TIMEOUT_MS },
    cpu: {
      sampleMs: v.CPU_SAMPLE_MS,
      thresholdPct: v.CPU_THRESHOLD_PCT,
      sustainSamples: v.CPU_SUSTAIN_SAMPLES,
      heartbeatTimeoutMs: v.CPU_HEARTBEAT_TIMEOUT_MS,
      warmupMs: v.CPU_WARMUP_MS,
    },
    restart: { max: v.RESTART_MAX, windowMs: v.RESTART_WINDOW_MS, shutdownTimeoutMs: v.SHUTDOWN_TIMEOUT_MS },
    scheduler: {
      enabled: v.SCHEDULER_ENABLED,
      timezone: v.APP_TIMEZONE,
      pollMs: v.SCHEDULER_POLL_MS,
      batch: v.SCHEDULER_BATCH,
      lockTtlMs: v.SCHEDULER_LOCK_TTL_MS,
      maxAttempts: v.SCHEDULER_MAX_ATTEMPTS,
    },
    debugRoutes: v.ENABLE_DEBUG_ROUTES,
  });
}

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(obj);
}

module.exports = { loadConfig };
