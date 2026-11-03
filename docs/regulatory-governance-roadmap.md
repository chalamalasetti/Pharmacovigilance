# Regulatory governance acceptance map

This specification is the product direction. It is not a claim of completed regulatory coverage or validated enterprise compliance. Company current controls, proposed changes, impact/risk, required actions and verification remain private company assessment fields; they must never be added to a public legal baseline.

## Delivered in this release

- Source Documents adds topic, clinical/marketed lifecycle, authority/type and publication date filters. Unknown publication dates are excluded when a date range is selected.
- Catalog records are official primary sources only; secondary commentary is not silently accepted into this catalog. Exact captured versions show immutable human verification reviews with document type, language, stated product scope, revision date, decision, rationale, reviewer reference and timestamp.
- A changed capture never inherits verification. Earlier captures, original links, archive references and checksums remain available. A changed captured URL is explicitly flagged. Previous and current candidate text appear alongside each other; similarity remains an unconfirmed matching signal.
- A master capability checklist has eight areas. Five agency annex selectors cover FDA, EMA, MHRA, Health Canada and PMDA/MHLW. Links are explicit editorial mappings stored in each release; capability controls never imply universal legal applicability.
- Baseline release workflow: draft -> in_review -> approved -> published, with rejection and withdrawal decisions. Publication requires approved source-linked interpretation versions, verified source reviews, exact provenance/citation agreement, explicit applicability, effective date, trigger/clock and submission method. The author cannot approve their own release.
- Each release freezes complete requirement and source-version records, source verification, interpretation approval history, master control mapping, trigger/clock and submission method. A manifest checksum and separate append-only release decision history support JSON export. State decisions use optimistic concurrency. A correction creates a new snapshot; a predecessor release ID records supersession lineage.
- Public readers can read published release history (including withdrawn history). Draft releases and draft events are restricted to existing application admins. All new writes go through authenticated, admin-checked RPCs; privileged implementations live in an unexposed schema. No AI service or paid API is enabled.

## Existing foundations retained

- Immutable source captures, checksum archive paths, last-check status, bounded HTML/PDF extraction, duplicate-byte detection, partial/no-text warnings, candidate matching and human candidate triage.
- Append-only interpretation revisions, approved/date-based explorer view, legal authority classification, exact source-version links and private/team company handoff.
- Company applicability decisions, actions, owner email/due dates, evidence links, impact requirement revisions, closure review and event history. Team separation-of-duties rules exist; personal/local workflows currently support explicitly labeled self-review.
- Hourly collection is a rotating batch of up to 24 sources, not a guarantee that every configured source is fetched every hour. Homepage layout, Search Console/SEO and deployment refresh controls are preserved.

## Remaining acceptance work (not represented as complete)

1. **Source governance:** approved secondary-source catalog and immutable source metadata-edit history; explicit related-update links; per-document permission to archive or retain metadata only; comprehensive redirect/check history; translated/scanned source review and OCR.
2. **Baseline governance:** granular scoped editor/approver roles; separate draft editing experience; formal requirement draft/in-review/publication states distinct from release states; governed material-scope-change/new-ID decisions; automatic release-to-release added/removed/changed summaries; predecessor-derived superseded labels; organization-specific baseline subscriptions. Five annexes are structural views, not complete verified jurisdiction baselines.
3. **Change monitoring:** a first-class change ID, saved full-document comparisons, explicit triage decisions and affected requirement mappings; confidence/structural-change flags and date-uncertainty work queues. Existing candidate-to-company handoff still permits review of unapproved extraction; this must be replaced with human-triage gating before formal impact creation in a later workflow migration.
4. **Impact workflow:** the complete New/Triage/Impact/Functional/Regulatory-QA/Approved/Actions/Verified state graph; multiple requirement/product/function links; every requested structured field; comments and governed attachments; configurable independent approval for each organization; complete source-to-action evidence export. Existing Action Center behavior is not relabeled as this full workflow.
5. **Access/audit/operations:** Reader/Assessor/Regulatory reviewer/Baseline editor/Baseline approver/Admin/Auditor scope matrix enforced by agency/product/team; authentication and authorization event retention; export-event logging; user deactivation, backup/restore and organization retention policies. Existing admin-only publication is an interim permission boundary.

## Release verification

The rolled-back SQL journey exercises real authorization, public/draft RLS, rejection of pending interpretations and unverified sources, independent approval, immutable manifest history, source-review changes and public approval history. The browser journey uses synthetic fixtures to test master controls, annex gaps, source links, exports, admin drafting and mobile width. Existing company, source, requirements and events browser journeys continue in CI. No real legal obligation is approved or published during development.
