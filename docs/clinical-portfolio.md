# Clinical Pipeline and Therapeutic Areas

## Entry points

Company Explorer -> existing company -> Portfolio 360 -> Clinical pipeline or Therapeutic areas. Authorization portfolio and the existing product table remain available. The homepage and shared homepage styles are unchanged. Subviews and filters are URL-backed, and the prior authorization view remains the default.

## Public source and collection

- ClinicalTrials.gov API v2, official documentation: https://clinicaltrials.gov/data-api
- Protocol definitions: https://clinicaltrials.gov/policy/protocol-definitions
- GET /api/clinical-trials accepts only an existing bundled company ID and an opaque continuation token. There is no caller-supplied upstream URL or free-form search expression. Responses are public, organization-level metadata; no identity, team context or credentials are required.
- The server projects an explicit field whitelist: trial ID/title, phases, study type, status, condition and MeSH condition/ancestor terms, organization names, medicine/arm labels, study dates, registry-update date and country only. It does not request investigator/contact names, email, phone, facility, street/city/postcode, participant records or free-text descriptions.
- Exact normalized organization names come from the company catalog and mapped FDA/EMA holder labels. Case/punctuation and ampersand/and are normalized. Ambiguous plain names such as Merck are excluded. Catalog affiliation mappings remain provisional where the existing catalog is draft. There is no fuzzy ingredient-to-company or trial-to-product ownership inference.
- Only interventional studies with drug/biological interventions and a matched lead sponsor/collaborator enter the view. The source query can contain other matches; excluded/source-scanned counts are visible. Registry totals are pre-filter query counts, not verified company pipeline totals.
- Each request checks up to 100 source records, has bounded timeout/response size and a fixed official HTTPS endpoint. Source IDs deduplicate across pages. The browser caps a session at 10 pages (1,000 checked records), with a direct full-registry link for the remainder. API errors preserve previously loaded rows and offer a retry.
- Server responses may be cached for one hour with up to one day of stale-while-revalidate. Retrieval time is retained per study/page; registry last-update dates remain separate. Browser sessions recheck after an hour or via Reload clinical evidence. There is no new cron, paid API or build per request.

## Presentation and evidence rules

- Trial phases remain study-scoped and can coexist, e.g. Phase 2 and Phase 3. A registered trial does not establish marketing authorization, ownership, indication approval or complete development coverage.
- Experimental-arm and comparator labels are retained separately for each study medicine; an experimental arm is not proof the medicine is unapproved. Unknown arm roles remain unknown.
- Therapeutic-area display labels use exact source-supplied MeSH condition/ancestor terms and IDs, mapped to broad UI groups by PV Info grouping v1. The original term and ID remain visible. These groups are not MedDRA SOCs or a qualified universal therapeutic taxonomy. Multiple groups can apply; counts are not additive. Missing source classification is explicitly unmapped.
- Study-country filters describe trial locations, not authorization markets. Unknown and partial dates remain unknown/year/month/day with actual/estimated status; no invented day or timeline bar is produced.
- Original NCT records, conditions, reported company relationship, retrieval time, last registry update and grouping rationale are accessible on every study card.
- Product evidence offers a related-trial text search labelled unconfirmed; it does not create an approved product/trial mapping or applicability decision.

## Verification and limitations

- Unit/API tests cover contact exclusion, ambiguous names, exact sponsor roles, comparator vs experimental medicine, parallel phases, invalid/partial dates, combined filters, source projection, bounded URLs, cache errors and deduplication.
- Browser fixtures cover switching views during a pending fetch, phase/area filters, direct sources, preserved results after an outage, paging/deduplication, reload/URL persistence and mobile overflow. Existing eight journeys remain in CI.
- Live first-page probes succeeded for AstraZeneca, GSK and Johnson & Johnson. Measured counts are temporary observations, not hardcoded coverage claims. Visual QA uses a sanitized capture of the live API; the managed preview's direct outbound source request was unavailable. Production endpoint verification follows deployment.
- All bundled catalog companies are queryable. Custom companies added outside the bundled catalog need a reviewed sponsor mapping before this API can query them. Organization aliases, historic affiliates, unindexed conditions, absent trials, upstream publishing delays and the page cap create known coverage gaps.
- This release is a current registry explorer, not an immutable historical trial archive, validated safety database or autonomous applicability engine. It does not ingest trial participants or safety case reports. Approved product indications, global trial coverage, expert-reviewed therapy mapping and historical clinical snapshots remain future extensions.

## Rollback

Restore the prior application commit to remove the new subviews/API. No database migration or private record change is introduced. Existing hourly workflows, homepage, portfolio confirmations, source verification, baseline publication and company cases are preserved.
