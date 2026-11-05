import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { waitUntil } from '@vercel/functions';
import { pool, withTransaction } from './db.js';
import { normalizeEmail, requireAuth, revokeToken, tokenHash } from './utils.js';
import { recoveryConfiguration, sendRecoveryEmail } from './recoveryMail.js';
const router = express.Router();
const generic = { message: 'If an account matches, a password reset link will be emailed. Check your inbox and spam folder.' };
const validPassword = (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72 && /^(?=.*[A-Za-z])(?=.*\d).{8,}$/s.test(value);

// Database-backed throttles survive Vercel cold starts and multiple instances.
async function limited(key, max, seconds) {
  const hash = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(key).digest('hex');
  const { rows } = await pool.query(`INSERT INTO auth_rate_limits (key_hash, window_start, attempts) VALUES ($1, now(), 1)
    ON CONFLICT (key_hash) DO UPDATE SET
    attempts = CASE WHEN auth_rate_limits.window_start < now() - $2 * interval '1 second' THEN 1 ELSE auth_rate_limits.attempts + 1 END,
    window_start = CASE WHEN auth_rate_limits.window_start < now() - $2 * interval '1 second' THEN now() ELSE auth_rate_limits.window_start END
    RETURNING attempts`, [hash, seconds]);
  return rows[0].attempts > max;
}
router.use((req, res, next) => { req.body ??= {}; res.set('Cache-Control', 'no-store'); next(); });
router.get('/session', requireAuth, (_req, res) => res.json({ authenticated: true }));
router.post('/logout', requireAuth, async (req, res) => {
  await revokeToken(req.authToken, req.userId);
  res.json({ message: 'Signed out.' });
});
router.post('/logout-all', requireAuth, async (req, res) => {
  await pool.query('UPDATE users SET auth_version = auth_version + 1, updated_at = now() WHERE id = $1', [req.userId]);
  res.json({ message: 'Signed out on all devices.' });
});
router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const role = req.body.role;
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['patient', 'doctor', 'hospital'].includes(role)) return res.status(400).json({ message: 'Enter a valid email and account role.' });
  if (await limited(`recover-ip:${req.ip}`, 15, 900) || await limited(`recover-email:${email}`, 5, 3600)) return res.status(429).json({ message: 'Too many reset requests. Please try again later.' });
  try { recoveryConfiguration(); } catch { return res.status(503).json({ message: 'Password recovery email is not available yet. Please try again later.' }); }
  const token = crypto.randomBytes(32).toString('hex');
  const hash = tokenHash(token);
  const { rows } = await pool.query(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
    SELECT $1, id, now() + interval '30 minutes' FROM users WHERE email = $2 AND role = $3 RETURNING user_id`, [hash, email, role]);
  if (rows.length) {
    const delivery = sendRecoveryEmail({ to: email, token }).catch(async () => {
      console.error('Password recovery delivery failed.'); // Never log tokens/provider responses.
      await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [hash]);
    });
    waitUntil(delivery);
  }
  return res.status(202).json(generic);
});
router.post('/reset-password', async (req, res) => {
  if (await limited(`reset-ip:${req.ip}`, 20, 900)) return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
  const { token, password } = req.body;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: 'This reset link is invalid or expired. Request a new one.' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Use 8 or more characters with a letter and number, and no more than 72 UTF-8 bytes.' });
  const hash = tokenHash(token);
  // Reject bad/expired tokens before expensive bcrypt; lock and recheck inside the transaction.
  const { rows } = await pool.query('SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()', [hash]);
  if (!rows.length) return res.status(400).json({ message: 'This reset link is invalid or expired. Request a new one.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const changed = await withTransaction(async (client) => {
    // Lock the account first: all resets for the same account serialize, including distinct links.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [rows[0].user_id]);
    const consumed = await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [hash]);
    if (!consumed.rows.length) return false;
    await client.query('UPDATE users SET password_hash = $1, auth_version = auth_version + 1, updated_at = now() WHERE id = $2', [passwordHash, rows[0].user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [rows[0].user_id]);
    return true;
  });
  if (!changed) return res.status(400).json({ message: 'This reset link is invalid or expired. Request a new one.' });
  res.json({ message: 'Password updated. All devices have been signed out. Sign in with your new password.' });
});
router.post('/change-password', requireAuth, async (req, res) => {
  if (await limited(`change:${req.userId}`, 10, 900)) return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
  const { currentPassword, password } = req.body;
  if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72 || !validPassword(password)) return res.status(400).json({ message: 'Enter your current password and a new password of 8–72 bytes with a letter and number.' });
  const { rows } = await pool.query('SELECT password_hash, auth_version FROM users WHERE id = $1', [req.userId]);
  if (!rows[0] || !await bcrypt.compare(currentPassword, rows[0].password_hash)) return res.status(400).json({ message: 'Current password is incorrect.' });
  const hash = await bcrypt.hash(password, 12);
  const changed = await withTransaction(async (client) => {
    const result = await client.query('UPDATE users SET password_hash = $1, auth_version = auth_version + 1, updated_at = now() WHERE id = $2 AND auth_version = $3 RETURNING id', [hash, req.userId, rows[0].auth_version]);
    if (!result.rows.length) return false;
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [req.userId]);
    return true;
  });
  if (!changed) return res.status(409).json({ message: 'Your account changed. Sign in again and retry.' });
  res.json({ message: 'Password updated. Sign in again on all devices.' });
});
router.use((_err, _req, res, _next) => {
  void _next;
  console.error('Account security request failed.');
  res.status(503).json({ message: 'Account security is temporarily unavailable. Please try again.' });
});
export default router;
