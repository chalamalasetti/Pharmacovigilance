# US Approval & Label Journey

## Find an FDA application

Open **Label Intelligence → US Approval & Label Journey**, or follow the journey link from [Label Intelligence](label-intelligence.md), Product Evidence Answers or a US application answer in Ask PV Info. This public lookup does not require a company portfolio.

Search by brand, active ingredient or FDA application. Suggestions appear as you type at least three characters; the Search button also works with two. Choose the matching FDA application explicitly. Spaced and lowercase identifiers such as `NDA 020702` are normalized. Generic products and multiple applications remain separate choices; a matching name is not proof of presentation equivalence.

The summary reads live openFDA Drugs@FDA records. It distinguishes the earliest captured approved original submission from the source sponsor and the products currently listed under the application. A later presentation's own first approval, historical original applicant, first worldwide approval and ingredient-first approval are not established by that application date.

## Read the approval and document evidence

Select a presentation to inspect its ingredient strengths, dosage form, administration route and source status. The regulatory application type (NDA, ANDA or BLA) is separate from administration route. Sponsor means the name reported in the current source snapshot, not a verified original applicant or current commercial owner.

Original-decision evidence shows only documents listed by FDA. A Review remains a Review; the app does not invent an approval-letter link when none is returned. Document dates can be later than the approval decision. The underlying FDA JSON, application page, record hash, source update and retrieval time remain available.

## Follow decisions and versions together

The timeline includes original submissions, supplements and other submission statuses. Approved submissions use the source approval-decision date; non-approved statuses are not called approvals. Each record exposes the supplied classification, review priority and available label, letter and review links.

**Label-linked decisions + SPL** selects submissions with a listed label document or source labeling classification, plus submitted SPL versions. This does not establish that each supplement concerns a specific safety term or that each SPL version corresponds to a listed supplement.

Choose a DailyMed label family using the labeler and Set ID. FDA application links can span multiple labels, formulations and presentations. No dates are automatically joined to declare a supplement and an SPL version equivalent.

Load additional history pages with **More history entries**. Retrieve individual versions from the timeline. Every retrieved version must report the selected Set ID and FDA application. A version with missing or different application metadata is blocked in this combined journey; inspect it separately in the standalone Label History tool. Retrieval is bounded to 50 versions and 6 MB of text per session.

## Filter and compare wording

Use date range, source-record type, SPL date basis, section and phrase filters. DailyMed publication date is available from its history index. An SPL effective date is shown only after retrieving its XML. Filtering by effective date excludes versions whose effective date has not been retrieved. Invalid date ranges show a correction prompt.

Section and phrase filters search retrieved narrative text only and exclude FDA decisions and unretrieved versions. Missing results do not establish absence of a warning or adverse reaction. This is a literal text search, not a licensed MedDRA or SMQ expansion.

Retrieve two versions of the same family, select an earlier and later version, and choose **Compare wording**. Red marks removed words/punctuation; green marks additions. The comparison preserves the extracted source text, including whitespace. Large changed ranges use an explicitly labeled bounded fallback. Images, original document layout and scientific interpretation are not compared. The comparison follows its chosen version pair and section filter; timeline date and phrase filters do not change that pair.

A text difference does not explain a regulatory reason. The app displays the source submission classification, but a reason for a particular wording change requires review of the original letter, assessment and label. First observed mention remains distinct from confirmed first approved addition.

## Export and coverage

Download the journey evidence as JSON. It includes application and product metadata, submission decisions and official document links, the selected presentation and family, loaded history index, retrieved version text and hashes, failed retrievals, comparison and active filters. Keep the export with its source dates and limitations.

The newest retrieved SPL is not labeled as the verified current approved label. Historical coverage, particularly before 2009 and between listed versions, can be incomplete. Official document links are supplied as listed by FDA; the app does not attest to their reachability, contents or regulatory applicability. Original-applicant identities and term-specific approved first additions are not inferred. Qualified human review is mandatory.
