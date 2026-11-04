import { pool } from './db.js';
export const DEFAULT_NOTIFICATIONS = [
  { id: 'access_request', channel: 'Access requests', description: 'In-app alerts when someone requests access to your records', enabled: true },
  { id: 'access_granted', channel: 'Access changes', description: 'In-app alerts when access is granted or revoked', enabled: true },
  { id: 'emergency_access', channel: 'Emergency access', description: 'In-app emergency access alerts', enabled: true },
  { id: 'document_upload', channel: 'Document uploads', description: 'In-app alerts when a document is uploaded', enabled: false },
  { id: 'appointments', channel: 'Appointments', description: 'In-app booking, confirmation and schedule changes', enabled: true },
];
export async function getPreferences(userId, db = pool) {
  const { rows } = await db.query('SELECT category, enabled FROM notification_preferences WHERE user_id = $1', [userId]);
  const saved = new Map(rows.map((r) => [r.category, r.enabled]));
  return DEFAULT_NOTIFICATIONS.map((n) => ({ ...n, enabled: saved.get(n.id) ?? n.enabled }));
}
export async function notifyUser(userId, category, title, body, db = pool) {
  const preference = (await getPreferences(userId, db)).find((n) => n.id === category);
  if (preference?.enabled) await db.query(
    "INSERT INTO notifications (user_id, title, body, channel) VALUES ($1, $2, $3, 'in_app')",
    [userId, title, body]
  );
}
