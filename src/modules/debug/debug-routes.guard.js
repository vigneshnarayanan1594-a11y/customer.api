'use strict';

const { Dependencies, Injectable, NotFoundException } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');

// Debug routes exist only when ENABLE_DEBUG_ROUTES=true; otherwise they look like any unknown route.
@Injectable()
@Dependencies(AppConfigService)
class DebugRoutesGuard {
  constructor(config) {
    this.config = config;
  }

  canActivate() {
    if (!this.config.debugRoutes) throw new NotFoundException();
    return true;
  }
}

module.exports = { DebugRoutesGuard };
