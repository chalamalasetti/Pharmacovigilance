# Substance Explorer — proposed product specification

Status: **Draft for product review. Not an implemented module.**

Product: Pharmacovigilance (PV) Info. Prepared 3 November 2026 against main commit `0a86070`. This proposal preserves the existing homepage layout and uses the existing data-only publication architecture. No paid LLM/API subscription is required for the first release.

## 1. Product outcome

A visitor should be able to ask: **“Show me paracetamol, its product records, the companies associated with them, and which company roles the sources actually establish.”**

The public journey is:

1. Open **Explore → Substances**, near Companies in the default navigation.
2. Browse an A–Z list or search by substance, ingredient synonym or supported identifier.
3. Choose **Paracetamol**; recognize **acetaminophen** as a reviewed synonym, and distinguish suggestions for misspellings such as **paracetomol** from verified synonyms.
4. Open Companies or Products, narrow by market and company role, and inspect the original source.
5. Open a mapped company's portfolio or confirm a company briefing when personal assessment is needed.

The core entity chain is **substance → ingredient occurrence → product/presentation → legal entity and its stated role → optional Company Explorer group**. Safety alerts, research and clinical studies can attach later through evidence-backed associations.

### Mandatory interpretation rule

The default heading is **Companies associated with this substance**, not “All manufacturers worldwide.” The FDA Orange Book identifies application holders, which are not necessarily manufacturers [1]. Manufacturing must therefore be a separately evidenced relationship. Preserve these distinct roles:

| Role | Required interpretation |
| --- | --- |
| Application holder/applicant | Holds the source-listed application; manufacturing is not inferred. |
| Marketing authorization holder | Holds the relevant authorization; retain source jurisdiction and legal entity. |
| Labeler | Source lists a labeler; the labeler may have another role but that must be separately supported. |
| Distributor/repackager/relabeler | Display the stated operation without upgrading it to manufacturing. |
| Finished-product manufacturer | Source explicitly associates the entity with manufacturing the relevant finished product. |
| Active-substance/API manufacturer | Explicit substance-manufacturing evidence; do not derive this from a finished-product authorization. |
| Other or unknown | Preserve the original source wording and the missing evidence. |

“Manufactured for X” does not establish that X physically manufactures the product. A facility registration, a UNII, a company ingredient mention or a study-sponsor relationship alone is insufficient evidence of a substance/product manufacturing relationship. Use **Source-stated** and **Reviewed mapping** as separate labels; do not imply an independent GMP inspection or certification.

## 2. Users, access and privacy

Public visitors and pending-approval users can browse substances, companies, products and public source evidence. Approved users can use supported private watchlists/company workflows. Existing account/team access controls govern all private saves. Selecting a public substance does not reveal who else follows it or which private companies other users monitor.

Administrators maintain identity mappings, source settings and unresolved company relationships. A professional-role preference does not grant editorial rights. No new names, birth dates, contact details, addresses, patient narratives or other individual data are needed. Store organizational legal-entity names and public source identifiers only. Use the app's existing email identifiers solely when an existing private assignment workflow requires them.

## 3. Public screens and navigation

### 3.1 Substance directory

Route: `substances.html`; navigation ID: `substances`; label: **Substances**. Add it to the existing configurable menu without changing saved custom group arrangements or homepage composition.

The page includes:

- Search with examples: “paracetamol, acetaminophen, metformin.”
- A–Z browse and a paginated, keyboard-accessible list. Do not render every product row into the directory.
- Filters: market/jurisdiction, available source, single-ingredient versus combination-containing records, relationship role, and source-reported product status.
- Each substance card shows preferred name, principal reviewed aliases, identity/mapping state, available company/product counts, covered markets and source-data date.
- Counts explicitly describe covered records. Unknown/unavailable manufacturer evidence is shown as **Not established from current sources**, not a misleading zero manufacturers.
- Clear filters, visible active filters and meaningful loading, empty and failure states.

Default search order: exact supported identifier, exact preferred name, exact reviewed synonym, prefix, then spelling suggestions. Keep identity matches separate from approximate suggestions. Do not use an LLM to decide chemical identity.

