'use strict';

const { IsInt, IsOptional, Max, Min } = require('class-validator');
const { Type } = require('class-transformer');

// Decorators apply bottom-up: the check nearest the property runs first (see common/pipes/validation.js).
class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @IsInt()
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Max(100)
  @Min(1)
  @IsInt()
  limit = 20;
}

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);

const toPagination = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

module.exports = { PaginationQueryDto, trim, toPagination };
