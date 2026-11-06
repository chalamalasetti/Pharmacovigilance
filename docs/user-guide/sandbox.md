# Synthetic Safety Sandbox

Use this training workspace to construct fictional clinical or marketed case scenarios and compare reporting-rule assumptions. It is not a production safety database or a complete implementation of ICH E2B(R3).

## Open and start

Open Resources → Synthetic Safety Sandbox from the Resources page, or follow the Configuration Workbench link. Start with **Cases**, **Scenario Library** or **Rule Lab**. Choose **New case** for a blank record, or start a fictional scenario from the library. Everything stays in page memory. Closing or reloading clears the working session; downloaded files remain on your device. No case records are transmitted or saved in browser storage.

Use fictional information only. The form intentionally has no patient/reporter names, date of birth, email, phone or address fields. Short text labels are not an anonymization service: do not paste real case information into them.

## Your case workspace

The Cases dashboard shows saved revisions as cards. Search by case ID, medicine, event or country; filter by lifecycle, structural review status or earlier revisions. Summary cards distinguish structural issues from the requirements needed to run XML checks. **Ready to test** means the demonstration rules can run; it does not mean clinical completeness or XML validation has passed.

Open a case to work through **Intake → Patient → Products → Events → Assessment → Narrative → Review → Export**. Previous/Continue buttons and the step navigation keep the same draft. Returning to Cases or Scenario Library keeps unsaved edits in this tab; choose **Resume draft** to continue. Opening a different case or scenario asks before discarding edits. Reloading or closing the tab still clears the entire session.

**Review** brings structural issues, XML profile requirements, changes since the saved revision and the last saved revision’s changes together. Repeated rows are compared by their stable IDs. Save a new revision with its type and reason before testing saved cases or downloading the saved-case package.

The Scenario Library includes a clinical reporting clock, multiple products/events, gestation zero, conflicting null flavor, follow-up without clock reset and missing initial receipt. Each creates a separate fictional case. Sample dates, assessments and clocks are editable training assumptions.

## Case form

1. **Case and receipt:** synthetic ID, country, clinical/marketed scope, source, reporter qualification, initial receipt, latest information, simulated submission and explicit case-level seriousness, unexpectedness and relatedness.
2. **Patient and study:** fictional age/unit, sex, weight, height, pregnancy, gestation, study reference, phase and study type. Zero and unknown are distinct.
3. **Products:** up to 20 independent products with stable row IDs, ingredient, role, strength, form, dose, route, indication, treatment dates, action, dechallenge and rechallenge. Each product also supports up to 20 dose regimens with amount/unit, frequency, route, dates, duration and fictional batch reference. These are training labels, not dictionary-coded medicines.
4. **Events:** up to 20 events with stable IDs, terms, onset/end, outcome, seriousness criteria and explicit term-availability choices. No MedDRA terminology is distributed.
5. **Assessment matrix:** causality, expectedness and a reference basis for every product–event pair. Opposite assessments for different pairs are preserved. Removing a product or event removes its associated pairs from the current draft only.
6. **Tests and history:** repeatable structured tests/results/units and medical history with dates and ongoing status, up to 20 rows each.
7. **Literature and linked reports:** up to 20 fictional citations with reference/DOI and language; linked case reference and amendment context.
8. **Parent–child and death:** fictional parent demographics/history, death date/cause and autopsy context. No identity fields.
9. **Narrative and exchange context:** fictional clinical narrative and reporter/sender comments, worldwide case reference, sender/receiver identifiers, reporter country and study sponsor/protocol. No gateway connection is created.
10. **Revisions:** save the initial case, then record a reason and choose follow-up, correction or restore. Each save creates a new revision and preserves the previous snapshot. Case ID is locked after first save. A known initial receipt is locked; a previously missing receipt can be completed in a reasoned new revision, preserving the earlier blank snapshot. Up to 100 earlier snapshots are supported. Restore creates a draft from an earlier snapshot; saving makes another revision. Latest-information time does not move backwards.
11. **Preview and export:** check structural issues, preview the case report and download the original PV Info training PDF. PDF reflects the current form, including unsaved changes, and is labeled draft. Save first to capture a complete revision record.

The form covers the sections listed here. It does not implement every ICH/regional ICSR element, full parent drug/history repeatability, linked attachments, sender/receiver XML envelopes or licensed terminology validation. Fictional narratives are limited to 4,000 characters each; citation and parent/autopsy text are limited to 1,000 characters each.

## Rule simulation

