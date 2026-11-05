// Rewrap keys only; ciphertext objects remain untouched. Safe to rerun/rotate.
// Default is a read-only inventory. --apply performs the transaction.
import 'dotenv/config';
import { pool, withTransaction } from '../server/src/db.js';
import { validateDocumentKeys, wrapDocumentKey, unwrapDocumentKey } from '../server/src/crypto.js';
const active = validateDocumentKeys();
const apply = process.argv.includes('--apply');
try {
  await withTransaction(async (client) => {
    // Serialize against document/grant writers while copying authoritative keys.
    if (apply) await client.query('LOCK TABLE documents, document_access_grants, hospitals IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT id, dek_wrapped FROM documents WHERE encrypted = true');
    let changed = 0;
    for (const row of rows) {
      const dek = unwrapDocumentKey(row.dek_wrapped, { allowLegacy: true });
      try {
        if (!row.dek_wrapped.startsWith(`v1:${active}:`)) {
          changed++;
          if (apply) await client.query('UPDATE documents SET dek_wrapped = $1 WHERE id = $2', [wrapDocumentKey(dek), row.id]);
        }
      } finally { dek.fill(0); }
    }
    if (apply) {
      await client.query(`UPDATE document_access_grants g SET wrapped_dek_for_grantee = d.dek_wrapped FROM documents d WHERE d.id = g.document_id AND d.encrypted = true`);
      // Historical proof uploads discarded their key; only proofs with a stored key can be rewrapped.
      const proofs = await client.query('SELECT id, proof_dek_wrapped FROM hospitals WHERE proof_dek_wrapped IS NOT NULL');
      for (const row of proofs.rows) {
        const dek = unwrapDocumentKey(row.proof_dek_wrapped, { allowLegacy: true });
        try { await client.query('UPDATE hospitals SET proof_dek_wrapped = $1 WHERE id = $2', [wrapDocumentKey(dek), row.id]); } finally { dek.fill(0); }
      }
    }
    const proofs = await client.query('SELECT count(*)::int AS count FROM hospitals WHERE proof_file_id IS NOT NULL AND proof_dek_wrapped IS NULL');
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'inventory', documents: rows.length, keysToRewrap: changed, historicalProofsMissingKeys: proofs.rows[0].count }));
  });
} finally { await pool.end(); }
