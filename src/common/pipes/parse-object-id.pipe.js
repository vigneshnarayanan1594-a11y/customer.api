'use strict';

const { BadRequestException, Injectable } = require('@nestjs/common');
const { isValidObjectId } = require('mongoose');

@Injectable()
class ParseObjectIdPipe {
  transform(value, metadata) {
    if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value) || !isValidObjectId(value)) {
      throw new BadRequestException(`${metadata?.data ?? 'id'} must be a 24-character hex ObjectId`);
    }
    return value;
  }
}

module.exports = { ParseObjectIdPipe };
