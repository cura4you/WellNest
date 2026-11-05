# Patient and doctor dashboard UX pass

The approved P8/W1 brand and shared dashboard tokens remain the basis of the design.

- Overview headers expose the next common action: patient appointment requests, or doctor uploads and access requests.
- Patient pending requests appear prominently with a clear review action. Doctor pending requests are explicitly awaiting patient approval.
- Shared recent-record and activity cards use readable labels and visible document actions. Patient emergency-contact navigation describes the profile task accurately.
- Both roles use the same searchable record browser, including type/date filters, result counts, reset controls and useful empty states. Doctor search includes the actual camel-case `patientEmail` field returned by the API.
- Patient request reviews show the reason and scope, status filters, document details, loading feedback and recoverable detail errors.
- Doctor access requests follow find patient / choose records / explain and submit. Enter submits the search, dependent fields are revealed when useful, and blank reasons cannot be submitted.
- Dashboard loading has skeletons and a recovery state. Failed, incomplete or expired-session responses cannot silently become zero-valued accounts. The shared recovery also covers hospital because the data service is shared.
- Navigation stays available during long views. Mobile quick actions are compact; vitals in the overview use a readable two-column arrangement. DOM and keyboard reading order are preserved.
- Appointment previews expose dates, times and confirmation state without implying that a patient request is already confirmed.

## Verification

`npm run test:e2e:dashboard-ux` covers the new interactions and controlled failure states with explicit UI fixtures. `npm run test:e2e:dashboard-ui` covers the shared role layouts and themes. `npm run test:e2e:care` covers actual local API/PostgreSQL/MinIO/Ollama workflows with isolated fixtures. These are separate evidence types; UI fixture results do not establish production backend permissions.

No database migration or authorization-policy changes are included in this pass.
