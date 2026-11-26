# Spreadsheet migration and workflow coverage

The source tracker files were not supplied for this work. This inventory is grounded in OMS source and the provided handoff, not inferred organization-specific spreadsheet columns.

| Workflow | Existing OMS implementation | Finalization coverage / limit |
| --- | --- | --- |
| Independent and Project tasks | M1 tasks, assignments, lifecycle, audit | Preserved; Board/Sheet share filters |
| Event task tracker | Existing M1 links | Direct unassigned creation added; no duplicate task model |
| Event organization roster | Teams and consent-based appointments | Accepted/pending roster and team inspector |
| Schedule, issues, meeting/decision notes | M3 operational records | Compact panels and existing focused mutation dialogs |
| Readiness, records, closure, debrief | M3 requirements and references | Preserved; protected references, not file uploads |
| Official announcements | Audience restrictions, publication, receipts | Preserved and regression tested |
| Budget transactions, attendance/registration, inventory | No dedicated transactional modules | Requirements/references only; organization-approved source trackers and SOP needed before claiming replacement |
| Sheets exchange | Task CSV export | CSV import with field mapping, preview and duplicate detection added |

## Import workflow

1. Keep the original tracker as an archive. Export a Google Sheets tab using its CSV download option; do not share account credentials with OMS.
2. Use Tasks → Import CSV as Lead, Co-Lead or Executive. Executives remain restricted to their own permanent department. Temporary Event appointments do not grant import authority.
3. Choose a CSV of at most 100 data rows / 2 MB. Headers must be nonempty and unique. Quotes, commas, UTF-8 BOM and quoted line breaks are supported.
4. Select the accountable department and map title, description, instructions, priority, startDate and deadline. Only title is a required mapped column. Dates use valid ISO dates/datetimes; priority is Low, Medium, High or Critical. The provided template is a synthetic example of existing M1 fields, not a proposed organizational schema.
5. Validate & preview. The server validates every row and the actor's authority before writing any row. Review duplicates before committing.
6. Import ready rows. Each task, audit event and import receipt commits atomically. A whole file is **not** one transaction: if a runtime error occurs, earlier successful rows remain saved and the import stops.
7. Use Retry same batch after a transient error. The dialog preserves batch and row keys; receipts prevent repeated creation. Do not change file or mapping during a partially completed batch. If the dialog is lost, re-uploading flags existing tasks using title + department + dates.

Duplicate matching is deliberately conservative and may flag legitimate same-title work. Resolve such cases through the normal task creation UI after review. Imports never overwrite records or recreate historical audit, approval or assignment decisions. Blank optional cells retain defaults. Project/Event relationships and historical statuses must use their existing authorized workflows.

## Export workflow

Existing Task CSV export remains available to permanent Lead/Co-Lead/Executive roles. It exports the filtered data and selected columns, with formula-leading cells neutralized. Event name now appears in the Context column. CSV can be opened/imported into Google Sheets. This release does not include a Google API connection or automatic bidirectional synchronization.

## Required organizational inputs

Provide sanitized tracker headers, sample rows and desired retention rules for attendance, finance, assets, partnerships or other operational trackers before extending schemas or claiming full spreadsheet retirement. The existing CBL expects records that extend beyond the current task/operational references. Those workflows need organizational acceptance and approved controls.
