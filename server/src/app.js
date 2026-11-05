import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool, withTransaction } from './db.js';
import { issueToken, makeSafeUser, normalizeEmail, requireAuth, camelRow, camelRows, calculateAge, callAIChatCompletion, describeAiFailure } from './utils.js';
import { uploadFile, downloadFile } from './storage.js';
import { getPatientId, getDoctorId, getHospitalId, isAuthorizedForDocument } from './authz.js';
import { encryptFile, decryptFile } from './crypto.js';
import { logAudit } from './audit.js';
import { indexDocument, isEmbeddingConfigured, extractPdfText } from './embeddings.js';
import chatRouter from './chat.js';
import careRouter from './care.js';
import securityRouter from './security.js';
import { getPreferences, notifyUser } from './notifications.js';
import { waitUntil } from '@vercel/functions';

// Vercel serverless functions reject request bodies over 4.5 MB, so cap uploads there when deployed.
const MAX_UPLOAD_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
const app = express();

// ── CORS: allow only known origins ──
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, Postman, same-origin server calls)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
}));

// ── Rate limiters ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

// Behind Vercel/any reverse proxy: trust X-Forwarded-For so express-rate-limit keys on the real client IP
// (otherwise it logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and rate-limits everyone as one IP).
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));

// ── Request logger ──
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  next();
});

app.use('/auth', securityRouter);

// ════════════════════════════════════════
//  Health
// ════════════════════════════════════════
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('Health check error:', err.message);
    res.status(500).json({ ok: false });
  }
});
// ════════════════════════════════════════
//  Registration helpers
// ════════════════════════════════════════
async function insertPatientProfile(client, userId, data) {
  const { rows } = await client.query(
    `INSERT INTO patients (user_id, full_name, date_of_birth, blood_group, gender)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING full_name, date_of_birth, blood_group, gender`,
    [userId, data.fullName, data.dateOfBirth || null, data.bloodGroup || null, data.gender || null]
  );
  return camelRow(rows[0]);
}

async function insertDoctorProfile(client, userId, data) {
  const { rows } = await client.query(
    `INSERT INTO doctors (user_id, full_name, license_number, specialization)
     VALUES ($1, $2, $3, $4)
     RETURNING full_name, license_number, specialization`,
    [userId, data.fullName, data.licenseNumber || null, data.specialization || null]
  );
  return camelRow(rows[0]);
}

async function insertHospitalProfile(client, userId, data) {
  const { rows } = await client.query(
    `INSERT INTO hospitals (user_id, hospital_name, license_number, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING hospital_name, license_number, phone, address`,
    [userId, data.hospitalName, data.licenseNumber || null, data.phone || null, data.address || null]
  );
  return camelRow(rows[0]);
}

function ensureRole(role) {
  if (!['patient', 'doctor', 'hospital'].includes(role)) {
    const err = new Error('Unsupported role.');
    err.status = 400;
    throw err;
  }
}

async function createUserWithRole(role, payload) {
  return withTransaction(async (client) => {
    const email = normalizeEmail(payload.email || payload.officialEmail);
    if (!email || !payload.password) {
      const err = new Error('Email and password are required.');
      err.status = 400;
      throw err;
    }

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      const err = new Error('Email already exists.');
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const { rows } = await client.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, passwordHash, role]
    );
    const user = rows[0];

    let profile;
    if (role === 'patient') profile = await insertPatientProfile(client, user.id, payload);
    else if (role === 'doctor') profile = await insertDoctorProfile(client, user.id, payload);
    else profile = await insertHospitalProfile(client, user.id, payload);

    console.log(`✅  Registered ${role}: ${email}`);
    return {
      token: issueToken(user.id, role),
      user: makeSafeUser(user, profile),
      message: 'Registration successful.',
    };
  });
}

// ════════════════════════════════════════
//  Auth routes
// ════════════════════════════════════════
app.post('/auth/register/patient', registerLimiter, async (req, res) => {
  try {
    const result = await createUserWithRole('patient', req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('Register patient error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Registration failed.' });
  }
});

app.post('/auth/register/doctor', registerLimiter, async (req, res) => {
  try {
    const result = await createUserWithRole('doctor', req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('Register doctor error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Registration failed.' });
  }
});

app.post('/auth/register/hospital', registerLimiter, upload.single('proofDocument'), async (req, res) => {
  try {
    const result = await createUserWithRole('hospital', req.body);

    // Store proof document in Appwrite if provided
    if (req.file) {
      try {
        const { blob, dekWrapped, dekIv } = encryptFile(req.file.buffer);
        const appwriteFileId = await uploadFile(blob, `${crypto.randomUUID()}_${req.file.originalname}`);

        // Save Appwrite file reference on the hospital profile
        await pool.query(
          `UPDATE hospitals SET proof_file_id = $1, proof_filename = $2, proof_dek_wrapped = $4, proof_dek_iv = $5, updated_at = NOW()
           WHERE user_id = (SELECT id FROM users WHERE email = $3)`,
          [appwriteFileId, req.file.originalname, normalizeEmail(req.body.officialEmail || req.body.email), dekWrapped, dekIv]
        );
        console.log(`✅  Hospital proof document stored in object storage: ${appwriteFileId}`);
      } catch (proofErr) {
        console.warn('⚠️  Hospital proof document upload failed (registration still succeeded):', proofErr.message);
      }
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('Register hospital error:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Registration failed.' });
  }
});

app.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { role, email, password } = req.body;
    ensureRole(role);

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const { rows, rowCount } = await pool.query(
      'SELECT id, email, role, password_hash, auth_version FROM users WHERE email = $1 AND role = $2',
      [normalizedEmail, role]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found. Please register first.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Load profile with camelCase keys
    let profile = {};
    if (role === 'patient') {
      const r = await pool.query('SELECT full_name, date_of_birth, blood_group, gender, emergency_contact_name, emergency_contact_phone FROM patients WHERE user_id = $1', [user.id]);
      profile = camelRow(r.rows[0]) || {};
    } else if (role === 'doctor') {
      const r = await pool.query('SELECT full_name, license_number, specialization FROM doctors WHERE user_id = $1', [user.id]);
      profile = camelRow(r.rows[0]) || {};
    } else {
      const r = await pool.query('SELECT hospital_name, license_number, phone, address FROM hospitals WHERE user_id = $1', [user.id]);
      profile = camelRow(r.rows[0]) || {};
    }

    console.log(`✅  Login ${role}: ${normalizedEmail}`);
    return res.json({
      token: issueToken(user.id, user.role, user.auth_version),
      user: makeSafeUser(user, profile),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(err.status || 500).json({ message: err.message || 'Login failed.' });
  }
});

