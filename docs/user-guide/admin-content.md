# Admin: sources, discovery and editorial controls

Maintain collection connectors, discover official documents and review public editorial changes.

## Data sources: configure collection
Open [Data sources](https://www.pvinfo.org/admin-sources.html). The registry is the configured collection list, not a promise that every public source is reachable. Search/filter to find an existing source before adding a duplicate.

1. Choose the appropriate type: RSS/Atom, JSON API, web page or news search.
2. Enter a stable source ID, organizational name/classification, URL and supported region/topic/parser settings.
3. Use supported credential placeholders and the private credential controls if needed. Do not paste credential values into a public source URL, public notes or a GitHub issue.
4. Save, then use Test now to inspect the immediate result. A successful test does not guarantee every later run will succeed.
5. Activate, pause/deactivate or resume collection with the requested organizational reason. When offered, choose a catch-up window appropriate to the source.
6. After the next data publication, check actual collection results and public coverage.

Deactivation is different from a temporary upstream error. A failed source should not silently disappear from configuration or erase prior successful evidence. Use the supported history/revert controls carefully: inspect the earlier configuration and record why it is being restored. HTTP status, parser format, counts and last-success context help distinguish a feed problem from a publication problem.

## Source Discovery: find candidate documents
Open [Source Discovery](https://www.pvinfo.org/admin-discovery.html). Publication connectors monitor approved official indexes, RSS/Atom or a supported sitemap list. They produce candidate documents for review; they do not recursively crawl all history or automatically approve legal requirements.

Use Add publication connector to configure the verified agency, official URL, keywords/scope and available schedule controls. Review Publication connectors and Recent discovery checks, or Scan now for an authorized immediate request. Filter Discovery inbox by agency and candidate status: Awaiting review, Deferred, Registered or Rejected.

Open a candidate's official publication, confirm document identity/type/scope, then use the offered registration/review controls. Register the intended document family in Source Documents rather than creating multiple families for the same evolving document. A rejected/deferred candidate retains its disposition; it is not a public approved requirement. Failed or duplicate candidates must not silently create new baselines.

## Source and requirement editorial workflows
Use [Source Documents](source-documents.md) for capture configuration/agency verification, [Baseline Review](baseline-review.md) for automatic drafts, [Requirements Library](requirements-library.md) for versioned interpretations/releases and [Regulatory Change Review](regulatory-change-review.md) for human source-change triage. Source registration, capture, draft creation, triage and approval are distinct operations.

## Public resource and research reviews
Use [Safety resources](resources.md) for directory entries and feedback. Use [Research review](research.md) for tags, maturity/relevance, summary review and paper-version relationships. Keep company-confidential applicability decisions in private assessments, not public editorial annotations.

## Company directory and approvals
The main Admin screen exposes company-list approval and supported company overrides/additions. Review the manifest/coverage information, use the offered organizational approval rationale and inspect the resulting public profile after data publication. Hiding or editing a public directory company is not the same as deleting private user cases or erasing a company's historical source evidence.

## Activity and responsible editing
Inspect available admin activity/history after important changes. A successful save records configuration, but public snapshots may not update until publication. If an edit conflicts with another user's revision, reload and compare before retrying. Do not bypass source-host, access, version or approval checks to make a record appear complete.
