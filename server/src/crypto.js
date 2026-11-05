import crypto from 'node:crypto';

// The key ring belongs in server secrets, independently of the database/storage.
// Keep old key IDs when rotating; new uploads always use DOCUMENT_KEK_ID.
function keyRing() {
  let ring;
  try { ring = JSON.parse(process.env.DOCUMENT_KEKS || '{}'); } catch { throw new Error('Invalid document key ring configuration.'); }
  if (!ring || typeof ring !== 'object' || Array.isArray(ring)) throw new Error('Invalid document key ring configuration.');
  return ring;
}
function masterKey(id) {
  const encoded = keyRing()[id];
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Document wrapping key unavailable.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Document wrapping key must contain 32 bytes.');
  return key;
}
export function validateDocumentKeys() {
  const id = process.env.DOCUMENT_KEK_ID;
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('DOCUMENT_KEK_ID is required.');
  masterKey(id);
  return id;
}
export function wrapDocumentKey(dek) {
  if (dek.length !== 32) throw new Error('Invalid document key.');
  const id = validateDocumentKeys();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(id), iv);
  cipher.setAAD(Buffer.from(`medivault:dek:v1:${id}`));
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  return `v1:${id}:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
}
export function unwrapDocumentKey(value, { allowLegacy = process.env.ALLOW_LEGACY_DOCUMENT_KEYS === 'true' } = {}) {
  if (typeof value !== 'string') throw new Error('Invalid wrapped document key.');
  if (!value.startsWith('v1:')) {
    if (!allowLegacy || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Unwrapped legacy document key rejected.');
    return Buffer.from(value, 'base64');
  }
  const parts = value.split(':');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]{80}$/.test(parts[2])) throw new Error('Invalid wrapped document key.');
  const blob = Buffer.from(parts[2], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(parts[1]), blob.subarray(0, 12));
  decipher.setAAD(Buffer.from(`medivault:dek:v1:${parts[1]}`));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}
export function encryptFile(buffer) {
  const dek = crypto.randomBytes(32);
  try {
    const iv = crypto.randomBytes(12);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const blob = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    return { dekWrapped: wrapDocumentKey(dek), dekIv: iv.toString('base64'), blob, checksum };
  } finally { dek.fill(0); }
}
export function decryptFile(encryptedBuf, wrappedKey) {
  const dek = unwrapDocumentKey(wrappedKey);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', dek, encryptedBuf.subarray(0, 12));
    d.setAuthTag(encryptedBuf.subarray(12, 28));
    return Buffer.concat([d.update(encryptedBuf.subarray(28)), d.final()]);
  } finally { dek.fill(0); }
}
