'use strict';

const { Dependencies, Injectable } = require('@nestjs/common');
const { getModelToken } = require('@nestjs/mongoose');
const { BaseRepository } = require('../base.repository');
const { ModelName } = require('../../schemas/model-names');
const { ScheduledMessageStatus: Status } = require('../../schemas/models/scheduled-message.schema');

@Injectable()
@Dependencies(getModelToken(ModelName.ScheduledMessage))
class ScheduledMessageRepository extends BaseRepository {
  constructor(model) {
    super(model);
  }

  // Jobs whose claimer died mid-delivery (e.g. killed by the CPU supervisor) go back to pending.
  releaseStaleLocks(lockedBefore) {
    return this.model.updateMany(
      { status: Status.Processing, lockedAt: { $lt: lockedBefore } },
      { $set: { status: Status.Pending }, $unset: { lockedAt: 1, lockedBy: 1 } },
    );
  }

  // Atomic claim: findOneAndUpdate guarantees two server processes never claim the same job.
  claimNextDue(now, workerId) {
    return this.model
      .findOneAndUpdate(
        { status: Status.Pending, runAt: { $lte: now } },
        { $set: { status: Status.Processing, lockedAt: now, lockedBy: workerId }, $inc: { attempts: 1 } },
        { sort: { runAt: 1 }, returnDocument: 'after' },
      )
      .lean();
  }

  markDone(jobId, messageId) {
    return this.model.updateOne(
      { _id: jobId },
      { $set: { status: Status.Done, processedAt: new Date(), messageId }, $unset: { lockedAt: 1, lockedBy: 1 } },
    );
  }

  // Back to pending for the next tick, or failed once the attempts are used up.
  markAttemptFailed(job, error, maxAttempts) {
    return this.model.updateOne(
      { _id: job._id },
      {
        $set: { status: job.attempts >= maxAttempts ? Status.Failed : Status.Pending, lastError: String(error?.message ?? error) },
        $unset: { lockedAt: 1, lockedBy: 1 },
      },
    );
  }
}

module.exports = { ScheduledMessageRepository };
