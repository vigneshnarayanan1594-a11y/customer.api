'use strict';

const { Schema } = require('mongoose');
const { CollectionName } = require('../model-names');

// Schemas are plain mongoose (no decorators) so the import worker thread can load them
// without Babel. Natural keys carry unique indexes: re-uploading a sheet upserts, never duplicates.
const AgentSchema = new Schema(
  { name: { type: String, required: true, trim: true } },
  { collection: CollectionName.Agent, timestamps: true, versionKey: false },
);
AgentSchema.index({ name: 1 }, { unique: true });

module.exports = { AgentSchema };
