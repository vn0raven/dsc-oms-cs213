# M2 Issue and Decision Register

| ID | Severity | Finding / Decision | Status | Validation / Remaining work |
| --- | --- | --- | --- | --- |
| M2-01 | P1 | Events lacked a dedicated lifecycle and audit history | Fixed | SQLite stage trigger, histories, API transition tests |
| M2-02 | P1 | Only permanent OMS roles existed; temporary event authority absent | Fixed | Scoped accepted appointment checks; no mutation to `users.role` |
| M2-03 | P1 | Nominees could be assigned without affirmative consent | Fixed | Proposed → Accepted/Declined owner-only endpoints and DB trigger |
| M2-04 | P1 | Event decisions could duplicate on concurrent approval | Fixed | Atomic D1 batch and trigger; exactly-one-decision test |
| M2-05 | P1 | Cross-event team injection | Fixed | Team-bound checks in services and INSERT triggers |
| M2-06 | P1 | Event task association could bypass M1 task edit scope | Fixed | Delegated event permission PLUS existing task edit permission; tests |
| M2-07 | P1 | Historical closure record missing | Fixed for human attestation | Typed closure table, final attendance/expense and evidence; independent review pending SOP |
| M2-08 | P1 | Linked confidential project could leak to outside department | Fixed | Project DTO redaction by existing service; test |
| M2-09 | P1 | Unfinished approval/SOP could be mistaken for formal authorization | Open / release blocker | Confirm signed CBL, delegated authority and Standard Event SOP |
| M2-10 | P2 | Appointment notifications not in main bell | Partial | Recipient-specific Event appointment inbox; global notification integration later |
| M2-11 | P2 | Full event finance, registration, checklist automation | Deferred | Next milestone; no financial authority implicitly granted |
| M2-12 | P2 | Timezone-normalization policy missing | Open | Adopt IANA event-zone convention before cross-zone use |
| M2-13 | P1 | Native Worker Access and browser E2E absent | Blocked | Must run Windows/compatible Cloudflare staging acceptance |
| M2-14 | P1 | 0005 migration not tested against real staging copy | Blocked | Backup, rehearsal, rollback, release approval |
| M2-15 | P2 | Post-approval organization-wide visibility is a provisional policy | Open | Approve visibility policy before production |
