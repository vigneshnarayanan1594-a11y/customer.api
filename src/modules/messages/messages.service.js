'use strict';

const { BadRequestException, Dependencies, Injectable, NotFoundException } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');
const { ScheduledMessageRepository } = require('../../common/database/repositories/scheduled-message.repository');
const { MessageRepository } = require('../../common/database/repositories/message.repository');
const { resolveRunAt, ScheduleTimeError } = require('./schedule-time');

const toJobView = (job) => ({
  id: job._id,
  message: job.message,
  status: job.status,
  runAt: job.runAt,
  timezone: job.timezone,
  requested: job.requested,
  attempts: job.attempts,
  processedAt: job.processedAt ?? null,
  messageId: job.messageId ?? null,
  lastError: job.lastError ?? null,
});

const toMessageView = (message) => ({
  id: message._id,
  message: message.message,
  scheduledFor: message.scheduledFor,
  insertedAt: message.createdAt,
  scheduledMessageId: message.scheduledMessageId,
});

@Injectable()
@Dependencies(AppConfigService, ScheduledMessageRepository, MessageRepository)
class MessagesService {
  constructor(config, scheduledMessages, messages) {
    this.config = config;
    this.scheduledMessages = scheduledMessages;
    this.messages = messages;
  }

  // Task 2.2 — persist the job; MessageDispatcherService inserts the message when it's due.
  async schedule({ message, day, time, timezone }) {
    const zone = timezone ?? this.config.scheduler.timezone;
    let runAt;
    try {
      runAt = resolveRunAt(day, time, zone);
    } catch (err) {
      if (err instanceof ScheduleTimeError) throw new BadRequestException(err.message);
      throw err;
    }

    const job = await this.scheduledMessages.create({ message, runAt, timezone: zone, requested: { day, time } });
    return { resp_msg: 'Message scheduled', ...toJobView(job) };
  }

  async getScheduled(id) {
    const job = await this.scheduledMessages.findById(id);
    if (!job) throw new NotFoundException('Scheduled message not found');
    return toJobView(job);
  }

  async listInserted({ page, limit }) {
    const { items, pagination } = await this.messages.findPaginated({}, { page, limit, sort: { createdAt: -1, _id: -1 } });
    return { pagination, messages: items.map(toMessageView) };
  }
}

module.exports = { MessagesService };
