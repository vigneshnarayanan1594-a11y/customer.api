'use strict';

const { Bind, Controller, Dependencies, Get } = require('@nestjs/common');
const { ValidQuery } = require('../../common/pipes/validation');
const { PoliciesService } = require('./policies.service');
const { SearchPoliciesQueryDto } = require('./dto/search-policies-query.dto');
const { AggregateByUserQueryDto } = require('./dto/aggregate-by-user-query.dto');

@Controller('policies')
@Dependencies(PoliciesService)
class PoliciesController {
  constructor(policiesService) {
    this.policiesService = policiesService;
  }

  // GET /api/policies/search?username=lura
  @Get('search')
  @Bind(ValidQuery(SearchPoliciesQueryDto))
  search(query) {
    return this.policiesService.searchByUsername(query);
  }

  // GET /api/policies/aggregate/by-user?page=1&limit=20[&userId=]
  @Get('aggregate/by-user')
  @Bind(ValidQuery(AggregateByUserQueryDto))
  aggregateByUser(query) {
    return this.policiesService.aggregateByUser(query);
  }
}

module.exports = { PoliciesController };
