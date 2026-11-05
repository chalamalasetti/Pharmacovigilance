# Guidance impact: a worked automation example

## Open the example

Open Resources → Source Documents, search for **Module VI Addendum II**, select the source and choose **Explore document-level impact**. An Impact card whose original link is this exact official PDF also links to the analysis. The worked example is available at `guidance-impact.html?id=ema-178902-2025`.

This is a public draft demonstration, not an editorially approved premium analysis, an approved legal baseline or an executed company validation. It remains excluded from search indexing while unreviewed. Source facts, deterministic field policies, company implementation inferences and unknowns are displayed separately. No company information is published with the analysis.

## What this EMA document establishes

The source is EMA/178902/2025, dated 22 July 2025. EMA's GVP index lists first publication on 24 July 2025. The PDF states an effect date of 25 July 2025, accompanied by an instruction for senders to implement as soon as possible within a reasonable timeframe documented in internal procedures. These are different dates and concepts; the app does not invent a fixed grace deadline.

The four source tables contain 282 field references: 13 to use MSK when data are available, 11 to leave blank, 185 potentially personal/PV fields whose available data are to be preserved under the applicable implementation guidance, and 73 available technical/PV fields to preserve. This count is not 282 independent legal obligations. Missing-data alternatives for the first group must follow the applicable implementation guidance. The second group does not support nullFlavors under the cited guidance.

Exceptions matter. Reporter city/state and sender e-mail are in the preservation group, while other address/contact fields are in masking/blank groups. Preserving a field does not authorize unrestricted identifiers or personal content: the relevant ICH/EU implementation guidance and pseudonymisation constraints still need review. This app contains only field definitions and organizational specifications, never patient/case values.

The addendum states that EudraVigilance business rules are unchanged and the EU ICSR implementation guide remains applicable. It does not establish a new reporting clock. Its primary design impact is destination-scoped outbound data handling, together with associated procedures, validation and training. There is no verified earlier company baseline in the example, so an actual before/after compliance gap cannot be declared.

## What runs automatically today

Approved source monitoring and discovery intake already run through the document collector. A newly discovered source may still require an editor to register/approve it before capture. The monitored EMA PDF is registered explicitly for this pilot. The collector captures an immutable original by checksum, extracts normative paragraphs and, for the supported edition, derives the four table policies. The existing ingestion trigger prepares draft baseline records; it does not publish them.

The table recipe checks the exact verified source checksum, document identity, effect date, four expected table counts and unique field references. Unexpected editions, missing rows or duplicates require manual review rather than a successful field-policy result. Parser upgrades retain original archives and existing versions; they do not establish that the regulator changed its policy. Although all four table counts pass, generic paragraph context is bounded and can be truncated; the actual capture is marked partial rather than certified complete. Generic PDF extraction remains available for other documents, with its existing limitations. The system does not autonomously perform a complete legal analysis of arbitrary guidance.

The public pilot package is generated reproducibly from the public PDF, matched against the official source bytes and pinned by source/analysis hashes. It supplies field references, ten draft implementation proposals and twelve unexecuted test scenarios. It is a controlled release asset; document monitoring does not silently overwrite its analysis or mark it reviewed. A changed source requires a new reviewed package/version.

The document collector is hourly with bounded oldest-first batches, and discovery indexes have their own configured intervals. Actual platform delays and source availability affect detection. The separate public news/research pipeline defaults to twice daily. No same-minute detection or retrospective July 2025 detection by PV Info is claimed.

## What an ordinary company user does

1. Open the Impact card and read scope, dates, exceptions and evidence.
2. Select the actual safety system and choose **Prepare my private configuration design**. Sign in with an approved account to save work.
3. Confirm company, installed release/patches, environment, EudraVigilance sender/destination scope and current configuration. The system cannot know these facts from a public PDF.
4. In Evidence, confirm the complete source and applicable implementation guides. Review the proposed transmission policy, current-control gap, dependencies, implementation plan and rollback. Missing current controls remain unknown.
5. Save a private/team draft revision in Configuration Workbench. Its source retains the immutable public analysis ID/version/hash and original-source hash. Organizational records remain private to the selected account/team scope.
6. Use the existing team review workflow for independent approval where configured. Execute the synthetic validation plan against the actual installed system and retain exact expected/output evidence in the company's controlled environment.
7. Send the saved configuration package to Action Center, assign implementation work, collect evidence and obtain verified closure. Tests listed in the public package are prompts, not execution results.

