# WellNest transition

- Repository: https://github.com/cura4you/WellNest
- Local checkout: `/Users/momossss/Documents/GitHub/WellNest`
- Production: https://wellnest-cura4you.vercel.app
- Existing Vercel project renamed to `wellnest`; project ID and backing services retained.
- `wellnest.vercel.app` is already assigned to another project.
- Previous production address remains an alias for existing links.

The approved tonal petal symbol and visual design are retained with a WellNest wordmark. Runtime copy, accessible names, page title, favicon, brand exports, account emails, AI identity and newly seeded guest PDFs use WellNest. Historical binary project documents and previous uploaded records are retained as original artifacts.

Internal compatibility identifiers (the encrypted-key AAD, existing storage bucket, database migration names, advisory lock and browser session keys) remain unchanged to preserve access to existing data. Renaming these is a separate data migration, not part of the visual rebrand. Browser storage is origin-specific: visitors sign in again at the new address; accounts remain in the same database.

## Git and deployment

Both local branches track `cura4you/WellNest`; all original commit authors and history are preserved. Deployments use the existing Vercel CLI project link. Vercel rejected connecting the new GitHub organization repository, so push-triggered deployment is not yet configured. The organization must grant the Vercel GitHub app access to WellNest, then run:

```sh
vercel git connect https://github.com/cura4you/WellNest.git --yes --scope mohammad-petiwalas-projects
```

Production `APP_PUBLIC_URL`, allowed origins and account email sender display name use WellNest. Database, encryption secrets, storage and AI credentials stay with the existing project.

## Verified rollout — 2026-11-07

Runtime source commit: `23b4f4b`. Production deployment: `dpl_6tmRLozU6nrffrEYdye8KcRxYCXr`. Both the new WellNest address and the previous production alias returned healthy API responses.

- Build, lint, TypeScript and all 50 unit tests passed.
- Eight isolated real PostgreSQL/HTTP guest regression groups passed.
- Twenty dashboard UI fixture groups passed across patient, doctor and hospital, six screen widths, both themes and shared branding.
- Ten homepage report entries passed locally and on production, including individually exercising links, 13 screen widths, keyboard navigation and logo explorers.
- Twelve public/account entry routes and all three actual guest dashboards showed WellNest with no visible MediVault text. A patient-created appointment persisted in the guest doctor's dashboard.
- Six hosted guest groups passed: role entry, consent sharing, visitor isolation, actual cited AI chat/PDF summary, reset, mobile controls, exit and recoverable connection failure. Test-created guest workspaces were closed.

The first hosted sharing run switched roles before approval finished. The regression now waits for the Approved state before switching, matching the existing full guest browser driver. The corrected run passed.

Reports and screenshots are in [`docs/wellnest-transition`](docs/wellnest-transition). GitHub-to-Vercel automatic deployment remains pending organization app access; this verified production release was deployed through the CLI.
