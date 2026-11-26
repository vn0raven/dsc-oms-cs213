# DSC OMS — Remaining work, ordered by release risk

1. **P1 / Blocker — environment separation (OMS-007, 020):** Cloudflare owner registers independent staging and production D1 bindings and Access apps, stores environment-scoped secrets and approves a staging restore rehearsal. Run config gate and verify with Wrangler dry run. Never fill IDs from a guess.
2. **P1 / Blocker — security verification (OMS-014, 024):** Confirm if organization-wide active task visibility is intended, execute real signed and forged/expired Access token tests in staging, and test direct ID cross-department access. Do not silently revise the role matrix.
3. **P1 / Blocker — database compatibility (OMS-004–006):** Run migration `0004` on an approved staging copy, compare prior counts and operational flows; conduct backup/restore and rollback drill with operator signoff.
4. **P2 — Browser E2E and a11y (OMS-019, 026):** Run real authenticated flows at 375/768/1440, keyboard-only focus, all dialogs, axe audits, theme/night mode, notification polling and failure cases. Current component-only coverage is insufficient.
5. **P2 — Complete HTML taint audit (OMS-022):** Review each `innerHTML`/HTML attribute interpolation in all frontend modules with fake malicious payloads; use the shared escaping/URL helper, without redesigning the UI.
6. **P2 — API scalability (OMS-023):** Design optional backward-compatible pagination with stable sorts and server-side filtering, preserve old list response contracts, and load-test 100/1000+ rows against staging D1.
7. **P2 — Approved task stage (OMS-013):** Product owner selects explicit two-step approval/completion or preserves current direct completion; add acceptance tests only after signoff.
8. **P2/P3 — technical debt (OMS-021):** Incrementally retire duplicated escape utilities/CSS override layers after real screenshot and accessibility baselines; no speculative rewrite.
