# Drug Name Resolver

## Open the resolver

Open **Explore → Substances → Resolve a medicine name**. The ingredient detail page also links to it. Public lookup works without sign-in and while approval is pending. Enter one reported medicine name; optionally include strength and form in the same field. The name is sent directly to NLM. Do not paste a patient narrative or contact details. Searches are not placed in shareable URLs or stored in browser local storage.

## Compare candidates

The tool tries exact lookup, normalized lookup and then approximate suggestions if earlier steps find nothing. Normalized search may ignore salts, punctuation or word order; it is not proof of precise medicine identity. Approximate ranks order lexical suggestions and are not confidence percentages. Returned atom names are not reproduced; candidate names come from active RxNorm concepts.

Up to six initial concepts and six related branded products for one brand family are shown. The app flags limited results. Add strength/form to narrow a broad brand query. An ingredient, brand family or pack does not identify a particular strength/form product. A no-candidate result is different from an NLM availability error.

## Review source evidence

Select Review this candidate to see the RxCUI, concept type, related ingredients, structured strength and form when supplied, source releases and original API links. Source-response capture dates distinguish cached responses from when the evidence panel was assembled. Responses are cached in page memory for up to 12 hours; a page reload clears this cache. Lookup and detail review check the RxNorm release for a version change. Product details also capture and check RxTerms release metadata.

Ingredients can link to a Substance Explorer search, which does not assert an automatic identity mapping. RxNorm is US-focused and does not establish a product's authorization in another market, manufacturer, interchangeability or clinical equivalence. It complements, and does not replace, WHODrug.

## Record a private decision

An approved account can save a decision to its private history. Choose unresolved, reject the selected candidate, confirm ingredient only, or confirm ingredient/strength/form where supported. Provide a medicine-identification rationale. Confirmation requires explicit source review; product confirmation is blocked when required details are missing or incomplete. Brand families, packs and partial concepts cannot be confirmed as a product.

Saved records include the original input, candidates, chosen source snapshot, source releases, rationale, status, server timestamp and account attribution. These are reviewer-recorded identifications using browser-observed source responses, not independent approval or validated safety-case coding. Saving does not change a portfolio, shared alias registry, Inbox marker or Action Center case.

## History and corrections

My saved decisions shows your latest 30 records. Expand Inspect saved source snapshot to review the preserved evidence. Records cannot be overwritten or deleted through the app. To correct a decision, resolve and review again and record another decision with a correction rationale. Same-account session refresh preserves a draft; sign-out/account changes clear private forms and history. Public medicine evidence stays available.

## Troubleshooting

If the source cannot be reached or is rate limited, wait before retrying. No identity is confirmed by a failed lookup. If source releases change, repeat the lookup. If details are incomplete, retry the candidate or save unresolved. A failed private save retains the visible rationale; retry and check My saved decisions before assuming success. Pending users can inspect candidates but cannot save private decisions. No paid model API or UMLS API key is used in this release.
