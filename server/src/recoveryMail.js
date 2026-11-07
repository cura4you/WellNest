import { appendFile } from 'node:fs/promises';

export function recoveryConfiguration() {
  const url = new URL(process.env.APP_PUBLIC_URL || 'http://invalid');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('Invalid APP_PUBLIC_URL.');
  const file = process.env.RECOVERY_MAIL_FILE;
  if (file && local && !process.env.VERCEL && process.env.NODE_ENV !== 'production') return { origin: url.origin, file };
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) throw new Error('Recovery email service is not configured.');
  return { origin: url.origin };
}

async function sendAccountEmail({ to, token, purpose }) {
  const config = recoveryConfiguration();
  if (!canEmailRecipient(to)) throw new Error('Email recipient unavailable in this portfolio deployment.');
  // Fragment keeps the secret out of request URLs, referrers, and access logs.
  const verifying = purpose === 'verification';
  const link = `${config.origin}/${verifying ? 'verify-email' : 'reset-password'}#${token}`;
  const text = verifying ? `Verify your WellNest email address.\n\n${link}\n\nThis link expires in 24 hours and can be used once. If you did not request this, ignore this email.` : `A password reset was requested for your WellNest account.\n\n${link}\n\nThis link expires in 30 minutes and can be used once. Resetting your password signs out all devices. If you did not request this, ignore this email.`;
  if (config.file) {
    await appendFile(config.file, JSON.stringify({ to, link, purpose }) + '\n', { mode: 0o600 });
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${purpose}-${token}` },
    body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [to], subject: verifying ? 'Verify your WellNest email' : 'Reset your WellNest password', text }),
  });
  if (!response.ok) throw new Error('Recovery email delivery failed.');
}

export function canEmailRecipient(email) {
  const allowed = (process.env.AUTH_EMAIL_ALLOWLIST || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !allowed.length || allowed.includes(String(email).trim().toLowerCase());
}
export function sendRecoveryEmail(input) { return sendAccountEmail({ ...input, purpose: 'recovery' }); }
export function sendVerificationEmail(input) { return sendAccountEmail({ ...input, purpose: 'verification' }); }
