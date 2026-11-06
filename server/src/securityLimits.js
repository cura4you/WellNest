import crypto from 'node:crypto';
import { pool } from './db.js';

// Database-backed throttles survive Vercel cold starts and multiple instances.
export async function limited(key, max, seconds) {
  const hash = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(key).digest('hex');
  const { rows } = await pool.query(`INSERT INTO auth_rate_limits (key_hash, window_start, attempts) VALUES ($1, now(), 1)
    ON CONFLICT (key_hash) DO UPDATE SET
    attempts = CASE WHEN auth_rate_limits.window_start < now() - $2 * interval '1 second' THEN 1 ELSE auth_rate_limits.attempts + 1 END,
    window_start = CASE WHEN auth_rate_limits.window_start < now() - $2 * interval '1 second' THEN now() ELSE auth_rate_limits.window_start END
    RETURNING attempts`, [hash, seconds]);
  return rows[0].attempts > max;
}
