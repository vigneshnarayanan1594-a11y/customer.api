'use strict';

const { Dependencies, Injectable } = require('@nestjs/common');
const { UserRepository } = require('../../common/database/repositories/user.repository');
const { PolicyRepository } = require('../../common/database/repositories/policy.repository');

const ref = (doc, fields) => (doc ? { id: doc._id, ...Object.fromEntries(fields.map((f) => [f, doc[f]])) } : null);

// Populated policy → API view (userId → user, policyCategoryId → category, …).
const toPolicyView = (policy) => ({
  id: policy._id,
  policyNumber: policy.policyNumber,
  policyStartDate: policy.policyStartDate,
  policyEndDate: policy.policyEndDate,
  policyType: policy.policyType,
  policyMode: policy.policyMode,
  premiumAmount: policy.premiumAmount,
  category: ref(policy.policyCategoryId, ['categoryName']),
  carrier: ref(policy.companyId, ['companyName']),
  agent: ref(policy.agentId, ['name']),
  user: ref(policy.userId, ['firstName', 'email']),
});

@Injectable()
@Dependencies(UserRepository, PolicyRepository)
class PoliciesService {
  constructor(users, policies) {
    this.users = users;
    this.policies = policies;
  }

  // Task 1.2 — policies of every user whose name contains `username` (case-insensitive).
  async searchByUsername({ username, page, limit }) {
    const userIds = await this.users.findIdsByNameContains(username);
    const { items, pagination } = await this.policies.findByUserIdsPopulated(userIds, { page, limit });
    const { total } = pagination;
    return {
      resp_msg: total ? `Found ${total} ${total === 1 ? 'policy' : 'policies'}` : 'No policies found',
      pagination,
      policies: items.map(toPolicyView),
    };
  }

  // Task 1.3 — policies aggregated per user (optionally a single user).
  async aggregateByUser({ page, limit, userId }) {
    const { items, pagination } = await this.policies.aggregateByUser({ page, limit, userId });
    return { pagination, users: items };
  }
}

module.exports = { PoliciesService };