// ════════════════════════════════════════
//  Dashboard data endpoints
// ════════════════════════════════════════
app.get('/api/dashboard/patient', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const patientId = await getPatientId(userId);
    if (!patientId) return res.status(404).json({ message: 'Patient profile not found.' });

    const [docsR, pendR, grantsR, auditR, docsListR, reqsR, auditListR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM documents WHERE patient_id = $1', [patientId]),
      pool.query("SELECT COUNT(*)::int AS c FROM access_requests WHERE patient_id = $1 AND status = 'pending'", [patientId]),
      pool.query("SELECT COUNT(*)::int AS c FROM document_access_grants WHERE patient_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())", [patientId]),
      pool.query('SELECT COUNT(*)::int AS c FROM audit_logs WHERE patient_id = $1', [patientId]),
      pool.query(`SELECT d.id, d.original_filename AS name, d.document_type AS type,
                    COALESCE(u.email, 'You') AS uploaded_by,
                    TO_CHAR(d.created_at, 'YYYY-MM-DD') AS date,
                    CASE WHEN d.encrypted THEN 'encrypted' ELSE 'stored' END AS status
                  FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by_user_id
                  WHERE d.patient_id = $1 ORDER BY d.created_at DESC LIMIT 50`, [patientId]),
      pool.query(`SELECT ar.id, u.email AS requester, u.role,
                    ar.reason, ar.requested_scope AS scope, ar.status, ar.document_ids
                  FROM access_requests ar JOIN users u ON u.id = ar.requester_user_id
                  WHERE ar.patient_id = $1 ORDER BY ar.created_at DESC LIMIT 50`, [patientId]),
      pool.query(`SELECT id, action AS title, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS time, COALESCE(reason, metadata_json::text) AS description
                  FROM audit_logs WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 30`, [patientId]),
    ]);

    res.json({
      metrics: [
        { key: 'docs', title: 'Documents', value: String(docsR.rows[0].c), hint: docsR.rows[0].c === 0 ? 'No uploads yet' : 'Total stored documents' },
        { key: 'pending', title: 'Pending Requests', value: String(pendR.rows[0].c), hint: pendR.rows[0].c === 0 ? 'No pending requests' : 'Awaiting your action' },
        { key: 'active', title: 'Active Grants', value: String(grantsR.rows[0].c), hint: grantsR.rows[0].c === 0 ? 'No active grants' : 'Currently shared' },
        { key: 'audit', title: 'Audit Events', value: String(auditR.rows[0].c), hint: auditR.rows[0].c === 0 ? 'No activity yet' : 'Total events' },
      ],
      documents: camelRows(docsListR.rows),
      accessRequests: camelRows(reqsR.rows),
      auditEvents: camelRows(auditListR.rows),
      notifications: await getPreferences(req.userId),
    });
  } catch (err) {
    console.error('Patient dashboard error:', err.message);
    res.status(500).json({ message: 'Failed to load patient dashboard.' });
  }
});

