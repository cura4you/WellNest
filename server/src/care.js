import express from 'express';
import { pool, withTransaction } from './db.js';
import { requireAuth, camelRows, camelRow, normalizeEmail } from './utils.js';
import { getPatientId } from './authz.js';
import { DEFAULT_NOTIFICATIONS, getPreferences, notifyUser } from './notifications.js';
import { invalid, isUuid, validateVital, validateAppointment } from './careValidation.js';
const router = express.Router();
router.use(requireAuth);
const route = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (err) {
    if (!err.status) console.error('Care workflow:', err.message);
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Could not save or load this information. Please try again.' });
  }
};
async function patientId(req) {
  if (req.userRole !== 'patient') throw invalid('Only patients can manage their own vitals.', 403);
  const id = await getPatientId(req.userId);
  if (!id) throw invalid('Patient profile not found.', 404);
  return id;
}
router.get('/vitals', route(async (req, res) => {
  const id = await patientId(req);
  res.json({ vitals: camelRows((await pool.query('SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY measured_at DESC, created_at DESC LIMIT 100', [id])).rows) });
}));
router.post('/vitals', route(async (req, res) => {
  const id = await patientId(req), v = validateVital(req.body);
  const { rows } = await pool.query(`INSERT INTO patient_vitals (patient_id, measured_at, heart_rate, systolic, diastolic, glucose, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, v.measuredAt, v.heartRate, v.systolic, v.diastolic, v.glucose, v.notes]);
  res.status(201).json({ vital: camelRow(rows[0]) });
}));
router.delete('/vitals/:id', route(async (req, res) => {
  const pid = await patientId(req);
  if (!isUuid(req.params.id)) throw invalid('Vital not found.', 404);
  const result = await pool.query('DELETE FROM patient_vitals WHERE id = $1 AND patient_id = $2 RETURNING id', [req.params.id, pid]);
  if (!result.rowCount) throw invalid('Vital not found.', 404);
  res.json({ message: 'Measurement deleted.' });
}));
router.get('/notification-preferences', route(async (req, res) => res.json({ preferences: await getPreferences(req.userId) })));
router.put('/notification-preferences/:category', route(async (req, res) => {
  if (!DEFAULT_NOTIFICATIONS.some((n) => n.id === req.params.category) || typeof req.body.enabled !== 'boolean') throw invalid('Choose a valid notification preference.');
  await pool.query(`INSERT INTO notification_preferences (user_id, category, enabled) VALUES ($1,$2,$3)
    ON CONFLICT (user_id, category) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`, [req.userId, req.params.category, req.body.enabled]);
  res.json({ preferences: await getPreferences(req.userId) });
}));
router.get('/notifications', route(async (req, res) => {
  res.json({ notifications: camelRows((await pool.query('SELECT id, title, body, status, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.userId])).rows) });
}));
router.patch('/notifications/:id/read', route(async (req, res) => {
  if (!isUuid(req.params.id)) throw invalid('Notification not found.', 404);
  const result = await pool.query("UPDATE notifications SET status = 'read' WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.userId]);
  if (!result.rowCount) throw invalid('Notification not found.', 404);
  res.json({ message: 'Marked as read.' });
}));
const APPOINTMENT_SELECT = `SELECT a.*, p.full_name AS patient_name, pu.email AS patient_email,
  COALESCE(d.full_name, h.hospital_name) AS provider_name, pr.email AS provider_email, pr.role AS provider_role
  FROM appointments a JOIN users pu ON pu.id = a.patient_user_id JOIN patients p ON p.user_id = pu.id
  JOIN users pr ON pr.id = a.provider_user_id LEFT JOIN doctors d ON d.user_id = pr.id LEFT JOIN hospitals h ON h.user_id = pr.id`;
router.get('/appointments', route(async (req, res) => {
  res.json({ appointments: camelRows((await pool.query(`${APPOINTMENT_SELECT} WHERE a.patient_user_id = $1 OR a.provider_user_id = $1 ORDER BY a.starts_at DESC LIMIT 200`, [req.userId])).rows) });
}));
async function lockParticipants(db, patient, provider) {
  // Lock both schedules in the same order: concurrent bookings cannot overlap.
  await db.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[patient, provider]]);
}
async function checkConflict(db, patient, provider, schedule, exclude = null) {
  const result = await db.query(`SELECT id FROM appointments WHERE status IN ('requested','confirmed')
    AND (patient_user_id = $1 OR provider_user_id = $2) AND ($5::uuid IS NULL OR id <> $5)
    AND starts_at < $3::timestamptz + $4 * interval '1 minute'
    AND starts_at + duration_minutes * interval '1 minute' > $3::timestamptz LIMIT 1`,
  [patient, provider, schedule.startsAt, schedule.durationMinutes, exclude]);
  if (result.rowCount) throw invalid('This time overlaps an existing appointment for the patient or provider.', 409);
}
async function appointmentEvent(db, appointment, actor, action) {
  await db.query('INSERT INTO appointment_events (appointment_id, actor_user_id, action) VALUES ($1,$2,$3)', [appointment.id, actor, action]);
  for (const user of [appointment.patient_user_id, appointment.provider_user_id]) {
    await notifyUser(user, 'appointments', `Appointment ${action}`, `${new Date(appointment.starts_at).toISOString()} · ${appointment.status}`, db);
  }
}
router.post('/appointments', route(async (req, res) => {
  const schedule = validateAppointment(req.body);
  const email = normalizeEmail(req.body.participantEmail);
  if (!email || email.length > 255) throw invalid('Enter the other participant’s registered email.');
  const appointment = await withTransaction(async (db) => {
    const other = (await db.query('SELECT id, role FROM users WHERE email = $1', [email])).rows[0];
    const isPatient = req.userRole === 'patient';
    if (!other || (isPatient ? !['doctor', 'hospital'].includes(other.role) : other.role !== 'patient')) throw invalid('No matching patient or provider account found.', 404);
    const patient = isPatient ? req.userId : other.id, provider = isPatient ? other.id : req.userId;
    await lockParticipants(db, patient, provider);
    await checkConflict(db, patient, provider, schedule);
    const row = (await db.query(`INSERT INTO appointments
      (patient_user_id, provider_user_id, created_by_user_id, starts_at, duration_minutes, reason, location, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [patient, provider, req.userId, schedule.startsAt, schedule.durationMinutes, schedule.reason, schedule.location, isPatient ? 'requested' : 'confirmed'])).rows[0];
    await appointmentEvent(db, row, req.userId, 'created'); return row;
  });
  res.status(201).json({ appointment: camelRow(appointment) });
}));
router.patch('/appointments/:id', route(async (req, res) => {
  if (!isUuid(req.params.id)) throw invalid('Appointment not found.', 404);
  if (!['confirm', 'reschedule', 'cancel', 'complete'].includes(req.body.action)) throw invalid('Choose a valid appointment action.');
  const appointment = await withTransaction(async (db) => {
    // Read participant ids first, then acquire schedule locks before the row lock.
    const found = (await db.query('SELECT * FROM appointments WHERE id = $1 AND (patient_user_id = $2 OR provider_user_id = $2)', [req.params.id, req.userId])).rows[0];
    if (!found) throw invalid('Appointment not found.', 404);
    await lockParticipants(db, found.patient_user_id, found.provider_user_id);
    const row = (await db.query('SELECT * FROM appointments WHERE id = $1 FOR UPDATE', [found.id])).rows[0];
    if (req.body.version !== row.version) throw invalid('This appointment changed. Refresh and try again.', 409);
    if (['cancelled', 'completed'].includes(row.status)) throw invalid('This appointment is already closed.', 409);
    const provider = row.provider_user_id === req.userId;
    if (['confirm', 'complete'].includes(req.body.action) && !provider) throw invalid('Only the provider can confirm or complete appointments.', 403);
    let schedule = { startsAt: row.starts_at, durationMinutes: row.duration_minutes, reason: row.reason, location: row.location };
    let status = row.status;
    if (req.body.action === 'reschedule') {
      schedule = validateAppointment(req.body);
      await checkConflict(db, row.patient_user_id, row.provider_user_id, schedule, row.id);
      status = provider ? 'confirmed' : 'requested';
    } else if (req.body.action === 'confirm') {
      if (new Date(row.starts_at) <= new Date()) throw invalid('Reschedule this appointment to a future time before confirming.');
      status = 'confirmed';
    } else if (req.body.action === 'complete') {
      if (row.status !== 'confirmed' || new Date(row.starts_at) > new Date()) throw invalid('Only confirmed appointments that have started can be completed.');
      status = 'completed';
    } else status = 'cancelled';
    const updated = (await db.query(`UPDATE appointments SET starts_at=$2, duration_minutes=$3, reason=$4, location=$5,
      status=$6, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [row.id, schedule.startsAt, schedule.durationMinutes, schedule.reason, schedule.location, status])).rows[0];
    await appointmentEvent(db, updated, req.userId, req.body.action === 'reschedule' ? 'rescheduled' : status); return updated;
  });
  res.json({ appointment: camelRow(appointment) });
}));
export default router;
