import express from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { waitUntil } from '@vercel/functions';
import { pool, withTransaction } from './db.js';
import { requireAuth, tokenHash, camelRow, camelRows } from './utils.js';
import { limited } from './securityLimits.js';
import { recoveryConfiguration, sendVerificationEmail, canEmailRecipient } from './recoveryMail.js';
import { encryptFile, decryptFile } from './crypto.js';
import { uploadFile, downloadFile, deleteFile } from './storage.js';
import { proofMime, revisionValue, reviewDecision } from './identityValidation.js';
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
const fault = (status, message) => Object.assign(new Error(message), { status });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const applicationSql = `SELECT a.user_id,a.status,a.revision,a.submission_note,a.review_reason,a.submitted_at,a.reviewed_at,
 u.email,u.email_verified,u.role,COALESCE(d.full_name,h.hospital_name) AS name,COALESCE(d.license_number,h.license_number) AS license_number,
 p.id AS proof_id,p.filename AS proof_filename,p.mime_type AS proof_mime_type,(p.dek_wrapped IS NOT NULL) AS proof_readable
 FROM provider_applications a JOIN users u ON u.id=a.user_id LEFT JOIN doctors d ON d.user_id=u.id LEFT JOIN hospitals h ON h.user_id=u.id LEFT JOIN provider_proofs p ON p.id=a.proof_id`;
