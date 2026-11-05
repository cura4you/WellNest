import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryConfiguration, sendRecoveryEmail } from '../src/recoveryMail.js';
test('recovery refuses missing delivery config, unsafe public URLs and production file capture', () => {
  const prior = { ...process.env };
  try {
    delete process.env.RESEND_API_KEY; delete process.env.AUTH_EMAIL_FROM; delete process.env.RECOVERY_MAIL_FILE;
    process.env.APP_PUBLIC_URL = 'https://medivault.example';
    assert.throws(() => recoveryConfiguration());
    process.env.RESEND_API_KEY = 'synthetic-key'; process.env.AUTH_EMAIL_FROM = 'MediVault <auth@example.com>';
    assert.equal(recoveryConfiguration().origin, 'https://medivault.example');
    for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com/other', 'https://example.com/?redirect=evil']) {
      process.env.APP_PUBLIC_URL = url; assert.throws(() => recoveryConfiguration());
    }
    process.env.APP_PUBLIC_URL = 'http://localhost:5179'; process.env.RECOVERY_MAIL_FILE = '/private/tmp/test-mail'; process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY; assert.throws(() => recoveryConfiguration());
  } finally { for (const k of Object.keys(process.env)) if (!(k in prior)) delete process.env[k]; Object.assign(process.env, prior); }
});
test('hosted delivery uses configured origin and rejects provider failures', async () => {
  const prior = { ...process.env }, originalFetch = globalThis.fetch;
  try {
    process.env.APP_PUBLIC_URL = 'https://medivault.example'; process.env.RESEND_API_KEY = 'synthetic-key'; process.env.AUTH_EMAIL_FROM = 'auth@example.com'; delete process.env.RECOVERY_MAIL_FILE;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.to, ['patient@example.com']);
      assert.ok(payload.text.includes('https://medivault.example/reset-password#synthetic-token'));
      return { ok: false };
    };
    await assert.rejects(sendRecoveryEmail({ to: 'patient@example.com', token: 'synthetic-token' }), /delivery failed/);
  } finally { globalThis.fetch = originalFetch; for (const k of Object.keys(process.env)) if (!(k in prior)) delete process.env[k]; Object.assign(process.env, prior); }
});
