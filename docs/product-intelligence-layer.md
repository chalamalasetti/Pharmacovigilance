# Shared Product Intelligence layer

The chat reads company registry records, the published bulk product repository, captured regulatory label changes and explicitly selected DailyMed families through one reusable browser-side read model. It reuses the existing published snapshots and runtime data transport; it adds no bulk files to Vercel deployments.

## Consumer contract

`createProductIntelligence({json, readRepository, fetcher})` in `public/product-intelligence.js` exposes market loading, product candidate search, selected context, label-family registration, version registration, newest available label retrieval and combined dossiers. `public/product-intelligence-lib.js` contains the pure normalisation and relationship rules. Other screens can consume this same contract without introducing another identity implementation.

`pv-product-intelligence/1` dossiers retain source facts separately: reported product/ingredient names, identifiers, company roles, status/categories, date meanings, registry forms/strengths, relationships, captured changes, selected family, retrieved versions, investigation result, coverage and gaps. Facts carry source record IDs, source URLs, available fingerprints and snapshot timestamps. Combined evidence downloads preserve these fields.

## Identity and provenance

- US application identifiers are canonicalised across reported NDA/ANDA/BLA formats and Orange Book presentation keys. NDC listings remain listing identifiers.
- EMA medicine IDs identify EMA records; they are not silently relabelled as national licence numbers. Canadian DPD drug codes are never turned into DINs or approval identifiers.
- Company registry complements require the same market and authorisation plus exact normalised brand and ingredient-name sets. Salt forms and substance synonyms are not merged. Forms and strengths from application aggregates retain that broader scope.
- Catalog company associations derive from matched registry records or exact reported company/legal names. Roles remain sponsor, holder/applicant, labeler or DIN owner. Commercial ownership and historical transfers require separate evidence.
- Captured label changes link by reported regulatory identifier and market. This is an authorisation-level association; exact presentation/family implementation remains a separate review.
- Live families require explicit selection. SPL versions must match the selected Set ID and, when reported, application. Historical versions and newest available narrative are distinct. Source version/effective dates are never promoted into approval or official first-addition dates.

## Chat behaviour

General product questions, company portfolios, ingredients, source status, dates, label sections, timelines and source questions use the combined model. Label-history investigations register the same selected product, family, verified versions and result. Follow-up questions retain that scope; changing market requires another product selection. Clear conversation removes the scope and retrieved-label context.

Bulk-source failures are visible and are not cached as successful loads. If available, the company registry can supply a clearly scoped fallback. Missing company catalogs, label captures or trial data remain gaps. Company trial captures require the matching company ID; lexical study matches do not establish approved indications.

The current data-source footprint is US, EMA-scope EU and Canada. Automated historical narrative retrieval covers US DailyMed. The product records overlap across sources. This model does not establish complete worldwide portfolios, current commercial rights, clinical equivalence, regulatory compliance or a validated submission dataset. Qualified human review remains mandatory.
