# PV Info evidence repository

A reproducible, source-linked dataset for product, ingredient, label and regulatory-history analysis. Source records overlap and are **not unique worldwide drug counts**. Informational/training use; qualified human review is mandatory. Built with AI assistance, including ChatGPT and Claude; errors and omissions are possible. Not affiliated with regulators; not for regulatory submission.

## Contents

- `repository.sqlite.gz`: decompress to SQLite. Includes full-text search of the captured safety narrative sections.
- `products.csv.gz`, `ingredients.csv.gz`, `product_ingredients.csv.gz`: source-specific records and exact-name ingredient relationships. Salt forms and synonyms are not silently merged.
- `events.csv.gz`: typed approval, submission, marketing, cancellation and captured label-change events. Original application approvals are not presentation-specific approvals.
- `labels.csv.gz`, `label-sections.jsonl.gz`: complete successfully ingested openFDA label snapshot metadata and selected safety narrative text; not every historical SPL version.
- `identifiers.csv.gz`: source-reported application, NDC, DIN, EMA product and SPL Set ID relationships.
- `source_files.csv.gz`: original download URLs, source export dates, retrieval timestamps, SHA-256 and expected/loaded counts.

CSV fields that could execute as spreadsheet formulas receive a leading apostrophe. SQLite/JSON preserve original field text. Each normalized record retains its hash and locator; source-file hashes identify the downloaded input. The entire original source files are available from the referenced agencies, not duplicated in these exports. The endpoint's metadata and source catalog define scope and limitations.

## Identity and dates

Product records use source-specific IDs. `product_label_links` joins source-reported US application, NDC and SPL Set IDs and includes the match level. Application matches can connect several presentations; they do not establish a unique brand, strength or historical owner. Manufacturer, labeler, sponsor and DIN-owner roles remain distinct. Ingredient identifiers use exact casefolded names, not inferred chemical equivalence. Raw harmonized UNII arrays are not assigned positionally to ingredient names.

`approval_date` is only populated when its accompanying meaning is known. `events.date_raw` preserves qualifiers such as "before 1982" and original date strings. A marketing end, discontinued status, cancellation or expired listing is not automatically a safety withdrawal. `withdrawal_date` is populated only when an EMA authorisation-end date accompanies an explicitly withdrawn-authorisation status; no safety reason is inferred. Other cancellation, expiry, revocation, suspension and application-withdrawal dates stay in typed events. Health Canada cancellation dates and reasons are retained in status events; source status history can contain reinstatements. No event is used to guess an official first term-addition date.

## SQL examples

```sql
-- Full-text search of captured label safety sections; phrase match is not a diagnosis.
SELECT l.set_id, l.version, l.effective_date, s.section, s.text, l.source_url
FROM label_text_search f JOIN label_sections s ON s.id=f.rowid
JOIN labels l ON l.id=s.label_id
WHERE label_text_search MATCH '"anaphylaxis"';

-- Approved application labeling supplements (not necessarily safety changes).
SELECT * FROM events WHERE event_type='labeling_supplement_approval';

-- Canadian cancellation history; inspect status and source before interpretation.
SELECT * FROM events WHERE market='CA' AND event_type='cancellation_status';

-- Source-linked product/label associations retain their match granularity.
SELECT p.brand, x.match_level, x.matched_identifier, l.set_id
FROM product_label_links x JOIN products p ON p.id=x.product_id
JOIN labels l ON l.id=x.label_id WHERE p.id = 'SOURCE:RECORD_KEY';
```

Literal full text supports user-defined safety phrases. No MedDRA PT/LLT/SMQ dictionary or algorithm is bundled. Current label mentions do not establish original addition dates. DailyMed historical files remain available through the app's on-demand version comparison tools.

## Refresh and reliability

A weekly GitHub workflow downloads every published FDA partition for the configured endpoints, checks record counts, and builds a new immutable release. Core-source or publication failure leaves the previous published manifest intact. Additional-source failures are shown explicitly; a previously populated source cannot silently disappear on refresh. Counts dropping by over 20% require investigation before publication. A new snapshot is published only after SQLite integrity checks, source checksums, and export checks succeed. Public browser indexes contain metadata; complete safety-text search is available in SQLite.

Run locally: `npm ci`, then `python scripts/evidence/build.py --out output/evidence`. Python 3.12+ and Node 22+ are used. No additional Python libraries are required. Development subset flags must never be used for publication.
