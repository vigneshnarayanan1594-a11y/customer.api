'use strict';

const { Dependencies, Injectable } = require('@nestjs/common');
const { getModelToken } = require('@nestjs/mongoose');
const { BaseRepository } = require('../base.repository');
const { ModelName } = require('../../schemas/model-names');
const { toPagination } = require('../../dto/pagination-query.dto');
const { buildAggregateByUserPipeline } = require('../../schemas/queries/policy-aggregate.query');

@Injectable()
@Dependencies(getModelToken(ModelName.Policy))
class PolicyRepository extends BaseRepository {
  constructor(model) {
    super(model);
  }

  // Policies of the given users, newest first, with user / category / carrier / agent populated.
  async findByUserIdsPopulated(userIds, { page, limit }) {
    const filter = { userId: { $in: userIds } };
    const [total, items] = await Promise.all([
      this.model.countDocuments(filter),
      this.model
        .find(filter)
        .sort({ policyStartDate: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'firstName email')
        .populate('policyCategoryId', 'categoryName')
        .populate('companyId', 'companyName')
        .populate('agentId', 'name')
        .lean(),
    ]);
    return { items, pagination: toPagination({ page, limit }, total) };
  }

  async aggregateByUser({ page, limit, userId }) {
    const [result] = await this.model
      .aggregate(buildAggregateByUserPipeline({ page, limit, userId }))
      .collation({ locale: 'en', strength: 2 });     // case-insensitive name ordering
    const total = result?.meta[0]?.total ?? 0;
    return { items: result?.items ?? [], pagination: toPagination({ page, limit }, total) };
  }
}

module.exports = { PolicyRepository };
