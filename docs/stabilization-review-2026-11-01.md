# Publishing and regulatory-review validation — 1 November 2026

## Production and publishing

The live homepage, nav.js, admin-visibility.js and status.js matched main before this change. The original sidebar filters and welcome layout were visible. A signed-out visit to status.html showed the admin access message, with diagnostics hidden. The public static status JSON remains available to the existing health monitor: admin-only is a presentation/fetch rule, not a confidentiality boundary for that file.

Repository history showed both hourly workflow_dispatch invocations and scheduled FDA runs. The existing main-only production settings already disable codex/*, claude/* and both cache branches. This change also extends the ignore-build fallback to work branches. The FDA workflow keeps its hourly cron, its external dispatcher and the existing deployment hook, but skips duplicate collection/publication/hook attempts when the same main revision actually refreshed successfully within 50 minutes. A green skipped run does not count as a refresh. Failed refreshes, changed main revisions and the manual Force input remain eligible. Schedules remain best effort; this is not a guarantee of exactly 60-minute delivery.

Google Search Console, SEO generation, production domain, homepage layout, the hook secret and company data access rules are preserved. The separate manual rebuild workflow is still an explicit override. Project/team-wide Vercel deployment inventory is not available through the connected tools; this review uses source configuration, GitHub run history, deployment commit status and live production assets.

## Four-document extraction audit

The original bytes in the public archive were retrieved and their SHA-256 hashes matched the registered versions. Review covered selected high-value clauses, lists, exceptions, dates and citation behavior; it was not exhaustive legal validation of every clause. Counts below come from re-running both methods on those exact bytes. More candidates do not establish greater legal accuracy or a complete baseline.

| Document | v2 candidates | v3 candidates | Sample finding and correction |
| --- | ---: | ---: | --- |
| FDA E2D(R1), March 2026 | 95 | 104 | PDF page 9 minimum-case-criteria list lost some governed bullets. The page 10 expedited-report definition uses a deadline phrase without must/shall/should. Governed bullets and deadline wording are now candidates. Regional exceptions still require review. |
| EMA GVP Module I | 107 | 150 | PDF page 5 quality-cycle bullets relied on the introductory obligation. The list scope now accompanies child candidates. Training-plan/record clauses were already present. Guidance recommendations and referenced legal obligations must remain distinct during editorial review. |
| UK pharmacovigilance procedures | 62 | 83 | Submission and emerging-safety wording used require/obliged. Some notification/PSUR exception paragraphs were discarded because they contained a public agency mailbox. The wording is now captured; the mailbox is replaced with an explicit omission marker directing readers to the original. HTML citations now include the preceding heading and a unique paragraph reference instead of repeatedly saying contents. |
| Canada GUI-0102 pharmacovigilance system | 37 | 119 | Employee training, records and validation/migration lists depended on parent instructions. List clauses, including short items, now retain their governing context. Lists still require contextual human interpretation. |

All four v3 results are explicitly partial where text was shortened, contacts were omitted or context could exceed the bounded field. No source is automatically approved. Original contact routes remain in the archived original. Parser upgrades append a new extraction version against unchanged bytes, preserve previous versions and suppress omission/withdrawal suggestions across parser changes.

### Evidence and dates

- FDA original SHA-256: `d781934572ce0ab9ce06fb9f27a623f61132530a13a1bea0e6a2cc9914e90321`. [Official guidance](https://www.fda.gov/media/176977/download). The cover establishes March 2026; the source register records 3 March publication. No effective date is inferred.
- EMA original SHA-256: `197de2bc0cfb6bdafe8d322934ece6e9bd4c5901651a5a828e74076470d7ff59`. [Official Module I](https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-good-pharmacovigilance-practices-module-i-pharmacovigilance-systems-and-their-quality-systems_en.pdf). The cover identifies final adoption on 22 June 2012 and effect from 2 July 2012. The register's 25 June publication date is a separate claim, not verified by that cover; it must not be conflated with adoption.
- UK original SHA-256: `815e0e0337b54e14be704f5a56343d13da4e870bee161862439f37df1257b136`. [Official procedures](https://www.gov.uk/government/publications/guidance-on-pharmacovigilance-procedures/guidance-on-pharmacovigilance-procedures). The page identifies the 30 September 2026 update; original publication, update and jurisdiction-specific applicability dates are separate. No blanket new effective date is assigned.
- Canada original SHA-256: `3ab1b1226739079f1927ed3b9fd3dac57fa10e77492f917e88642a76e91a8320`. [Official system chapter](https://www.canada.ca/en/health-canada/services/drugs-health-products/compliance-enforcement/good-manufacturing-practices/guidance-documents/pharmacovigilance-guidelines-0102/pharmacovigilance-system.html). The [overview](https://www.canada.ca/en/health-canada/services/drugs-health-products/compliance-enforcement/good-manufacturing-practices/guidance-documents/pharmacovigilance-guidelines-0102.html) explicitly gives issue and implementation as 22 May 2026. Chapter scope and referenced regulations still require review.

## Complete company-review journey

Automated browser fixtures exercise one pinned chain: archived source version -> extracted clause -> pending baseline interpretation -> separate editorial approval -> confirmed synthetic company/market -> private applicability decision -> business, system, process and data drafts -> action owner/due date -> completion evidence -> approval of all four drafts -> explicit personal self-review -> closed case. Closing with drafts still pending must fail. Personal self-review is deliberately labelled and is not represented as independent approval.

The transactional database test additionally exercises team isolation, source lineage, optimistic concurrency, a different designated reviewer and successful team closure after all four impact types are approved. All synthetic database fixtures roll back. No actual company profile, production baseline interpretation, user session or live case is created/approved for this validation.

## Next coverage gate

Do not equate the jurisdiction directory with verified document coverage. Expand by one reviewed agency/source family at a time after this chain passes. Require verified official hosts, representative source capture, explicit document and date provenance, sampled clause/list/exception checks, pending editorial review and a company-specific test. Prioritize recovering failed existing sources before adding more agencies. Scans, complex tables, semantic equivalence and other languages remain manual-review gaps. No paid model is introduced.
