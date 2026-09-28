'use strict';

const { Bind, Controller, Dependencies, HttpCode, HttpStatus, Post, UseGuards } = require('@nestjs/common');
const { ValidBody } = require('../../common/pipes/validation');
const { DebugRoutesGuard } = require('./debug-routes.guard');
const { DebugService } = require('./debug.service');
const { CpuBurnDto } = require('./dto/cpu-burn.dto');

// Dev-only load generator to demonstrate Task 2.1 (ENABLE_DEBUG_ROUTES=true).
@Controller('debug')
@UseGuards(DebugRoutesGuard)
@Dependencies(DebugService)
class DebugController {
  constructor(debugService) {
    this.debugService = debugService;
  }

  // POST /api/debug/cpu-burn  { "seconds": 15, "mode": "yield" | "block" }  → 202
  @Post('cpu-burn')
  @HttpCode(HttpStatus.ACCEPTED)
  @Bind(ValidBody(CpuBurnDto))
  cpuBurn(dto) {
    this.debugService.burnCpu(dto);
    return { resp_msg: 'CPU burn started', pid: process.pid, seconds: dto.seconds, mode: dto.mode };
  }
}

module.exports = { DebugController };
