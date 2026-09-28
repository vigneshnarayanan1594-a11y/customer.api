'use strict';

const cluster = require('node:cluster');
const { Controller, Dependencies, Get } = require('@nestjs/common');
const { getConnectionToken } = require('@nestjs/mongoose');
const { CpuSamplerService } = require('./cpu-sampler.service');

// GET /health (outside the /api prefix). `pid` changing is the easiest way to see a restart.
@Controller('health')
@Dependencies(getConnectionToken(), CpuSamplerService)
class HealthController {
  constructor(connection, cpuSampler) {
    this.connection = connection;
    this.cpuSampler = cpuSampler;
  }

  @Get()
  check() {
    return {
      resp_msg: 'ok',
      pid: process.pid,
      workerId: cluster.isWorker ? cluster.worker.id : null,
      uptimeSec: Math.round(process.uptime()),
      db: this.connection.readyState === 1 ? 'up' : 'down',
      cpu: this.cpuSampler.latest(),
    };
  }
}

module.exports = { HealthController };
