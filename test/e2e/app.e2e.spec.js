'use strict';

const { startTestApp } = require('./helpers');

describe('Application shell', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await startTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('GET /health reports the process and database state inside the success envelope', async () => {
    const res = await ctx.http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'success', code: 200, msg: 'ok' });
    expect(res.body.data).toMatchObject({ pid: process.pid, db: 'up' });
  });

  it('sets security headers and echoes a request id', async () => {
    const res = await ctx.http().get('/health').set('x-request-id', 'test-request-1').expect(200);
    expect(res.headers['x-request-id']).toBe('test-request-1');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('wraps unknown routes and malformed JSON in the failure envelope', async () => {
    expect((await ctx.http().get('/api/nope').expect(404)).body).toEqual({ status: 'failed', code: 404, msg: 'Cannot GET /api/nope', data: {} });
    const res = await ctx.http().post('/api/messages/schedule').set('content-type', 'application/json').send('{bad').expect(400);
    expect(res.body).toMatchObject({ status: 'failed', code: 400 });
  });

  it('hides the debug routes unless ENABLE_DEBUG_ROUTES=true', async () => {
    await ctx.http().post('/api/debug/cpu-burn').send({}).expect(404);
  });
});

describe('Debug routes enabled', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await startTestApp({ ENABLE_DEBUG_ROUTES: 'true' });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('validates the burn request', async () => {
    const res = await ctx.http().post('/api/debug/cpu-burn').send({ seconds: 600, mode: 'forever' }).expect(400);
    expect(res.body.data.details).toEqual(['seconds must not be greater than 60', 'mode must be one of the following values: yield, block']);
  });

  it('accepts a burn with 202', async () => {
    const res = await ctx.http().post('/api/debug/cpu-burn').send({ seconds: 1, mode: 'yield' }).expect(202);
    expect(res.body).toMatchObject({ status: 'success', code: 202, data: { pid: process.pid, seconds: 1, mode: 'yield' } });
    await new Promise((resolve) => setTimeout(resolve, 1500));   // let the 1 s burn finish
  });
});
