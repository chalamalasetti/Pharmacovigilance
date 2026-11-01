# Document-led regulatory requirements workflow

## What ships

- **Source Document Library** (`documents.html`), filtered by country/jurisdiction, agency, monitoring status and search. Initial jurisdiction coverage is US/FDA and EU/EMA. Six existing source families are registered with metadata-only historical references; that status never pretends a copy has been captured.
- **Immutable captures** keep the official public original in Supabase Storage, original-byte SHA-256, filtered normative text, its checksum, retrieval time, configured source edition/dates, parser version and predecessor. Date/edition metadata is not automatically asserted to have been verified. Raw HTML downloads use attachment delivery and an octet-stream content type. Public originals can contain public personal information, as authorized; no private document/case upload is offered.
- **Extraction and matching** identify English normative language (`must`, `shall`, `should`, etc.), retain adjacent context, exclude contacts/narratives from extracted candidate text, and suggest one-to-one text matches with the previous capture or existing curated requirements. Exact text plus context can be unchanged; other matches are potential changes. Unmatched previous clauses are *possible omissions*, not withdrawals. Partial/empty extraction suppresses omission proposals. Matching scores measure lexical similarity, not legal confidence.
- **Global baseline review** is an app-admin editorial function. Accepting a candidate pins its source version and creates a *pending* interpretation. Exact agency/source-family/URL/edition citation must stay pinned. Reviewers can correct the stable requirement ID, statement, scope, exceptions, authority, dates, classification and system/process assessment prompts. Approval is a separate Requirements Library action. Rejections/finalized candidate reviews cannot be overwritten.
- **Private company assessment** is available to ordinary users. Select a confirmed company portfolio and explicitly choose private workspace or a team. Only jurisdiction relevance is proposed; product/role/clinical applicability must be decided in Action Center. The source candidate UUID and company portfolio revision remain pinned.
- **Impact requirements** add business, system, data and process drafts to a relevant open case. Editable prompts reference the source and decision; they are not completed specifications or automated legal analysis. Users provide measurable acceptance criteria and actual system/configuration scope. Every save appends a revision. Team drafts require a different designated current member to review; personal/browser work is marked self-review. Latest drafts must be approved against the current applicability decision before a relevant case can close. Cases with no drafts retain the previous workflow.

## Data and authorization

Public: `pv_documents`, `pv_document_versions`, `pv_document_candidates`, `pv_document_checks`, and existing `pv_requirement_versions`. The `pv-regulatory-documents` public Storage bucket contains only official public originals fetched by the server. Client insert/update/delete is restricted. Content-addressed paths use non-upsert uploads and verify an existing object's checksum before reuse.

Private: `pv_impact_requirements`, linked to `company_cases`. RLS limits reads to the personal owner/current team members. Mutations use checked RPCs. No direct client writes. Draft author/reviewer identity uses email only. Global editorial actor identity stays in the existing admin audit, not public document responses.

`capture_pv_document` and `record_pv_document_failure` are service-role-only. `admin_save_pv_document` and `admin_review_pv_candidate` require authenticated app admin access. Advisory locks, expected configuration/predecessor IDs and immutable versions prevent lost updates and duplicate captures. New source bytes create a new revision; a later reversion to historical bytes also receives a new revision. An unchanged latest byte hash creates no duplicate.

## Collection and deployment

The dedicated `.github/workflows/documents.yml` collector runs hourly at minute 17 (GitHub schedules are best effort), on relevant main pushes, and by manual dispatch. It reads the public source register and fetches official copies on GitHub runners, avoiding exclusive dependence on Vercel's access to agency sites. It sends copies to `api/document-collect.js` using short-lived GitHub OIDC tokens. The endpoint verifies signature, issuer, audience, expiry, numeric repository ID, exact main-branch workflow/ref and allowed event types. The signed subject is required and may follow the repository's customized GitHub subject template. The Supabase server key stays on Vercel; no new shared secret is needed. Untrusted branches/forks and anonymous requests cannot ingest. Public failure codes retain prior copies. Relay uploads are capped at 3 MiB; the direct admin path supports 8 MiB. Original hourly FDA/deployment and SEO/Search Console logic remains intact.

Builds also bootstrap source families that have no archived copy yet; already captured families are left to the scheduled collector. The feed fetcher preserves binary bytes explicitly for documents, while existing feed consumers retain text responses.

`npm run documents:probe` is a read-only reachability check used in CI; it cannot write captures. `npm run documents` retains the direct server-side collector for environments that can reach sources. Source metadata corrections also create an immutable revision when the bytes do not change.
Admins can register/edit/deactivate a source or request **Capture now** through `api/document-capture.js`, checked against their authenticated admin role. Source URLs and every redirect are limited to the configured agency's official HTTPS hosts; the existing DNS/private-network/size checks remain active. PDF extraction runs in a bounded worker (8 MiB input, 120 pages, 18 seconds, memory limit), with 300 candidates per capture. Public failure records use fixed messages, never response bodies or credentials.

