# Email verification and provider review

This release adds email ownership verification, encrypted provider credential evidence, manual administrator decisions, and a replacement path for old unreadable hospital proofs. It is a portfolio workflow, not an external professional-license registry integration.

## Pages and access

- `/account/verification`: signed-in account email status, verification mail request, provider license editing, proof upload/replacement, review status/reason, and resubmission.
- `/verify-email#<token>`: explicit confirmation of a single-use email link. The fragment is removed from the address bar and never sent in the request URL.
- `/admin/login`: sign in using the account's existing role and administrator permission.
- `/admin/reviews`: administrator-only application filters, current and historical proof downloads, reasoned approval/rejection, suspension, and revision history.

Public registration cannot grant administrator access. The CLI is the bootstrap mechanism:

```sh
npm run admin -- grant --email <registered-email>
npm run admin -- revoke --email <registered-email>
```

For an explicitly synthetic portfolio administrator, `grant --create --credentials-file <private-path>` creates a patient-role account with independent administrator permission and writes a generated password exclusively to a mode-0600 local file. No password is printed. The created profile contains synthetic placeholder values. Existing accounts retain their password. Permission changes invalidate existing sessions; the CLI serializes privilege changes and refuses to revoke the last administrator. Account email ownership is not marked verified by bootstrap.

## Configuration and portfolio mode

Apply migration `0013_identity_review.sql` before deploying.

- `APP_PUBLIC_URL`: fixed origin for verification/recovery links.
- `RESEND_API_KEY`: server-only email credential.
- `AUTH_EMAIL_FROM`: an authorized sender. For a domain-free portfolio test, `WellNest <onboarding@resend.dev>` can send only to the address associated with that Resend account; see [Resend's testing restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
- `AUTH_EMAIL_ALLOWLIST`: optional comma-separated recipient restriction. The portfolio deployment limits email to its configured burner inbox. It never redirects other users' links to the burner inbox; those addresses cannot receive verification email in that mode.
- `PROVIDER_APPROVAL_REQUIRED=false`: portfolio mode. Existing dashboards remain accessible, and banners/pages display actual unverified/draft/pending/rejected status. This is not approval enforcement.
- `PROVIDER_APPROVAL_REQUIRED=true`: strict mode. Doctor/hospital clinical API requests and dashboard routes require both a verified email and an approved current application. Patients retain their ordinary role permissions. Proof upload, verification, account security and admin review endpoints remain accessible to authorized accounts outside the clinical API gate.

Strict mode was exercised end to end with real isolated services. Production is deliberately in portfolio mode because the user identified this as a portfolio with no real users. Enable strict mode before a deployment intended to rely on reviewed provider identities. Email verification and professional review are separate states; neither is inferred from account creation.

As of this rollout, the sender, recipient restriction and portfolio mode are configured. The Resend API key is still missing, so actual inbox delivery remains pending. Add it in Vercel, redeploy, send verification to the configured inbox, confirm the link, then verify password-reset delivery. Do not mark inbox delivery complete based on captured local test mail. No email credential is stored in this repository.

## Evidence and concurrency

Proof upload accepts one PDF/JPG/PNG up to 4 MB, detects file type by its bytes, encrypts it with a wrapped key, and retains historical versions. Only the owner and a currently authorized administrator can download a proof; untrusted clients receive no object-storage keys or wrapping metadata. New hospital registration saves the proof/application atomically in PostgreSQL after object upload and cleans up the object on failure. Existing hospital proof references are imported without inventing missing keys. Account status also adopts providers created by an older deployment during the rollout window.

License edits and proof replacement reopen the application as draft and remove prior approval. Submission requires verified email, a license number and readable evidence. Rejected applicants can update and resubmit. Decisions require the current application revision, a reason, and explicit acknowledgement of the current proof for approval. Administrators cannot review their own application. Concurrent decisions serialize; outdated tabs receive a conflict and must review the current evidence again. Administrator permission is rechecked under transaction locks for decisions. The review history records the license snapshot and proof ID for each revision, preserving access to historical evidence.

Proof rotation is included in `npm run keys:rewrap -- --apply`; retain all required key IDs for historical evidence/backups. The six pre-existing production hospital proofs without retained keys remain unreadable until their owners upload replacements. Replacement is now supported; no synthetic evidence was substituted for their originals.

## Email security and testing

Email verification uses random 256-bit tokens with hashed storage, 24-hour expiry, account/email binding, single-use transactional confirmation and durable per-account/IP limits. One successful confirmation invalidates other outstanding links. Old email addresses, expiry, replay and concurrent confirmation are tested. A private localhost-only capture supports isolated tests; capture files are deleted afterward. Resend delivery errors invalidate undelivered tokens and log no credential or token.

Run `npm run test:e2e:identity` for the strict-mode local API/PostgreSQL/MinIO/Chromium suite on ports 3003/5179. Do not run it concurrently with `test:e2e:security`, which uses the same ports. The identity suite also checks portfolio-mode behavior on port 3004. Existing care tests use portfolio mode; identity tests establish strict enforcement. Unit tests and regression evidence are under `docs/identity-review`.

No real patient data, permanent example approvals, or fake email verification claims are introduced by this release. Remaining operational scope includes external email activation, backups/restore monitoring, automated maintenance, and CI.