app.get('/api/dashboard/doctor', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const [grantsR, pendR, emerR, viewsR, grantListR, reqListR, auditListR, sharedDocsR] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS c FROM document_access_grants WHERE grantee_user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())", [userId]),
      pool.query("SELECT COUNT(*)::int AS c FROM access_requests WHERE requester_user_id = $1 AND status = 'pending'", [userId]),
      pool.query('SELECT COUNT(*)::int AS c FROM emergency_access_events WHERE requester_user_id = $1', [userId]),
      pool.query("SELECT COUNT(*)::int AS c FROM audit_logs WHERE actor_user_id = $1 AND action = 'view_document'", [userId]),
      pool.query(`SELECT g.id, u.email AS patient, g.access_type AS scope,
                    TO_CHAR(g.expires_at, 'YYYY-MM-DD') AS expires_at,
                    CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked'
                         WHEN g.expires_at IS NOT NULL AND g.expires_at < NOW() THEN 'expired'
                         ELSE 'active' END AS status
                  FROM document_access_grants g
                  JOIN patients p ON p.id = g.patient_id
                  JOIN users u ON u.id = p.user_id
                  WHERE g.grantee_user_id = $1 ORDER BY g.created_at DESC LIMIT 50`, [userId]),
      pool.query(`SELECT ar.id, u.email AS patient, ar.reason,
                    ar.requested_scope AS scope, ar.status
                  FROM access_requests ar
                  JOIN patients p ON p.id = ar.patient_id
                  JOIN users u ON u.id = p.user_id
                  WHERE ar.requester_user_id = $1 ORDER BY ar.created_at DESC LIMIT 50`, [userId]),
      pool.query(`SELECT id, action AS title, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS time, COALESCE(reason, metadata_json::text) AS description
                  FROM audit_logs WHERE actor_user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId]),
      pool.query(`SELECT DISTINCT ON (d.id) d.id, d.original_filename AS name, d.document_type AS type,
                    p.full_name AS patient, u.email AS patient_email, TO_CHAR(d.created_at, 'YYYY-MM-DD') AS date,
                    CASE WHEN d.encrypted THEN 'encrypted' ELSE 'stored' END AS status
                  FROM document_access_grants g
                  JOIN documents d ON d.id = g.document_id
                  JOIN patients p ON p.id = d.patient_id
                  JOIN users u ON u.id = p.user_id
                  WHERE g.grantee_user_id = $1 AND g.status = 'approved'
                    AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > NOW())
                  ORDER BY d.id, d.created_at DESC LIMIT 50`, [userId]),
    ]);

    res.json({
      metrics: [
        { key: 'grants', title: 'Active Grants', value: String(grantsR.rows[0].c), hint: grantsR.rows[0].c === 0 ? 'No grants yet' : 'Patients sharing with you' },
        { key: 'pending', title: 'Pending Requests', value: String(pendR.rows[0].c), hint: pendR.rows[0].c === 0 ? 'No open requests' : 'Awaiting approval' },
        { key: 'emergency', title: 'Emergency Sessions', value: String(emerR.rows[0].c), hint: emerR.rows[0].c === 0 ? 'No emergency sessions' : 'Total sessions' },
        { key: 'views', title: 'Documents Reviewed', value: String(viewsR.rows[0].c), hint: viewsR.rows[0].c === 0 ? 'No reviewed documents' : 'Total reviews' },
      ],
      grantedAccess: camelRows(grantListR.rows),
      requestHistory: camelRows(reqListR.rows),
      sharedDocuments: camelRows(sharedDocsR.rows),
      auditEvents: camelRows(auditListR.rows),
      notifications: await getPreferences(req.userId),
    });
  } catch (err) {
    console.error('Doctor dashboard error:', err.message);
    res.status(500).json({ message: 'Failed to load doctor dashboard.' });
  }
});

app.get('/api/dashboard/hospital', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const hospitalId = await getHospitalId(userId);
    if (!hospitalId) return res.status(404).json({ message: 'Hospital profile not found.' });

    const [staffR, uploadsR, verifyR, compR, uploadListR, staffListR, compListR] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT g.grantee_user_id)::int AS c FROM document_access_grants g
                  JOIN documents d ON d.id = g.document_id
                  WHERE d.hospital_id = $1 AND g.status = 'approved' AND g.revoked_at IS NULL
                    AND (g.expires_at IS NULL OR g.expires_at > NOW())`, [hospitalId]),
      pool.query("SELECT COUNT(*)::int AS c FROM documents WHERE uploaded_by_user_id = $1 AND created_at > NOW() - interval '7 days'", [userId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM access_requests
                  WHERE patient_id IN (SELECT p.id FROM patients p JOIN documents d ON d.patient_id = p.id WHERE d.hospital_id = $1) AND status = 'pending'`, [hospitalId]),
      pool.query("SELECT COUNT(*)::int AS c FROM audit_logs WHERE actor_user_id = $1 AND action::text LIKE '%compliance%'", [userId]),
      pool.query(`SELECT d.id, u.email AS patient, d.original_filename AS file,
                    TO_CHAR(d.created_at, 'YYYY-MM-DD HH24:MI') AS submitted_at,
                    CASE WHEN d.encrypted THEN 'encrypted' ELSE 'pending' END AS status
                  FROM documents d LEFT JOIN patients p ON p.id = d.patient_id
                  LEFT JOIN users u ON u.id = p.user_id
                  WHERE d.uploaded_by_user_id = $1 ORDER BY d.created_at DESC LIMIT 50`, [userId]),
      pool.query(`SELECT u.id AS id, u.email AS doctor, u.id AS grantee_user_id, 'General' AS department,
                    COUNT(g.id)::int AS grants, 'active' AS status
                  FROM document_access_grants g
                  JOIN documents d ON d.id = g.document_id JOIN users u ON u.id = g.grantee_user_id
                  WHERE d.hospital_id = $1 AND g.status = 'approved' AND g.revoked_at IS NULL
                    AND (g.expires_at IS NULL OR g.expires_at > NOW())
                  GROUP BY u.email, u.id LIMIT 50`, [hospitalId]),
      pool.query(`SELECT id, action AS title, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS time, COALESCE(reason, metadata_json::text) AS description
                  FROM audit_logs WHERE actor_user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId]),
    ]);

    res.json({
      metrics: [
        { key: 'staff', title: 'Staff Linked', value: String(staffR.rows[0].c), hint: staffR.rows[0].c === 0 ? 'No staff linked yet' : 'Active staff' },
        { key: 'uploads', title: 'Uploads This Week', value: String(uploadsR.rows[0].c), hint: uploadsR.rows[0].c === 0 ? 'No uploads yet' : 'This week' },
        { key: 'verify', title: 'Pending Verifications', value: String(verifyR.rows[0].c), hint: verifyR.rows[0].c === 0 ? 'No pending verifications' : 'Awaiting action' },
        { key: 'compliance', title: 'Compliance Flags', value: String(compR.rows[0].c), hint: compR.rows[0].c === 0 ? 'No compliance flags' : 'Review needed' },
      ],
      uploadQueue: camelRows(uploadListR.rows),
      staffAccess: camelRows(staffListR.rows),
      complianceEvents: camelRows(compListR.rows),
      notifications: await getPreferences(req.userId),
    });
  } catch (err) {
    console.error('Hospital dashboard error:', err.message);
    res.status(500).json({ message: 'Failed to load hospital dashboard.' });
  }
});

