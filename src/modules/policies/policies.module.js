'use strict';

const { Module } = require('@nestjs/common');
const { PoliciesController } = require('./policies.controller');
const { PoliciesService } = require('./policies.service');

@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService],
})
class PoliciesModule {}

module.exports = { PoliciesModule };
