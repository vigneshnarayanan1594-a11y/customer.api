'use strict';

const { Schema } = require('mongoose');
const { CollectionName } = require('../model-names');

// Policy category / line of business (CSV: category_name).
const LobSchema = new Schema(
  { categoryName: { type: String, required: true, trim: true } },
  { collection: CollectionName.Lob, timestamps: true, versionKey: false },
);
LobSchema.index({ categoryName: 1 }, { unique: true });

module.exports = { LobSchema };
