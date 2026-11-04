import { pool } from './db.js';
import { notifyUser } from './notifications.js';

export async function logAudit({ patientId, documentId, actorUserId, action, status = 'success', reason, req, metadata }, client) {
  try {
    const q = client || pool;
    await q.query(
      `INSERT INTO audit_logs (patient_id, document_id, actor_user_id, action, status, reason, ip_address, user_agent, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [patientId, documentId || null, actorUserId, action, status, reason || null,
        req?.ip || req?.headers?.['x-forwarded-for'] || null,
        req?.headers?.['user-agent'] || null,
        metadata ? JSON.stringify(metadata) : null]
    );
    const category = { request_document_access: 'access_request', grant_access: 'access_granted', revoke_access: 'access_granted', upload: 'document_upload', upload_document: 'document_upload' }[action];
    if (category && status === 'success' && patientId) {
      const { rows } = await q.query('SELECT user_id FROM patients WHERE id = $1', [patientId]);
      const recipients = new Set([rows[0]?.user_id, ...(category === 'access_granted' ? [metadata?.granteeUserId] : [])].filter(Boolean));
      for (const recipient of recipients) await notifyUser(recipient, category, { access_request: 'New access request', access_granted: 'Record access changed', document_upload: 'Document uploaded' }[category], 'Open your dashboard to review this activity.', q);
    }
  } catch (err) {
    console.error('Audit log insert failed:', err.message);
  }
}
