'use strict';

const { Module } = require('@nestjs/common');
const { DebugController } = require('./debug.controller');
const { DebugRoutesGuard } = require('./debug-routes.guard');
const { DebugService } = require('./debug.service');

@Module({
  controllers: [DebugController],
  providers: [DebugService, DebugRoutesGuard],
})
class DebugModule {}

module.exports = { DebugModule };
