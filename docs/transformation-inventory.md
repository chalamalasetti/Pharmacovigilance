# Transformation delivery inventory

Design input: PVInfo Existing-App Transformation Specification v3. The top-level reconciled contract governs the illustrative appendices. This release is the first bounded implementation slice, not delivery of the entire seven-stage platform.

## Preservation and scope

- The homepage HTML, shared homepage stylesheet, existing URLs, hourly collection/deployment jobs and Search Console code are unchanged.
- The latest main-branch FDA/EMA registry refresh is merged, preserving its data.
- Company legacy IDs and existing overview, update, product table, research and source views remain intact. Portfolio 360 is an additional tab on the existing company route.
- No paid APIs, new model services, dependency framework migration, licensed taxonomy, private case data or customer/vendor configuration is introduced.

## Delivered increment

1. Source verification and independent baseline releases described in regulatory-governance-roadmap.md. Migration 20261102024636 is additive and already applied; synthetic authorization/publication tests roll back all test data.
2. Portfolio 360 visual registry-status board, composed search/jurisdiction/status filters, 200-row accessible table and product evidence dialog. URLs preserve filters. Original source links, stable legacy record identity, holder role, scope, dates and missing-data states are explicit.
3. Product evidence links to the selected jurisdiction in Requirements Library and the existing Company Briefing confirmation workflow. A link is discovery, never an applicability approval.

Counts are source records and distinct substance labels, not unique molecules, incidence or clinical programs. Authorization status is not proof of current marketing. Clinical phases, indications and therapeutic areas are not inferred or populated from illustrative specification examples. Board columns are categorical authorization-status groups, not clinical development stages.

## Tests and rollout

- Local Node suite: 191 tests pass, with the two pre-existing localhost-network scenarios excluded locally; CI runs the full suite.
- New browser journeys exercise baseline releases and a synthetic 200-record portfolio with composed filters, unknown dates/stages, source details, JSON export, URL persistence, keyboard dialog behavior and mobile overflow.
- Existing company briefing, Action Center, navigation, source document, requirements and calendar browser journeys remain in CI. The browser runner is pinned to Ubuntu 24.04 for compatibility with Playwright 1.56.1.
- Updated fast-xml-parser to pinned 5.11.2 after a critical advisory was reported for the existing 4.5.0 dependency. The 191 local tests pass after the update; npm audit reports zero vulnerabilities.
- SQL tests exercise reader denial, draft RLS, verified-source/approved-interpretation gates, separate release approval and immutable published history. No real source or legal interpretation is approved during development.
- Rollback: restore the previous application commit to hide the additive UI. Retain the new evidence tables/history; do not drop or rewrite published records. No existing table or RPC is destructively replaced.

## Next slices

Normalized product/indication and trial evidence, clinical lifecycle lanes and sourced therapeutic classification; private safety-system baselines and five impact dimensions; controlled requirement packages, trace links, acceptance tests and test evidence. Each remains a separate measured release with role/tenant isolation and review gates. See regulatory-governance-roadmap.md for unresolved acceptance criteria.
