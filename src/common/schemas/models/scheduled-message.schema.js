'use strict';

const { Schema } = require('mongoose');
const { CollectionName, ModelName } = require('../model-names');

const ScheduledMessageStatus = Object.freeze({
  Pending: 'pending',
  Processing: 'processing',
  Done: 'done',
  Failed: 'failed',
});

// Durable job queue for Task 2.2. Survives restarts (Task 2.1 restarts the server on purpose).
const ScheduledMessageSchema = new Schema(
  {
    message: { type: String, required: true },
    runAt: { type: Date, required: true },                 // UTC instant the message must be inserted at
    timezone: { type: String, required: true },            // zone used to interpret day + time
    requested: { day: String, time: String },              // echo of the request
    status: { type: String, enum: Object.values(ScheduledMessageStatus), default: ScheduledMessageStatus.Pending },
    attempts: { type: Number, default: 0 },
    lockedAt: Date,
    lockedBy: String,
    processedAt: Date,
    lastError: String,
    messageId: { type: Schema.Types.ObjectId, ref: ModelName.Message },
  },
  { collection: CollectionName.ScheduledMessage, timestamps: true, versionKey: false },
);
ScheduledMessageSchema.index({ status: 1, runAt: 1 });

module.exports = { ScheduledMessageSchema, ScheduledMessageStatus };
