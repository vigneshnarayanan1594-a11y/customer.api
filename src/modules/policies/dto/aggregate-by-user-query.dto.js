'use strict';

const { IsMongoId, IsOptional } = require('class-validator');
const { PaginationQueryDto } = require('../../../common/dto/pagination-query.dto');

// GET /api/policies/aggregate/by-user?page=&limit=&userId=
class AggregateByUserQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsMongoId()
  userId;
}

module.exports = { AggregateByUserQueryDto };
