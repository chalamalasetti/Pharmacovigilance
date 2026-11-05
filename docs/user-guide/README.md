# PV Info User Guide

Version 1.4 · reviewed 4 November 2026 · application reference e2b-mapping-studio-v1.

[Open the searchable in-app User Guide](https://www.pvinfo.org/user-guide.html). These are versioned wiki-style pages within the main GitHub repository, not a separate GitHub Wiki repository. The app renders a help center; it does not attach Markdown files to user workflows.

## Start here

- [Start here](getting-started.md) — Understand what PV Info does, choose your starting point and complete a useful first session.
- [Accounts, approval and recovery](accounts-and-access.md) — Create a user-ID account, understand approval, maintain access and recover a password without relying on email.

## Read and explore

- [Updates, search and global discovery](updates-and-discovery.md) — Find updates, understand impact cards and explore the same evidence through country views, the archive and Ask PV Info.
- [My PV Briefing, workspace and teams](personal-briefing.md) — Tailor your reading view, maintain saved work, and distinguish local, personal and shared records.
- [Research, papers and innovation](research.md) — Find papers, follow ideas over time and assess research without treating exploratory findings as established practice.
- [Events, time zones and calendar downloads](events-and-calendar.md) — Find source-verified training and events, interpret date-only listings and download calendar files safely.
- [Safety resources and reference tools](resources.md) — Use the public safety-database directory and distinguish a useful reference link from an ingested data source.

- [Drug Name Resolver](drug-name-resolver.md) — Resolve one reported medicine name, review source candidates and save a private identification decision.
- [Substance Explorer](substances.md) — Search ingredients, distinguish source company roles and inspect product evidence and naming limits.
- [Label Change Intelligence](label-intelligence.md) — Review FDA excerpts and EMA recommendation indexes before opening a pinned private assessment.
- [Safety Topic Explorer](safety-topics.md) — Follow topic evidence across updates, label changes and research, inspect phrase matches and continue source review.

## Company work

- [Leadership Cockpit and Company Safety Watch](leadership.md) — Prioritize existing company work, follow safety topics and prepare a private weekly brief.

- [Company Explorer and Portfolio 360](company-portfolios.md) — Explore marketed products, study medicines, therapeutic areas and source coverage before confirming a private company scope.
- [Confirm My Company Briefing](company-briefing.md) — Select a company, confirm products and markets, then hand relevant evidence to assessment.
- [My Company Change Inbox](company-change-inbox.md) — Triage new evidence and continue company work without confusing reading status with assessment status.
- [Action Center: assessment to verified closure](action-center.md) — Use the full case workflow, implementation drafts, ownership, evidence and reviewer decisions.

## Regulatory review

- [Source Documents and provenance](source-documents.md) — Find official source documents, inspect captured versions and reach extraction and baseline review.
- [Baseline Review: draft to publication](baseline-review.md) — Review automatically prepared requirements against the original document before publishing a human-reviewed version.
- [Requirements Library and baseline releases](requirements-library.md) — Explore source-linked interpretations, distinguish current evidence from approved baselines and assess a pinned version for your company.
- [Regulatory Change Review](regulatory-change-review.md) — Compare source captures, record human triage and open a company assessment with pinned evidence.

## Administration

- [Admin: accounts and access requests](admin-accounts.md) — Approve signups, communicate privately and handle assistance without shared passwords or automatic identity bypass.
- [Admin: sources, discovery and editorial controls](admin-content.md) — Maintain collection connectors, discover official documents and review public editorial changes.
- [Admin: refresh, navigation and publishing](admin-operations.md) — Operate data refresh independently of app releases, inspect failures and manage menus.

- [Safety Configuration Workbench](config-workbench.md) — Private environment profiles, current-rule baselines, evidence-linked proposals, independent review and implementation handoff.

- [E2B Requirements & Mapping Studio](e2b-studio.md) — ICH/FDA source captures, reviewed baseline subsets and private system mappings.

## Reference

- [End-to-end worked examples](worked-examples.md) — Practice the full journey with clearly hypothetical organizational examples.
- [Troubleshooting and safe support](troubleshooting.md) — Resolve common reading, account, workflow and refresh problems without losing evidence or exposing private data.
- [Glossary and function map](glossary.md) — Use consistent terms and locate every current page, including contextual and administrator screens.

## Maintain this guide

Update the relevant chapter and catalog when a released function changes. Run `node scripts/build-user-guide.mjs` to regenerate the in-app content, then run `node --test test/user-guide.test.mjs`. Link existing guides rather than duplicating instructions. Never include real user data, credentials, private company examples or screenshots containing confidential records. New app features should include a guide update in their pull request.