A query such as “paracetomol” should propose **Did you mean paracetamol?** The user selects the result. Never persist the typo as an approved synonym automatically. For an ambiguous term, show distinct candidates and the evidence needed to distinguish them.

### 3.2 Substance detail

Route: `substance.html?id=<stable-id>&tab=<tab>` with shareable public filters. Display a stable ID rather than treating a display-name slug as chemical identity. Reviewed merges retain redirects/history.

Header: preferred name, reviewed aliases, identifiers where supported, covered markets, identity state and source-as-of date. Use **Substance Explorer** as the page/module title. Initial tabs:

| Tab | Required content |
| --- | --- |
| Overview | Identity, aliases, exact ingredient/form relationships, combination-product indicators, source coverage and key counts. |
| Companies | Legal entities and source-stated roles, mapped company group where reviewed, markets and product counts. |
| Products | Source-linked product/presentation rows, exact ingredients and co-ingredients, brand, strength/form/route where known, status and associated legal entity. |
| Sources & coverage | Available datasets, retrieval/version evidence, unresolved mappings and limitations. |

Later tabs: Safety & regulatory updates, Research, Clinical studies. Do not show empty placeholders as completed integrations in the first release.

### 3.3 Companies view

Suggested columns: **Company/legal entity; Relationship; Products in selected view; Market; Source; Evidence state**.

- Preserve the legal-entity name exactly as stated by the source alongside any reviewed company-group mapping.
- Allow source-listed entities without a Company Explorer profile. Label them **Not yet mapped to Company Explorer**; do not hide them.
- Default counts distinguish legal entities from corporate groups. Offer an explicit group roll-up rather than counting subsidiaries as both entities and parents in one total.
- A **Manufacturer** filter includes only relationships explicitly supported as manufacturing. Allow users to distinguish API from finished-product manufacturing.
- Open product records and source evidence from each row. Offer **View company** only where the mapping/profile exists.
- If a manufacturer is not established, offer the evidenced holder/labeler records and explain the evidence gap. Do not claim “no manufacturers exist.”

### 3.4 Products view

One source product/presentation row must retain its actual ingredient/strength/form/route relationships. Do not create a Cartesian product from separately collected strength/form arrays. Preserve all co-ingredients and whether the selected substance occurs as an active ingredient. Default scope is active ingredients; excipients need a separate future mode and explicit source role.

Suggested columns: **Product; Exact ingredient(s); Strength; Form/route; Market; Source-reported status; Entity and role; Original record**.

Keep approval status, marketing/listing status, discontinued status and current availability separate. A source-listed approval is not independent evidence that a product is currently supplied. A discontinued record should not be relabeled withdrawn for safety reasons without specific evidence.

## 4. Identity and naming rules

Use stable internal substance IDs. Add external identifiers, such as UNII or RxNorm identifiers, only when the source mapping is supported and retained. RxNorm offers normalized clinical-drug terminology and relationships [2]; UNII availability does not imply regulatory approval [3]. These are different identifier systems, not interchangeable universal IDs.

The app must preserve:

1. The original ingredient string.
2. Its precise source identity, if established.
3. The canonical concept to which it has been mapped.
4. Any base/salt/ester/hydrate relationship and its evidence/review state.
5. The mapping version and rationale.

Paracetamol/acetaminophen should resolve to the same reviewed concept in the pilot. Salts, esters, stereoisomers and combination products must not be indiscriminately merged. A discovery grouping can offer **Include related ingredient forms**, but must display the exact source form and the relationship used.

The existing `moiety()` helper removes selected words for company matching. **Do not promote that heuristic into an authoritative substance identity service.** Reuse it only as an explicitly provisional discovery signal while building reviewed mappings.

Do not silently infer a substance from a brand name. Brands can differ across markets and may contain multiple ingredients. Brand search can navigate through the verified product record to its ingredients.

## 5. Data model

The logical model can be implemented in versioned public snapshots first; it does not require creating every entity as a new public database table. Editorial mappings need administrator-only writes and event history if stored in Supabase.

