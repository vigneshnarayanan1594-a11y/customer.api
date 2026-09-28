'use strict';

const { DateTime } = require('luxon');
const { resolveRunAt, ScheduleTimeError } = require('../../src/modules/messages/schedule-time');

const zone = 'Asia/Kolkata';
// Monday 2026-09-28 10:00 in Asia/Kolkata
const now = DateTime.fromISO('2026-09-28T10:00', { zone });
const at = (day, time, z = zone) => resolveRunAt(day, time, z, now.setZone(z)).toISOString();

describe('resolveRunAt', () => {
  it('converts a calendar date + wall time in the zone to UTC', () => {
    expect(at('2026-10-05', '14:30')).toBe('2026-10-05T09:00:00.000Z');
    expect(at('2026-10-05', '14:30:15')).toBe('2026-10-05T09:00:15.000Z');
  });

  it('uses the requested zone', () => {
    expect(at('2026-10-02', '10:00', 'America/New_York')).toBe('2026-10-02T14:00:00.000Z');
  });

  it('resolves a weekday to its next occurrence', () => {
    expect(at('friday', '14:30')).toBe('2026-10-02T09:00:00.000Z');
    expect(at('Monday', '11:00')).toBe('2026-09-28T05:30:00.000Z');   // today, still ahead
    expect(at('monday', '09:00')).toBe('2026-10-05T03:30:00.000Z');   // today already passed → next week
  });

  it('shifts a wall time inside a DST gap forward', () => {
    const nyNow = DateTime.fromISO('2027-03-01T00:00', { zone: 'America/New_York' });
    expect(resolveRunAt('2027-03-14', '02:30', 'America/New_York', nyNow).toISOString()).toBe('2027-03-14T07:30:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(() => at('2026-02-30', '10:00')).toThrow(ScheduleTimeError);
  });

  it('rejects moments that are not in the future', () => {
    expect(() => at('2026-09-28', '09:59')).toThrow('must be in the future');
    expect(() => at('2026-09-28', '10:00')).toThrow('must be in the future');
  });
});
