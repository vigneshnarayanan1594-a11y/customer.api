'use strict';

const { Schema } = require('mongoose');
const { CollectionName, ModelName } = require('../model-names');

const AccountSchema = new Schema(
  {
    accountName: { type: String, required: true },
    // extra: the account's owner and type (Personal / Commercial)
    userId: { type: Schema.Types.ObjectId, ref: ModelName.User, required: true },
    accountType: String,
  },
  { collection: CollectionName.Account, timestamps: true, versionKey: false },
);
// Some account names are shared by two different people in the sample, so the key includes the owner.
AccountSchema.index({ userId: 1, accountName: 1 }, { unique: true });

module.exports = { AccountSchema };
