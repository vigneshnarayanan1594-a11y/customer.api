'use strict';

// Typed read access to the validated configuration (see configuration.js).
// Provided by ConfigModule.forRoot(config); never read process.env anywhere else.
class AppConfigService {
  constructor(config) {
    this.config = config;
  }

  get env() { return this.config.env; }
  get isProduction() { return this.config.isProduction; }
  get host() { return this.config.host; }
  get port() { return this.config.port; }
  get corsOrigins() { return this.config.corsOrigins; }
  get logLevel() { return this.config.logLevel; }
  get mongo() { return this.config.mongo; }
  get cluster() { return this.config.cluster; }
  get upload() { return this.config.upload; }
  get import() { return this.config.import; }
  get cpu() { return this.config.cpu; }
  get restart() { return this.config.restart; }
  get scheduler() { return this.config.scheduler; }
  get debugRoutes() { return this.config.debugRoutes; }
}

module.exports = { AppConfigService };
