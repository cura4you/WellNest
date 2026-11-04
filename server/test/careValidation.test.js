import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVital, validateAppointment } from '../src/careValidation.js';
const measuredAt = new Date(Date.now() - 60000).toISOString();
const startsAt = new Date(Date.now() + 86400000).toISOString();
test('partial measurements retain units and optional notes', () => {
  assert.deepEqual(validateVital({ measuredAt, heartRate: 76 }), { measuredAt, heartRate: 76, systolic: null, diastolic: null, glucose: null, notes: '' });
});
test('measurements reject non-finite, string and out-of-range values', () => {
  for (const heartRate of [NaN, Infinity, '76', -1, 401]) assert.throws(() => validateVital({ measuredAt, heartRate }), /Invalid/);
});
test('blood pressure needs a pair with higher systolic value', () => {
  assert.throws(() => validateVital({ measuredAt, systolic: 120 }), /both/);
  assert.throws(() => validateVital({ measuredAt, systolic: 70, diastolic: 80 }), /greater/);
});
test('measurements require a reading and a past or present time', () => {
  assert.throws(() => validateVital({ measuredAt }), /at least one/);
  assert.throws(() => validateVital({ measuredAt: startsAt, glucose: 94 }), /future/);
});
test('appointments require future dates, bounded duration and a reason', () => {
  assert.throws(() => validateAppointment({ startsAt: measuredAt, durationMinutes: 30, reason: 'Review' }), /future/);
  for (const durationMinutes of [0, 121, 15.5, '30']) assert.throws(() => validateAppointment({ startsAt, durationMinutes, reason: 'Review' }), /Duration/);
  assert.throws(() => validateAppointment({ startsAt, durationMinutes: 30, reason: ' ' }), /reason/);
  assert.deepEqual(validateAppointment({ startsAt, durationMinutes: 30, reason: ' Review ' }), { startsAt, durationMinutes: 30, reason: 'Review', location: '' });
});
