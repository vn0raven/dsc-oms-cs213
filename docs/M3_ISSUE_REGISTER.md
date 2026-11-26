# M3 Issue Register — Verified Findings and Outstanding Risks

| ID | Priority | Evidence / module | Disposition | Validation |
|---|---|---|---|---|
| M3-001 | P1 | M2 readiness attestation had no line-item verification (`event.service.ts`) | Mitigated: requirement statuses, evidence, verifier, and DB gate | M3 SQLite/Hono tests |
| M3-002 | P1 | M2 closure lacked checklist-specific state gate | Mitigated: activated requirements block final closure | Hono rollback test |
| M3-003 | P1 | M2 event visibility was broader than internal operational-record visibility needs | Fixed: accepted appointment/event authority required for internal operations | Direct-identifier API tests |
| M3-004 | P1 | Concurrent publish could yield duplicate success and notifications | Fixed: atomic DB transition guarded by trigger; no stale-update WHERE clause | Concurrent Hono publish test |
| M3-005 | P1 | Event high-severity blockers did not affect readiness | Fixed: DB trigger for unresolved High/Urgent issues | Synthetic database test |
| M3-006 | P1 | Notification schema lacked event/announcement types | Fixed with additive versioned table rebuild | M2->M3 synthetic upgrade test |
| M3-007 | P1 | Announcement audience was not previously implemented | Implemented and server-restricted; unpublished records private | Cross-department API tests |
| M3-008 | P1 | Repeated checklist submit/review or issue close could duplicate audit | Fixed via DB transition guards | SQLite and Hono duplicate tests |
| M3-009 | P2 | Events had no operational schedule, issues or coordination notes | Implemented minimum useful workspaces | API and component checks |
| M3-010 | P2 | Document metadata and status were not recorded | Implemented secure references and review metadata, **no file uploads** | API authorization tests |
| M3-011 | P2 | Dashboard preview count was used as total upcoming-event KPI | Fixed by separate aggregate result | TypeScript/API checks |
| M3-012 | P2 | Official announcements lacked read receipts and archive history | Implemented separate read receipts / archive history | API tests |
| M3-013 | P2 | Browser navigation to localhost blocked by current environment | Open: authenticated Worker E2E required | Component-only scenarios |
| M3-014 | P1 | M3 schema not rehearsed on approved staging D1 copy | **Release blocker** | Synthetic upgrade passed; staging not run |
| M3-015 | P1 | University/principal CBL and proposed Event SOP approval procedures incomplete | **Policy blocker** | Requires DSC sign-off |
| M3-016 | P2 | Protected file uploads and custodial transfer workflow not implemented | Open for later milestone | References only |
| M3-017 | P2 | Checklist template library, registration and budget transactions not implemented | Open / SOP-dependent | Existing requirements manually configurable |
| M3-018 | P2 | No true before/after performance baseline exists for new M3 modules | Open | Current synthetic timings only |
| M3-019 | P2 | Recipient review of linked restricted Projects needs conservative field redaction | Mitigated by server redaction for non-administrative non-authors | Source check, broader role validation pending |

No hypothesis in this register is claimed to be a deployed exploit. Tests cover synthetic records only.
