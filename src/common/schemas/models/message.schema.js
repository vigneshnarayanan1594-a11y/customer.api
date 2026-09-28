'use strict';

const { Schema } = require('mongoose');
const { CollectionName, ModelName } = require('../model-names');

// The messages inserted by the dispatcher at their scheduled time. `createdAt` is the actual
// insert time; `scheduledFor` is the requested one.
const MessageSchema = new Schema(
  {
    message: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    scheduledMessageId: { type: Schema.Types.ObjectId, ref: ModelName.ScheduledMessage, required: true },
  },
  { collection: CollectionName.Message, timestamps: true, versionKey: false },
);
// One message per scheduled job: a retried or recovered job can never insert twice.
MessageSchema.index({ scheduledMessageId: 1 }, { unique: true });
MessageSchema.index({ createdAt: -1 });

module.exports = { MessageSchema };
