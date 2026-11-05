# E2B Requirements & Mapping Studio

## Purpose and navigation

Open **Resources → E2B Mapping Studio**, or use **Explore E2B requirements** in Configuration Workbench. Public visitors and pending accounts can search the reference library. Approved accounts can save private organizational mappings. Baseline editor actions currently require application administrator access.

The studio is a technical reference and design workspace. It does not process case XML, run a schema validator, calculate reporting obligations or connect to a safety database. No paid model API is needed.

## Understand the captured sources

The initial release contains definition blocks from the supplied October 2026 Revision 2 ICH guide (FDA edition), postmarket field rows from FDA business-rules workbook version 1.7 dated 2024-04-01, unclassified warning/rejection worksheet rows and sections from the August 2024 version 3.1 FDA regional guide. A separate dated structured-summary overlay covers C.1.3 and C.5.4 from the December 2025 ICH alignment paper, including the additional study-type categories. These summaries are not exact quotations; inspect the linked paper. Sources are separate layers; older FDA text is not automatically overridden or promoted into current requirements.

Open sources and coverage to inspect original links, editions, original-file checksums and source-document records. PDF locations show both physical PDF page and printed page; workbook locations show sheet and row. A field capture hash identifies the extracted content and source binary. The supplied core PDF is identified as user-supplied; no byte-for-byte match with the current official download is claimed.

Schema-set metadata and official example/implementation resources are references. XML instances are not ingested. Schema validation, full code-list maintenance, dictionary content and automatic vendor field discovery are outside this release. No MedDRA or WHODrug dictionary is distributed.

## Search and compare

Search an element ID, title, nullFlavor, XPath or source text. Filter by ICH core, ICH alignment summary, FDA postmarket workbook, unclassified warning/rejection rows or regional-guide sections. Review-state filters distinguish extracted draft, source verified, needs correction, published subset and unavailable review status. Reset clears search and filters.

Choose a record to inspect captured guidance, conformance, type, allowed values, business rules, OID and other available attributes. Blank, dash or uncaptured information is not inferred. Cardinality and cross-field dependencies require the original diagrams, current code lists and complete source text. Warning/rejection rows preserve uninterpreted source columns; confirm column meanings and clinical/vaccine applicability in the original workbook.

Where the same field is captured in ICH and FDA layers, expand the comparison. The workbook predates the core guide. Differences are review prompts, not a determination of which instruction is legally applicable. Check later FDA implementation policies, including those linked from the current FDA resource index.

The initial counts describe captured blocks, worksheet rows and sections; they do not prove every obligation or clause has been extracted. PDF layout, grouped fields, diagrams and appendices can need correction. A field marked needs correction must be fixed through a new extraction/capture; the prior capture remains immutable.

## Review and publish a baseline

An administrator can record a source-verification decision for one record, with a public organizational reason. Compare exact wording, attributes, exceptions, edition and location with the original source. Choose source verified or needs correction. No batch verification is performed automatically. Public notes must not contain personal or company-confidential information.

Publish verified subset creates an immutable snapshot containing only fields whose latest source-review decision is verified. It captures source metadata, the selected fields, verification decisions, release reason and the captured-versus-published counts. It does not claim full ICH/FDA coverage or legal approval. Subsequent review decisions and new captures do not rewrite the snapshot. Choose any prior published subset using the reference-version selector.

If source-review data cannot load, the screen says review unavailable; it does not silently treat records as approved. The raw reference library remains available when possible. Publication requires live review data and approver access.

## Document private system mappings

Select a record and enter your system, installed version, environment, company and markets. Record the actual system field/configuration, current control, transformation/customization, test evidence reference and rationale. Use organizational metadata only. Do not enter contacts, credentials, real case XML, patient or reporter information.

Save a draft, change needed, documented or not applicable decision. Documented requires a system field, current control and explicit confirmation that you checked the mapping in that installed release/environment. This records your mapping documentation, not independent compliance approval. Argus, Veeva, ARISg and other systems share the specification form; exact vendor fields are not fabricated.

Each save retains a revision snapshot and reason. Stale revisions are rejected. Mappings are private to your account, including against administrator/public access through the normal application. Token refresh retains drafts; sign-out or account changes clear private data from the screen.

Private mapping counts cover entered mappings only. Unmapped library records are not automatically company gaps. If a later capture has a different field/source hash, the mapping is flagged for reassessment. Open the old mapping to retain its source. Reassess against latest capture explicitly selects the new evidence, resets system confirmation and marks change needed; saving creates a new revision without modifying history. Absent fields remain unresolved rather than automatically deleted.

## Use the Argus administration references

The supplied Oracle guide is Release 8.4.1, F84377-02, October 2023. The public detail panel suggests documentation areas to inspect; these are not automatic field mappings. In a private Argus mapping, select and add up to eight guide references. The capture retains the guide version, original-file checksum, configuration path and PDF/printed-page citation. References never populate a real system field or select a regulatory deadline automatically.

The guide covers reporting destinations, EDI/message profiles, ACK profiles, country/license rule scope, criteria, advanced conditions, super-rule behavior, distribution, awareness dates, observer study type and report confidentiality. A release mismatch warning appears when your entered version differs. Matching the guide release still does not verify patches or environment behavior. The reporting-rule confidentiality option must not be assumed to implement E2B XML masking. Use synthetic validation to verify the actual output.

The Oracle PDF is not redistributed. The app contains derived reference pointers and links to the official documentation. Detailed interchange field transformations and database-column mappings remain unverified until checked against the appropriate vendor documentation and installed environment.

## Create a configuration change package

After saving a mapping, choose **Draft configuration change**. Configuration Workbench opens the saved mapping with its pinned source version and hash. It copies the environment and current control, sets transmission as the configuration area and retains the mapping ID/revision in the source pin.

The quoted passage can be partial. Verify the complete original source, company applicability, dependencies, implementation and rollback. Source verification and applicability are not approved by the mapping handoff. Existing workbench review and Action Center processes then handle approval, implementation and verified closure.

Changing the source URL, title or edition clears the old provenance pin. Export a saved private mapping to retain the source record, revision history and synthetic test prompts. The export is a specification, not a vendor import file or an executed test protocol. Share only with authorized recipients.

## Operational limits

Reference captures are immutable database records with a bundled initial fallback. A complete newer controlled import can load without redeploying the app. An incomplete new import is surfaced rather than treated as a complete baseline. The ordinary PDF document collector monitors the registered core/regional PDF sources; the workbook is a reference-only source because its extraction uses a different importer. A changed source must be imported and reviewed as a new E2B capture before mappings can be compared with it. Hourly news refresh does not regenerate this technical library or publish a baseline.

The view loads up to 500 private mappings, 100 capture/release choices and the latest 100 mapping history entries for export. Loading failures or limits are shown explicitly. Retain company change-control and vendor validation evidence outside the tool where required.
