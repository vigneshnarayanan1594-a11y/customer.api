'use strict';

const { IsDefined, IsNotEmpty, IsString, MaxLength } = require('class-validator');
const { Transform } = require('class-transformer');
const { PaginationQueryDto, trim } = require('../../../common/dto/pagination-query.dto');

// GET /api/policies/search?username=<text>&page=&limit=
class SearchPoliciesQueryDto extends PaginationQueryDto {
  @Transform(trim)
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  @IsDefined({ message: 'username is required' })
  username;
}

module.exports = { SearchPoliciesQueryDto };
