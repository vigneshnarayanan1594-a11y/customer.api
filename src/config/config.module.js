'use strict';

const { Module } = require('@nestjs/common');
const { AppConfigService } = require('./app-config.service');
const { loadConfig } = require('./configuration');

@Module({})
class ConfigModule {
  // main.js loads the config once and passes it in; tests pass their own.
  static forRoot(config = loadConfig()) {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: AppConfigService, useValue: new AppConfigService(config) }],
      exports: [AppConfigService],
    };
  }
}

module.exports = { ConfigModule };