// ════════════════════════════════════════
//  Profile update endpoints
// ════════════════════════════════════════
app.patch('/api/profile/patient', requireAuth, async (req, res) => {
  try {
    const patientId = await getPatientId(req.userId);
    if (!patientId) return res.status(404).json({ message: 'Patient profile not found.' });
    const { fullName, bloodGroup, gender, emergencyContactPhone, emergencyContactName } = req.body;
    const { rows } = await pool.query(
      `UPDATE patients SET
         full_name = COALESCE($1, full_name),
         blood_group = COALESCE($2, blood_group),
         gender = COALESCE($3, gender),
         emergency_contact_phone = COALESCE($4, emergency_contact_phone),
         emergency_contact_name = COALESCE($5, emergency_contact_name),
         updated_at = NOW()
       WHERE id = $6
       RETURNING full_name, date_of_birth, blood_group, gender, emergency_contact_phone, emergency_contact_name`,
      [fullName || null, bloodGroup || null, gender || null, emergencyContactPhone || null, emergencyContactName || null, patientId]
    );
    res.json({ message: 'Profile updated.', profile: camelRow(rows[0]) });
  } catch (err) {
    console.error('Update patient profile error:', err.message);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

app.patch('/api/profile/doctor', requireAuth, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req.userId);
    if (!doctorId) return res.status(404).json({ message: 'Doctor profile not found.' });
    const { fullName, specialization } = req.body;
    const { rows } = await pool.query(
      `UPDATE doctors SET
         full_name = COALESCE($1, full_name),
         specialization = COALESCE($2, specialization),
         updated_at = NOW()
       WHERE id = $3
       RETURNING full_name, license_number, specialization`,
      [fullName || null, specialization || null, doctorId]
    );
    res.json({ message: 'Profile updated.', profile: camelRow(rows[0]) });
  } catch (err) {
    console.error('Update doctor profile error:', err.message);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

app.patch('/api/profile/hospital', requireAuth, async (req, res) => {
  try {
    const hospitalId = await getHospitalId(req.userId);
    if (!hospitalId) return res.status(404).json({ message: 'Hospital profile not found.' });
    const { hospitalName, phone, address } = req.body;
    const { rows } = await pool.query(
      `UPDATE hospitals SET
         hospital_name = COALESCE($1, hospital_name),
         phone = COALESCE($2, phone),
         address = COALESCE($3, address),
         updated_at = NOW()
       WHERE id = $4
       RETURNING hospital_name, license_number, phone, address`,
      [hospitalName || null, phone || null, address || null, hospitalId]
    );
    res.json({ message: 'Profile updated.', profile: camelRow(rows[0]) });
  } catch (err) {
    console.error('Update hospital profile error:', err.message);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// ════════════════════════════════════════
//  Document upload
// ════════════════════════════════════════
app.post('/api/documents/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { documentType, description, visitDate, patientId: patientIdInput } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file provided.' });
    if (!documentType) return res.status(400).json({ message: 'Document type is required.' });

    let patientId;
    let hospitalId = null;

    // Verify role from database (in-memory session may be stale after restart)
    const { rows: roleRows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    const role = roleRows[0]?.role || req.userRole;

    if (role === 'doctor' || role === 'hospital') {
      if (!patientIdInput) return res.status(400).json({ message: 'Patient identifier is required.' });
      // Look up patient by email or UUID
      const byEmail = await pool.query(
        'SELECT p.id FROM patients p JOIN users u ON u.id = p.user_id WHERE u.email = $1',
        [patientIdInput.trim().toLowerCase()]
      );
      if (byEmail.rowCount > 0) {
        patientId = byEmail.rows[0].id;
      } else {
        // Only try the UUID lookup for UUID-shaped input; Postgres throws on "invalid input syntax for type uuid" otherwise
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const byId = UUID_RE.test(patientIdInput.trim())
          ? await pool.query('SELECT id FROM patients WHERE id = $1', [patientIdInput.trim()])
          : { rowCount: 0, rows: [] };
        if (byId.rowCount > 0) patientId = byId.rows[0].id;
        else return res.status(404).json({ message: `Patient not found for "${patientIdInput.trim()}". The patient must register first; use the exact email they log in with.` });
      }
      if (role === 'hospital') hospitalId = await getHospitalId(req.userId);
    } else {
      return res.status(403).json({ message: 'Only doctors and hospitals can upload documents.' });
    }

    const { dekWrapped, dekIv, blob, checksum } = encryptFile(file.buffer);

    // Upload encrypted blob to Appwrite Storage
    const appwriteFileId = await uploadFile(blob, `${crypto.randomUUID()}_${file.originalname}`);

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO documents (patient_id, uploaded_by_user_id, hospital_id, document_type,
           original_filename, mime_type, file_size_bytes, total_chunks,
           file_checksum_sha256, encrypted, dek_wrapped, dek_iv, visit_date, description, appwrite_file_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,true,$9,$10,$11,$12,$13) RETURNING id`,
        [patientId, req.userId, hospitalId, documentType, file.originalname, file.mimetype,
          file.size, checksum, dekWrapped, dekIv, visitDate || null, description || null, appwriteFileId]
      );
      const docId = rows[0].id;

      await logAudit({
        patientId, documentId: docId, actorUserId: req.userId,
        action: 'upload', req, metadata: { filename: file.originalname, size: file.size, storage: 'appwrite' },
      }, client);

      return docId;
    });

    res.status(201).json({ message: 'Document uploaded successfully.', documentId: result });

    // Index for chat/RAG retrieval. Fire-and-forget so upload latency isn't
    // gated on chunking + embedding; failures are logged, not surfaced to the
    // uploader (the document still uploaded fine, it just won't be chat-searchable yet).
    // waitUntil (not a bare un-awaited call) because on Vercel the serverless
    // function can be frozen the instant res.json() above resolves — without
    // it, this promise silently never finishes and nothing gets indexed.
    if (isEmbeddingConfigured()) {
      waitUntil(
        indexDocument(result).catch((err) => {
          console.error(`Background indexing failed for document ${result}:`, err.message);
        })
      );
    }
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ message: 'Upload failed.' });
  }
});

// ════════════════════════════════════════
//  Document download
// ════════════════════════════════════════
app.get('/api/documents/:id/download', requireAuth, async (req, res) => {
  try {
    const docId = req.params.id;
    const userId = req.userId;

    const { rows: docs } = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
    if (docs.length === 0) return res.status(404).json({ message: 'Document not found.' });
    const doc = docs[0];

    // Authorize: owner, uploader, or active grant holder (shared with summarize + chat retrieval)
    const authorized = await isAuthorizedForDocument(doc, userId, req.userRole);

    if (!authorized) {
      await logAudit({
        patientId: doc.patient_id, documentId: docId, actorUserId: userId,
        action: 'download_document', status: 'denied', req,
      });
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (!doc.appwrite_file_id) {
      return res.status(410).json({ message: 'Document stored in legacy format. Re-upload required.' });
    }

    const encryptedBuf = await downloadFile(doc.appwrite_file_id);
    const plainBuffer = doc.encrypted ? decryptFile(encryptedBuf, doc.dek_wrapped) : encryptedBuf;

    await logAudit({
      patientId: doc.patient_id, documentId: docId, actorUserId: userId,
      action: 'download_document', req,
    });

    // RFC 5987 encoded filename prevents header injection via control chars / newlines
    const safeAsciiName = doc.original_filename.replace(/[^\w.-]/g, '_');
    res.set({
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(doc.original_filename)}`,
      'Content-Length': plainBuffer.length,
    });
    res.send(plainBuffer);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ message: 'Download failed.' });
  }
});

// ════════════════════════════════════════
//  Access requests (doctor/hospital → patient)
// ════════════════════════════════════════
app.post('/api/access-requests', requireAuth, async (req, res) => {
  try {
    const { patientEmail, reason, scope } = req.body;
    if (!patientEmail || !reason || !scope) {
      return res.status(400).json({ message: 'patientEmail, reason, and scope are required.' });
    }

    const pr = await pool.query(
      'SELECT p.id AS patient_id FROM patients p JOIN users u ON u.id = p.user_id WHERE u.email = $1',
      [patientEmail.trim().toLowerCase()]
    );
    if (pr.rowCount === 0) return res.status(404).json({ message: 'Patient not found with that email.' });
    const patientId = pr.rows[0].patient_id;

    const { rows } = await pool.query(
      `INSERT INTO access_requests (patient_id, requester_user_id, requested_scope, reason)
       VALUES ($1,$2,$3,$4) RETURNING id, status`,
      [patientId, req.userId, scope, reason]
    );

    await logAudit({
      patientId, actorUserId: req.userId,
      action: 'share_document', req, metadata: { scope, reason },
    });

    res.status(201).json({ message: 'Access request submitted.', request: camelRow(rows[0]) });
  } catch (err) {
    console.error('Access request error:', err.message);
    res.status(500).json({ message: 'Failed to submit request.' });
  }
});