Guidance landing pages can resolve an unambiguous official PDF link; GVP Module I has a current-document link adapter. This is not an exhaustive historical or discovery crawler. If the agency publishes at a different URL that the configured landing page does not expose, an admin updates the source URL and edition. Source retrieval time and effective/publication dates are different fields.

## Known limits and review obligations

- Scans/image-only PDFs, unsupported languages, very large sources, complex tables and extraction/layout defects can need manual review. Zero candidates does not mean zero obligations. Contact/narrative exclusions or candidate caps explicitly mark extraction partial.
- New source revisions do not automatically alter approved baseline interpretations, company applicability decisions or existing case snapshots. Human review is required.
- English rules and lexical matching can miss implicit obligations, semantic changes, definitions, cross-document dependencies, merges/splits and regional overlays. Review the archived original and legal context. No LLM, OCR or vendor-specific validation is silently claimed.
- System names/configuration scope are organizational metadata; users must not enter private case details. No personal data is requested beyond the existing email authentication/assignment/review fields.
- Captures are currently bounded at 100 active sources per build, and list/history limits fail visibly. Scale with a queue and server-side search before broad global backfill.
- Global source candidates and editorial rationales are public. Company drafting and decisions are private, including when based on a public document.

## Verification

`test/documents.test.mjs` exercises real PDF worker parsing, HTML boundaries, bounded extraction, qualifiers, matching/omission rules, official URL rules, collection idempotency/failures, archive integrity, candidate handoff and impact-draft readiness. `test/document-pipeline.sql` uses rolled-back synthetic fixtures to verify service/admin separation, source lineage, candidate promotion without approval, private/team isolation, draft concurrency, designated reviewer rules and closure gating. `test/browser/documents.smoke.cjs` covers the complete public-document-to-company-closure journey on desktop/mobile plus editorial concurrency, source registration and a capture failure. Existing browser journeys remain in CI; baseline country/agency/lifecycle filters are also verified.


## Public key-information copy in GitHub

The hourly document workflow also extracts key information on the GitHub runner during downloading, without a GPT API or extra paid service. It publishes JSON to the **`regulatory-document-cache`** branch of this repository, separately from application code. `index.json` lists the latest file per source, last check/success, extraction status, candidate count and preceding version. Each immutable `documents/<source-id>/<digest>.json` contains:

- Allowlisted source-register title, country, agency, edition, topic, document type, lifecycle, legal basis, applicability and dates. These are labelled as register metadata requiring verification; no publication/effective date is inferred from download time.
- Official source URL, SHA-256 of the downloaded original, parser/schema version and retrieval time.
- English normative requirement candidates with statement, neighboring context, page/section anchor, text fingerprint and pending-review status.
- Explicit partial, failed or zero-candidate status and parsing limitations. These are extraction candidates, not approved baseline requirements or company-specific impact decisions.

The content identity covers source bytes, metadata and extraction outcome. Repeated unchanged checks retain the same version path. The publisher preserves earlier files and commits each batch atomically without force. Unavailable sources keep their previous latest extraction and last-success time, with an explicit failure status. A failure in database delivery does not prevent publishing already collected public snapshots. The workflow remains visibly failed if any source or delivery fails.

Only public official-document derivatives are exported. No database dumps, company profiles, private assessments, reviewer identities, login emails, credentials or original PDF/HTML files are exported. Contacts and narrative-like individual fields continue to be excluded from candidates. Official originals remain in the existing document archive. The snapshot branch disables Vercel deployments through both branch settings and the existing ignore-build fallback; the FDA hourly deploy hook and SEO are unchanged.

For a read-only database collection that writes only local public JSON, run `node scripts/document-collector.mjs --snapshot-only --snapshot-dir=/tmp/pv-document-snapshots`. `--probe` remains read-only and never publishes. The scheduled job publishes through its scoped GitHub token; it does not require a new secret. Historical JSON remains in GitHub when an agency is later deactivated: consumers must also check the current source register, timestamps and status. Extraction files do not mirror later editorial approval or rejection in the application.

### Extraction v3 and publishing validation

`normative-rules-v3` retains governed list items, adds explicit require/obliged/deadline wording, uses unique heading-based HTML references, and preserves normative paragraphs containing email addresses by replacing the address with an explicit omission marker. Changed/shortened context is marked partial; the original remains authoritative. The service-only ingestion allowlist accepts v1/v2/v3 so prior collectors remain compatible. See [the four-document audit and validation scope](stabilization-review-2026-11-01.md).
