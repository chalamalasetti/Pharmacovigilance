# Label Change Intelligence

Open **Explore → Label Intelligence**. Public browsing works without sign-in and while account approval is pending.

## Find evidence

Search by drug name, ingredient, application number or safety topic. Filter by agency, label section or evidence type. Clear filters to return to the captured catalog. Select an entry on the left; use Show next 40 entries to browse further.

FDA approved safety-label changes and EMA recommendation indexes are different evidence types. A PRAC index entry does not establish that a company has implemented new wording. Neither a match nor a label change establishes a causal clinical conclusion.

## 1. Review evidence

FDA entries reproduce extracted change excerpts. Highlighting represents underlining in the FDA source, which may mark additions or revisions, including headings. The app does not infer deleted wording or manufacture a previous version by removing highlighted text.

Open the official change evidence. When FDA supplies links, inspect the approved label for that change and the earlier linked label. An earlier link can skip intervening label revisions; it is not a guaranteed consecutive version comparison.

EMA entries currently identify recommendations marked for a product-information update in the cumulative PRAC list. Open the official monthly recommendation and product-information wording before deciding implementation. Index-only or incomplete capture warnings remain visible.

## 2. Source and history

Review the source locator, supplement or meeting, source date where supplied, and evidence fingerprint. A meeting description is not converted into an invented publication or implementation date. Other captured entries for the same application or ingredient provide context; they are not a complete revision history.

The initial catalog includes bounded recent FDA discovery and EMA recommendation index entries from 2025 onward. FDA SrLC does not cover ANDA generics, OTC products or every biologic. An ingredient match to a generic medicine is a reason to investigate, not a claim that the FDA entry directly applies to that generic authorization. Current labeling and the latest FDA-approved labeling can differ.

## 3. Open a private company assessment

1. Sign in with an approved account and confirm products and markets in Company Briefing.
2. Choose the confirmed company and your private account or an authorized team.
3. Review matched products. Application-and-market matches are distinguished from ingredient matches. The reviewed acetaminophen/paracetamol naming pilot is supported; salts are not stripped. Class or ambiguous multi-ingredient EMA statements are not automatically matched.
4. If appropriate, explicitly enable cross-market monitoring. This does not infer a local product authorization.
5. Select proposed review areas, such as labeling, case processing, systems, interfaces or training. These are prompts for assessment, not approved required changes.
6. Explain why the evidence needs assessment and confirm that you reviewed the official source and its limitations.
7. Open the private assessment, then continue in Action Center.

The handoff pins an immutable source fingerprint. Repeat sends to the same company and privacy scope return the same case. Source corrections create different evidence versions; existing cases retain their original evidence and decisions.

In Action Center, decide applicability and record the reason; draft relevant business/system/process/data/training requirements; assign actions; record implementation evidence; obtain reviewer verification. The source review confirmation on the label page is not assessment approval or verified closure.

## Inbox, exports and access

Matched label entries appear in My Company Change Inbox under **Label changes**. Open Review label evidence before assessment. Existing cases can be continued from the inbox.

Action Center includes a link to the pinned source version. Its label-case export includes the captured evidence, fingerprint, company decisions and the case's recorded action/verification history. Exports contain private company work; share them only with authorized recipients.

Public source evidence is separate from private company decisions. Signing out clears the visible company assessment panel. Pending accounts can continue browsing evidence but cannot open private cases. If durable evidence publication is still pending, retry after the next refresh rather than creating an unpinned case.

## Administration and collection

Collection follows the existing data-only scheduled worker. FDA discovery covers a rolling 100-day window; up to 24 due product pages are captured per run, with later runs continuing pending details and rechecking previously captured pages after seven days. EMA index checks run daily. The catalog is bounded to 500 captured entries, so it is not an exhaustive historical register. Published evidence versions used for assessments remain in the durable evidence table independently of the current catalog.

Source failures retain prior captured entries. Collection diagnostics are visible only to administrators. Source excerpts remain unverified until a person checks the official source; automated ingestion does not publish legal interpretations or approve company decisions.

## Related discovery and session behavior

Use [Safety Topic Explorer](safety-topics.md) to discover label evidence alongside updates and research, or [Substance Explorer](substances.md) to investigate source-listed products and company roles. These public views do not change your private portfolio.

A normal same-account session refresh should retain your assessment draft and source-review selection. An actual sign-out or account change clears the private panel. If an older cached page incorrectly asks you to sign in again, refresh once before requesting another email link.

