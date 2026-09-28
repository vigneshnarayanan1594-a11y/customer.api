'use strict';

const { Module } = require('@nestjs/common');
const { MessagesController } = require('./messages.controller');
const { MessagesService } = require('./messages.service');
const { MessageDispatcherService } = require('./message-dispatcher.service');

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MessageDispatcherService],
  exports: [MessageDispatcherService],
})
class MessagesModule {}

module.exports = { MessagesModule };
