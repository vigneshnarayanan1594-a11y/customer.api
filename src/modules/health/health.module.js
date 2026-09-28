'use strict';

const { Module } = require('@nestjs/common');
const { HealthController } = require('./health.controller');
const { CpuSamplerService } = require('./cpu-sampler.service');

@Module({
  controllers: [HealthController],
  providers: [CpuSamplerService],
  exports: [CpuSamplerService],
})
class HealthModule {}

module.exports = { HealthModule };
