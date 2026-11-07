# WellNest | Full-Stack, AI-Powered Medical Records Platform

**Technologies:** React, TypeScript, JavaScript, Node.js, Express.js, REST APIs, PostgreSQL, pgvector, Google Gemini, Cloudflare R2, Vercel, Playwright, SQL, Git

- Built and deployed a full-stack healthcare application using React, TypeScript, Node.js, Express.js, and PostgreSQL, delivering responsive patient, doctor, and hospital dashboards with role-based access control (RBAC), appointment scheduling, patient-entered vitals, and persistent notifications.
- Developed a Retrieval-Augmented Generation (RAG) pipeline using pgvector, vector embeddings, PDF text extraction, and Google Gemini to generate medical document summaries and stream conversational answers with source citations and authorization-scoped retrieval.
- Engineered a tool-calling AI agent with five read-only tools for document search, discovery, paginated reading, and patient-context retrieval; implemented bounded execution, per-tool authorization, audit logging, and RAG fallback, and validated behavior across 26 live local evaluation scenarios.
- Strengthened application security with AES-256-GCM file encryption, versioned envelope key wrapping, bcrypt password hashing, server-side session revocation, and single-use password-reset tokens; used SQL transactions and account-level locking to prevent reset-token replay and concurrent password-reset races.
- Automated validation with 41 unit tests and 32 browser/API workflow groups using Playwright and real PostgreSQL/object-storage services; verified role permissions, encrypted file round trips, scheduling conflicts, account recovery, and homepage responsiveness across 13 viewport widths, alongside lint, TypeScript, and production-build checks.
