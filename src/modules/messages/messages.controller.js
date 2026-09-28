'use strict';

const { Bind, Controller, Dependencies, Get, Param, Post } = require('@nestjs/common');
const { ValidBody, ValidQuery } = require('../../common/pipes/validation');
const { ParseObjectIdPipe } = require('../../common/pipes/parse-object-id.pipe');
const { PaginationQueryDto } = require('../../common/dto/pagination-query.dto');
const { MessagesService } = require('./messages.service');
const { ScheduleMessageDto } = require('./dto/schedule-message.dto');

@Controller('messages')
@Dependencies(MessagesService)
class MessagesController {
  constructor(messagesService) {
    this.messagesService = messagesService;
  }

  // POST /api/messages/schedule  { message, day, time, timezone? }  → 201
  @Post('schedule')
  @Bind(ValidBody(ScheduleMessageDto))
  schedule(dto) {
    return this.messagesService.schedule(dto);
  }

  // GET /api/messages/schedule/:id  → job status
  @Get('schedule/:id')
  @Bind(Param('id', ParseObjectIdPipe))
  getScheduled(id) {
    return this.messagesService.getScheduled(id);
  }

  // GET /api/messages  → messages inserted so far, newest first
  @Get()
  @Bind(ValidQuery(PaginationQueryDto))
  list(query) {
    return this.messagesService.listInserted(query);
  }
}

module.exports = { MessagesController };
