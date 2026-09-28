'use strict';

const { IsIn, IsInt, IsOptional, Max, Min } = require('class-validator');
const { Type } = require('class-transformer');

// Decorators apply bottom-up: the check nearest the property runs first.
class CpuBurnDto {
  @IsOptional()
  @Type(() => Number)
  @Max(60)
  @Min(1)
  @IsInt()
  seconds = 15;

  // yield: ~100 % CPU while the event loop stays responsive → the "sustained CPU" rule fires
  // block: one synchronous loop → samples stop arriving → the "heartbeat" rule fires
  @IsOptional()
  @IsIn(['yield', 'block'])
  mode = 'yield';
}

module.exports = { CpuBurnDto };
