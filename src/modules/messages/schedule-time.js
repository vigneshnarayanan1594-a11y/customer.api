'use strict';

const { DateTime } = require('luxon');

const WEEKDAYS = Object.freeze({ monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 });
const DAY_PATTERN = /^(\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

class ScheduleTimeError extends Error {}

// `day` + `time` in `zone` → the UTC instant to insert the message at.
//   day  = 'YYYY-MM-DD'            → that calendar date
//   day  = weekday name            → its next occurrence (today counts if the time is still ahead)
//   time = 'HH:mm' | 'HH:mm:ss'    → 24-hour wall-clock time in `zone`
// Luxon validates the calendar strictly (2026-02-30 is invalid) and handles DST.
function resolveRunAt(day, time, zone, now = DateTime.now().setZone(zone)) {
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const weekday = WEEKDAYS[day.toLowerCase()];

  let at;
  if (weekday) {
    at = now.set({ hour, minute, second, millisecond: 0 }).plus({ days: (weekday - now.weekday + 7) % 7 });
    if (at <= now) at = at.plus({ weeks: 1 });
  } else {
    at = DateTime.fromISO(`${day}T${time}`, { zone });
  }

  if (!at.isValid) throw new ScheduleTimeError(`Invalid day/time: ${at.invalidExplanation ?? at.invalidReason}`);
  if (at <= now) throw new ScheduleTimeError('The scheduled time must be in the future');
  return at.toUTC().toJSDate();
}

module.exports = { resolveRunAt, ScheduleTimeError, DAY_PATTERN, TIME_PATTERN, WEEKDAYS };
