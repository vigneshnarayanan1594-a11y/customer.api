'use strict';

const { Global, Module } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');
const { createLogger } = require('./logger');
const { PinoLoggerService } = require('./pino-logger.service');

@Global()
@Module({
  providers: [
    {
      provide: PinoLoggerService,
      inject: [AppConfigService],
      useFactory: (config) => new PinoLoggerService(createLogger({ level: config.logLevel })),
    },
  ],
  exports: [PinoLoggerService],
})
class LoggerModule {}

module.exports = { LoggerModule };