Users do not need to write JSON, extract tables or retype all source fields. They still make company applicability, design approval and implementation/closure decisions. The pilot starts a new draft and asks for the company environment; automatic reuse of a confirmed company configuration profile is a future enhancement.

Changing the source title, URL or edition clears the guidance provenance pin. Selecting another requirement replaces the evidence. Private exports retain the guidance pin; the versioned public JSON contains the full corresponding table/analysis package. Vendor JSON/CSV exports remain review specifications, not verified Argus-import files.

## How the requested rule-design workspace fits

| Capability | Current use and required boundary |
| --- | --- |
| Regulatory-to-rule mapper | Configuration Workbench supports country, licence, destination, clock and conditions for reporting-rule changes; this example uses the separate transmission area. A paper is not a regulatory mandate. |
| Versioned template library | The pilot is a source-linked, parameterized transmission-design template. A broad approved expedited-rule template library is still future work; examples such as “EMA 15-day fatal” cannot be assumed universal. |
| Gap analysis | Current vs proposed controls can be compared after the company supplies its baseline. Missing baseline data are unknown, not a confirmed gap. Automated portfolio-wide comparison needs structured, verified company baselines. |
| Change preview | Source versions and configuration diffs exist. This historical first capture cannot prove a changed obligation without a verified predecessor. |
| Collaboration and review | Use existing private/team workbench revisions and review. Public editorial approval is a distinct future publishing workflow, not a company sign-off. |
| Validation checklist | Workbench readiness checks and synthetic scenarios support preparation. Execution results and independent verification must come from the actual company environment. |
| Argus export | Current JSON/CSV are review specifications. An import adapter requires exact vendor version/schema, approved mapping, supported APIs and testing; the tool does not push to Argus Console. |
| Regulatory calendar | Effect, publication and implementation-planning dates must remain distinct. This example has historical dates and no invented future deadline. An EURD or other agency event needs its own verified source/version. |

## Roadmap to autonomous intelligence

The next major service should create an analysis job when an approved source version is captured. The job should record source/version hashes, extraction coverage, exact citations, requirement classifications, exceptions, predecessor comparisons, unverified inference, test proposals and explicit unknowns. Deduplicate by source version plus analysis-engine version; retry transient failures and surface incomplete/OCR documents to editors.

Future model-assisted analysis should use a strict output schema and citation checks, treat regulator text as untrusted input rather than executable instructions, and keep model output unverified. Current deployment has no model API connection. A ChatGPT conversation can help prepare an example, but it is not a connected unattended reasoning service inside the app. Continue deterministic recipes now; introduce a budgeted model service only after authorization, quality evaluation and cost controls.

Publication should have two tracks: automatically publish a source-linked detection notice with its verification state; submit substantive public analysis for an accountable regulatory/editorial approval before marking it reviewed/premium. Company applicability and implementation remain a separate private process. A public analysis must never contain a customer's product strategy, current configuration, users, case information or assessment records.

Measure discovery-to-capture time, extraction coverage, citation correctness, unsupported-date frequency, reviewer corrections, source-change backlog, company applicability decisions and verified closures. These measures are more useful than simply maximizing the number of generated summaries. A complete source archive and source-linked uncertainty are essential; no recipe or AI system should claim that every clause was understood without evidence.

For an immediate controlled capture, run the GitHub **Collect regulatory source documents** workflow with optional `document_id` set to an active registered source ID. This prioritizes that source within the same 24-source batch; it does not bypass approved-host, source-state, identity or review checks. Collector-code pushes prioritize the EMA pilot once for release verification. Normal scheduled runs remain oldest-check-first. A trusted parser-capability handshake waits for the matching application release before delivering documents.
