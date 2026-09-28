'use strict';

const { IsDefined, IsNotEmpty, IsOptional, IsString, IsTimeZone, Matches, MaxLength } = require('class-validator');
const { Transform } = require('class-transformer');
const { trim } = require('../../../common/dto/pagination-query.dto');
const { DAY_PATTERN, TIME_PATTERN } = require('../schedule-time');

// POST /api/messages/schedule
// { "message": "…", "day": "2026-10-05" | "friday", "time": "14:30", "timezone"?: "Asia/Kolkata" }
// Decorators apply bottom-up: the check nearest the property runs first.
class ScheduleMessageDto {
  @Transform(trim)
  @MaxLength(1000)
  @IsNotEmpty()
  @IsString()
  @IsDefined({ message: 'message is required' })
  message;

  @Transform(trim)
  @Matches(DAY_PATTERN, { message: 'day must be YYYY-MM-DD or a weekday name (monday … sunday)' })
  @IsString()
  @IsDefined({ message: 'day is required' })
  day;

  @Transform(trim)
  @Matches(TIME_PATTERN, { message: 'time must be HH:mm or HH:mm:ss (24-hour)' })
  @IsString()
  @IsDefined({ message: 'time is required' })
  time;

  @IsOptional()
  @Transform(trim)
  @IsTimeZone({ message: 'timezone must be a valid IANA time zone, e.g. Asia/Kolkata' })
  timezone;
}

module.exports = { ScheduleMessageDto };