| Record | Essential fields |
| --- | --- |
| Substance | `id`, preferred name, concept type, identity state, supported identifiers, created/updated version. |
| Substance alias | Substance ID, alias, language/region if known, alias type, authority/source, reviewed state, mapping version. |
| Substance relationship | From/to IDs, relation such as precise-form/base, evidence, qualifications, reviewer decision and version. |
| Product record | Stable source key, source dataset/version, market, application/authorization identifier, product/presentation identifier, brand, source status, structured strength/form/route when available. |
| Product ingredient | Product key, original string, mapped substance ID (nullable), ingredient role, source strength/basis where available, match method and review state. |
| Organization | Stable entity ID, original legal name, source identifiers, nullable company-group/profile ID, mapping evidence/status. |
| Product/substance company relationship | Entity ID, product/substance scope, explicit role, source wording, source URL/record locator/version, valid/source dates if stated, retrieved date and evidence state. |
| Publication metadata | Snapshot ID, vocabulary/mapping version, source as-of dates, coverage counts, stale/partial flags and checksums. |

Manufacturer evidence should include the precise public source statement or structured operation/role and the product/substance linkage. An entity's location alone is not proof of its manufacturing role. Unknown identifiers/dates remain unknown.

Every company/product association must be traceable to a source record. Do not use an account holder's private product list as public evidence of a company's portfolio.

## 6. Existing application integration and required corrections

Code inspection identifies a useful starting point and two material gaps:

- `scripts/companies.mjs` already creates brand/substance-to-company search terms in `data/companies/products.json`.
- `scripts/registry.mjs` preserves ingredients, holder, role, market and source identifiers from FDA/EMA collection.
- Current public company search is restricted to mapped company profiles. The collector emits mapped product records and only a limited summary of unmapped holders. **The new substance layer must retain complete permitted source product/entity rows before company-directory filtering.** Existing unmapped summaries are not sufficient to reconstruct them.
- Orange Book parsing currently groups multiple presentations under an application. **Retain source product-number granularity in a parallel normalized layer** before displaying exact form/strength/product counts. Preserve original rows for reconciliation.

Keep the existing company-registry shape and stable portfolio keys compatible during the first implementation. Publish the new normalized product/substance layer alongside the existing company view. Do not silently rewrite confirmed company portfolios, deduplication keys or pinned case evidence.

Where a company briefing still selects an application-level group, a handoff from a granular substance product must identify that broader group and require user confirmation. Do not imply a specific presentation was selected when the current portfolio model cannot represent it.

### Future workflow connections

- Companies page: ingredient links open Substance Explorer with the substance filter preserved.
- Company Briefing: start with a mapped company and ingredient/product context, then require the normal product/market confirmation.
- Company Change Inbox: substance signals can enter only under the established confirmed portfolio and existing private reading/assessment rules.
- Action Center: no automatic applicability decision, new case, assignment or closure from a public substance match.
- Requirements Library: only explicitly linked substance scope is relevant; a substance page does not create a regulatory obligation.

## 7. Data sources and practical coverage

### Initial product/holder coverage

Use the configured FDA Orange Book and EMA medicines datasets already collected by the app, retaining source-specific limits. Do not describe the initial release as all FDA products, all EU national authorizations, all biologics or all global manufacturers. Validate each connector's current terms, fields and allowed use at implementation time.

### Identity enrichment

Use a bounded, reviewed synonym pilot, supported by official substance/nomenclature sources such as GSRS/UNII and RxNorm [2,3]. Record the source/release and mapping evidence. Do not promise that every public API or complete download can be used without checking its access/licensing conditions. API keys, if a future connector needs them, stay server-side.

### Manufacturer/labeler enrichment

Evaluate official DailyMed/SPL and FDA listing evidence as a separate connector/pilot. DailyMed exposes source-linked labeling and supported search identifiers [4,5]. FDA states that a labeler can be a manufacturer, repackager/relabeler or another entity named on the label, and the NDC Directory includes approved and unapproved listings [6]. Therefore, listing/labeler evidence must retain its role and must not become an approval or manufacturing badge by default.

The first release must visibly distinguish **manufacturer evidence available**, **holder/labeler evidence only**, **not checked** and **source unavailable**. Specific manufacturing claims require explicit role/product linkage and editorial checking before presentation as a reviewed mapping.

### Geographic expansion

Later add additional official product catalogs by country after field mapping, identity quality and company-role evidence are assessed. Reuse administrator-managed source enable/disable and frequency controls. Avoid unaudited supplier-directory scraping or a claim of comprehensive global supply-chain coverage.