Save cases before running. The current and proposed rules use explicit **case-level** country, scope, seriousness, unexpectedness and relatedness; all selected conditions must match. The pair matrix is retained as evidence and is not automatically combined into a medical judgment. Unknown yields an indeterminate result unless a different condition definitively excludes the case.

Times are UTC. Deadline = selected receipt timestamp + configured days × 24 hours. Initial receipt is the default. Choosing latest-information time requires an explicit rationale and is only a simulation assumption; a follow-up does not automatically reset the clock. Business-day, regional clock and vendor auto-scheduling policies are not implemented. Missing receipt, contradictory event seriousness, invalid chronology, conflicting null flavors or an incomplete pair matrix block simulation and explain why.

Results distinguish not triggered, indeterminate, blocked and triggered; triggered results show pending/overdue or met/missed against the simulated submission time. They explain each condition and preserve inputs in a downloadable results package.

## Save, import and restore

Use **Import, download & session controls** to download saved cases, restore files or close the session. Draft edits are not included in saved-case packages. Closing clears cases, drafts, rules, results and the locally selected CIOMS template.

- **Saved case package (JSON):** preserves saved cases, repeatable sections and revision history. Restore accepts the versioned synthetic format, checks IDs/history and replaces the current case collection after confirmation. Maximum 200 cases and 2 MB per imported package. Download this before closing.
- **Legacy CSV:** fixed columns only, up to 200 cases / 200 KB. It creates simple single-product/single-event cases. CSV cannot carry repeatable sections or revision history. Use JSON to preserve richer cases.
- **Reproducible test package:** records engine version, rules, saved cases, simulation time, clock assumptions and outcomes. This results file is evidence of a training run; restore uses the separate saved-case package.

Local revisions are not a tamper-proof audit trail and have no authenticated reviewer attribution. Imported files are not evidence of regulatory approval.

## PDF and XML exports

- **PDF print:** original PV Info report, labeled synthetic/draft, including all supported sections and prior revisions.
- **CIOMS training form:** asks you to choose the supported CIOMS PDF from your device, then fills that form without redrawing its boxes, numbering or scanned artwork. Identity is synthetic and date of birth is blank. Zero ages are retained; non-year ages stay in the description/continuation instead of being mislabeled as years. Long content continues on additional pages, which also preserve the complete supported case record. Unknown and mixed product responses do not silently become yes/no check marks. The template stays in browser memory and is never uploaded or published with the app. Closing the sandbox clears it. This editable training PDF is not an agency submission.
- **E2B mapping-readiness JSON:** source-pinned candidate fields and gaps. This review does not execute XSD validation.
- **Validate and download E2B training XML:** runs explicit training-profile checks, serializes a single-case ICH batch, verifies the pinned schema bundle checksum, and executes all required ICH XSD dependencies locally in WebAssembly. XML download is blocked if any check fails or the validator is unavailable. No case data goes to a server. The successful download is a ZIP containing the XML, validation report, exact current form inputs/history, the dependency XSD files for offline revalidation and a read-me. XML and input checksums bind the report to the downloaded data.

For XML, enter fictional sender and receiver identifiers, a worldwide case reference, a clinical narrative, message creation UTC, and an eight-digit user-supplied MedDRA code plus its version for each event. The message creation time must not precede latest receipt. These code fields are checked for format only: the app does not contain or validate membership in a licensed MedDRA dictionary.

The export profile is **pvinfo-ich-r3-training/1**. It supports batch/message test headers; case identity and receipts; age/gestation/sex/weight/height; event terms/codes/dates/outcomes/seriousness; product names/ingredients/roles; regimen dates, route text and selected dose units; product–event causality references; and narratives/comments. Stable event/product UUIDs preserve associations across follow-ups. The XML uses test processing codes and a synthetic label. Prior versions stay in the companion case JSON, not in the ICSR itself.

All current sandbox fields also appear as explicitly labeled supplemental JSON text within H.1. This preserves additional context without pretending it is a structured E2B mapping. In particular, full parent/history/test/literature and expectedness mappings, complete study details, regional elements, and licensed terminology validation remain outside this profile. Negative or unknown seriousness criteria use ICH NI in the true-or-NI fields; the original tri-state values remain in the supplemental context. Unsupported dose units remain text. The report lists these assumptions.

**Validation scope:** passing ICH XSD and the listed PV Info training checks does not establish complete ICH business-rule conformance, FDA/EMA regional validity, clinical accuracy, dictionary validity or agency acceptance. Those checks are recorded as not executed. No live transmission or vendor connection is available.

PDF and XML exports use a snapshot of the current form, including unsaved changes, and identify it as current form/draft. Save first to capture the revision in the session. Saved case-package downloads continue to use saved revisions.
