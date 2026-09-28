'use strict';

const { Bind, Controller, Dependencies, HttpCode, HttpStatus, Post, Req } = require('@nestjs/common');
const { AppConfigService } = require('../../config/app-config.service');
const { UploadsService } = require('./uploads.service');
const { receiveUpload } = require('./receive-upload');

@Controller('uploads')
@Dependencies(UploadsService, AppConfigService)
class UploadsController {
  constructor(uploadsService, config) {
    this.uploadsService = uploadsService;
    this.config = config;
  }

  // POST /api/uploads  (multipart/form-data, field "file": .csv or .xlsx)
  @Post()
  @HttpCode(HttpStatus.OK)
  @Bind(Req())
  async upload(req) {
    const file = await receiveUpload(req, { maxBytes: this.config.upload.maxBytes });
    return this.uploadsService.importFile(file);
  }
}

module.exports = { UploadsController };
