# WellNest identity

The approved identity is **P8 Tonal petals + W1 Modern**, selected by the user on 2026-11-05. Four rotationally balanced petals form a subtle healthcare cross. Opposite petals use 58% opacity. The wordmark has charcoal “Well” and plum “Nest”, with no trailing period. Dark surfaces use lighter versions of the same colors.

- Primary: `#84416c` (plum); text: `#29272e` (charcoal).
- Logo wordmark: W1 Modern, Arial/sans-serif at weight 600 with tight spacing. Keep it on one line. Application typography remains Plus Jakarta Sans.
- Shared React component: `src/components/brand/BrandLogo.jsx`. Use `compact` for icon-only placements and provide an accessible name on its parent link/button.
- Shared brand colors/type live in `src/components/brand/brand.css`. Homepage and dashboard tokens reference these variables.
- Standalone SVGs: `public/brand/wellnest-mark.svg` and `public/brand/wellnest-logo.svg`. The mark is also the favicon. The lockup uses live Arial text matching the approved W1 treatment. Keep both the mark geometry and alternating 0.58 opacity in sync with the React component.
- Leave at least half the symbol's width clear around the lockup. Use the symbol at 24px or larger in navigation; the simplified vector remains usable at favicon sizes. Do not stretch or add shadows to the logo.

## Dashboard consistency

All patient, doctor, and hospital pages use `DashboardShell`, theme tokens, and `dashboard-v2.css`. Shared controls retain the same spacing, sizing, borders, focus treatment, and light/dark behavior. Overview pages use `WorkspaceHeading`, metrics, full-width appointment previews, and the shared card grid. Role-specific tools and permissions remain distinct. Common navigation destinations are named Overview, Appointments, Notifications, AI Chat, and Profile & Settings.

Keep new styles scoped to their component. Reuse semantic green, blue, and red tokens for statuses rather than replacing status colors with the brand accent. Test desktop and mobile navigation, collapsed branding, both themes, and real care workflows when changing the shared shell.
