# Master Prompt — DSC OMS M2 Governance-Aware Events Integration

Act as a senior full-stack engineer, Cloudflare/D1 database architect, security engineer, QA lead and event-governance systems analyst. Continue development of the **Developer Student Community Operations Management System (DSC OMS)**, using the most recent M2 source ZIP, `DSC_OMS_M1_Unified_Tasks_Candidate.zip` as the M1 baseline, and `DSC_CBL_EVENTS.docx` as the event governance reference.

**Goal:** Implement and stabilize a standalone, optionally Project-linked Events module with the CBL's temporary hierarchy, staged approval, flexible event teams, individual appointment consent, auditable decisions, and existing task integration, without changing existing permanent Lead/Co-Lead/Executive/Member permissions or overwriting organization data.

## Explicit approved product decisions

- Lead and Co-Lead may approve, return, reject and close event proposals within their delegated organizational authority.
- Event Director, optional Co-Director, Team Head, optional Co-Head and Team Member are **temporary event-only appointments**. They do not grant permanent OMS privileges.
- Appointments require the nominated active member's explicit acceptance before they confer event-specific powers. A member may work across permanent departments for a particular event.
- Events are independent from Projects, but may optionally link to one Project. They share **existing OMS tasks**, never duplicate task ownership or bypass task assignment and review. One task may be linked to one event in the current M2 design.
- Major events follow: Draft → For Approval → Approved → Team Formation → Planning → Preparation → Ready for Event → Ongoing → Post-Event → For Closure → Completed, with explicit returned/rejected/cancelled exception handling.
- Only necessary functional Event Teams should be activated (Program, Logistics, Relations, Creatives, Technology, Registration, Documentation, Finance, or a justified custom team). Appointment reports-to relationships and responsibility fields must remain auditable.
- Official Announcements, attendance/registration, complete finance workflows and the Standard Event SOP are **separate later milestones**.

## Mandatory implementation approach

1. First inspect the provided source, current migrations, event service/routes, Event UI, CBL and tests. Reproduce verified defects, and do not redo working M1 fixes.
2. Apply additive D1 migrations only, with real foreign keys, indexes, status checks, triggers and atomic batch updates. Never touch production records or deploy automatically.
3. Keep server-side event authorization independent of frontend controls. Restrict draft visibility, proposed appointment data, cross-team actions, optional project relationships and existing task associations. Prevent IDOR, event-scope escalation and silent permanent-role changes.
4. Require Lead/Co-Lead event proposal decisions, preserve event stage/approval/audit history, and reject duplicate/stale decisions with HTTP 409.
5. Verify that only active, consenting appointees gain temporary rights. Stop event authority on ended appointment, event closure, cancellation or OMS account deactivation.
6. Reuse existing Tasks endpoints for all assignment and lifecycle operations. A user's event role alone must not allow arbitrary task edits; verify task-specific M1 permissions on the server.
7. Provide readable DSC-branded desktop/mobile Event screens (Overview, Organization, Tasks, Approvals, Activity), inline error/success feedback, accessible dialogs, dark/light themes, and recipient-specific appointment inbox.
8. Add meaningful tests for four permanent roles, cross-department appointments, lifecycle transitions, rejection/resubmission, concurrent approvals, appointment consent, stale actions, event/project/task scoping, SQLite migration integrity, XSS rendering and viewport/theme behavior.
9. Run TypeScript, Node integration, SQLite, browser and native Worker tests wherever the environment supports them. Report blocked/untested checks truthfully. Browser component screenshots are not authenticated E2E.
10. Update README, CHANGELOG, architecture, issue register, M2 validation, SOP-dependent decisions, and release instructions. Deliver a safe source-only ZIP excluding `.dev.vars`, `.wrangler`, node_modules, Git history, backup databases and real member information.

## Governance caution

The supplied nine-page Event CBL references a Standard Event SOP that has not yet been drafted, and its supplied approval-signature page does not establish final adoption. Do not invent final spending limits, University signoffs, required finance controls, SOP checklist rules or permanent officer powers. Readiness and closure attestations are records of human review, not automatic compliance verification. Preserve the precedence of the principal DSC Codes and Bylaws and University policy.

## Release gate

No production readiness claim until: staging-copy migration/rollback rehearsal, actual Cloudflare Access verification, native Worker tests, end-to-end browser tests with four roles, security review, approved governance procedures and authorized human release signoff.
