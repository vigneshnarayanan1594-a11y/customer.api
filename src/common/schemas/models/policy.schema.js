'use strict';

const { Schema } = require('mongoose');
const { CollectionName, ModelName } = require('../model-names');

const { ObjectId } = Schema.Types;

const PolicySchema = new Schema(
  {
    policyNumber: { type: String, required: true },
    policyStartDate: { type: Date, required: true },
    policyEndDate: { type: Date, required: true },
    policyCategoryId: { type: ObjectId, ref: ModelName.Lob, required: true },   // policy category (LOB) id
    companyId: { type: ObjectId, ref: ModelName.Carrier, required: true },      // carrier (company) id
    userId: { type: ObjectId, ref: ModelName.User, required: true },
    // extra — keeps the import lossless and feeds the aggregation
    agentId: { type: ObjectId, ref: ModelName.Agent },
    premiumAmount: Number,
    policyMode: Number,        // term in months: 6 or 12
    policyType: String,        // Single | Package
    producer: String,
    csr: String,
  },
  { collection: CollectionName.Policy, timestamps: true, versionKey: false },
);
PolicySchema.index({ policyNumber: 1 }, { unique: true });
PolicySchema.index({ userId: 1 });

module.exports = { PolicySchema };