## 8. Collection, publication and cost controls

Build substance indexes in the existing product-data pipeline, publish them through the data-only snapshot publisher, and let the browser load public snapshots. No product-data push to main or Vercel deploy hook is required. Reuse source downloads instead of fetching once for each substance or visitor.

The source product cache must carry a schema, generation ID and integrity metadata for both the legacy company view and new normalized rows. Switch compatible outputs together; retain the last good source generation on failure and disclose staleness/partial coverage. Corrected/missing source records require reconciliation; do not silently resurrect data from a deactivated source as fresh evidence.

### Runtime publication design

The current publisher permits at most 600 files, 64 MiB compressed per snapshot and 16 MiB compressed per file. Its path allowlists do not yet include substance files. **Do not create one published file per substance**, which could exceed the file budget.

Proposed bounded layout:

- `data/substances/index.json`: names, reviewed aliases, lookup keys and lightweight directory counts.
- `data/substances/coverage.json`: source/mapping/quality metadata.
- Up to 64 deterministic `data/substances/shard-00.json` through `shard-3f.json` payloads, selected by a stable hash. Keep constituent IDs and shard mapping versioned.

Implementation must extend the client/server runtime path validators and the relevant SQL publication validation together, including tests for denied paths and snapshot budgets. The total of existing and new files must remain below the configured cap; evaluate compressed size and three-snapshot database storage before rollout. Do not raise limits automatically to hide a budget failure.

Load only the directory index initially and the selected shard on demand. Preserve the atomic snapshot pointer, checksums, last-good fallback and current generated-cache retention. Substance records never become an excuse to delete regulatory originals, baselines, audit records or private cases.

Performance targets for the pilot: compressed search index at or below 1 MiB, paginated product/company lists, responsive keyboard search with a 150–250 ms debounce, and selected-substance content usable within two seconds after the required cached data is available on the agreed test device. Measure against a declared dataset/network/device; report unmet targets rather than presenting them as guaranteed delivery.

The initial release uses deterministic parsing, reviewed mappings and existing hosting/database resources. No paid GPT calls are needed. Public data can still incur bandwidth/storage/compute usage; add size/run metrics to the existing admin diagnostics rather than promising zero ongoing cost.

## 9. Administration and quality controls

Administrator tools should support:

- Searching raw ingredient strings, aliases, unresolved identities and unlinked entities.
- Approving/rejecting proposed aliases and precise-form/base relationships with a reason.
- Linking a legal entity to an existing company group without deleting its original legal identity.
- Reviewing source-stated manufacturer evidence separately from company-group mapping.
- Correcting a mapping by new version, retaining redirects/history for merges/splits where appropriate.
- Viewing source/run date, stale state, record totals, unmapped counts and reconciliation exceptions.

Do not allow public visitors to publish identity merges or manufacturing claims. A feedback suggestion is a review candidate. Keep credentials, account information and private company work out of public snapshot/admin diagnostic exports. Menu visibility changes must not alter authorization.

## 10. Later evidence tabs

Add these only after the core identity and company/product views are reliable:

| Tab | Matching and interpretation rule |
| --- | --- |
| Safety & regulatory updates | Supported canonical/alias/product matches with source/date and why-it-matched evidence. Broad class matches are separately labeled. |
| Research | Identifier or reviewed textual association with original publication and maturity; not proof of efficacy, ownership or regulatory applicability. |
| Clinical studies | Study medicine/ingredient association, phase/status/condition grouping and reported sponsor/collaborator roles. Sponsorship is not manufacturing or product ownership. |

Ambiguous names and short/common-word aliases need disambiguation or exclusion from automatic textual matches. Preserve match method, vocabulary version, evidence location and confidence/review state. No personal narratives or adverse-event case rows are introduced by this feature.

## 11. Acceptance criteria and test scenarios

