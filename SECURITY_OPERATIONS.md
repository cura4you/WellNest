# Account security and document keys

Apply all SQL migrations through `0012_account_security.sql` using `npm run db:migrate` before deploying this version. SQL migrations are authoritative; Drizzle declarations mirror the new fields/tables.

## Document key wrapping

Each file has its own random AES-256-GCM data key. `dek_wrapped` now holds a versioned, authenticated AES-256-GCM envelope encrypted under an independent 32-byte server key, with a fresh nonce and version/key-ID AAD. The master key is never stored in PostgreSQL or object storage, sent to the browser, or derived from the session secret. This release uses Vercel server secrets; it does not claim a managed KMS/HSM integration.

Configure server-only secrets (never VITE variables):

- `DOCUMENT_KEK_ID`: active key ID, e.g. `production-v1`.
- `DOCUMENT_KEKS`: JSON mapping key IDs to Base64-encoded, cryptographically random 32-byte keys. Generate each with `crypto.randomBytes(32)`; never use an example key in production.
- `ALLOW_LEGACY_DOCUMENT_KEYS`: absent/false rejects the old raw Base64 DEKs. Only set true during a controlled upgrade.

Back up the key ring separately from the database. Losing a key makes files encrypted under that key unreadable. Keep old IDs until all dependent documents, grant copies, proofs and retained backups have been accounted for. Do not rotate by overwriting the value of an existing ID.

Upgrade sequence:

1. Configure the key ring in server secrets and apply migration 0012. Inventory with `npm run keys:rewrap` (read-only, validates every document envelope).
2. Deploy this compatible reader/writer with legacy reads temporarily enabled. New uploads always use wrapping; missing configuration fails closed for encryption.
3. Once old requests have drained, run `npm run keys:rewrap -- --apply` with the same server key ring/database. It locks document/grant/proof writers and rewraps keys transactionally. It leaves file ciphertext untouched, synchronizes grant copies, validates existing envelopes, and can be rerun. Do not use an old deployment that writes raw keys afterward.
4. Verify no old keys remain, set legacy reads false, deploy, and verify authorized downloads. Rollbacks must retain support for wrapped keys.

For rotation, add a new ID/key alongside existing IDs, select it, deploy, run the same script, and verify old/new files. Retain previous keys for backups according to retention requirements.

Historical hospital proof uploads discarded their encryption key before this release. The inventory reports their count; those proofs require re-upload through a future replacement/admin workflow. This migration cannot reconstruct a discarded key. New hospital registrations persist their wrapped proof key and IV.

## Sessions

New signed bearer tokens include a random ID and account authentication version. Each protected request checks the current database role/version and the token hash revocation table. Existing pre-upgrade tokens are accepted only while the account version remains zero. Logout revokes only the presented token; sign-out-all, password change and password reset increment the account version. Deleted accounts, changed roles, reset passwords and revoked tokens fail authentication. Database failures return 503 and do not bypass authentication.

Account security is linked from every dashboard. Password change requires the current password and signs out all devices. Logout only reports success after server confirmation (already-invalid tokens can be cleared locally). A network/server failure keeps the session with a visible retry message.

## Password recovery email

Set these production Vercel environment variables and redeploy:

- `APP_PUBLIC_URL=https://medivault-roan-six.vercel.app` (fixed origin, independent of request headers).
- `RESEND_API_KEY`: server-only Resend API credential.
- `AUTH_EMAIL_FROM`: a sender authorized by your verified Resend domain.

The implementation uses the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email). Verify delivery to a controlled inbox after configuration. No provider credentials or verified sender were available during initial implementation; until configured the request endpoint explicitly reports recovery email unavailable. Do not describe external email delivery as verified based on the local capture test.

All role login forms link to recovery. Requests use a common response for matched/unmatched accounts and durable per-IP/per-email throttles. Links contain a random 256-bit secret in the URL fragment, removed from the address bar by the page. Only SHA-256 hashes are stored; links expire after 30 minutes. Reset locks the account, consumes the token and invalidates all remaining reset links/sessions in one transaction. It does not automatically log in. Passwords use bcrypt and are bounded to 72 UTF-8 bytes to avoid silent truncation. Provider failures invalidate undelivered tokens and log no token or provider payload.

For isolated development only, use a localhost `APP_PUBLIC_URL` and `RECOVERY_MAIL_FILE=/private/tmp/...`. The local capture is disallowed in production/Vercel. Never publish capture files or reset links. See the [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) for the design constraints.

Expired revoked-token rows, expired/used reset rows, and old throttle windows can be pruned with a scheduled administrative database job. Retain active revocations until expiry; deleting an active entry restores that token unless the account version changed. Backups can retain pre-upgrade raw keys, so their access/retention must also be managed.

## Validation

`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e:security`, and `npm run test:e2e:care`. Security tests use isolated real PostgreSQL/MinIO and Chromium, with local email capture. Provider request/failure contracts are unit-tested, but actual external delivery requires a configured account and inbox. Email verification and provider credential review are now implemented; see IDENTITY_REVIEW.md for portfolio mode, strict enforcement, administrator bootstrap and pending email activation. Monitored restores and CI remain separate.