## Product Evidence Answers

Open **Explore → Product Evidence Answers**. Ask a question such as “Symbicort — when was it approved and when was anaphylaxis added to the label?” or follow the suggestion from Ask PV Info. Choose the exact product, market and application; use the optional exact brand/ingredient field to narrow ambiguous questions. The page uses the existing public registry, company associations, label captures and updates, with no new live regulatory search or AI medical interpretation.

The approval finding shows a registry application-level date with its source and locator. It does not prove earliest worldwide, indication-specific, presentation-specific or original brand approval. Label findings require the same application and market. A captured approved-change entry mentioning the safety term is distinct from an EMA recommendation and does not establish the first label-addition date. First addition stays unresolved because the current catalog does not provide a complete approval-label history. An absent match does not prove the term is absent from the label.

Check source dates and missing-dataset warnings, open original citations and download the answer evidence JSON. It includes the selected scope, matching records, hashes where available, retrieval coverage and limitations. Questions and answers are not saved to an account. Use public product questions only and obtain qualified human review.

### Ask in the existing chat

The bottom-right **Ask PV Info** chat is the main entry point for product approval and label-history questions. Ask naturally, then choose a product/application button within the conversation. Type US or EU to narrow market candidates, or ask “What about the EU?” after a selected product. Answers stay in chat, show citations and snapshot dates, and distinguish missing first-addition evidence. “Show sources” rechecks the current product context. Unknown follow-up scope prompts clarification instead of silently changing markets. Ordinary PV update queries retain their existing search. The detailed workspace is optional for a wider evidence view and JSON download. No model conversation or account-persisted chat history is added.

### Business question hub

Ask PV Info recognises fifteen business question families: product identity, company roles, company portfolio, approval, market status, indications, label contents/history, comparisons, safety, timelines, clinical studies, reporting templates, local work and source confidence. Product questions retain an explicit market/application selection and bounded conversational context. Expand the chat for longer evidence cards, clear the conversation to reset scope, and download structured business answers within the same window.

Company roles are kept distinct: registry holder and catalog association do not establish manufacturer, distributor, commercial-rights owner or a transfer date. Portfolios show captured application records rather than a claimed complete current inventory. Clinical answers search loaded company study snapshots by reported medicine names and ingredients; matches do not establish ownership, approval or causality. Label comparisons show captured excerpts with version-alignment gaps rather than pretending to compare complete current labels.

Reporting questions ask for a jurisdiction and show available source-linked planning starters; research-only countries retain unknown deadlines. My work questions summarise only this browser’s briefing records, not authoritative team assignments, overdue Action Center actions or verification decisions. Unsupported categories and missing evidence remain unresolved. Recognising a question family does not mean the corpus can establish every requested fact.

## Label Safety Analysis Workspace

Open **Explore → Label Safety Analysis**, or use the analysis link in Label Intelligence. Select a captured market and evidence-date window, starting at 2000 if needed. This does not backfill missing history. Registry dates are application-level captured source dates, not necessarily original approvals for each presentation.

Use all captured applications or import CSV/JSON with product, company, market and application columns. Confirm each exact application match or explicitly exclude its import row. Unresolved rows block analysis. Company names, IDs and holders match exactly; aliases are not inferred. Selected rows are combined, then the market filter applies.

Enter phrases, one per line, optionally followed by `| literal`, `| variant` or `| related`. These are phrase matches, not medical equivalence judgments. Optional locally supplied terminology JSON accepts term/type/code/version after rights acknowledgment. PT, LLT and SMQ metadata is not dictionary validated and no official SMQ algorithm runs. No licensed dictionary is bundled.

Run the analysis to see cohort coverage, matching passages, source links, captured registry dates, evidence dates, yearly passage counts and application timelines. Dates refer to captured change entries, not established first-addition dates. Ingredient-only recommendations are not automatically assigned to applications. Missing captures or matches cannot establish absence from a label.

Record include/exclude/needs-review decisions with reasons. Decisions bind to source hashes, are local review notes and do not establish an audit trail or approved conclusions. Save the JSON analysis package before leaving; working data remains in tab memory. Evidence CSV includes review decisions and reasons. Restore loads settings and notes but requires a fresh analysis against current captures; changed source hashes do not inherit prior decisions. Exports are training/review artifacts.
