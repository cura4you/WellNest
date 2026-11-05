# MediVault identity

The mark combines a protective shield with an M whose central fold forms a V. Use the plum symbol and charcoal wordmark on light surfaces; dark application surfaces use the same vector with a lighter accent and wordmark.

- Primary: `#84416c` (plum); text: `#29272e` (charcoal).
- Typeface: Plus Jakarta Sans. Keep the wordmark on one line.
- Shared React component: `src/components/brand/BrandLogo.jsx`. Use `compact` for icon-only placements and provide an accessible name on its parent link/button.
- Shared brand colors/type live in `src/components/brand/brand.css`. Homepage and dashboard tokens reference these variables.
- Standalone SVGs: `public/brand/medivault-mark.svg` and `public/brand/medivault-logo.svg`. The mark is also the favicon. The lockup uses live text with an Arial fallback when Plus Jakarta Sans is unavailable.
- Leave at least half the symbol's width clear around the lockup. Use the symbol at 24px or larger in navigation; the simplified vector remains usable at favicon sizes. Do not stretch or add shadows to the logo.

## Dashboard consistency

All patient, doctor, and hospital pages use `DashboardShell`, theme tokens, and `dashboard-v2.css`. Shared controls retain the same spacing, sizing, borders, focus treatment, and light/dark behavior. Overview pages use `WorkspaceHeading`, metrics, full-width appointment previews, and the shared card grid. Role-specific tools and permissions remain distinct. Common navigation destinations are named Overview, Appointments, Notifications, AI Chat, and Profile & Settings.

Keep new styles scoped to their component. Reuse semantic green, blue, and red tokens for statuses rather than replacing status colors with the brand accent. Test desktop and mobile navigation, collapsed branding, both themes, and real care workflows when changing the shared shell.
