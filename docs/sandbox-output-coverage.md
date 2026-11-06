# Synthetic case forms — review checkpoint

This release is a local training case model, not a full ICSR or regulated safety database. Homepage layout, authentication, production case storage and refresh schedules are unaffected.

## Capability and evidence matrix

| Capability | Implementation | Validation evidence / remaining gate |
| --- | --- | --- |
| Clinical/marketed case sections | Case source, qualification, anonymous synthetic demographics, study context, receipts | Model validation and browser smoke |
| Products/events | Up to 20 of each; independent stable IDs; up to 20 regimens per product | Repeatability, duplicate and dangling-reference tests |
| Additional clinical sections | Fictional narrative/comments, parent/death context, literature, sender/receiver references | Roundtrip and chronology tests; excludes identity/contact fields |
| Pair assessments | Up to 400 product–event pairs | Conflicting pair decisions preserved; not inferred into case-level medical judgments |
| Tests/history | Up to 20 each, explicit unknown and zero | Null-flavor conflict tests; no dictionary validation |
| Follow-up/correction/restore | New saved revision with preceding snapshot and reason | Initial receipt and ID locked, restore saves another version, latest receipt cannot move backwards |
| Local case packages | Versioned JSON import/export | Roundtrip, duplicate ID and missing/altered history structural tests |
| Rule simulation | Explicit case-level conditions; UTC elapsed days | Existing deadline tests plus clock-basis and blocking checks |
| Original PDF | PV Info layout, every page labeled synthetic, supported sections and saved history | PDF generated and visually inspected; browser download signature check |
| CIOMS training PDF | Supplied CIOMS form filled directly, editable fields and continuation pages | Canonical field/checkbox tests and rendered visual review; synthetic only |
| E2B mapping-readiness JSON | Source-pinned review candidates and unsupported catalog elements | No XML or coded conversion; zero validated fields claimed |
| ICH E2B(R3) training XML | Available only after local training checks and official ICH 2.5 XSD validation pass | Positive initial/multi-product/event/follow-up cases; negative structure/namespace checks; hash pin and failure gating; browser-local WebAssembly |
| Regional/dictionary/agency validation | Not implemented | No complete ICH business-rule, FDA/EMA acceptance or licensed dictionary claim |
| Audit trail / submission | Not implemented | Local files can be edited; no authenticated attribution, gateway or regulated audit claim |

The training model intentionally omits identity/contact fields. Short labels do not detect all personal data. Only fictional scenarios are permitted.

## Source references for the next output increment

- FDA ICH E2B(R3) implementation guide, schema set, reference and example instances: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2br3-electronic-transmission-individual-case-safety-reports-implementation-guide-data-elements-and
- FDA regional guide: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/fda-regional-implementation-guide-e2br3-electronic-transmission-individual-case-safety-reports-drug
- ICH specification and related files: https://admin.ich.org/node/348
- CIOMS terms: https://cioms.ch/terms-and-conditions/

Reference instances locate fields with data-element-number placeholders; they must not be copied as real coded output. Schema validity alone does not establish regional business-rule validity or agency acceptance. The compressed bundle contains all 167 XSD files from the checksum-pinned official ICH 2.5 archive, retaining their original notices. The browser checks its checksum before use. The CIOMS template is selected locally by the user and is never uploaded or included in the repository; its reference/hash metadata identifies the supported layout.

## Implemented XML scope and remaining work

The profile `pvinfo-ich-r3-training/1` serializes a single-case ICH batch and validates its actual XML against `multicacheschemas/MCCI_IN200100UV01.xsd` with all dependency XSDs in the local bundle. Validation reports pin the archive/bundle/XML hashes, profile and validator versions, errors, mapped sections, and unexecuted checks. Downloads contain XML, report and exact case inputs in one ZIP. Invalid/missing data, bad schema hashes and validator failures block XML download.

This is XSD validation plus explicit PV Info training checks, not a complete ICH or regional business-rule implementation. User-supplied MedDRA codes/versions receive syntax checks only. Additional current form fields remain in clearly identified supplemental narrative; prior revisions remain in companion JSON. The guide lists the exact structured coverage and assumptions.

Next work is a selected regional profile with its full field mappings, pinned code lists, licensed terminology checks and documented business-rule test suite. Agency test-gateway acceptance would be a separate exercise. No live transmission is implemented.
