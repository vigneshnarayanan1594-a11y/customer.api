'use strict';

const { Schema } = require('mongoose');
const { CollectionName } = require('../model-names');

const UserSchema = new Schema(
  {
    firstName: { type: String, required: true },   // the sheet's `firstname` column holds the full name
    dob: { type: Date, required: true },
    address: String,
    state: String,
    zip: String,                                   // string: ZIP+4 and leading zeros survive
    phone: String,                                 // normalised to 10 digits when possible
    email: { type: String, required: true, lowercase: true },
    gender: String,
    userType: { type: String, required: true },
    // extra (not in the brief's field list) — keeps the import lossless
    city: String,
    phoneExtension: String,
  },
  { collection: CollectionName.User, timestamps: true, versionKey: false },
);
// Email alone is shared by different people in the sample (47 addresses), so the key is name + email.
UserSchema.index({ firstName: 1, email: 1 }, { unique: true });

module.exports = { UserSchema };
