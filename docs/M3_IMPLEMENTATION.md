# M3 Architecture and Implemented Changes

**Baseline:** DSC OMS M2 Event Governance Candidate. All changes are additive to M1/M2, not a rewrite.

## Source inventory
- `migrations/0006_event_operations_announcements.sql`: event requirements, requirement history, operational issues and escalations, document reference records with review status, schedule entries, coordination notes, debrief, announcements, read receipts, announcement revision history; database transition triggers and indexes.
- `migrations/0007_notification_m3_types.sql`: rebuilds the original notification table with the prior rows and checks intact, adding only the M3 notification types and `EVENT`/`ANNOUNCEMENT` reference values.
- `src/routes/m3.routes.ts`: authenticated Hono routes for operations, record verification, schedule/debrief, official announcements, and metrics.
- `src/services/event.service.ts`: in-transaction M2 event proposal, approval and appointment notifications; existing event logic preserved.
- `src/index.ts`: mounts M3 API after existing routes.
- `public/js/events.js`: Readiness, Operations and Records panels inside M2 Events, without a competing lifecycle system.
- `public/js/announcements.js`: first-party official announcements frontend (no framework).
- `public/js/dashboard.js` and `reports.js`: real authenticated operational summaries.
- `public/js/app.js`, `notifications.js`, `public/index.html`, `public/styles/m3.css`: navigation, reference actions, stylesheet load.

## Governance mapping
| CBL | Implemented M3 behavior | Qualification |
|---|---|---|
| Chapter IX, §§43–46 | Event timeline, issues, escalation, coordination notes | No mandatory frequency or template invented |
| Chapter XI, §50 | Readiness checklist with evidence submission/independent verification, database-enforced gate | Only manually activated requirements; pending SOP templates are not binding |
| Chapter XI, §52 | Urgent issues notify authorized organizational/event leaders, can escalate without ordinary chain constraints | Emergency response must still use real university/emergency channels |
| Chapter XII, §§53–56 | Closure checklist, structured debrief, attestation remains in M2; closure requirements gate final transition | Formal custodian assignment and physical handover are not automated |
| Chapter XIV, §§60–61 | Category-tagged protected references and review status; records retained after closure | No file upload/storage platform; custodian routing needs SOP |

## Access model
Existing `Lead`, `Co-Lead`, `Executive`, `Member` roles are unchanged. Event internal operations require a currently accepted event appointment or authorized permanent/event leadership role. Only Lead/Co-Lead/accepted Director or Co-Director can manage readiness verification, sensitive record references and issue resolutions. Accepted event appointees can report/escalate issues and submit their assigned checklist evidence. Temporary appointments do not confer user/role/finance or organization-wide announcement permissions.

Official announcement publication uses permanent organizational roles only: Lead/Co-Lead can publish organization-wide or department notices; Executive can publish only to the user's permanent own department; Member cannot publish. Active recipients see only audience-eligible published notices. Drafts remain private to eligible authors and administrative leaders.

## M3 lifecycle extension
The existing M2 stages and approval attestations remain authoritative. Activated readiness and closure checklist items must be verified before the respective transitions. A requirement moves `Pending -> Submitted -> Verified`; evidence submission and verification are separate, auditable operations. Unresolved High/Urgent issues prevent moving into Ready for Event. Completed and cancelled events reject further operational mutation; historical records remain queryable by authorized leadership.

## Workflow examples
1. After M2 approval, the Event Director activates appropriate requirements and assigns responsible accepted appointees.
2. A responsible member submits an evidence identifier; an authorized director/leader verifies the submitted requirement.
3. Accepted event members report or escalate issues. High/Urgent unresolved issues block readiness; urgent issues generate notifications for organizational/event leadership.
4. After event day, leadership records the debrief and closure checklist. M2 final-closure attestation and all activated closure checklist items are required.
5. Authorized officials create official announcement drafts, optionally link approved Events or accessible Projects, publish to the eligible audience, and generate notifications. Announcement and notification read receipts remain independent.

## Compatibility and open extensions
No mandatory task schema changes; M1 Board and Sheet and M2 task-event links remain intact. No new permanent roles. Current M3 lacks secure binary uploads, automated registration, attendance, financial transactions, external email/push delivery, approved SOP template catalog, precise records-custodian delegation, and public announcement scheduling. These must not be treated as delivered capabilities.
