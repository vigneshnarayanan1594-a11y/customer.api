'use strict';

const { Module } = require('@nestjs/common');
const { APP_FILTER, APP_INTERCEPTOR } = require('@nestjs/core');
const { MongooseModule } = require('@nestjs/mongoose');
const { ConfigModule } = require('./config/config.module');
const { AppConfigService } = require('./config/app-config.service');
const { LoggerModule } = require('./common/logger/logger.module');
const { SchemasModule } = require('./common/schemas/schemas.module');
const { TransformInterceptor } = require('./common/interceptors/transform.interceptor');
const { AllExceptionsFilter } = require('./common/filters/all-exceptions.filter');
const { UploadsModule } = require('./modules/uploads/uploads.module');
const { PoliciesModule } = require('./modules/policies/policies.module');
const { MessagesModule } = require('./modules/messages/messages.module');
const { HealthModule } = require('./modules/health/health.module');
const { DebugModule } = require('./modules/debug/debug.module');

@Module({})
class AppModule {
  static forRoot(config) {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule,
        MongooseModule.forRootAsync({
          inject: [AppConfigService],
          useFactory: (cfg) => ({
            uri: cfg.mongo.uri,
            dbName: cfg.mongo.dbName,          // "customer" unless MONGO_DB_NAME says otherwise
            autoIndex: false,                  // IndexBootstrapService builds and awaits them explicitly
            serverSelectionTimeoutMS: 10000,
          }),
        }),
        SchemasModule,

        UploadsModule,
        PoliciesModule,
        MessagesModule,
        HealthModule,
        DebugModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}

module.exports = { AppModule };
