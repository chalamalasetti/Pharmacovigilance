# Global source and requirements library

The Source Document Library supports the full country/area index and additional regional/international jurisdictions. It now includes an **incomplete** agency/organization directory with explicit coverage gaps. This extends registration, country/agency filters, source capture, candidate extraction, comparison, baseline review and private company assessment beyond FDA/EMA. No model API, API key, paid translation, paid OCR or new paid service is used.

The initial directory contains 251 jurisdiction entries (UN M49 country/area rows plus the app's existing additional jurisdictions), 127 organization entries across 118 jurisdictions, and five agency configurations with approved capture hosts: FDA, EMA, MHRA, Health Canada and TGA. Four additional specific guidance sources are registered for the UK, Canada (two chapters) and Australia; availability is recorded per source, and none are automatically approved requirements. A directory reference is not proof of a current PV mandate, verified source access or an extracted requirements baseline. International organizations include standards and collaboration bodies, not only regulatory authorities.

Directory provenance is stored on each row. The country/area index is from UN M49, additional European authority entries from EMA's national competent authority directory, and selected additional organizational references from WHO's certification scheme contacts. WHO certification scheme listing does not imply WHO Listed Authority status or verified PV responsibility. No contact names, email addresses, phone numbers or addresses were imported. Referenced websites may have changed; HTTPS versions of legacy links require verification before capture.

## Admin workflow

1. Open **Resources → Source documents → Global agency directory & coverage gaps**. Filter by country, agency or organization name; compare registered documents, current archived copies, extracted documents and approved requirement versions. Empty coverage means missing evidence.
2. In **Manage source documents → Agency directory**, register an authority or use **Manage agency** on a directory entry. Confirm its current medicines safety mandate and official publication service. Approve exact HTTPS hostnames, provide provenance and a verification rationale, then select **Verified**. Host approval enables capture only; it does not approve any document or interpretation.
3. Register specific official guidance, regulation or technical instruction documents with that agency and jurisdiction. Record the edition, scope, authority type and dates; leave unknown dates blank. Do not register a whole homepage/contact directory as a baseline requirement document.
4. Capture now or await the collector. Archived originals remain immutable. The versioned free extractor can reprocess identical source bytes after a parser improvement while retaining the earlier extraction and archive. Method changes do not establish regulatory amendments; omission suggestions are suppressed across method changes. Rule-based candidates and before/after matches require review. English normative language is supported. Scanned PDFs, other languages, exceptions and complex tables can require manual extraction/review. A no-text result is never evidence of no obligations.
5. Match and draft pending interpretations, approve the baseline separately, then send pinned evidence to a private company assessment. A source outside confirmed company markets requires an explicit monitoring acknowledgement; no local product authorization or jurisdiction match is inferred.
6. Draft business/system/data/process requirements, review and verify closure through the existing private Action Center. Team authorization and independent reviewer rules continue to apply.

Agency IDs are stable and globally unique (`FDA`, `EMA` retain legacy IDs; other IDs include a jurisdiction prefix). Country/agency pairs are constrained in Postgres. Agency metadata uses admin-only RPC writes with optimistic concurrency and public read-only RLS. Changing a document's authority requires a new source family. Deactivating an agency prevents future collection without deleting history. Exact approved hostnames are validated in browser, collector, ingestion service and database; every HTTP redirect is also checked against public-network/DNS safeguards.

## Collection and operating limits

The existing FDA feed refresh/deployment-hook workflow and Google Search Console/SEO configuration are preserved. The separate document collector runs hourly at minute 17 and takes at most 24 active approved sources, oldest check first. With more than 24 sources, each source rotates through batches; actual freshness is its last-check timestamp, not a promise that every source was checked in the last hour. Build bootstrap takes at most three missing captures. The GitHub relay accepts at most 3 MiB per source; direct admin capture remains bounded at 8 MiB. A source block or failure retains the last captured version and a visible failure state.

The pipeline uses the existing hosting/database/storage allowances. This change does not purchase services, upgrade plans or enable paid AI calls. Published regulator data, infrastructure quotas, rate limits and unavailable sources still constrain coverage. No exhaustive worldwide historical crawl is enabled. Administrators explicitly verify agencies and register relevant documents in stages.

## Future optional model extraction

Model-based extraction is deferred. There is no OpenAI SDK, model key, paid call, enabled switch or fallback to a paid model. The existing archive checksum, immutable source versions, clause anchors, candidate review and baseline history already provide a foundation for a later adapter.

If separately authorized in future, add a server-only extraction adapter behind an explicit opt-in configuration. It should use a configurable model, structured JSON output, cited page/section evidence, model/prompt version, token/cost accounting, per-job budgets and retry caps. Reuse source hashes to avoid duplicate extraction. Benchmark against manually annotated FDA/EMA documents, flag uncertain/unsupported content, compare against the free extractor, and preserve mandatory human review. Model output must never auto-approve a requirement or company action. API failure should leave the original source and free/manual workflow available.

## Rebuilding the seed

Download the three official HTML pages listed in `scripts/build-regulatory-catalog.mjs` to local files, review the organizational-only extraction and run:

```
node scripts/build-regulatory-catalog.mjs /path/to/m49.html /path/to/ema-nca.html /path/to/who-contacts.html
```

The generated bundled seed is a fallback directory for browsing. Live verification state always comes from the database for actual collection. Updating the snapshot does not overwrite admin-managed live rows.

Validation: Node tests cover cross-agency hosts, every redirect, reference-only capture rejection, coverage categories, explicit outside-market monitoring and bounded scheduling; live SQL transactions cover admin gating, concurrency, forbidden hosts, global registration, source/agency pinning and deactivation. Browser journeys cover the directory, admin host verification, new agency selection and the existing end-to-end assessment/closure workflow.