1. A visitor can reach Substances from the configurable menu and browse without sign-in, including while account approval is pending.
2. A reviewed paracetamol/acetaminophen alias mapping returns the same concept. “Paracetomol” offers a spelling suggestion requiring selection, rather than automatically publishing a new synonym.
3. Precise salts/forms and combination-product ingredients remain explicit; the current salt-word heuristic cannot silently merge distinct substances.
4. A combination product appears for each supported constituent search, retaining the complete ingredient list and the actual strength/form relationships.
5. Application-holder, MAH, labeler, distributor, finished-product manufacturer and API-manufacturer roles remain distinct. Holder-only rows never appear under a manufacturers-only filter.
6. Manufacturer evidence unavailable is displayed as unknown/not established, not zero worldwide manufacturers. “Manufactured for” text alone does not establish the named entity as manufacturer.
7. Source-listed companies without curated profiles remain discoverable, with original names, role and source evidence. Known-company links are offered only for mapped profiles.
8. Company counts distinguish legal entities and rolled-up groups. Source/product keys prevent duplicate imports without merging genuinely different market/presentation records.
9. Each count states its scope: covered products/markets/statuses and source date. Approval, listing and availability remain distinct.
10. Every product-company/substance association has a public source identifier/locator, retrieval/version evidence and mapping state. UNII or NDC presence alone is not an approval claim.
11. Failed/partial collection preserves last good evidence with appropriate stale/partial labeling; deactivated sources do not reappear as fresh by fallback.
12. A refresh updates substance data without an app deployment. Publication remains atomic and fails safely if file/path/storage budgets are exceeded.
13. Deep links, A–Z browse, clear filters, pagination, keyboard selection, mobile layouts and accessible labels work with realistic large fixtures.
14. Client reads use public snapshots; unauthorized users cannot edit aliases/manufacturer mappings or access other users' private work/watchlists.
15. A company handoff requires normal confirmation, retains the actual scope granularity and does not overwrite a pinned existing case.
16. Update the User Guide/function map, source documentation and admin instructions with the release. Functional testing is not represented as GxP validation or independent supply-chain verification.

Use synthetic fixtures for misleading role names, “manufactured for,” conflicting aliases, unmapped holders, parent/subsidiary counts, discontinued records, unknown dates, duplicated sources, partial fetches and stale generations. Add a bounded manually reviewed real-source pilot before broad publication.

## 12. Recommended delivery plan

### Release 1 — ingredient-to-company browsing

Deliver the Substances menu, directory, identity detail, Companies, Products and Sources tabs; retain normalized source rows and unmapped entities; implement reviewed alias controls, role-aware labels, filters, source links and bounded snapshot publication. Start with existing FDA/EMA product/holder evidence and a reviewed paracetamol/acetaminophen pilot. Manufacturing information is shown only where explicit evidence exists; gaps remain visible.

### Release 1B — manufacturer evidence pilot

Add a small reviewed official-label/listing connector pilot, explicitly distinguishing API and finished-product manufacturing from holders/labelers. Check both positive and misleading role examples before scaling. This increment is required before marketing the module as a manufacturer browser.

### Release 2 — substance intelligence

Add source-linked safety/research/clinical tabs, approved private substance watchlists and deliberate company-workflow handoffs. Keep independent evidence categories and existing human assessment/approval requirements.

### Release 3 — geographic expansion

Extend country catalogs and organizational relationships through approved connectors after coverage, licensing, identity and review quality are established. Do not make global completeness a release claim without an independently measured coverage basis.

## 13. Source references checked for this proposal

These references explain source semantics and candidate integrations. They do not prove that a connector or manufacturer record is already implemented in PV Info.

1. FDA, Orange Book Preface — applicant/application-holder identification and the distinction from manufacturing: https://www.fda.gov/drugs/development-approval-process-drugs/orange-book-preface
2. NLM, RxNorm Overview — normalized clinical-drug names and ingredient/strength/form context: https://www.nlm.nih.gov/research/umls/rxnorm/overview.html
3. FDA, Global Substance Registration System — UNII identity and the absence of an implied regulatory approval: https://precision.fda.gov/uniisearch
4. NLM, DailyMed — source labeling context: https://dailymed.nlm.nih.gov/dailymed/index.cfm
5. NLM, DailyMed REST /spls — supported search filters, including manufacturer, labeler, RxCUI and UNII: https://dailymed.nlm.nih.gov/dailymed/webservices-help/v2/spls_api.cfm
6. FDA, National Drug Code Directory — labeler meaning and approved/unapproved listing scope: https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory
