'use strict';

const cluster = require('node:cluster');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { Dependencies, Injectable } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');

// Task 2.1 — real-time CPU tracking inside each server process.
//   cpu % = Δ(user + system CPU µs from process.cpuUsage()) / Δ(wall-clock µs) × 100
// Same convention as `top`: 100 % = one core fully busy. JavaScript runs on one thread, so a pegged
// event loop reads ~100 % here (but only 100/N % machine-wide, which would never trip a 70 % rule).
// Every sample goes to the cluster primary over IPC; the primary decides about restarts.
@Injectable()
@Dependencies(AppConfigService)
class CpuSamplerService {
  constructor(config) {
    this.config = config;
    this.timer = null;
    this.sample = null;
  }

  onApplicationBootstrap() {
    this.start();
  }

  onApplicationShutdown() {
    this.stop();
  }

  start() {
    if (this.timer) return;
    let last = { cpu: process.cpuUsage(), wall: process.hrtime.bigint(), elu: performance.eventLoopUtilization() };

    this.timer = setInterval(() => {
      const cpu = process.cpuUsage();
      const wall = process.hrtime.bigint();
      const elu = performance.eventLoopUtilization();
      const usedUs = cpu.user - last.cpu.user + (cpu.system - last.cpu.system);
      const pct = (usedUs / (Number(wall - last.wall) / 1000)) * 100;

      this.sample = {
        pct: round(pct),
        machinePct: round(pct / os.availableParallelism()),
        eventLoopPct: round(performance.eventLoopUtilization(elu, last.elu).utilization * 100),
        at: new Date().toISOString(),
      };
      last = { cpu, wall, elu };

      // Only a cluster worker has a supervisor to report to (never e.g. a test runner's IPC channel).
      if (cluster.isWorker && process.connected) process.send({ type: 'cpu', ...this.sample });
    }, this.config.cpu.sampleMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  latest() {
    return this.sample;
  }
}

const round = (n) => Math.round(n * 10) / 10;

module.exports = { CpuSamplerService };
