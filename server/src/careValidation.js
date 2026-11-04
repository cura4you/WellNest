export function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
export const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export function validateVital(body) {
  const result = {};
  for (const [key, min, max] of [['heartRate', 1, 400], ['systolic', 20, 350], ['diastolic', 10, 250], ['glucose', 1, 1500]]) {
    const value = body[key];
    result[key] = value === '' || value == null ? null : value;
    if (result[key] !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw invalid(`Invalid ${key} measurement.`);
  }
  if ((result.systolic === null) !== (result.diastolic === null)) throw invalid('Enter both blood pressure values.');
  if (result.systolic !== null && result.systolic <= result.diastolic) throw invalid('Systolic pressure must be greater than diastolic pressure.');
  if (result.heartRate === null && result.systolic === null && result.glucose === null) throw invalid('Enter at least one measurement.');
  const measured = new Date(body.measuredAt);
  if (!body.measuredAt || !Number.isFinite(measured.getTime()) || measured.getTime() > Date.now() + 60000) throw invalid('Choose a valid measurement time that is not in the future.');
  const notes = body.notes ?? '';
  if (typeof notes !== 'string' || notes.length > 1000) throw invalid('Notes must contain at most 1000 characters.');
  return { ...result, measuredAt: measured.toISOString(), notes: notes.trim() };
}
export function validateAppointment(body) {
  const starts = new Date(body.startsAt);
  if (!body.startsAt || !Number.isFinite(starts.getTime()) || starts <= new Date()) throw invalid('Choose a future appointment time.');
  if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 15 || body.durationMinutes > 120) throw invalid('Duration must be 15 to 120 minutes.');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500) throw invalid('Enter a reason of up to 500 characters.');
  const location = body.location ?? '';
  if (typeof location !== 'string' || location.length > 300) throw invalid('Location must contain at most 300 characters.');
  return { startsAt: starts.toISOString(), durationMinutes: body.durationMinutes, reason: body.reason.trim(), location: location.trim() };
}
