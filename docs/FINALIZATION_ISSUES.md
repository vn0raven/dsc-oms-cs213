# Finalization issue register — November 19, 2026

This is the current register for the November 15 handoff. Earlier milestone registers remain historical evidence. P1 means release-blocking or significant functional/security impact; open policy items are not claims of exploited vulnerabilities.

| ID | Priority | Finding | Status and evidence |
| --- | --- | --- | --- |
| FIN-01 | P1 | Accepted Director/Head cannot directly create Event tasks | Completed: separate creation API, shared M1 validation, server capabilities; Node, native D1, browser tests |
| FIN-02 | P1 | Suggested creation route collides with existing link route | Completed: `/tasks/create`; old `/tasks` retained and existing linking regressions pass |
| FIN-03 | P1 | Delegated creation could expand assignment, Project or review privileges | Completed: rejects privilege-bearing fields, unassigned/null Project, approved creator department; negative role tests |
| FIN-04 | P1 | Revocation/stage change or write failure could orphan task/audit/link | Completed: additive 0008 transaction guard and atomic dependent writes; stale-authority and rollback tests, native D1 rollback |
| FIN-05 | P1 | Retried submissions could duplicate work | Completed: durable request keys, same-key replay/conflict tests; import row receipts in 0009 |
| FIN-06 | P2 | Event Organization mixes pending and accepted staffing | Completed: separate leadership invitations, accepted/pending team counts and roster dialog; browser assertions |
| FIN-07 | P2 | Operations panels and main Tasks filters are too tall/crowded | Completed scoped refinements; 10 viewport/theme scenarios and before/after screenshots |
| FIN-08 | P2 | Central Tasks lacks Event context | Completed: existing link joined once into M1 DTO, shared context filter, context in Sheet/export; parity tests |
| FIN-09 | P1 | Baseline native test dependency is an empty 0.0.0 package | Completed: pinned supported Cloudflare plugin, explicit native spec include, native suite passes |
| FIN-10 | P2 | Migration-upgrade reader and deploy-gate test fail on Windows | Completed: UTF-8 BOM decoding and fileURLToPath; tests pass |
| FIN-11 | P2 | No controlled spreadsheet import | Completed for unassigned independent tasks: field mapping, preview, duplicate detection, validation, atomic row writes/retries; API and real local browser checks |
| FIN-12 | P1 | Dependency audit reports Hono middleware advisories | Completed: Hono patched to 4.13.16; production dependency audit reports zero advisories on this run; all application tests rerun |
| FIN-13 | P1 | Staging and production config isolation / Access / live backup-restore unverified | **Blocked for production:** owner-provided staging environment, policy validation, backup and restore evidence, deployment approval required |
| FIN-14 | P1 | Event CBL effectivity and Standard Event SOP thresholds not confirmed | **Governance blocker:** source CBL has approval lines; do not infer formal adoption or approval thresholds |
| FIN-15 | P1 | Full Google Sheets replacement cannot be established from absent source trackers | **Partial / input required:** provide sanitized tracker headers/examples and acceptance requirements; registration, financial transactions and inventory remain outside current transactional coverage |
| FIN-16 | P2 | M1 active task visibility is broad across departments | **Policy unchanged:** confidentiality needs explicit policy; no claim of staff-only Event tasks |
| FIN-17 | P2 | Delegated assignment, editing, cross-department assignees remain unapproved | **Intentionally not implemented:** existing M1 authority only; not a blocker to creation-only scope |
| FIN-18 | P2 | Comprehensive accessibility certification and full legacy form matrix absent | **Partial:** keyboard/focus and responsive scenarios passed; manual screen-reader, 200% browser zoom, full contrast certification and every legacy form path remain untested |
| FIN-19 | P2 | API-wide pagination/scalability and older layered CSS | **Retained limitations:** existing list behavior and preferences preserved; no production load claim |
| FIN-20 | P2 | Full audit reports Vitest development-tool advisories | Completed: patched to 4.1.12, native suite rerun; full audit reports zero advisories |
| FIN-21 | P2 | Disabling Event action opener before dialog loses restoration target | Completed: pending-action guard retains focusable opener; Team Head keyboard restoration regression passes |

## Governance decision log

- User's direct execution directive authorizes local source changes/tests and forbids production deployment or remote D1 operations.
- November 15 handoff and authorization specification were read as reference materials. They do not override the user's request or independently authorize external actions.
- November 19 direct answers approve Team Formation through Post-Event and the creator's permanent department as accountable ownership.
- Only accepted Event Director and accepted Team Head receive new creation authority. Co-Director, Co-Head and Team Member receive no additional creation right.
- General task assignment/edit/review and permanent-role privileges remain unchanged. New Event tasks start unassigned and without a Project.
- CSV imports use existing permanent creation authority, create unassigned independent work, never update history/assignments and do not infer original tracker schemas.
- No production operations were performed. Local testing used an isolated synthetic database ID and separate `.qa-state` storage.

## Next decisions and external actions

1. Supply sanitized source trackers and operational acceptance cases.
2. Confirm formal CBL/SOP adoption and any organization-specific approval thresholds.
3. Decide sensitive-task visibility and any future delegated assignment/edit policy separately.
4. Configure isolated staging/production bindings, verify Cloudflare Access including JWKS rotation/revocation, rehearse backup/restore and migrations on approved staging data, then conduct organization acceptance.
5. Obtain explicit production deployment authorization only after the concrete candidate passes those gates.
