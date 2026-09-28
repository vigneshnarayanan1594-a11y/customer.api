'use strict';

const { Dependencies, Injectable } = require('@nestjs/common');
const { getModelToken } = require('@nestjs/mongoose');
const { BaseRepository } = require('../base.repository');
const { ModelName } = require('../../schemas/model-names');

@Injectable()
@Dependencies(getModelToken(ModelName.Message))
class MessageRepository extends BaseRepository {
  constructor(model) {
    super(model);
  }

  // Idempotent insert keyed by the job id (unique index): replaying a job returns the existing row.
  insertOnceForJob(job) {
    return this.model
      .findOneAndUpdate(
        { scheduledMessageId: job._id },
        { $setOnInsert: { message: job.message, scheduledFor: job.runAt } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean();
  }
}

module.exports = { MessageRepository };
