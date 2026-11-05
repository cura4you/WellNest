# Account security implementation

The release replaces raw file keys with authenticated key envelopes, adds server-enforced session revocation, and provides password change/recovery flows shared across roles. The operational configuration, key rotation procedure and email setup are in [SECURITY_OPERATIONS.md](../../SECURITY_OPERATIONS.md).

Implemented behavior:

- Every new document/proof key is wrapped under a server-only key ring with a versioned key ID. Existing encrypted document keys and grant copies are migrated without rewriting ciphertext. Legacy decoding is explicitly gated for rollout and disabled in the final production release.
- Single-device logout uses a hashed token revocation entry; password changes, resets and sign-out-all invalidate all sessions through the account version. Every protected request verifies the database state and fails closed on verification failure.
- Reset links are random, hashed in the database, expire after 30 minutes, and can be consumed once. Account locking serializes concurrent resets. Reset invalidates outstanding links and sessions and requires signing in again.
- Shared UI provides recovery from each role's login screen and account security from every dashboard. Failed server logout keeps the session and reports the failure.
- Recovery requests and reset attempts have database-backed throttles. Email uses a fixed configured origin, not request headers, and secrets stay in URL fragments removed by the page.

Evidence is in local-verification.json and deployment-verification.json. Local validation includes 41 unit tests, 12 real security browser/API groups and 20 real care groups. The complete care run used hosted Gemini with local isolated PostgreSQL/MinIO, avoiding missing Ollama model downloads. Separate hosted tests exercise actual registration/login, wrapped upload/download and revocation with synthetic users, then remove their data. Dashboard fixture checks validate shared layout and are not substituted for the real backend checks.

Pending external setup: Resend credentials and an authorized sender were not available. Production recovery requests explicitly report unavailable until configured; actual external email delivery is not verified. Local recovery mail was captured to a private test file and removed afterward.

Historical limitation: six existing production hospital proof objects have no retained encryption key from the pre-release upload flow. They require re-upload through an administrative/replacement workflow; migration cannot recover a key that was discarded. New proof uploads retain wrapped keys. This release does not implement credential verification, email verification, a managed KMS, backup monitoring, or those separate roadmap items.
