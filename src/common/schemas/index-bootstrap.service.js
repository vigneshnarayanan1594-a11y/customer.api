'use strict';

const { Dependencies, Injectable, Logger } = require('@nestjs/common');
const { getConnectionToken } = require('@nestjs/mongoose');
const { AppConfigService } = require('../../config/app-config.service');

// Builds the schema indexes before the server starts listening. The unique indexes are part of the
// correctness story (idempotent imports, one message per job), so they must exist before traffic.
// Mongoose autoIndex stays off; this runs createIndexes() explicitly and awaits it.
@Injectable()
@Dependencies(getConnectionToken(), AppConfigService)
class IndexBootstrapService {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
    this.logger = new Logger(IndexBootstrapService.name);
  }

  async onApplicationBootstrap() {
    if (!this.config.mongo.autoIndex) {
      this.logger.log({ msg: 'MONGO_AUTO_INDEX=false: skipping index creation' });
      return;
    }
    const models = Object.values(this.connection.models);
    await Promise.all(models.map((model) => model.createIndexes()));
    this.logger.log({ msg: 'indexes ready', models: models.map((m) => m.modelName) });
  }
}

module.exports = { IndexBootstrapService };
