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