app.patch('/api/access-requests/:id', requireAuth, async (req, res) => {
  try {
    const arId = req.params.id;
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject".' });
    }

    const patientId = await getPatientId(req.userId);
    if (!patientId) return res.status(403).json({ message: 'Not a patient.' });

    const { rows: arRows } = await pool.query(
      "SELECT * FROM access_requests WHERE id = $1 AND patient_id = $2 AND status = 'pending'",
      [arId, patientId]
    );
    if (arRows.length === 0) return res.status(404).json({ message: 'Request not found or already resolved.' });
    const ar = arRows[0];

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await withTransaction(async (client) => {
      await client.query('UPDATE access_requests SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, arId]);

      if (action === 'approve') {
        // Determine which documents to grant access to
        let docsToGrant;
        if (ar.document_ids) {
          // Specific documents requested
          const requestedDocIds = typeof ar.document_ids === 'string' ? JSON.parse(ar.document_ids) : ar.document_ids;
          const docsR = await client.query(
            'SELECT id, dek_wrapped FROM documents WHERE id = ANY($1) AND patient_id = $2',
            [requestedDocIds, patientId]
          );
          docsToGrant = docsR.rows;
        } else {
          // Legacy: Grant access to all patient documents for 30 days
          const docsR = await client.query('SELECT id, dek_wrapped FROM documents WHERE patient_id = $1', [patientId]);
          docsToGrant = docsR.rows;
        }

        for (const doc of docsToGrant) {
          await client.query(
            `INSERT INTO document_access_grants
               (document_id, patient_id, grantee_user_id, status, access_type, request_reason, granted_at, expires_at, wrapped_dek_for_grantee)
             VALUES ($1,$2,$3,'approved','read_only',$4,NOW(),NOW() + interval '30 days',$5)
             ON CONFLICT (document_id, grantee_user_id) DO UPDATE
               SET status = 'approved', revoked_at = NULL, expires_at = NOW() + interval '30 days', updated_at = NOW()`,
            [doc.id, patientId, ar.requester_user_id, ar.reason, doc.dek_wrapped]
          );
        }
        await logAudit({ patientId, actorUserId: req.userId, action: 'grant_access', req, metadata: { requestId: arId, documentCount: docsToGrant.length, granteeUserId: ar.requester_user_id } }, client);
      } else {
        await logAudit({ patientId, actorUserId: req.userId, action: 'revoke_access', status: 'denied', req, metadata: { requestId: arId } }, client);
      }
    });

    res.json({ message: `Request ${newStatus}.` });
  } catch (err) {
    console.error('Approve/reject error:', err.message);
    res.status(500).json({ message: 'Failed to process request.' });
  }
});

