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
| CIOMS-style training PDF | Available in original four-part PV Info layout | Not the official CIOMS form; no acceptance claim |
| E2B mapping-readiness JSON | Source-pinned review candidates and unsupported catalog elements | No XML or coded conversion; zero validated fields claimed |
| Official CIOMS form | Not implemented | Establish supported layout/reuse basis and field-level output tests |
| E2B(R3) XML | Disabled | Complete mapping, ICH XSD and regional business-rule checks, terminology versions, explicit null flavors and example-based validation required |
| Audit trail / submission | Not implemented | Local files can be edited; no authenticated attribution, gateway or regulated audit claim |

The training model intentionally omits identity/contact fields. Short labels do not detect all personal data. Only fictional scenarios are permitted.

## Source references for the next output increment

- FDA ICH E2B(R3) implementation guide, schema set, reference and example instances: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2br3-electronic-transmission-individual-case-safety-reports-implementation-guide-data-elements-and
- FDA regional guide: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/fda-regional-implementation-guide-e2br3-electronic-transmission-individual-case-safety-reports-drug
- ICH specification and related files: https://admin.ich.org/node/348
- CIOMS terms: https://cioms.ch/terms-and-conditions/

Reference instances locate fields with data-element-number placeholders; they must not be copied as real coded output. Schema validity alone does not establish regional business-rule validity or agency acceptance. No schema artifacts are bundled in this increment.

## Next output increment, after review

1. Establish an explicit initial regional/profile scope and field-by-field coverage manifest, including unsupported mandatory fields.
2. Extend the current training fields to cover the selected profile, including remaining required elements, terminology and repeatable parent context.
3. Implement a profile-specific serializer against pinned official schema versions and terms. Keep unsupported profiles unavailable.
4. Validate representative synthetic XML against the full schema set and separately test code systems, null flavors, business rules, dates, envelopes, escaping and repeatables.
5. Add download only when all profile gates pass; retain a machine-readable validation report and training label. No live transmission in this scope.

Human review of this staged release precedes merge. No full ICSR, CIOMS compatibility, vendor compatibility, Part 11 compliance or submission-ready claim is made.
