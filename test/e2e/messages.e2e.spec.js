'use strict';

const { Types } = require('mongoose');
const { DateTime } = require('luxon');
const { startTestApp } = require('./helpers');
const { AppConfigService } = require('../../src/config/app-config.service');
const { MessageDispatcherService } = require('../../src/modules/messages/message-dispatcher.service');
const { ScheduledMessageRepository } = require('../../src/common/database/repositories/scheduled-message.repository');
const { MessageRepository } = require('../../src/common/database/repositories/message.repository');

describe('Scheduled messages — Task 2.2', () => {
  let ctx;
  let dispatcher;
  beforeAll(async () => {
    ctx = await startTestApp();
    dispatcher = ctx.app.get(MessageDispatcherService);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const schedule = (body) => ctx.http().post('/api/messages/schedule').send(body);
  const jobs = () => ctx.connection.collection('scheduled_messages');
  const messages = () => ctx.connection.collection('messages');

  describe('POST /api/messages/schedule', () => {
    it('stores the job with the UTC instant of day + time in the requested zone', async () => {
      const res = await schedule({ message: 'Policy renewal reminder', day: '2099-01-01', time: '10:00', timezone: 'Asia/Kolkata' }).expect(201);
      expect(res.body).toMatchObject({ status: 'success', code: 201, msg: 'Message scheduled' });
      expect(res.body.data).toMatchObject({
        message: 'Policy renewal reminder',
        status: 'pending',
        runAt: '2099-01-01T04:30:00.000Z',
        timezone: 'Asia/Kolkata',
        requested: { day: '2099-01-01', time: '10:00' },
      });
      expect(await messages().countDocuments()).toBe(0);   // nothing is inserted before the time
    });

    it('defaults to APP_TIMEZONE and accepts weekday names', async () => {
      const res = await schedule({ message: 'weekly', day: 'Friday', time: '09:15' }).expect(201);
      const runAt = DateTime.fromISO(res.body.data.runAt).setZone('Asia/Kolkata');
      expect(res.body.data.timezone).toBe('Asia/Kolkata');
      expect(runAt.weekday).toBe(5);
      expect(runAt.toFormat('HH:mm')).toBe('09:15');
      expect(runAt > DateTime.now()).toBe(true);
    });

    it.each([
      [{}, 'message is required; day is required; time is required'],
      [{ message: 'x', day: 'someday', time: '10:00' }, 'day must be YYYY-MM-DD or a weekday name (monday … sunday)'],
      [{ message: 'x', day: 'monday', time: '25:00' }, 'time must be HH:mm or HH:mm:ss (24-hour)'],
      [{ message: 'x', day: 'monday', time: '10:00', timezone: 'Mars/Base' }, 'timezone must be a valid IANA time zone, e.g. Asia/Kolkata'],
      [{ message: 'x', day: '2099-02-30', time: '10:00' }, 'Invalid day/time: you specified 30 (of type number) as a day, which is invalid'],
      [{ message: 'x', day: '2020-01-01', time: '10:00' }, 'The scheduled time must be in the future'],
    ])('rejects %j', async (body, msg) => {
      const res = await schedule(body).expect(400);
      expect(res.body).toMatchObject({ status: 'failed', code: 400, msg });
    });

    it('drops properties the DTO does not declare', async () => {
      const res = await schedule({ message: 'x', day: '2099-01-01', time: '10:00', status: 'done', attempts: 99 }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'pending', attempts: 0 });
    });
  });

  describe('GET /api/messages/schedule/:id', () => {
    it('returns the job, 404 for unknown ids and 400 for malformed ids', async () => {
      const { id } = (await schedule({ message: 'status check', day: '2099-01-01', time: '10:00' })).body.data;
      expect((await ctx.http().get(`/api/messages/schedule/${id}`).expect(200)).body.data).toMatchObject({ id, status: 'pending' });
      await ctx.http().get(`/api/messages/schedule/${new Types.ObjectId()}`).expect(404);
      await ctx.http().get('/api/messages/schedule/xyz').expect(400);
    });
  });

  describe('dispatcher', () => {
    beforeEach(async () => {
      await jobs().deleteMany({});
      await messages().deleteMany({});
    });

    it('inserts a message once its time has come, not before', async () => {
      const inTwoSeconds = DateTime.utc().plus({ seconds: 2 });
      const { id, runAt } = (await schedule({
        message: 'on time', day: inTwoSeconds.toFormat('yyyy-MM-dd'), time: inTwoSeconds.toFormat('HH:mm:ss'), timezone: 'UTC',
      }).expect(201)).body.data;

      expect(await dispatcher.tick(new Date())).toBe(0);   // not due yet
      expect(await dispatcher.tick(new Date(Date.parse(runAt) + 100))).toBe(1);

      const job = (await ctx.http().get(`/api/messages/schedule/${id}`)).body.data;
      expect(job).toMatchObject({ status: 'done', attempts: 1 });
      const list = (await ctx.http().get('/api/messages').expect(200)).body.data;
      expect(list.messages).toEqual([expect.objectContaining({ message: 'on time', scheduledFor: runAt, scheduledMessageId: id })]);
      expect(job.messageId).toBe(list.messages[0].id);
    });

    it('delivers each job exactly once with two dispatchers racing, and recovers stale locks', async () => {
      const past = new Date(Date.now() - 60_000);
      const due = Array.from({ length: 20 }, (_, i) => ({
        message: `m${i}`, runAt: past, timezone: 'UTC', status: 'pending', attempts: 0, createdAt: past, updatedAt: past,
      }));
      await jobs().insertMany([
        ...due,
        // claimed by a worker that died 2 minutes ago
        { message: 'stale', runAt: past, timezone: 'UTC', status: 'processing', attempts: 1, lockedAt: new Date(Date.now() - 120_000), lockedBy: 'dead' },
        { message: 'future', runAt: new Date(Date.now() + 3_600_000), timezone: 'UTC', status: 'pending', attempts: 0 },
      ]);

      const second = new MessageDispatcherService(
        ctx.app.get(AppConfigService),
        ctx.app.get(ScheduledMessageRepository),
        ctx.app.get(MessageRepository),
      );
      second.workerId = 'test-second-dispatcher';
      await Promise.all([dispatcher.tick(), second.tick(), dispatcher.tick(), second.tick()]);

      expect(await messages().countDocuments()).toBe(21);
      expect(await jobs().countDocuments({ status: 'done' })).toBe(21);
      expect(await jobs().countDocuments({ status: 'pending', message: 'future' })).toBe(1);
      const perJob = await messages().aggregate([{ $group: { _id: '$scheduledMessageId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
      expect(perJob).toEqual([]);
    });

    it('never inserts a second message when a delivered job is replayed', async () => {
      const job = { _id: new Types.ObjectId(), message: 'once', runAt: new Date() };
      const repository = ctx.app.get(MessageRepository);
      const first = await repository.insertOnceForJob(job);
      const again = await repository.insertOnceForJob(job);
      expect(String(again._id)).toBe(String(first._id));
      expect(await messages().countDocuments({ scheduledMessageId: job._id })).toBe(1);
    });
  });
});
