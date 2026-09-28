'use strict';

const { BadRequestException, HttpException, NotFoundException } = require('@nestjs/common');
const { loadConfig } = require('../../src/config/configuration');
const { toErrorEnvelope } = require('../../src/common/filters/error-envelope');

describe('loadConfig', () => {
  const base = { MONGO_URI: 'mongodb://127.0.0.1:27017' };

  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.mongo).toEqual({ uri: 'mongodb://127.0.0.1:27017', dbName: 'customer', autoIndex: true });
    expect(config.port).toBe(3000);
    expect(config.cluster).toEqual({ enabled: true, workers: 1 });
    expect(config.cpu).toEqual({ sampleMs: 1000, thresholdPct: 70, sustainSamples: 3, heartbeatTimeoutMs: 5000, warmupMs: 10000 });
    expect(config.scheduler.timezone).toBe('Asia/Kolkata');
    expect(config.corsOrigins).toEqual([]);
    expect(config.debugRoutes).toBe(false);
  });

  it('coerces env strings', () => {
    const config = loadConfig({ ...base, PORT: '4000', CLUSTER_ENABLED: 'false', CORS_ORIGINS: 'https://a.test, https://b.test' });
    expect(config.port).toBe(4000);
    expect(config.cluster.enabled).toBe(false);
    expect(config.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('fails fast on missing or invalid values', () => {
    expect(() => loadConfig({})).toThrow('"MONGO_URI" is required');
    expect(() => loadConfig({ MONGO_URI: 'http://x' })).toThrow('MONGO_URI must start with mongodb://');
    expect(() => loadConfig({ ...base, APP_TIMEZONE: 'Mars/Base' })).toThrow('APP_TIMEZONE must be a valid IANA time zone');
    expect(() => loadConfig({ ...base, MONGO_DB_NAME: 'bad/name' })).toThrow('MONGO_DB_NAME must be a valid MongoDB database name');
    expect(() => loadConfig({ ...base, CPU_SUSTAIN_SAMPLES: '0' })).toThrow('CPU_SUSTAIN_SAMPLES');
  });

  it('returns a frozen object', () => {
    const config = loadConfig(base);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.cpu)).toBe(true);
  });
});

describe('toErrorEnvelope', () => {
  it('keeps HttpException status and message', () => {
    expect(toErrorEnvelope(new NotFoundException('Scheduled message not found'))).toEqual({
      status: 'failed', code: 404, msg: 'Scheduled message not found', data: {},
    });
  });

  it('joins validation messages and returns them as details', () => {
    const exception = new BadRequestException(['day is required', 'time is required']);
    expect(toErrorEnvelope(exception)).toEqual({
      status: 'failed', code: 400, msg: 'day is required; time is required', data: { details: ['day is required', 'time is required'] },
    });
  });

  it('passes through Fastify 4xx errors', () => {
    const error = Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    expect(toErrorEnvelope(error)).toMatchObject({ code: 413, msg: 'Request body is too large' });
  });

  it('maps duplicate keys to 409', () => {
    expect(toErrorEnvelope(Object.assign(new Error('E11000'), { code: 11000 }))).toMatchObject({ code: 409 });
  });

  it('hides internal errors', () => {
    expect(toErrorEnvelope(new Error('connection string with password'))).toEqual({
      status: 'failed', code: 500, msg: 'Internal server error', data: {},
    });
    expect(toErrorEnvelope(new HttpException('Too many imports', 429))).toMatchObject({ code: 429 });
  });
});
