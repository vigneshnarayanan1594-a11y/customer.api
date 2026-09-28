'use strict';

const { Types } = require('mongoose');
const { CollectionName } = require('../model-names');

// Task 1.3 — one document per user: policy count, premium total, date range and the policy list
// with category and carrier names. Paginated with $facet so the count and the page come back together.
function buildAggregateByUserPipeline({ page, limit, userId }) {
  return [
    ...(userId ? [{ $match: { userId: new Types.ObjectId(userId) } }] : []),
    { $lookup: { from: CollectionName.Lob, localField: 'policyCategoryId', foreignField: '_id', as: 'lob' } },
    { $lookup: { from: CollectionName.Carrier, localField: 'companyId', foreignField: '_id', as: 'carrier' } },
    { $set: { category: { $first: '$lob.categoryName' }, carrier: { $first: '$carrier.companyName' } } },
    {
      $group: {
        _id: '$userId',
        policyCount: { $sum: 1 },
        totalPremium: { $sum: '$premiumAmount' },
        firstPolicyStart: { $min: '$policyStartDate' },
        lastPolicyEnd: { $max: '$policyEndDate' },
        policies: {
          $push: {
            policyNumber: '$policyNumber',
            category: '$category',
            carrier: '$carrier',
            policyStartDate: '$policyStartDate',
            policyEndDate: '$policyEndDate',
            premiumAmount: '$premiumAmount',
          },
        },
      },
    },
    { $lookup: { from: CollectionName.User, localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        firstName: '$user.firstName',
        email: '$user.email',
        policyCount: '$policyCount',
        totalPremium: { $round: ['$totalPremium', 2] },
        firstPolicyStart: '$firstPolicyStart',
        lastPolicyEnd: '$lastPolicyEnd',
        policies: { $sortArray: { input: '$policies', sortBy: { policyStartDate: -1 } } },
      },
    },
    { $sort: { policyCount: -1, firstName: 1, userId: 1 } },
    {
      $facet: {
        meta: [{ $count: 'total' }],
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ];
}

module.exports = { buildAggregateByUserPipeline };
