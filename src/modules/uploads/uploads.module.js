'use strict';

const { Module } = require('@nestjs/common');
const { UploadsController } = require('./uploads.controller');
const { UploadsService } = require('./uploads.service');

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
})
class UploadsModule {}

module.exports = { UploadsModule };
