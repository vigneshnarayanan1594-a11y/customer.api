'use strict';

const os = require('node:os');
const { Dependencies, Injectable, Logger } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');
const { ScheduledMessageRepository } = require('../../common/database/repositories/scheduled-message.repository');
const { MessageRepository } = require('../../common/database/repositories/message.repository');

// Task 2.2 dispatcher. Runs in every server process and polls MongoDB every SCHEDULER_POLL_MS.
// No in-memory timers per job: they would die with the process (Task 2.1 restarts it on purpose),
// and setTimeout fires immediately for delays over ~24.8 days.
//   - atomic claim (findOneAndUpdate)        → N processes never double-claim a job
//   - unique messages.scheduledMessageId     → a retried job never inserts twice
//   - stale-lock recovery                    → a job whose claimer died is retried
@Injectable()
@Dependencies(AppConfigService, ScheduledMessageRepository, MessageRepository)
class MessageDispatcherService {
  constructor(config, scheduledMessages, messages) {
    this.config = config;
    this.scheduledMessages = scheduledMessages;
    this.messages = messages;
    this.workerId = `${os.hostname()}:${process.pid}`;
    this.logger = new Logger(MessageDispatcherService.name);
    this.timer = null;
    this.stopped = true;
    this.shuttingDown = false;
    this.inFlight = null;
  }

  onApplicationBootstrap() {
    if (this.config.scheduler.enabled) this.start();
  }

  // Stop claiming, then let an in-flight tick finish before the Mongo connection closes.
  async beforeApplicationShutdown() {
    this.shuttingDown = true;
    this.stop();
    await this.inFlight;
  }

  start() {
    this.stopped = false;
    this.loop();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async loop() {
    this.inFlight = this.tick().catch((err) => this.logger.error({ msg: 'dispatcher tick failed', err }));
    await this.inFlight;
    this.inFlight = null;
    if (!this.stopped) {
      this.timer = setTimeout(() => this.loop(), this.config.scheduler.pollMs);   // chained: ticks never overlap
      this.timer.unref();
    }
  }

  // One pass: recover stale locks, then claim and deliver up to SCHEDULER_BATCH due jobs.
  async tick(now = new Date()) {
    const { lockTtlMs, batch } = this.config.scheduler;
    await this.scheduledMessages.releaseStaleLocks(new Date(now.getTime() - lockTtlMs));

    let delivered = 0;
    for (let i = 0; i < batch && !this.shuttingDown; i += 1) {
      const job = await this.scheduledMessages.claimNextDue(now, this.workerId);
      if (!job) break;
      if (await this.deliver(job)) delivered += 1;
    }
    return delivered;
  }

  async deliver(job) {
    try {
      const message = await this.messages.insertOnceForJob(job);
      await this.scheduledMessages.markDone(job._id, message._id);
      this.logger.log({ msg: 'scheduled message inserted', jobId: String(job._id), scheduledFor: job.runAt, lagMs: Date.now() - job.runAt.getTime() });
      return true;
    } catch (err) {
      this.logger.warn({ msg: 'scheduled message delivery failed', jobId: String(job._id), attempts: job.attempts, error: err.message });
      await this.scheduledMessages.markAttemptFailed(job, err, this.config.scheduler.maxAttempts);
      return false;
    }
  }
}

module.exports = { MessageDispatcherService };