// Search patient by email and get available documents
app.get('/api/patients/search', requireAuth, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const emailNorm = normalizeEmail(email);
    const pr = await pool.query(
      `SELECT p.id AS patient_id, p.full_name, u.email, p.blood_group, p.date_of_birth, p.gender
       FROM patients p JOIN users u ON u.id = p.user_id WHERE u.email = $1`,
      [emailNorm]
    );
    if (pr.rowCount === 0) return res.status(404).json({ message: 'Patient not found.' });

    const patient = pr.rows[0];

    // Get patient's documents (not including already granted ones if needed)
    const docs = await pool.query(
      `SELECT id, original_filename AS document_name, document_type, visit_date, created_at AS uploaded_at
       FROM documents WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patient.patient_id]
    );

    res.json({
      patient: {
        id: patient.patient_id,
        fullName: patient.full_name,
        email: patient.email,
        bloodGroup: patient.blood_group,
        dateOfBirth: patient.date_of_birth,
        age: calculateAge(patient.date_of_birth),
        gender: patient.gender,
      },
      documents: camelRows(docs.rows),
    });
  } catch (err) {
    console.error('Patient search error:', err.message);
    res.status(500).json({ message: 'Failed to search patient.' });
  }
});

// Request access to specific documents
app.post('/api/access-requests/documents', requireAuth, async (req, res) => {
  try {
    const { patientId, documentIds, reason } = req.body;
    if (!patientId || !documentIds || !Array.isArray(documentIds) || documentIds.length === 0 || !reason) {
      return res.status(400).json({ message: 'patientId, documentIds (array), and reason are required.' });
    }

    // Verify patient exists
    const pr = await pool.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (pr.rowCount === 0) return res.status(404).json({ message: 'Patient not found.' });

    // Create access request with specific documents
    const { rows } = await pool.query(
      `INSERT INTO access_requests (patient_id, requester_user_id, requested_scope, reason, document_ids)
       VALUES ($1, $2, 'specific_documents', $3, $4) RETURNING id, status`,
      [patientId, req.userId, reason, JSON.stringify(documentIds)]
    );

    await logAudit({
      patientId, actorUserId: req.userId,
      action: 'request_document_access', req, metadata: { documentIds, reason },
    });

    res.status(201).json({ message: 'Document access request submitted.', request: camelRow(rows[0]) });
  } catch (err) {
    console.error('Document access request error:', err.message);
    res.status(500).json({ message: 'Failed to submit document access request.' });
  }
});

// Get documents by IDs for patient to see in access request
app.get('/api/documents/by-ids', requireAuth, async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ message: 'ids parameter is required.' });

    // documents.id is a UUID, not an integer — the old .map(Number) turned every id into NaN
    // and this endpoint always 400'd. Only accept well-formed UUIDs.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const docIds = ids.split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s));
    if (docIds.length === 0) return res.status(400).json({ message: 'Valid document IDs required.' });

    const { rows } = await pool.query(
      `SELECT id, original_filename AS document_name, original_filename, document_type, visit_date, created_at AS uploaded_at
       FROM documents WHERE id = ANY($1)`,
      [docIds]
    );

    res.json({ documents: camelRows(rows) });
  } catch (err) {
    console.error('Get documents by IDs error:', err.message);
    res.status(500).json({ message: 'Failed to get documents.' });
  }
});

// ════════════════════════════════════════
//  Revoke grant
// ════════════════════════════════════════
app.post('/api/grants/:id/revoke', requireAuth, async (req, res) => {
  try {
    const grantId = req.params.id;
    const { rows } = await pool.query(
      `SELECT g.*, d.uploaded_by_user_id FROM document_access_grants g
       JOIN documents d ON d.id = g.document_id
       WHERE g.id = $1 AND g.revoked_at IS NULL`,
      [grantId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Grant not found or already revoked.' });
    const grant = rows[0];

    const patientId = await getPatientId(req.userId);
    const canRevoke = (patientId && grant.patient_id === patientId) || grant.uploaded_by_user_id === req.userId;
    if (!canRevoke) return res.status(403).json({ message: 'Not authorized to revoke this grant.' });

    await pool.query("UPDATE document_access_grants SET revoked_at = NOW(), status = 'revoked', updated_at = NOW() WHERE id = $1", [grantId]);

    await logAudit({
      patientId: grant.patient_id, documentId: grant.document_id, actorUserId: req.userId,
      action: 'revoke_access', req, metadata: { grantId, granteeUserId: grant.grantee_user_id },
    });

    res.json({ message: 'Grant revoked.' });
  } catch (err) {
    console.error('Revoke error:', err.message);
    res.status(500).json({ message: 'Failed to revoke grant.' });
  }
});

// Bulk-revoke all grants for a specific grantee on documents uploaded by the current user
app.post('/api/grants/revoke-by-grantee', requireAuth, async (req, res) => {
  try {
    const { granteeUserId } = req.body;
    if (!granteeUserId) return res.status(400).json({ message: 'granteeUserId is required.' });

    const result = await pool.query(
      `UPDATE document_access_grants g SET revoked_at = NOW(), status = 'revoked', updated_at = NOW()
       FROM documents d
       WHERE g.document_id = d.id AND d.uploaded_by_user_id = $1
         AND g.grantee_user_id = $2 AND g.revoked_at IS NULL
       RETURNING g.id, g.patient_id, g.document_id`,
      [req.userId, granteeUserId]
    );

    for (const grant of result.rows) await logAudit({ patientId: grant.patient_id, documentId: grant.document_id, actorUserId: req.userId,
      action: 'revoke_access', req, metadata: { grantId: grant.id, granteeUserId } });
    res.json({ message: `Revoked ${result.rowCount} grant(s).` });
  } catch (err) {
    console.error('Bulk revoke error:', err.message);
    res.status(500).json({ message: 'Failed to revoke grants.' });
  }
});

// ════════════════════════════════════════
//  Emergency Access
// ════════════════════════════════════════
app.post('/api/emergency-access/initiate', requireAuth, async (req, res) => {
  try {
    // Only doctors and hospitals may initiate
    const roleR = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    const role = roleR.rows[0]?.role;
    if (role !== 'doctor' && role !== 'hospital') {
      return res.status(403).json({ error: 'Only doctors and hospitals can initiate emergency access.' });
    }

    const { patientEmail } = req.body;
    if (!patientEmail) return res.status(400).json({ error: 'patientEmail is required.' });

    // Find patient user (including health detail columns)
    const patientUserR = await pool.query(
      `SELECT u.id AS user_id, p.id AS patient_id, p.full_name, p.date_of_birth, p.blood_group, p.gender,
              p.emergency_contact_phone, p.emergency_contact_name, p.emergency_consent_enabled,
              p.allergies, p.chronic_conditions, p.current_medications
       FROM users u JOIN patients p ON p.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) AND u.role = 'patient'`,
      [patientEmail.trim()]
    );

    if (patientUserR.rowCount === 0) {
      return res.status(404).json({ error: 'Patient not found with that email.' });
    }

    const pt = patientUserR.rows[0];

    // Guard: patient must have opted into emergency access
    if (!pt.emergency_consent_enabled) {
      return res.status(403).json({
        error: 'This patient has not enabled emergency access. Their records cannot be accessed this way.',
      });
    }

    // Create emergency_access_events record (24h window)
    const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const hospitalId = role === 'hospital'
      ? (await pool.query('SELECT id FROM hospitals WHERE user_id = $1', [req.userId])).rows[0]?.id
      : null;

    await pool.query(
      `INSERT INTO emergency_access_events (patient_id, approved_by_hospital_id, requester_user_id, reason, status, ends_at)
       VALUES ($1, $2, $3, $4, 'active', $5)`,
      [pt.patient_id, hospitalId, req.userId, 'Emergency access initiated with patient consent', endsAt]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (patient_id, actor_user_id, action, status, reason)
       VALUES ($1, $2, 'emergency_access', 'success', 'Emergency 24h access initiated')`,
      [pt.patient_id, req.userId]
    );

    // Fetch patient documents
    const docsR = await pool.query(
      `SELECT id, document_type, original_filename, mime_type, created_at
       FROM documents WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [pt.patient_id]
    );

    // Parse comma-separated health fields into arrays
    const parseList = (val) =>
      val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Fetch drug interactions for this patient
    const diR = await pool.query(
      `SELECT di.id, di.drug_a, di.drug_b, di.severity, di.interaction_type,
              di.description, di.recommendation,
              TO_CHAR(di.created_at, 'YYYY-MM-DD') AS date,
              doc.full_name AS doctor_name
       FROM drug_interactions di
       LEFT JOIN doctors doc ON doc.user_id = di.doctor_user_id
       WHERE di.patient_id = $1
       ORDER BY di.created_at DESC`,
      [pt.patient_id]
    );

    const patient = {
      name: pt.full_name,
      dob: pt.date_of_birth ? new Date(pt.date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null,
      age: calculateAge(pt.date_of_birth),
      gender: pt.gender,
      bloodGroup: pt.blood_group,
      allergies: parseList(pt.allergies),
      conditions: parseList(pt.chronic_conditions),
      medications: parseList(pt.current_medications),
      drugInteractions: camelRows(diR.rows),
      emergencyContact: pt.emergency_contact_name
        ? { name: pt.emergency_contact_name, phone: pt.emergency_contact_phone || 'N/A' }
        : null,
      documents: docsR.rows.map(d => ({
        id: d.id,
        title: d.original_filename,
        type: d.document_type,
        date: new Date(d.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      })),
    };

    await notifyUser(pt.user_id, 'emergency_access', 'Emergency access started', 'A clinician opened a 24-hour emergency access window.');
    res.json({ patient, endsAt: endsAt.toISOString() });
  } catch (err) {
    console.error('Emergency access error:', err.message);
    res.status(500).json({ error: 'Failed to initiate emergency access.' });
  }
});

// ════════════════════════════════════════
//  AI Document Summary (any OpenAI-compatible chat API: Ollama, OpenRouter, ...)
// ════════════════════════════════════════
app.post('/api/ai/summarize/:id', requireAuth, async (req, res) => {
  try {
    // AI_BASE_URL: OpenAI-compatible base, e.g. http://localhost:11434/v1 (Ollama) or https://openrouter.ai/api/v1
    // Legacy: GEMINI_API_KEY alone still means OpenRouter + gpt-4o.
    const AI_API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
    const AI_BASE_URL = (process.env.AI_BASE_URL || (process.env.GEMINI_API_KEY ? 'https://openrouter.ai/api/v1' : '')).replace(/\/$/, '');
    const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o';
    // gemini-3.6-flash (the reasoning-heavy primary model) has real, verified
    // intermittent 503 "high demand" capacity issues on Google's side — not
    // fixable by retries alone. gemini-3.1-flash-lite is a fast, verified-working
    // fallback (~2s for a full document vs 20-50s+ and frequent 503s on primary).
    const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || '';
    const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60000;
    if (!AI_BASE_URL) return res.status(503).json({ message: 'AI service not configured. Set AI_BASE_URL and AI_MODEL in .env.' });

    const docId = req.params.id;
    const userId = req.userId;

    const { rows: docs } = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
    if (docs.length === 0) return res.status(404).json({ message: 'Document not found.' });
    const doc = docs[0];

    // Authorize: same shared check as download (server/src/authz.js)
    const authorized = await isAuthorizedForDocument(doc, userId, req.userRole);
    if (!authorized) return res.status(403).json({ message: 'Access denied.' });

    if (!doc.appwrite_file_id) {
      return res.status(410).json({ message: 'Document stored in legacy format. Re-upload required.' });
    }

    // Fetch & decrypt
    const encryptedBuf = await downloadFile(doc.appwrite_file_id);
    const plainBuffer = doc.encrypted ? decryptFile(encryptedBuf, doc.dek_wrapped) : encryptedBuf;
    const base64Data = plainBuffer.toString('base64');
    const mimeType = doc.mime_type || 'application/pdf';

    console.log(`Document size: ${plainBuffer.length} bytes, base64 length: ${base64Data.length}`);

    // For anything that isn't an image, the model needs the actual document
    // content, not just its filename/size — that was the bug: PDFs (and any
    // other non-image type) went to the AI with no content at all, just a
    // metadata description, so there was nothing to actually summarize.
    let extractedText = '';
    const MAX_SUMMARY_CHARS = 15000;
    if (!mimeType.startsWith('image/')) {
      if (mimeType === 'application/pdf') {
        try {
          extractedText = await extractPdfText(plainBuffer);
        } catch (err) {
          console.error('PDF text extraction failed for summarize:', err.message);
          return res.status(422).json({ message: `Could not read this PDF for analysis: ${err.message}` });
        }
      } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        extractedText = plainBuffer.toString('utf8');
      }
      if (!extractedText || !extractedText.trim()) {
        return res.status(422).json({
          message: `No readable text found in this document (${mimeType}) — AI summary isn't available for this file type yet.`,
        });
      }
      if (extractedText.length > MAX_SUMMARY_CHARS) {
        extractedText = `${extractedText.slice(0, MAX_SUMMARY_CHARS)}\n\n[...truncated for length...]`;
      }
    }

    const systemPrompt = `You are MediVault AI — an intelligent medical document analysis and summarization assistant.
AUDIENCE: Patients, Doctors. TONE: Warm, clear, professional.

STRICT OUTPUT FORMAT:
🏥 DOCUMENT IDENTIFIED: [Type]
📋 KEY FINDINGS: [Bullet points]
⚠️ ALERTS: [Parameter] — [Value] vs [Range] — [Meaning]
💊 MEDICATIONS: [Names, Dose, Freq]
🧠 SIMPLE SUMMARY: [3-4 sentences, no jargon]
🩺 CLINICAL SUMMARY: [Technical details if any]
❓ QUESTIONS: [2-3 for doctor]
🔴 URGENCY: [Routine / Monitor / Urgent / Critical]

RULES:
- Never diagnose.
- Always flag abnormal values with ⚠️.
- Be empathetic.
- High priority ⚠️⚠️ for lesions, masses, or fractures.`;

    const aiUrl = `${AI_BASE_URL}/chat/completions`;
    const buildAiBody = (model) => ({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: mimeType.startsWith('image/')
            ? [
              { type: 'text', text: `Analyze this medical image named "${doc.original_filename}" (${mimeType}, ${plainBuffer.length} bytes). Provide a comprehensive analysis in the format specified above.` },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
            ]
            : `Analyze this medical document named "${doc.original_filename}" (${mimeType}).\n\nDocument content:\n"""\n${extractedText}\n"""\n\nProvide a comprehensive analysis in the format specified above, based on the document content.`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    let aiRes;
    let modelUsed = AI_MODEL;
    try {
      console.log(`Calling AI model "${AI_MODEL}" at ${AI_BASE_URL} (timeout ${AI_TIMEOUT_MS} ms)...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      aiRes = await callAIChatCompletion({
        url: aiUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
          'HTTP-Referer': 'https://medivault.local',
          'X-Title': 'MediVault',
        },
        buildBody: buildAiBody,
        primaryModel: AI_MODEL,
        fallbackModel: AI_FALLBACK_MODEL,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('AI API response:', aiRes.status);
    } catch (fetchErr) {
      console.error('Fetch error details:', {
        code: fetchErr.code,
        message: fetchErr.message,
        cause: fetchErr.cause?.code,
        causeMsg: fetchErr.cause?.message,
      });

      const { status, message } = describeAiFailure(fetchErr);
      return res.status(status).json({ message });
    }

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      console.error('AI API error details:');
      console.error('  Status:', aiRes.status);
      console.error('  Headers:', Object.fromEntries(aiRes.headers.entries()));
      console.error('  Body:', errBody);

      let errorMsg = 'AI analysis failed.';
      try {
        const errJson = JSON.parse(errBody);
        errorMsg = errJson.error?.message || errJson.message || errBody;
        console.error('  Parsed error:', errorMsg);
      } catch {
        // Fall back to raw body
      }

      return res.status(502).json({
        message: 'AI analysis failed.',
        details: aiRes.status === 429 ? 'API rate limited' : undefined,
        debug: process.env.NODE_ENV === 'development' ? errorMsg : undefined
      });
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || 'No summary generated.';
    modelUsed = aiData.model || AI_MODEL;
    if (modelUsed !== AI_MODEL) {
      console.warn(`Summary served by fallback model "${modelUsed}" (primary "${AI_MODEL}" was unavailable).`);
    }

    // Honest signal instead of silently rendering broken output: the client's
    // parser (AISummaryModal.jsx) splits on these section markers, so if the
    // model didn't follow the requested format closely, tell the user rather
    // than let it look like a normal (but oddly laid out) summary.
    const REQUIRED_SECTION_MARKERS = ['🏥', '📋', '🧠', '🔴'];
    const missingMarkers = REQUIRED_SECTION_MARKERS.filter((m) => !summary.includes(m));
    const parseWarning = missingMarkers.length > 0;
    if (parseWarning) {
      console.warn(`Summary for document ${docId} is missing expected section marker(s): ${missingMarkers.join(' ')}`);
    }

    await logAudit({
      patientId: doc.patient_id, documentId: docId, actorUserId: userId,
      action: 'ai_summarize', req, metadata: { model: modelUsed, baseUrl: AI_BASE_URL, parseWarning },
    });

    res.json({ summary, filename: doc.original_filename, parseWarning });
  } catch (err) {
    console.error('AI summarize error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ message: 'AI analysis failed.' });
  }
});

// ════════════════════════════════════════
//  Drug Interactions
// ════════════════════════════════════════

// POST /api/drug-interactions — doctor writes a note
app.post('/api/drug-interactions', requireAuth, async (req, res) => {
  try {
    // Only doctors may write drug interactions
    const roleR = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (roleR.rows[0]?.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can write drug interaction notes.' });
    }

    const { patientId, drugA, drugB, severity, interactionType, description, recommendation } = req.body;
    if (!patientId || !drugA || !drugB || !severity || !interactionType || !description) {
      return res.status(400).json({ message: 'patientId, drugA, drugB, severity, interactionType, and description are required.' });
    }

    const VALID_SEVERITY = ['mild', 'moderate', 'severe', 'contraindicated'];
    const VALID_TYPE = ['pharmacokinetic', 'pharmacodynamic', 'food_drug', 'allergy', 'other'];
    if (!VALID_SEVERITY.includes(severity)) return res.status(400).json({ message: `severity must be one of: ${VALID_SEVERITY.join(', ')}` });
    if (!VALID_TYPE.includes(interactionType)) return res.status(400).json({ message: `interactionType must be one of: ${VALID_TYPE.join(', ')}` });

    // Verify patient exists
    const pR = await pool.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (pR.rowCount === 0) return res.status(404).json({ message: 'Patient not found.' });

    const { rows } = await pool.query(
      `INSERT INTO drug_interactions
         (patient_id, doctor_user_id, drug_a, drug_b, severity, interaction_type, description, recommendation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, drug_a, drug_b, severity, interaction_type, description, recommendation,
                 TO_CHAR(created_at, 'YYYY-MM-DD') AS date`,
      [patientId, req.userId, drugA.trim(), drugB.trim(), severity, interactionType, description.trim(), recommendation?.trim() || null]
    );

    try {
      await pool.query(
        `INSERT INTO audit_logs (patient_id, actor_user_id, action, status, reason)
         VALUES ($1,$2,'drug_interaction_write','success',$3)`,
        [patientId, req.userId, `Drug interaction noted: ${drugA} ↔ ${drugB} (${severity})`]
      );
    } catch (auditErr) {
      console.warn('Audit log failed (non-fatal):', auditErr.message);
    }

    res.status(201).json({ message: 'Drug interaction saved.', interaction: camelRow(rows[0]) });
  } catch (err) {
    console.error('Drug interaction write error:', err.message);
    res.status(500).json({ message: 'Failed to save drug interaction.' });
  }
});

// GET /api/drug-interactions/:patientId — fetch all for a patient
app.get('/api/drug-interactions/:patientId', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Authorize: patient themselves, any doctor with active grant, or doctor/hospital role
    const roleR = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    const role = roleR.rows[0]?.role;
    let authorized = false;

    if (role === 'patient') {
      const pidR = await pool.query('SELECT id FROM patients WHERE user_id = $1 AND id = $2', [req.userId, patientId]);
      authorized = pidR.rowCount > 0;
    } else if (role === 'doctor' || role === 'hospital') {
      // Doctor: owns the record OR has active grant on any document for this patient
      const grantR = await pool.query(
        `SELECT 1 FROM document_access_grants g
         JOIN documents d ON d.id = g.document_id
         WHERE d.patient_id = $1 AND g.grantee_user_id = $2
           AND g.status = 'approved' AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR g.expires_at > NOW())
         LIMIT 1`,
        [patientId, req.userId]
      );
      authorized = grantR.rowCount > 0;
      // Also allow: doctor wrote interactions for this patient even without a grant
      if (!authorized) {
        const wroteR = await pool.query(
          'SELECT 1 FROM drug_interactions WHERE patient_id = $1 AND doctor_user_id = $2 LIMIT 1',
          [patientId, req.userId]
        );
        authorized = wroteR.rowCount > 0;
      }
    }

    if (!authorized) return res.status(403).json({ message: 'Access denied.' });

    const { rows } = await pool.query(
      `SELECT di.id, di.drug_a, di.drug_b, di.severity, di.interaction_type,
              di.description, di.recommendation,
              TO_CHAR(di.created_at, 'YYYY-MM-DD') AS date,
              doc.full_name AS doctor_name
       FROM drug_interactions di
       LEFT JOIN doctors doc ON doc.user_id = di.doctor_user_id
       WHERE di.patient_id = $1
       ORDER BY di.created_at DESC`,
      [patientId]
    );

    res.json({ interactions: camelRows(rows) });
  } catch (err) {
    console.error('Drug interaction fetch error:', err.message);
    res.status(500).json({ message: 'Failed to fetch drug interactions.' });
  }
});

// DELETE /api/drug-interactions/:id — doctor deletes their own note
app.delete('/api/drug-interactions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Only doctors may delete
    const roleR = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (roleR.rows[0]?.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can delete drug interaction notes.' });
    }

    // Must own the record
    const diR = await pool.query(
      'SELECT id, patient_id, drug_a, drug_b FROM drug_interactions WHERE id = $1 AND doctor_user_id = $2',
      [id, req.userId]
    );
    if (diR.rowCount === 0) return res.status(404).json({ message: 'Drug interaction not found or not owned by you.' });

    await pool.query('DELETE FROM drug_interactions WHERE id = $1', [id]);

    try {
      const di = diR.rows[0];
      await pool.query(
        `INSERT INTO audit_logs (patient_id, actor_user_id, action, status, reason)
         VALUES ($1,$2,'drug_interaction_write','success',$3)`,
        [di.patient_id, req.userId, `Drug interaction deleted: ${di.drug_a} ↔ ${di.drug_b}`]
      );
    } catch (auditErr) {
      console.warn('Audit log failed (non-fatal):', auditErr.message);
    }

    res.json({ message: 'Drug interaction deleted.' });
  } catch (err) {
    console.error('Drug interaction delete error:', err.message);
    res.status(500).json({ message: 'Failed to delete drug interaction.' });
  }
});

// ════════════════════════════════════════
//  Chat + RAG (server/src/chat.js) — mounted at /api, so its internal
//  '/chat', '/chat/sessions', '/documents/:id/reindex' become /api/chat, etc.
// ════════════════════════════════════════
app.use('/api', careRouter);
app.use('/api', chatRouter);

export default app;