async function event(client, userId, actor, action, revision, proof, reason = '') {
  const license=(await client.query('SELECT COALESCE(d.license_number,h.license_number) AS license FROM users u LEFT JOIN doctors d ON d.user_id=u.id LEFT JOIN hospitals h ON h.user_id=u.id WHERE u.id=$1',[userId])).rows[0]?.license;
  await client.query('INSERT INTO provider_review_events(user_id,actor_user_id,action,revision,proof_id,reason,license_number) VALUES($1,$2,$3,$4,$5,$6,$7)', [userId, actor, action, revision, proof, reason, license]);
}
async function requireAdmin(req, _res, next) {
  const user = (await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.userId])).rows[0];
  if (!user?.is_admin) throw fault(403, 'Administrator access is required.');
  next();
}
async function ensureProvider(req, _res, next) {
  if (!['doctor','hospital'].includes(req.userRole)) throw fault(403, 'Only doctor and hospital accounts can submit credentials.');
  await pool.query('INSERT INTO provider_applications(user_id) VALUES($1) ON CONFLICT DO NOTHING', [req.userId]); next();
}
router.use((req, res, next) => { req.body ??= {}; res.set('Cache-Control','no-store'); next(); });
router.get('/account-status', requireAuth, async (req, res) => {
  const user = (await pool.query('SELECT email,email_verified,is_admin FROM users WHERE id=$1', [req.userId])).rows[0];
  let app = (await pool.query(`${applicationSql} WHERE a.user_id=$1`, [req.userId])).rows[0];
  if (!app && ['doctor','hospital'].includes(req.userRole)) {
    // Covers accounts registered by the previous deployment during rollout.
    await withTransaction(async client=>{
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.userId]);
      await client.query('INSERT INTO provider_applications(user_id) VALUES($1) ON CONFLICT DO NOTHING',[req.userId]);
      const h=(await client.query('SELECT * FROM hospitals WHERE user_id=$1',[req.userId])).rows[0];
      if(h?.proof_file_id){
        let p=(await client.query('SELECT id FROM provider_proofs WHERE user_id=$1 AND object_key=$2 LIMIT 1',[req.userId,h.proof_file_id])).rows[0];
        if(!p)p=(await client.query("INSERT INTO provider_proofs(user_id,object_key,filename,mime_type,dek_wrapped,dek_iv) VALUES($1,$2,$3,'application/octet-stream',$4,$5) RETURNING id",[req.userId,h.proof_file_id,h.proof_filename||'Hospital proof',h.proof_dek_wrapped,h.proof_dek_iv])).rows[0];
        await client.query('UPDATE provider_applications SET proof_id=$1 WHERE user_id=$2 AND proof_id IS NULL',[p.id,req.userId]);
      }
    });
    app=(await pool.query(`${applicationSql} WHERE a.user_id=$1`,[req.userId])).rows[0];
  }
  let emailAvailable = canEmailRecipient(user.email);
  try { recoveryConfiguration(); } catch { emailAvailable = false; }
  res.json({ email:user.email,emailVerified:user.email_verified,isAdmin:user.is_admin,emailAvailable,approvalRequired:process.env.PROVIDER_APPROVAL_REQUIRED === 'true',application:app ? camelRow(app) : null });
});
router.post('/verification/send', requireAuth, async (req, res) => {
  const user = (await pool.query('SELECT email,email_verified FROM users WHERE id=$1',[req.userId])).rows[0];
  if (user.email_verified) return res.json({ message:'Your email is already verified.' });
  if (await limited(`verify-user:${req.userId}`,5,3600) || await limited(`verify-ip:${req.ip}`,15,900)) throw fault(429,'Too many verification requests. Please try again later.');
  try { recoveryConfiguration(); } catch { throw fault(503,'Verification email is not configured yet.'); }
  if (!canEmailRecipient(user.email)) throw fault(503,'This portfolio deployment sends email only to its configured test inbox.');
  const token = crypto.randomBytes(32).toString('hex'), hash = tokenHash(token);
  await pool.query("INSERT INTO email_verification_tokens(token_hash,user_id,email,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",[hash,req.userId,user.email]);
  waitUntil(sendVerificationEmail({ to:user.email,token }).catch(async () => {
    console.error('Verification email delivery failed.'); await pool.query('DELETE FROM email_verification_tokens WHERE token_hash=$1',[hash]);
  }));
  res.status(202).json({ message:'Verification requested. Check your inbox and spam folder.' });
});
router.post('/verification/confirm', async (req, res) => {
  if (await limited(`verify-confirm:${req.ip}`,30,900)) throw fault(429,'Too many attempts. Please try again later.');
  const token = req.body.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw fault(400,'This verification link is invalid or expired.');
  const hash = tokenHash(token);
  const verified = await withTransaction(async client => {
    const row = (await client.query('SELECT user_id,email FROM email_verification_tokens WHERE token_hash=$1',[hash])).rows[0];
    if (!row) return false;
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[row.user_id]);
    const used = await client.query('UPDATE email_verification_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id',[hash]);
    if (!used.rowCount) return false;
    const updated = await client.query('UPDATE users SET email_verified=true,updated_at=now() WHERE id=$1 AND email=$2 RETURNING id',[row.user_id,row.email]);
    if (!updated.rowCount) return false;
    await client.query('UPDATE email_verification_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[row.user_id]);return true;
  });
  if (!verified) throw fault(400,'This verification link is invalid or expired.');
  res.json({ message:'Email verified. You can return to your account.' });
});
router.post('/provider/license', requireAuth, ensureProvider, async (req,res)=>{
  const revision=revisionValue(req.body.revision),license=typeof req.body.licenseNumber==='string'?req.body.licenseNumber.trim():'';
  if(license.length<2 || license.length>120 || Array.from(license).some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127))throw fault(400,'Enter a license or registration number of 2–120 characters.');
  await withTransaction(async client=>{
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.userId]);
    const a=(await client.query('SELECT * FROM provider_applications WHERE user_id=$1 FOR UPDATE',[req.userId])).rows[0];
    if(a.revision!==revision)throw fault(409,'Your application changed. Reload before editing license details.');
    const table=req.userRole==='doctor'?'doctors':'hospitals';
    await client.query(`UPDATE ${table} SET license_number=$1,is_license_verified=false,updated_at=now() WHERE user_id=$2`,[license,req.userId]);
    await client.query("UPDATE provider_applications SET status='draft',revision=revision+1,review_reason='',reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE user_id=$1",[req.userId]);
    await event(client,req.userId,req.userId,'details_updated',revision+1,a.proof_id,'License details updated');
  });
  res.json({message:'License details saved. Submit the updated application for review.'});
});
router.post('/provider/proof', requireAuth, ensureProvider, upload.single('proof'), async (req, res) => {
  if (!req.file) throw fault(400,'Choose a proof document.');
  if (await limited(`proof-user:${req.userId}`,10,3600)) throw fault(429,'Too many proof uploads. Please try again later.');
  const revision = revisionValue(req.body.revision), mime = proofMime(req.file.buffer);
  const encrypted = encryptFile(req.file.buffer);
  const object = await uploadFile(encrypted.blob, `credential_${crypto.randomUUID()}`);
  try {
    const result = await withTransaction(async client => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.userId]);
      const a = (await client.query('SELECT * FROM provider_applications WHERE user_id=$1 FOR UPDATE',[req.userId])).rows[0];
      if (a.revision !== revision) throw fault(409,'Your application changed. Reload before uploading again.');
      const proof = (await client.query('INSERT INTO provider_proofs(user_id,object_key,filename,mime_type,file_size_bytes,dek_wrapped,dek_iv) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[req.userId,object,req.file.originalname.slice(0,255),mime,req.file.size,encrypted.dekWrapped,encrypted.dekIv])).rows[0];
      await client.query("UPDATE provider_applications SET proof_id=$1,status='draft',revision=revision+1,review_reason='',reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE user_id=$2",[proof.id,req.userId]);
      const table = req.userRole === 'doctor' ? 'doctors' : 'hospitals';
      await client.query(`UPDATE ${table} SET is_license_verified=false WHERE user_id=$1`,[req.userId]);
      if (req.userRole === 'hospital') await client.query('UPDATE hospitals SET proof_file_id=$1,proof_filename=$2,proof_dek_wrapped=$3,proof_dek_iv=$4 WHERE user_id=$5',[object,req.file.originalname.slice(0,255),encrypted.dekWrapped,encrypted.dekIv,req.userId]);
      await event(client,req.userId,req.userId,'proof_uploaded',revision+1,proof.id);
      return { message:'Proof uploaded. Submit your application for review.',revision:revision+1 };
    });
    res.status(201).json(result);
  } catch (error) { await deleteFile(object).catch(()=>console.error('Unused proof cleanup failed.')); throw error; }
});
router.post('/provider/submit', requireAuth, ensureProvider, async (req, res) => {
  const revision = revisionValue(req.body.revision), note = typeof req.body.note==='string'?req.body.note.trim():'';
  if (note.length>2000) throw fault(400,'Keep your application note within 2000 characters.');
  await withTransaction(async client => {
    // User first, then application: same order as decisions/email confirmation.
    const u = (await client.query('SELECT email_verified FROM users WHERE id=$1 FOR UPDATE',[req.userId])).rows[0];
    const a = (await client.query('SELECT a.*,p.dek_wrapped FROM provider_applications a LEFT JOIN provider_proofs p ON p.id=a.proof_id WHERE a.user_id=$1 FOR UPDATE OF a',[req.userId])).rows[0];
    if (!u.email_verified) throw fault(403,'Verify your email before submitting credentials.');
    if (a.revision!==revision) throw fault(409,'Your application changed. Reload before submitting.');
    if (!['draft','rejected'].includes(a.status)) throw fault(409,'This application is already submitted or approved.');
    if (!a.dek_wrapped) throw fault(400,'Upload a readable proof document before submitting.');
    const table = req.userRole==='doctor'?'doctors':'hospitals';
    const license = (await client.query(`SELECT license_number FROM ${table} WHERE user_id=$1`,[req.userId])).rows[0]?.license_number;
    if (!license?.trim()) throw fault(400,'A license or registration number is required.');
    await client.query("UPDATE provider_applications SET status='pending',submission_note=$1,revision=revision+1,submitted_at=now(),review_reason='',reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE user_id=$2",[note,req.userId]);
    await event(client,req.userId,req.userId,'submitted',revision+1,a.proof_id,note);
  });
  res.json({ message:'Application submitted. An administrator will review your credentials.' });
});
router.get('/credential-proofs/:id/download', requireAuth, async (req, res) => {
  if (!uuid.test(req.params.id)) throw fault(404,'Proof not found.');
  const proof = (await pool.query('SELECT * FROM provider_proofs WHERE id=$1',[req.params.id])).rows[0];
  const admin = (await pool.query('SELECT is_admin FROM users WHERE id=$1',[req.userId])).rows[0]?.is_admin;
  if (!proof || (proof.user_id!==req.userId && !admin)) throw fault(404,'Proof not found.');
  if (!proof.dek_wrapped) throw fault(410,'The original key is unavailable. A replacement proof must be uploaded.');
  const plain = decryptFile(await downloadFile(proof.object_key),proof.dek_wrapped);
  const filename = proof.filename.replace(/[^\w.-]/g,'_');
  res.set({'Content-Type':proof.mime_type,'Content-Disposition':`attachment; filename="${filename}"`,'X-Content-Type-Options':'nosniff'}).send(plain);
});
router.get('/admin/applications', requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['draft','pending','approved','rejected','all'].includes(status)) throw fault(400,'Invalid review status.');
  const rows = await pool.query(`${applicationSql} WHERE ($1='all' OR a.status=$1) ORDER BY a.updated_at DESC LIMIT 200`,[status]);
  res.json({ applications:camelRows(rows.rows) });
});
router.get('/admin/applications/:id/events', requireAuth, requireAdmin, async (req, res) => {
  if (!uuid.test(req.params.id)) throw fault(404,'Application not found.');
  const rows=await pool.query('SELECT id,action,reason,license_number,revision,proof_id,created_at FROM provider_review_events WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[req.params.id]);
  res.json({ events:camelRows(rows.rows) });
});
router.post('/admin/applications/:id/decision', requireAuth, requireAdmin, async (req, res) => {
  if (!uuid.test(req.params.id)) throw fault(404,'Application not found.');
  if (req.params.id===req.userId) throw fault(403,'You cannot review your own provider application.');
  const {decision,reason,revision}=reviewDecision(req.body);
  await withTransaction(async client => {
    const locked=(await client.query('SELECT id,role,email_verified,is_admin FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[req.userId,req.params.id]])).rows;
    if(!locked.find(u=>u.id===req.userId)?.is_admin)throw fault(403,'Administrator access was removed.');
    const u=locked.find(u=>u.id===req.params.id);
    const a=(await client.query('SELECT a.*,p.dek_wrapped FROM provider_applications a LEFT JOIN provider_proofs p ON p.id=a.proof_id WHERE a.user_id=$1 FOR UPDATE OF a',[req.params.id])).rows[0];
    if (!a || !u || !['doctor','hospital'].includes(u.role)) throw fault(404,'Application not found.');
    if (a.revision!==revision) throw fault(409,'The application changed. Reload and review the latest proof.');
    if (!(a.status==='pending' || (decision==='rejected' && a.status==='approved'))) throw fault(409,'Only pending applications can be approved or rejected; approved applications can be suspended.');
    if (decision==='approved' && (req.body.proofReviewed!==true || req.body.proofId!==a.proof_id)) throw fault(400,'Acknowledge review of the current proof before approving.');
    if (decision==='approved' && (!u.email_verified || !a.dek_wrapped)) throw fault(409,'A verified email and readable proof are required for approval.');
    await client.query('UPDATE provider_applications SET status=$1,review_reason=$2,revision=revision+1,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE user_id=$4',[decision,reason,req.userId,req.params.id]);
    const table=u.role==='doctor'?'doctors':'hospitals';
    await client.query(`UPDATE ${table} SET is_license_verified=$1 WHERE user_id=$2`,[decision==='approved',req.params.id]);
    await event(client,req.params.id,req.userId,decision,revision+1,a.proof_id,reason);
  });
  res.json({ message:decision==='approved'?'Application approved.':'Application rejected. The provider can replace their proof and resubmit.' });
});
router.use((err,_req,res,next)=>{
  void next;
  if (err instanceof multer.MulterError) return res.status(400).json({ message:'Choose one proof file up to 4 MB.' });
  if(err.code==='23505')return res.status(409).json({message:'This license or registration number is already registered.'});
  const status=err.status||503;
  if(status>=500) console.error('Identity request failed.');
  res.status(status).json({ message:status>=500?(err.status===503?err.message:'Account verification is temporarily unavailable.'):err.message });
});
export default router;
