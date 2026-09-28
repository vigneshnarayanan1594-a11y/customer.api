'use strict';

const { Schema } = require('mongoose');
const { CollectionName } = require('../model-names');

// Policy carrier (CSV: company_name).
const CarrierSchema = new Schema(
  { companyName: { type: String, required: true, trim: true } },
  { collection: CollectionName.Carrier, timestamps: true, versionKey: false },
);
CarrierSchema.index({ companyName: 1 }, { unique: true });

module.exports = { CarrierSchema };
