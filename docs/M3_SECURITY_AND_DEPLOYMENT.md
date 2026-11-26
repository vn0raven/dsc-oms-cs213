# M3 Security and D1 Deployment Safety

**Release status: NO-GO for production pending required staging/environment checks.**

## Authentication and authorization
- Existing Cloudflare Access JWT and local-auth restrictions remain unchanged.
- All `/api/m3` routes require the existing Hono authentication middleware.
- Event operational reads require accepted event appointment or permanent/event leadership authority; sensitive references further restrict visibility.
- Event writes are scoped to the exact event ID and capability, with record ID and event ID matched together.
- Official announcement scopes are server-enforced: Lead/Co-Lead organization/department, Executive own department, Member reader only. Publishing uses the permanent role, never a temporary event appointment.
- Inputs are size-restricted; frontend text is escaped; draft/publication read receipts have distinct storage from notification reads.
- Event and announcement mutations have audit records, with batch atomicity where multiple records must commit together.

## Migration rehearsal
1. Back up the current staging D1 using approved Cloudflare procedures; record backup identifier and retention owner securely.
2. Clone an **approved sanitized** copy of production structure/data into isolated staging; never insert live records into the provided ZIP.
3. Confirm migration registry is at 0005. Apply 0006 and 0007 in staging only; inspect foreign keys, existing notification count, notification type distribution, task/project/event counts, and read-path behavior.
4. Exercise concurrent announcement publishing, event checklist verification and closure rollback under native Workers/D1. Run native Vitest and browser E2E for all four roles.
5. Reconcile any D1/SQLite differences, secure organization policy decisions, and obtain a human release approval before attempting production migrations.
6. Production rollback for 0007: do **not** run an ad-hoc DROP/rename reverse migration if new notification types already exist; restore a verified pre-migration database snapshot under approved disaster-recovery procedure, with reconciling post-backup writes as necessary.

## Blocked verification
This container cannot navigate to local Worker/HTTP browser origins. Native Worker tests and live Access policy checks have not been run. Cloudflare staging bindings, R2 private storage, approved documents and University sign-offs were not accessible. No remote Cloudflare API operations or live migrations were performed.

## Retention and file protection
`event_records.reference` is a plain private identifier, never an unrestricted presigned URL. M3 provides no binary upload or download. D1 stores metadata and internal references only. Future file storage must use authenticated R2 handlers, object-level access checks, size/type controls, malware screening as appropriate, and approved retention/custody policy.
