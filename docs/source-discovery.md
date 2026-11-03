# Source Discovery and Coverage

Admin → Source Discovery (`admin-discovery.html`) provides a review inbox separate from extraction candidates and baseline approval. Source documents → Manage source documents links to the same screen. The homepage is unchanged.

Five seed publication indexes cover EMA GVP, FDA safety guidances, MHRA GPvP, Health Canada GVP chapters and TGA sponsor responsibilities. They discover public official links only; a page listing is not a current legal obligation or verified document edition. Initial scans produced 44 pending links and two links to existing Canadian source records on 3 November 2026. TGA returned HTTP 503 during the initial scan; its failure is retained and does not erase prior evidence. These are temporary observations, not fixed coverage guarantees.

## Review journey

Search/filter by agency and candidate status. Open the original proposed source. Defer, reject or register with a recorded reason. Registration asks for stable document ID, title, edition, topic, lifecycle, authority basis, applicability and dates; unknown dates remain blank and source status defaults to uncertain. It creates or links a source record, not an approved requirement. Use the existing source page for capture, extraction review, source verification and separate baseline publication.

Exact canonical URLs deduplicate across connectors within an agency. Repeat observations retain prior decisions and first-seen metadata. Existing source URLs link to their record. Similar titles are a review hint only; new URLs and revised editions are not automatically superseded or legally classified. Existing original captures and baseline versions remain unchanged.

## Collection and control

Connectors support HTML links, RSS/Atom and one sitemap URL list. An admin can configure only a verified agency's exact approved HTTPS hosts; every redirect is checked by existing safe-fetch DNS/network guards. Matching uses comma-separated scope keywords against title/URL, not a model. No document bytes are downloaded by discovery; only a bounded index is parsed. XML entities/DOCTYPE are rejected, links are canonicalized, and contact-like titles/unsafe URLs are excluded. Source dates are not inferred from sitemap lastmod or RSS dates.

The existing trusted main-branch `documents.yml` collector asks the existing OIDC-authenticated `document-collect` endpoint for up to five due connectors and scans each through the server. Default interval is daily, configurable from 60 to 43200 minutes. The job still runs hourly at minute 17; it does not reconfigure cron-job.org, the FDA workflow or deployment hook. A paused connector is rejected by server persistence even if a scan is in flight. Configuration changes invalidate old results.

Each index is limited to 1 MiB, 5000 inspected HTML links and 50 matching candidates per scan. No recursive crawling, pagination or sitemap-index expansion is enabled. Truncation is visible; narrow the index or split by topic rather than assuming complete coverage. Failures record a failed run and preserve candidates. Actual check time and counts are admin-only. The public library's existing country/agency coverage remains available.

Connector/candidate/run tables have admin-only SELECT policies; no browser direct writes. Admin RPCs record reasons and events, require version checks and enforce agency/URL identity for registration. The record worker is service-role-only, reached through the existing trusted GitHub identity or an authenticated admin scan endpoint. No new secret or model API is introduced. Rejected/deferred candidates can return to pending; registered candidates remain linked. Service/database owners retain administrative access; this is not a GxP immutability claim.

## Verification and deployment

Apply `20261103151420_source_document_discovery.sql` before deploying the UI/API. It creates additive discovery tables and RPCs and seeds five publication connectors; no existing document, user, requirement or case is removed. Seed indexes require ongoing access/terms review and document archival rights remain a separate capture decision.

`test/discovery.test.mjs` covers formats, canonical duplicates, host and redirect restrictions, XML entities, unknown dates, caps and preserved failure state. `test/source-discovery.sql` exercises real worker/admin/RLS paths with rolled-back synthetic fixtures. `test/browser/discovery.smoke.cjs` covers scan, defer, registration, pause, mobile and the admin gate using synthetic fixtures only. CI retains all existing journeys.

GxP Readiness Foundation is deferred in issue #57. This release does not claim validation, formal electronic signatures, exhaustive collection or approved automated legal interpretation.

## Collector run outcomes

The prior collector returned exit code 1 whenever any source failed. Run 41623303828 delivered six sources but failed four, producing the generic GitHub all-jobs-failed email. The collector now adds a GitHub step summary and source warning annotations: partial success completes with explicit incomplete-coverage warnings; a batch with failures and zero successes still fails. Configuration/identity/database exceptions remain hard failures. This changes reporting, not source-host approval or original preservation. Intermittent eCFR, EUR-Lex and TGA failures still need per-source monitoring.
