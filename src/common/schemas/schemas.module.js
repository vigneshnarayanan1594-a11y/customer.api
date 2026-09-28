'use strict';

const { Global, Module } = require('@nestjs/common');
const { MongooseModule } = require('@nestjs/mongoose');
const { MODEL_DEFINITIONS } = require('./model-definitions');
const { IndexBootstrapService } = require('./index-bootstrap.service');
const { UserRepository } = require('../database/repositories/user.repository');
const { PolicyRepository } = require('../database/repositories/policy.repository');
const { ScheduledMessageRepository } = require('../database/repositories/scheduled-message.repository');
const { MessageRepository } = require('../database/repositories/message.repository');

const repositories = [UserRepository, PolicyRepository, ScheduledMessageRepository, MessageRepository];

// Registers every owned collection once and exposes the repositories app-wide.
// (Agent / LOB / Carrier / Account are written by the import worker thread and read through
// $lookup / populate, so they need models but no repository.)
@Global()
@Module({
  imports: [MongooseModule.forFeature([...MODEL_DEFINITIONS])],
  providers: [IndexBootstrapService, ...repositories],
  exports: [MongooseModule, ...repositories],
})
class SchemasModule {}

module.exports = { SchemasModule };
