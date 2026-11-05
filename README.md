# PV Info

PV Info brings public pharmacovigilance, drug-safety and regulatory information together for safety operations, regulatory affairs, safety science, quality and PV systems teams. Discover updates and research, explore company products and clinical studies, trace source documents and requirements, and review company impact in a private workspace. Coverage varies by agency, source and dataset; the app does not claim exhaustive global coverage.

**Live site: [www.pvinfo.org](https://www.pvinfo.org/)** · [Public coverage](https://www.pvinfo.org/coverage.html) · [Company Explorer](https://www.pvinfo.org/companies.html) · [Research](https://www.pvinfo.org/research.html) · [Substances](https://www.pvinfo.org/substances.html) · [Label Intelligence](https://www.pvinfo.org/labels.html) · [Safety Topics](https://www.pvinfo.org/safety-topics.html)

The application uses HTML/CSS/JavaScript, Node collection jobs and serverless APIs, Vercel, and optional Supabase authentication, Postgres and storage. Automated matching and extraction use explicit rules; no paid model API is required.

## Product overview

| Module | What users can do |
| --- | --- |
| Updates and impact cards | Search and filter safety/regulatory updates; inspect original sources, dates and explainable potential business/technical impact. |
| Research and innovation | Explore papers, preprints, evidence summaries and topic timelines; distinguish research from regulatory obligations. |
| Company Explorer and Portfolio 360 | Browse sourced product relationships, clinical studies, investigational medicine labels and therapeutic-area groupings with their limitations. |
| Drug Name Resolver | Resolve one reported medicine name with RxNorm/RxTerms source candidates and explicit identity scope; approved users save private reviewer decisions. |
| Substance Explorer | Search ingredients and the reviewed paracetamol/acetaminophen synonym pilot; inspect source-listed products and company roles without inferring manufacturers. |
| Label Intelligence | Review captured FDA approved-change excerpts and EMA recommendation indexes; confirm source evidence and portfolio matches before opening a pinned private assessment. |
| Safety Topic Explorer | Explore 12 editorial topics across updates, labels and research; filter publication timelines and inspect phrase matches, source provenance and paper-status notices. |
| My Company Briefing | Confirm products and monitored markets, see matching updates/research and why they matched, then send an item for assessment. |
| Leadership Cockpit and Safety Watch | Configure private topic/function interests, prioritize existing company evidence and cases, inspect upcoming source-date prompts and download a private weekly brief. |
| My Company Change Inbox | Review matched items and new evidence for a confirmed portfolio; distinguish inbox triage from the Action Center case workflow. |
| Source documents | Filter by country/agency, inspect original captures and versions, review extraction candidates and source changes. |
| Requirements Library | Explore requirement interpretations, research intake, coverage gaps and links into company workflow. |
| Automatic baseline extraction | New captures prepare admin-only drafts automatically. Review source evidence, submit for review and publish a human-reviewed requirement version without JSON handling. |
| Baseline releases | Review pinned source/requirement snapshots and release history; separate drafting, approval and publication. |
| Regulatory changes and Action Center | Review source differences, assess applicability, draft business/system/process/data requirements, assign action and verify closure. |
| Events and training | Browse curated events with verification dates, timezone-aware times where confirmed and downloadable calendar files. |
| Resources and archive | Find curated public safety databases and search retained updates. |
| Administration | Manage signup approvals, private account messages, source connectors, refresh controls, navigation and review queues. |

## Accounts and private work

New users choose a unique user ID (an alias), a password and an optional professional role at `request-access.html`. Personal email is not required. Signup shows **one recovery key**: save it privately; a successful password reset rotates it to a replacement. Legacy email-link sign-in remains available for existing accounts and is subject to the email provider’s limits.

| Access state | Available capabilities |
| --- | --- |
| Visitor | Browse public updates, research, companies, clinical studies and published regulatory/reference information. Some personal tools offer browser-only storage. |
| Signed in, awaiting approval | Continue browsing public modules; view approval status and private admin messages; manage the recovery key. Private company/team work is gated without redirecting public pages. |
| Approved user | Use account-backed company profiles, synchronized workspace and authorized personal/team assessment features. |
| Site administrator | Access admin modules after server-side authorization; review signups and manage site configuration. |

Approve accounts at **Admin → Accounts & access requests → Signup approvals** (`admin-accounts.html`). Use **Reload requests** to refresh the list. The same screen supports private organizational messages and password-assistance review; a support request does not authorize an automatic password reset. Advanced manual provisioning remains available for temporary-password accounts.

Company selections and private case records are not published to public company pages. Browser-only data remains accessible to someone using the same browser profile; it is not a tamper-resistant regulated record. Account/team access is enforced by database policies and workflow APIs, not menu visibility alone. The header shows **Sign out** without displaying the account name or email.

Use organizational information only. Do not enter patient details or unnecessary personal information. Some existing assignment/team workflows use email identifiers; signup aliases are not verified electronic-signature identities.

## How it works

- `public/data/agencies.json` is the directory of 49 countries and international bodies (WHO, UMC, ICH, CIOMS, ICMRA, FDA, EMA, MHRA, PMDA, CDSCO, NMPA, MFDS, Health Canada, TGA, ANVISA, Swissmedic, SAHPRA, SFDA and more): region, agency names and aliases, and official site. It decides where each update is placed.
- The **data source registry** is the list of what the build collects: the official regulator feeds (FDA MedWatch, drugs, biologics, press releases and recalls; EMA news; MHRA Drug Safety Update, alerts and news; Health Canada recalls and alerts; TGA safety alerts; WHO news), a Google News search per agency so countries without their own feed are still covered, and PV topic searches (safety signals, boxed warnings, PSUR/PBRER, GVP, DHPC, nitrosamines, falsified medicines…). Admins manage it on **Admin → Data sources**; see [Data sources](#data-sources).
- `scripts/aggregate.mjs` fetches everything (8 at a time), keeps news only when it is about medicines, safety or regulation, tags each update with a country, region, agency and topic (`scripts/classify.mjs`), drops duplicates (the official notice wins over news coverage of it), keeps 60 days, and writes `public/data/updates.json` and an RSS feed at `public/feed.xml`. Earlier updates are kept when a feed is down.
- `public/` is the site: `index.html` (search, region, country, topic, source and date filters; key updates of the week; follow countries), `agencies.html` (the directory with links to each regulator) and `about.html`. Filters are in the URL, so any view can be shared or bookmarked.
- **Ask PV Info** (`public/chat.js`, logic in `public/chat-lib.js`): a chat bubble on every page. It reads the question for a country or agency (“PMDA”, “India”), a region, a topic (“recalls”, “guidelines”), a time window (“this week”) and any other words (a drug name), then answers with the matching updates, each linked to its source, plus a link to the same filters on the main page. Like Just Visual News' "Ask the news", it runs in the browser over the site's own data: no AI, no server, nothing invented.
- **PV Globe** (`public/globe.html`, `public/globe.js`): Just Visual News' Earth Pulse globe, re-pointed at PV updates. Countries glow by number of updates, red pulses mark a safety alert or recall in the last 7 days, and markers stand in for the EU, international bodies, Singapore and Hong Kong. It tours the newest updates; drag to spin, tap a country for its list. `public/map/globe.json` and `public/vendor/d3-geo.js` are copied from Just Visual News (built there by `scripts/build-globe.mjs`).
- **My PV Briefing** (`public/briefing.html`, `public/briefing.js`): a short daily view for one reader. They pick a role, countries, topics and a watchlist (products, substances, keywords); the page shows what is new in the last 24 hours (or since their last visit, 7 or 30 days), with watchlist hits first, new updates naming a substance they follow, a review queue ranked for their role, upcoming effective dates and consultation deadlines, and a "My work" area (saved, following, assigned, assessed, dismissed).
- **Role-based views** (`public/views.js`): five audiences, each leading with its own sections. *Case processing & operations*: submission interruptions, reporting changes, authority communications, process implications. *Safety scientists & physicians*: watchlist hits, PRAC outcomes, safety communications. *QPPV & compliance*: regulatory changes, effective dates and consultations, inspection themes, review status. *PV systems & configuration*: E2B and validation rules, gateway notices, terminology releases, configuration impact (technical impact shown first on cards). *PV leaders*: a weekly window with the week at a glance, major changes, pending assessments and coverage gaps (countries with no updates or only news coverage, unreachable sources). A two-step first-run setup picks the view and interests; a view bar switches at any time, and `briefing.html?view=systems` opens a view directly. Under **Groups** readers rename the five views and add their own groups, each based on one view plus extra topics and keywords.
- **Impact cards** (rules in `public/impact.js`, drawing in `public/impact-view.js`): every update, on the main page and in the briefing, opens into a structured card: what changed (quoted from the source's own summary, or the headline when there is none), who may be affected (roles, jurisdictions, substances detected by INN name pattern), potential business and technical impact (each with the words that triggered it), dates (published, effective, consultation deadline, transition period, each with the sentence it came from, or "not stated"), and evidence (source, official or news, any GVP module/article/section named, the date PV Info first retrieved it, and review status). Nothing is generated by AI; anything that is a judgement is labelled "potential". Actions: save, follow, assess (with status and note), assign (owner, due date and note; review the available sharing action), dismiss with a reason, copy as text.
- **Where per-user data lives**: the briefing profile and every action are kept in the browser's localStorage (`public/workspace.js`). Export/Import (JSON) moves a workspace to another browser or colleague, and the CSV export gives an assessment log. With the database connected (below), signed-in readers' workspaces also sync across devices.
- **Database (optional, Supabase)**: tables and access rules are in `supabase/schema.sql`; build-side code in `scripts/cloud.mjs`, browser side in `public/cloud.js`. It adds:
  - **Archive** (`public/archive.html`): every update is saved by the data refresh pipeline, with its impact card fields stored as `impact` for reporting, and kept after it leaves the 60-day feed. Search by words, country, topic, source type and dates. No sign-in needed.
  - **Sign-in and sync** (`public/account.html`): user ID/password with approval-gated private work; legacy email-link access remains available for existing accounts. The profile, groups and saved, followed, assessed, assigned and dismissed items follow the reader to every device. If two devices both changed, item records merge newest first.
  - **Teams** (`public/team.html`): create a team, invite colleagues by link, and share one review queue. Assessments, assignments (to a teammate by email) and dismissals from any impact card go to the queue, with tabs for Assigned to me, Action needed, All open, Closed and Dismissed, overdue flags, and an activity log. The audit trail is written by a database trigger, so browsers cannot edit or delete it. The top bar shows how many open items are assigned to you.
  - Without the database, public static content and supported browser-only tools remain available; authenticated/admin and server-backed workflows require the connected services.

### Topics

Safety alerts & signals · Recalls & quality · Label changes · Guidelines & guidance · Regulatory changes · Policy & strategy · Inspections & enforcement · Approvals & authorisations · Industry & science news. The rules are plain keywords in `scripts/classify.mjs`; an update keeps every topic it matches as a tag, so filters find it under each.

## Run it

```sh
npm install
npm run app        # http://localhost:4330, refreshes every hour
npm run aggregate  # just rebuild public/data/updates.json and public/feed.xml
npm test           # offline tests against test/fixtures
node scripts/aggregate.mjs --fixtures test/fixtures   # sample data, no network
```

## User Guide

[Open the searchable User Guide](https://www.pvinfo.org/user-guide.html) or [browse the versioned GitHub wiki-style pages](docs/user-guide/README.md). The 26 chapters cover every current screen, account approval/recovery, public discovery, Substance Explorer, Label Intelligence, Safety Topic Explorer, company/clinical portfolios, baseline and change review, private actions/closure, calendar downloads and administrator operations. Use **Resources → User Guide**, full-text search, audience filters or **Read complete guide → Print / save as PDF**. Source chapters and the rendered in-app guide are maintained together with `npm run guide`; no Markdown attachments are added to app workflows.

## Hosting

Import the repository into Vercel. `vercel.json` installs with `npm ci`, runs `npm run build` and serves `public/` plus the serverless API routes. The canonical production address is **https://www.pvinfo.org**; the legacy `pharmacovigilance-info.vercel.app` host redirects there. `SITE_URL` controls where collection reads the previous published data; `SEO_SITE_URL` controls canonical URLs.

The checked-in build collects clinical snapshots, updates and missing document captures before generating SEO output. A rebuild can therefore change content even when the application source commit has not changed. Vercel builds and upstream sources can be delayed or fail; scheduled refreshes are targets; GitHub may delay execution.

- `.github/workflows/fda-collector.yml` checks the admin-managed schedule hourly at minute 23 (every 12 hours by default), collects FDA feeds and the other configured public sources, and publishes a compressed runtime snapshot to Supabase. It never calls a Vercel deploy hook.
- `.github/workflows/vercel-refresh.yml` is a manual shortcut to the data-only refresh worker. It does not deploy the app.
- GitHub provides the automatic data-only schedule. No cron-job.org account or Vercel deploy hook is required. The owner reported disabling the old deploy-hook job; keep it disabled. External dispatchers, if used, must target the GitHub data workflow and keep credentials private.
- Cache and development branches are excluded through `vercel.json` and `scripts/ignore-build.mjs`. Review these before changing deployment behavior.

See [FDA collection delivery](#fda-collection-delivery) and [refresh administration](#refresh-administration) for the separate collection paths. See [data-only publication and retention](docs/runtime-data-publication.md) for cutover, failure recovery and retention boundaries.

## Search engines (www.pvinfo.org)

Every page keeps its own `<title>` and `<meta name="description">`. `scripts/seo.mjs` adds a generated block after them with the canonical address (`https://www.pvinfo.org/...`), Open Graph and Twitter tags (image: `public/og.png`). After adding or renaming a page, run `npm run seo`; the tests fail if a page is missing a title or description or its block is out of date. A page with `<meta name="robots" content="noindex">` (admin, status, account and team pages) gets no canonical tag and stays out of the sitemap.

The build (`npm run build`) runs it after the aggregator and writes `public/sitemap.xml` (every indexable page, plus one `paper.html?id=` URL per paper and one `company.html?id=` URL per company) and `public/robots.txt`. New pages are included automatically. `public/seo.js` points the canonical tag on paper and company pages at the item shown.

Settings (Vercel → Project → Settings → Environment Variables, both optional):
- `SEO_SITE_URL`: canonical address, default `https://www.pvinfo.org`. This is separate from `SITE_URL`, which the build uses to read the last published data.
- `GOOGLE_SITE_VERIFICATION`: only if you verify Search Console with the HTML-tag method; put the `content="..."` value here and redeploy. The DNS method needs nothing here.

## Data freshness and feed alerts

Each build also writes `public/data/status.json`: when the updates were last refreshed, and for every feed whether it was reachable, when it last succeeded and how long it has been failing. Feed diagnostics are shown only to administrators by default; `status.html` and the admin refresh/source screens support investigation. Public coverage is available separately without operational health details. A feed that fails keeps its earlier updates on the site, and if every feed fails the build keeps the whole previous list instead of emptying the page.

`.github/workflows/feed-health.yml` runs `scripts/health.mjs` against the live site every hour (at :47). Freshness thresholds follow the cadence pinned in each published snapshot (18-hour stale threshold and 24-hour persistent-source threshold at the 12-hour setting). If that threshold is exceeded, half the news searches fail, or a research source has failed for a day, it opens one GitHub issue labelled `feed-alert` assigned to the repo owner, so GitHub emails you. While the problem lasts it quietly updates that issue, and it comments and closes it once a check is healthy. Thresholds are in `FRESHNESS` in `public/lib.js`. Run it by hand from the Actions tab (Feed health check → Run workflow).

## Connecting the database

1. **Create it.** In Vercel, open the `pharmacovigilance` project → **Storage** → **Create Database** → **Supabase**, pick the Free plan and a region near your team, and connect it to all environments. Vercel adds `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and friends to the project.
2. **Create and migrate the database.** Review `supabase/schema.sql` for the base schema, then apply the required incremental files in `supabase/migrations/` in timestamp order, using tracked migration history. Several newer features are implemented in migrations, so the base file alone is insufficient. For an existing database, inspect applied migrations and apply only missing ones; do not blindly replay the entire history.
3. **Allow sign-in links back to the site.** Supabase → **Authentication** → **URL Configuration**: set Site URL to `https://www.pvinfo.org`, and allow the required callback URLs on that host. Add specific development/preview callback origins only when needed; keep production redirects controlled.
4. **Choose the account flow.** The current user ID/password signup and recovery-key flow does not send email. If retaining legacy email-link sign-in, configure and test the provider’s redirect URLs, delivery and rate limits. A new SMTP service is not required for password-based signup.
5. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy). The build log shows `database: sign-in and team features on` and `database: archived N updates`.

Only the project URL and the public anon key reach the browser (`public/config.json`, written by the build). The service key is used only by trusted build jobs and server APIs, including restricted account operations. Never expose it through browser configuration or committed files. Row-level security does the rest: anyone can read the archive, each reader sees only their own workspace, and team data only its members.

## Admin console

Additional admin screens include **Accounts & access requests**, **Data Refresh Center**, **Navigation Studio**, source/document management, source verification, baseline review and research review. Pending signup accounts use the restricted `pv_pending` role until approved; the approval list is provided by the server-only account worker.

`admin.html` is one signed-in page for app admins (the emails in `research_admins`). It replaces editing repo files or running SQL for day-to-day admin work:

- **Company list approval:** one button approves the current version of `companies/manifest.json`, with your name and today's date. A new manifest version needs a fresh approval. Withdrawing puts the draft notice back.
- **Companies:** add a company, edit its names, matching phrases or holder prefixes, hide it, and undo any change. Signed-in readers can ask for a company from the bottom of the Companies page, and the requests wait here to be added or declined.
- **Site menu:** reorder the menu and hide pages from it for every visitor (a hidden page still opens from a direct link; Updates and Sign in always stay). Feed diagnostics stay admin-only by default; public coverage and internal health are distinct. Saved in `site_settings`; each build writes them to `public/data/site.json`, which `public/nav.js` applies.
- **Admins:** add or remove admins by email (you cannot remove yourself).
- **Data sources and research review:** failing regulator, research and registry sources with a link to [Data sources](#data-sources), and the research review backlog with a link to the queue.
- **Refresh published data and activity:** queue a data refresh without deploying the app, and see a log of admin changes.

How it works: admin changes live in Supabase (`manifest_approvals`, `company_overrides`, `company_requests`, `admin_events`; see `supabase/schema.sql`). Each build reads them (`scripts/admin.mjs`), applies them over the repo manifest, and publishes what it applied as `public/data/companies/admin.json`. If the database can't be reached, the build reuses the live site's last copy, so an approval or a hidden company never flips back. The repo files are not changed. The weekly registry run reads that same file from the live site, so companies added here get their FDA and EMA products linked on Mondays.

Publish now: in Vercel, open the project → **Settings** → **Git** → **Deploy Hooks**, create a hook for `main`, and paste its URL in the Publish section once. It is stored in a database table nobody can read, and the database calls it through Supabase's free `pg_net` extension. No GitHub or Vercel token reaches the browser.

To turn it on, run `supabase/schema.sql` again (safe to re-run). Admins already in `research_admins` can use the page straight away, and the account page shows them an **Open the Admin console** button.

## Research & Innovation

`research.html` lists recent PV research and preprints, and `paper.html?id=…` opens each paper's detail page. The build runs `scripts/research.mjs` at most every 6 hours (set `RESEARCH_FORCE=1` to force a refresh). It works without AI or any paid service:

- **Sources:** Europe PMC, which needs no key and includes all of PubMed plus the medRxiv and bioRxiv preprints. Searches are in `research.json`. PubMed's E-utilities are used directly only when `NCBI_EMAIL` is set (optionally with `NCBI_API_KEY`). NCBI asks that the tool and email be registered with them first.
- **Tags:** two dimensions (PV application, and method or technology), set by keyword rules in `scripts/research-taxonomy.mjs`. Each tag keeps the words that triggered it.
- **Sections and summary:** `scripts/research-extract.mjs` sorts the abstract's sentences into question, approach, findings, limitations and conclusion, and picks the summary sentences with TextRank. Every sentence is quoted verbatim. Evidence maturity comes from cue phrases, and the sentence behind each label is quoted with it.
- **Copyright:** abstracts belong to their publishers or authors. Full abstracts are kept only for open-access papers; for any other paper the page quotes at most one sentence per section and links to the original.
- **Watchlist:** saved papers, notes, followed topics and authors, and saved searches are kept in this browser's localStorage (`pv-research`). Saved papers export as RIS.

- **Innovation timeline:** the dated events for one topic: papers, preprints and their journal versions, datasets, documented implementations, and regulator guidance from the updates feed on the same topic. Entries are linked only by version links, or as "similar topic" through shared vocabulary. Nothing is presented as "builds on".
- **Review queue** (`research-admin.html`): admins correct topics, approve or reject summaries, hide papers with weak PV relevance, fix version links and override maturity. Reviews live in `research_reviews`, and the database keeps the revision history. Each build adds the public part of each review to `research.json`, and the pages apply it over the automated values, which are kept. To turn it on, run `supabase/schema.sql` again (it is safe to re-run), then add yourself as an admin:

  ```sql
  insert into public.research_admins (email) values ('you@example.org') on conflict do nothing;
  ```

Offline check: `node scripts/research.mjs --fixtures test/fixtures/research`.

## Company Explorer

`companies.html` searches pharmaceutical companies by name, alias, former name, brand or substance; `company.html?id=…` is one company's public page (overview, related updates, products and markets, research, sources and coverage). No sign-in, no AI and no paid service.

- **Coverage list:** `companies/manifest.json` names each company group with a stable `id`, its legal name, aliases, former names, the exact phrases that identify it in news (`mentions`, case-sensitive and specific, so "Vertex" alone never matches), and the holder-name prefixes its legal entities use in FDA and EMA records (`holders`). Ambiguous short names such as "Merck" are listed under `ambiguous` and never matched on their own. The list is a **draft** until the product owner approves it on the Admin page (or by setting `status`, `approvedBy` and `approvedOn` here). Bump `version` on every change to this file.
- **Sources:** `companies/sources.json` is the source capability register (what each source covers, how often, reuse terms, limits). Active today: the FDA Orange Book data files (US, NDAs and ANDAs) and EMA's medicines report (EU, centrally authorised). Planned: FDA Purple Book, the EU Union Register and EMA Article 57 data.
- **Registry:** `scripts/registry.mjs` downloads the active sources, links each record's holder to a company and writes `companies/registry.json`, keeping the source, record locator, URL and file hash on every row. The **Refresh company registry** workflow runs it every Monday and commits the file, which redeploys the site. If a source fails, its last good rows are kept and marked stale. Run it by hand from the Actions tab after changing the manifest.
- **Matching:** each data refresh matches updates and research papers to companies (`scripts/company-match.mjs`) in four lanes: direct (authorisation number, or a brand the company holds), substance, drug class (indirect) and company news (off by default). Every match stores its reason, and the rules version. A brand held by different companies in different markets is not matched unless the company is named. Results go to `public/data/companies/`, and each update gets a `co` list for the Updates page's "Related companies" line.
- **Following:** followed companies are kept in this browser's localStorage (`pv-companies`) and show in My Briefing.

Offline check: `node scripts/registry.mjs --fixtures test/fixtures/companies` (synthetic medicines; regenerate them with `python3 test/fixtures/companies/make-fixtures.py test/fixtures/companies`).

### Company Explorer runbook

- **Add, fix or hide a company:** use the Companies section of the Admin page. For a lasting change to the base list, edit `companies/manifest.json` (never change or reuse an `id`), run `npm test`, then run the registry workflow so its products are linked.
- **A large holder is not linked:** the Sources section of `companies.html` and `unmapped` in `companies/registry.json` list the biggest unlinked holder names. Add the right prefix to that company's `holders` after checking the holder really belongs to the group.
- **A source fails:** the Data status page shows it under "Company registry sources", and the company pages say products come from the last good copy. Check the download URL in `companies/sources.json`; the parsers find columns by name, so a renamed column is the usual cause.
- **A correction or company request:** both buttons open a public GitHub issue labelled `company-correction` or `company-request`. Signed-in readers can also ask from the "Missing a company?" box, and those requests wait on the Admin page.
- **Never** describe the list as exhaustive or the matches as validated: coverage is as stated on the pages.

## Data sources

`admin-sources.html` (Admin → Data sources) manages every source the data pipeline collects, without a code change or a deployment. The registry in Supabase is the pipeline’s authoritative list; there is no hard-coded one.

- **The table** shows each source's name, organization, exact URL (for a news search, the provider and query), type (RSS/Atom, JSON API, web page, news search), classification (official regulator, research, vendor, secondary news), countries/regions, topics, status (active, paused, draft), collection health (successful, failed, stale, never collected), last attempt and last success, items collected and accepted in the chosen period, and actions. Summary cards above it count Configured, Active, Paused, Failing and Stale. Status is what an admin set; health is how collection went, so an active source can be failing and a paused one keeps the health it had.
- **Add:** enter the details and URL, **Test now**, check the sample records, then **Save and activate** (or save a draft). **Edit:** a changed URL, type or parser setting must pass Test now before it can be saved; names, topics and notes don't need a test. The database enforces this: it only accepts a configuration that passed a test in the last 24 hours.
- **Test now** runs on the server (`api/source-test.js`, a free Vercel function, admins only) and shows the HTTP status, detected format, redirects, sample items with whether each would be kept, and errors in plain words.
- **Pause** stops collection from the next build; everything already collected stays, with its source id. **Resume** restarts it with a catch-up window you choose (0 to 60 days). Updates are identified by their link, so a resume or a new URL never adds one twice.
- **History** shows every configuration change (who, when, why, before and after), collection runs with failures, and tests. Any change can be undone, and the undo is logged too.
- **Credentials:** a source that needs a key writes `{{NAME}}` in its URL or a header; the value is set on the edit form, stored in `data_source_secrets` (no browser can read it), and used only when collecting and testing. URLs with a literal key, password or token are refused.
- **Safety:** every address is checked on the server before each fetch and at each redirect (`scripts/safe-fetch.mjs`): only http/https on ports 80 and 443, no private networks, link-local or cloud metadata addresses (checked at connect time, after DNS), no https-to-http redirects, and a size and time limit.
- **Failures:** temporary failures (timeouts, 429, 5xx) are retried within the run. A failing source is never switched off: it stays active, shows as Failed with its last success, and after 6 failed runs in a row the hourly health check opens a GitHub issue.
- **Public coverage:** `coverage.html` (linked from About) lists active sources by name, organization, kind, countries and topics, from `public/data/coverage.json`. It has no URLs, settings, credentials or health.

How it works: tables `data_sources`, `data_source_events`, `data_source_runs`, `data_source_tests` and `data_source_secrets` in `supabase/schema.sql`, changed only through `admin_*` functions that check the admin. Each build loads the registry (`scripts/sources.mjs`), collects the active sources, records one run per source, and publishes what it used as `public/data/sources/registry.json` (credential names only). If the database can't be reached, the build uses that file from the live site, so a paused source never restarts by accident. `sources.json` in the repository is the initial import of the 75 sources collected before the registry existed; `schema.sql` imports it once (regenerate the import with `npm run sources:sql` if it changes). It is only used by builds before the schema has been run.

To turn it on, run `supabase/schema.sql` again (safe to re-run). The 75 sources appear in the table at once, active, with the same URLs and settings.

## Public Safety Data Resources

`resources.html` (menu: Resources) is a curated directory of public safety databases, registers and safety communication lists. It is a reference for readers, separate from collection: listing a resource never makes the build collect from it. Automated collection needs a source in Data sources, tested and activated there.

- **Each card** shows the name and maintaining organization, the question it helps answer, data coverage (countries, products, report types, years), access, downloads, API, reuse terms, limitations, the official link and when it was last verified. Public access, downloadable data and permission to reuse data are recorded separately.
- **Categories:** adverse-event reporting databases; regulatory safety communications and recalls; product labels and reference information; clinical trial results; research and literature; specialist resources (vaccines, pregnancy, medication errors, medical devices).
- **Finding things:** filters for country, category, product type, access and download/API; a search that reads plain questions ("Find adverse-event data for Japan") into those filters with keyword rules (no AI); and a "Which resource should I use?" guide. For a country, its own resources come first, then EU-wide ones for EEA countries and international ones. Filters are in the URL, so a view can be shared.
- **Favorites** are kept in the reader's workspace (this browser; synced when signed in). Viewing never needs sign-in.
- **Suggest a resource** and **Report incorrect information** need no sign-in. Messages go to `resource_feedback` through `submit_resource_feedback`, which allows five an hour per address (stored as a hash) and 200 a day in all.
- **Admin → Safety data resources** (`admin-resources.html`): add, edit, verify ("Save and verify" records that you checked the official page today), categorize, flag a broken link (readers see a warning), publish, retire and restore, with every change in the resource's history. A resource is published only once verified (enforced by the database). Linking a resource to an existing data source only shows readers that PV Info collects from it; "Set up a source connector" opens a prefilled draft on the Data sources page, which collects only after its own test and activation.
- **Coverage statement:** the page says it is a curated selection, not every database (`COVERAGE_STATEMENT` in `public/resources-lib.js`).

How it works: tables `safety_resources`, `safety_resource_events` and `resource_feedback` in `supabase/schema.sql`, readable by admins only and changed through `admin_*` functions. Each build publishes the published entries to `public/data/resources.json` (`scripts/resources.mjs`) without editors' emails; if the database can't be reached it reuses that file from the live site. `resources.json` in the repository is the initial list: 57 resources, each checked against its official page on 31 Oct 2026 by an automated page read (marked "awaiting editor review" until an admin verifies it). Five whose pages could not be read are drafts. `schema.sql` imports the list once (regenerate with `npm run resources:sql`).

## Adding a country or source

- New source: Admin → Data sources → **Add a source**.
- New agency: add it to `public/data/agencies.json` with its aliases, so updates that mention it are placed in its country. Then add a news search for it on the Data sources page if it has no feed.
- CI's "Live feed check" step prints which feeds are reachable and how many updates each gave.

Topic and country tags are automatic and can be wrong. PV Info is a reading aid; always confirm details with the official source.

## FDA collection delivery

The five official FDA RSS feeds are collected by `.github/workflows/fda-collector.yml`
(schedule checks hourly at :23; collection is every 12 hours by default, with admin frequency controls). Collection
runs on GitHub Actions because production Vercel requests to these same URLs have
returned HTTP 404 while the GitHub runner succeeds. The workflow reads the last
published active registry, fetches only the five exact FDA endpoints, privacy-screens
parsed items, and publishes `fda-feeds.json` to the `fda-feed-cache` branch using the
existing workflow token. The same run collects configured updates and research and atomically publishes a runtime snapshot through a pinned GitHub OIDC identity.
The cache branch is excluded from Vercel preview builds by `scripts/ignore-build.mjs`.
The older refresh workflow now requests a data-only run. Product and clinical workers stage non-deploying cache branches and queue the updates pipeline. App releases remain independent.

The app's build and Admin → Test now can use this snapshot. FDA remains the original
source; article links and publication dates are preserved. Source status identifies
GitHub Actions delivery and actual FDA collection time. A snapshot older than two
hours (or from a collector whose latest attempt failed) warns; after twelve hours it
is rejected and the app tries the official URL directly. Paused sources are not
consumed. Missing/corrupt snapshots never turn arbitrary URLs into proxy requests.
GitHub scheduling and Vercel builds may be delayed; these are freshness targets,
not a guarantee of exact delivery times. Check Actions → Refresh public PV data and
`status.html` when investigating gaps. No new paid service or source credential is
required. Do not point the collector at patient-level data.

## My Company Briefing

Open `company-briefing.html` from My Briefing, Company Explorer, or a company page.
Search/select an organization, explicitly choose current sourced product records
and their markets, and confirm your monitoring scope. The first version uses the
US/EU relationships already mapped by the FDA/EMA registry; it does not infer
commercial availability, local responsibility or company affiliation.

The briefing matches **selected product keys**, not merely a company's name. Each
update/paper shows why it matched, the matching confirmed product records and source
links. Indirect class matches and out-of-market notices are optional. Missing product
mapping and older matches without product-level evidence are disclosed. A changed,
removed or transferred selected product requires reconfirmation before new handoffs.

Scopes live in `workspace.companyPortfolios` and remain in this browser unless the
reader signs in to sync their own workspace. They never enter public company JSON or
URLs. “Send for assessment” is an explicit handoff: anonymous readers get a local
assessment; signed-in readers with an active team send the context to that team's
existing queue. Company/market/item keys prevent repeated-click duplicates. Existing
assessment decisions are not overwritten; snapshots preserve the confirmed scope,
product evidence, match explanation and portfolio revision. Research is a review
candidate, not a regulatory obligation. Team assignment remains email-only. No new
database table or schema migration is needed.


## My Company Action Center

Open `action-center.html` or **Action Center** in the shared menu. Send a scoped update or research paper from My Company Briefing, then use **Continue in Action Center**. Existing assessment handoffs are offered as candidates; **Start case** explicitly opens one case per source key and visibility scope. Repeated starts return the existing case. Legacy assessment/assignment notes remain in the original queue; they are not treated as approved applicability decisions. The Action Center is the authoritative workflow for its cases.

Choose **This browser only**, **My private account**, or a specific team. Browser-only cases use a separate local key (`pv-company-action-cases-v1`) and are never automatically synced or published. Account cases and team cases are separate records; no implicit personal-to-team migration occurs. The dashboard shows awaiting assessment, actions due, overdue, awaiting verification and closed, filtered by company and monitored market. Date-only deadlines are compared against the browser's local calendar date. Counts cover loaded cases (up to 10,000 per scope).

Applicability requires a reason. Relevant cases require an action type, email-only owner, due date and instructions. Uncertain cases stay in assessment. Not-relevant dispositions still require evidence and verification before closure. Completion records what changed and supporting HTTPS document links. Uploading files is intentionally unsupported; evidence access remains governed by its document provider, and expiring/signed links should not be stored. No emails or notifications are sent automatically.

Team action owners and reviewers must be current team members. Only the assigned owner can submit an action's completion, and only a designated different teammate can approve or return it. Personal closure is explicitly self-reviewed. Rework and reopening require reasons; every change retains an event in case history. Cloud state transitions are server-stamped, serialized with row locks and expected-version checks; direct client writes are forbidden. Browser-only records are editable by anyone with that browser profile and are not a tamper-resistant audit record. This feature does not claim electronic-signature, Part 11, or regulated-system validation.

Apply `supabase/migrations/20261031232110_company_action_center.sql` for an existing database. The new `company_cases` table has authenticated SELECT-only grants and RLS for the personal owner or current team members. The two authenticated workflow RPCs check the same authorization explicitly. Internal validation helpers have no API-role execution grants. Case data is never written to public build files. Administrative database access still applies; this is not end-to-end encryption. Free-text identifier screening is a guard, not a guarantee of detecting arbitrary personal details. Use organizational information only; team assignment identifiers use email, while the current signup flow uses an alias and password.

Validation: `test/action-center.test.mjs` tests state gates, expiry-free date comparison, dashboard scope and safe inputs; `test/browser/action-center.smoke.cjs` exercises the full browser workflow; `test/company-action-center.sql` checks RPC authorization, isolation and workflow gates in a transaction and rolls back all synthetic fixtures. The browser smoke test uses synthetic local fixtures and makes no production writes.


## Grouped navigation and Navigation Studio

The shared header groups **Action Center**, Company Briefing and the team queue under **My Briefing** by default. Explore and Resources collect the browsing/reference pages. Desktop menus use native disclosure controls; mobile menus expand inline. Enter/Space open a group, Tab visits its links, and Escape or an outside click closes it. Admin is still shown only after a server role check, and the account link keeps its existing sign-in/sign-out handler.

**Admin → Site menu** now opens **Navigation studio**: rename/reorder groups; move pages between groups; rename/reorder/show/hide items; add or remove empty groups; preview; discard drafts; or restore a default draft. Routes are selected from the fixed registry in `public/navigation.js` rather than free-form URLs. Updates cannot be hidden; Admin and account actions cannot be moved into public groups. Single-visible-item groups render as a direct page link; empty groups are omitted. Save performs one validated, version-checked transaction. Use Publish now, or the next scheduled build, to publish saved changes. No cron configuration is changed.

The new `navigation` site setting takes precedence over the old `nav_order` and `hidden_nav` settings; old visibility and item ordering are retained when no grouped layout has been saved. Invalid cached layouts are normalized without accepting unknown links or dropping required pages. A missing/new registered page is restored safely. The build and browser share the same registry and normalization. The public settings contain only page labels/layout, never account identity or private company selections.

Migration `20261101005846_grouped_navigation.sql` adds the setting and an admin-only atomic `admin_save_navigation` RPC. Other site settings and the existing SEO/Search Console and hourly workflow configuration are preserved. Test coverage includes config validation, migration defaults, keyboard/touch disclosure, mobile overflow, editor save/conflict handling, and SQL authorization/concurrency checks using rolled-back synthetic fixtures.


### Document-led regulatory requirements

Open **Resources → Source documents** to filter registered source families by jurisdiction and agency, including FDA, EMA, MHRA, Health Canada and TGA where capture is configured, inspect archived captures and extraction candidates, and hand a pinned clause to a private company assessment. Admins can manage sources and capture now. A dedicated hourly GitHub collector fetches public originals and delivers them to Vercel with verified short-lived GitHub identity. The existing Supabase server key stays on Vercel; no new shared secret or LLM credential is needed. Business/system/data/process drafts and review gates live in Action Center. See [implementation, boundaries and operations](docs/document-requirements-pipeline.md).


## Clinical portfolios and coverage

Company pages retain the authorization-product view and add **Clinical pipeline** and **Therapeutic areas**. ClinicalTrials.gov evidence distinguishes lead sponsors/collaborators, phases, study status, medicines, conditions and study countries. Therapeutic groups retain their source terms and grouping rationale; study countries are not authorization markets, and a registry match does not establish ownership or approval.

Bulk collection and cached portfolios have explicit coverage states. Queryable companies are not necessarily fully loaded or fully mapped. Missing matches, partial collections and older snapshots must remain visible; do not describe the catalog as “all companies, all data.” Product and trial refreshes depend on their configured pipelines and upstream publication. See [clinical portfolio boundaries](docs/clinical-portfolio.md).

## Source documents requirements and baseline releases

The global directory supports country/agency discovery with explicit coverage gaps. Registered or verified agencies, captured source documents, extracted candidates and approved requirements are different coverage states. There is no exhaustive worldwide historical crawl or automatic approval of extracted legal obligations.

Source captures preserve original links, retrieval metadata, checksums and versions. HTML/PDF extraction is rule-based and may miss exceptions, tables, scanned text or non-English obligations. Candidate comparisons and interpretation drafts require human review. Baseline releases pin evidence and interpretations; published snapshot bodies cannot be silently overwritten, and baseline approval requires a different user from the author.

Regulatory change review can pin a source change and requirement evidence into a private company case. Action Center supports applicability decisions, business/system/process/data requirement drafts, review, action completion and verification. Research remains a review candidate, not a legal requirement.

Implementation and limits:

- [Document capture and extraction](docs/document-requirements-pipeline.md)
- [Global directory and coverage](docs/global-regulatory-library.md)
- [Requirements Library](docs/requirements-library.md) and [requirements workspace](docs/requirements-workspace.md)
- [Governance roadmap](docs/regulatory-governance-roadmap.md)

## Events and calendar downloads

`events.html` presents a curated event/training pilot from official sources. Confirmed timed events use UTC instants and an organizer IANA timezone; date-only events stay date-only. Downloaded ICS files retain stable IDs and cancellation/version information. They are snapshots, not subscribed calendars: download again after an event changes. Source verification age and unknown details remain visible. Calendar-client compatibility still needs manual checks. See [calendar rules and verification](docs/events-calendar.md).

## Refresh administration

**Admin → Data Refresh Center** (`admin-refresh.html`) shows configured pipeline frequency, collection state and run history, and can queue work for the next scheduler check. Saving a frequency controls when a pipeline is eligible to run; it does not reschedule the external cron service or guarantee immediate execution. The updates worker wakes hourly and uses the database due time and lease to avoid duplicate collections. Inspect each workflow and the current configuration before changing frequency.

Regulatory document collection runs hourly at minute 17 with a bounded oldest-first batch; a large source catalog rotates through multiple runs. FDA RSS delivery, clinical backfill, research, product registry and document capture have different sources, schedules and limits. Check actual last-success/last-check evidence per pipeline. Preserve SEO/Search Console settings. After the data-only cutover is verified, retire the external cron-job.org deploy-hook call; do not run duplicate app deployments for data freshness.

## Quality status and GxP readiness

PV Info is a regulatory intelligence and review aid. **It is not represented as a validated GxP system, Part 11 compliant product or qualified electronic-signature service.** Current controls include selected server-enforced permissions, versioned source evidence, baseline snapshot protections, reviewer separation in specific workflows and workflow-specific event histories. These are foundations, not a completed compliance assessment.

Planned readiness work includes a defined regulated-use boundary, consistent organization/record permissions, complete protected audit coverage, controlled artifact promotion, retention and archival controls, complete inspection exports, and demonstrated backup/restore. Browser-only cases and personal self-review must not be mistaken for controlled company approval records. Routine content ingestion must remain distinct from an approved application release.

A validation-package draft has been prepared separately with intended-use/risk assessment, IQ/OQ/PQ protocols, traceability, change control, periodic review and release templates. It is **not executed** and does not certify this deployment. Customer QA must approve applicability, scope and evidence. Informational monitoring alone does not establish GAMP Category 3 or low risk. Formal electronic signatures require a separate identity/privacy and validation decision. No paid GPT extraction is enabled; future model use requires explicit authorization and preserved human review.

## Verification and contribution

`npm test` runs the Node suites. GitHub CI also runs synthetic browser journeys for signup/approval, pending-user public browsing, private feature gates, company briefing/inbox, Action Center, navigation, sources/requirements/baselines, clinical portfolios, events and refresh controls. SQL regression files under `test/` and `supabase/tests/` cover selected real database permissions/workflows; execute only through an authorized test connection and follow each file’s rollback instructions.

Before merging: preserve concurrent work, review migration impact, run checks relevant to the change and document unresolved limitations. Existing automated tests and supplier CI are not a substitute for executed customer qualification. Keep credentials, recovery keys, private company work and patient information out of issues, screenshots and committed fixtures.

## Source Discovery and Coverage

**Admin → Source Discovery** (`admin-discovery.html`), also linked from Source Documents management, finds candidate document links on approved official publication indexes. Review the original and edition, defer/reject with a reason, or register a source for the existing capture/extraction workflow. Registration never approves requirements. Existing URLs deduplicate; similar titles only suggest an edition check.

Five starter indexes cover FDA, EMA, MHRA, Health Canada and TGA. Admins can configure HTML, RSS/Atom or a single sitemap URL list, scope keywords, frequency and pause/resume. The existing hourly document collector checks up to five due indexes (daily by default), retaining admin-only run status and prior candidates on failure. Discovery is bounded and does not recursively crawl or promise complete coverage. See [source discovery operations and limits](docs/source-discovery.md).

The separate [GxP Readiness Foundation release](https://github.com/chalamalasetti/Pharmacovigilance/issues/57) is in the backlog.

### Substance Explorer

Explore → Substances searches source ingredients and reviewed naming variants, including the paracetamol/acetaminophen pilot. Ingredient pages show company relationships, product evidence and source capture dates. FDA application holders and EMA authorization holders remain distinct from manufacturers; physical manufacturing is not inferred. Source-level companies without a curated company profile are included. Presentation-level FDA records preserve product numbers and ingredient/strength/form relationships; EMA records retain their authorization-level granularity.

The product collector stages the legacy company registry and detailed substance product companion atomically on the non-deploying product cache branch. The public runtime publisher creates a bounded 64-shard substance catalog; data refresh does not trigger app deployments. Naming rules are reviewed, versioned repository configuration in `substances/aliases.json`. See the [Substance Explorer guide](docs/user-guide/substances.md).

### Label Change Intelligence

Explore → Label Intelligence presents captured FDA SrLC entries with regulator-marked additions/revisions and EMA PRAC recommendation index entries. FDA discovery uses a rolling 100-day query and incremental detail capture (24 product pages per data collection run; seven-day detail rechecks). Captured entries are bounded to 500; EMA index scope starts in 2025. This is partial, explicit source coverage, not a complete global labeling database. Prior evidence survives source failures. App builds use the versioned bootstrap; ongoing collection is part of the existing data-only runtime workflow.

Previous wording is never reconstructed from underlining. Earlier FDA label links may skip intervening revisions. EMA index-only records require original wording review. Source corrections create new immutable evidence fingerprints; assessments pin the reviewed version and retain existing decisions. Approved users confirm source review, select a confirmed company scope, document a rationale and open a private/team Action Center case. Matching entries also appear in Company Change Inbox. Assessment exports include the pinned source record. No paid AI extraction or API is required.

See [Label Change Intelligence guide](docs/user-guide/label-intelligence.md).

### Safety Topic Explorer

Public `safety-topics.html` connects 12 editorial safety topics to collected updates, label changes and research. Filterable publication timelines explain phrase matches and retain original-source links. Label and paper routes preserve existing review workflows; no automatic assessments or clinical causality claims. Rules are versioned in `public/safety-topics-lib.js`; no licensed dictionary content or paid model API is required. See [the user guide](docs/user-guide/safety-topics.md).

### Drug Name Resolver

Open Substances → Resolve a medicine name (`drug-resolver.html`). Browser-to-NLM exact → normalized → approximate lookup uses active RxNorm concept names; source ranks are not probabilities. Normalized lookup can ignore salts. Candidate review shows related ingredients, RxTerms strength/form, source release/capture metadata and bounded brand-product expansion. No paid model or UMLS key is used. Requests are serialized (four starts/second per page), memory-cached for up to 12 hours, and 429/unavailable responses require retry; shared network limits still apply. No patient narratives or batch upload.

Approved accounts can append private ingredient/product confirmation, rejection or unresolved decisions to `drug_name_reviews`; RLS isolates owners and excludes pending/anonymous accounts. Owner/time/ID are database defaults without client insert grants; ordinary users cannot update/delete prior decisions. Browser-observed evidence is reviewer-recorded, not validated coding or WHODrug equivalence. No global aliases, portfolio selections or assessment cases are mutated. Apply the additive `drug_name_resolution_reviews` migration before enabling private saves. See [the resolver guide](docs/user-guide/drug-name-resolver.md).

### Leadership Cockpit and Company Safety Watch

`leadership.html` joins confirmed portfolios, scoped updates/research, captured labels, regulatory source reviews, existing company cases and personal reading markers. Private preferences live in `company_safety_watches`, protected by owner RLS and revision-checked edits. Team viewing reuses existing case membership authorization; watch preferences remain personal. No automatic cases, approvals, owner assignments or control-gap claims are created.

Explainable priorities distinguish overdue actions, verification, due-within-seven-days work, unverified upcoming source-date prompts and editorial watched-topic matches. Exact Inbox links preserve company/team/item context and existing case identities. Weekly text downloads summarize recorded events/current work and include scope and coverage caveats. Clinical updates remain in Inbox/Portfolio 360, and operational source diagnostics remain admin-only. Apply the additive `company_safety_watch` migration before private configuration. See [the leadership guide](docs/user-guide/leadership.md).

### Data publication retries

The data-only worker shares a short-lived GitHub OIDC identity across concurrent publication requests; it does not mint a token for every uploaded file. Identities remain in process memory and renew after four minutes. Identity issuance and idempotent input/source/begin/stage requests have bounded retries for temporary network, rate-limit and server failures. Authorization denials and publication conflicts are not retried, and commit is not blindly replayed. A failed staging request stops new uploads and waits for in-flight uploads before recording failure. The last complete public snapshot remains live; workflow logs identify the safe public file/part and HTTP status without exposing credentials or upstream private error text.

### Safety Configuration Workbench

**My Briefing → Configuration Workbench** connects private system/environment profiles and current-rule baselines to source-linked configuration proposals. Choose Argus, Veeva, ARISg or another system; enter rules or import the bounded CSV template; pin a requirement version or exact primary-source passage; generate before/after comparisons, implementation requirements and synthetic test prompts without a paid AI API.

Immutable saved revision snapshots retain inputs and generated output. Optimistic concurrency prevents silent overwrites. Team-owner approval requires a different person from the creator/last editor; personal specifications cannot be self-approved. Action Center handoff preserves scope and links the captured configuration revision for implementation and closure. Read the [workbench guide](docs/user-guide/config-workbench.md).

Outputs are review specifications, not vendor import files, executed tests, regulatory completeness determinations or verified release-specific adapters. No direct production-system connection is made. Existing homepage layout and independent data-refresh jobs are preserved. The additive `safety_configuration_workbench` migration creates scope-protected records and revision history; no existing user records are modified.

### E2B Requirements & Mapping Studio

**Resources → E2B Mapping Studio** provides source-linked ICH/FDA technical reference captures, filtered search, separate source layers and original page/sheet/row citations. Captures are unverified drafts; administrators individually verify records and publish immutable reviewed subsets with coverage counts. Older FDA workbook/regional editions remain distinct from the October 2026 core guide. No current legal precedence, full extraction coverage or automatic compliance is inferred.

Approved users document private system/environment mappings with optimistic concurrency, append-only history and explicit reassessment when a source hash changes. A saved mapping opens a pinned Configuration Workbench draft; existing review and Action Center flows handle implementation. JSON exports include source evidence and synthetic test prompts. No patient XML, paid AI API, licensed dictionary content, live vendor adapter or executable schema validation is included.

See the [E2B Studio user guide](docs/user-guide/e2b-studio.md). `scripts/e2b-extract.py` deterministically imports the supplied core PDF, FDA workbook and regional PDF into `public/e2b-catalog.json`; source binaries are not bundled. Its field/source hashes and coverage limits are retained. A new capture requires a controlled import and human review; the studio can read a complete newer database capture without an app deployment; scheduled news refresh does not regenerate or approve E2B baselines. The additive `e2b_mapping_studio` migration supplies public provenance/review records, immutable baseline snapshots and private mappings. It registers PDF source families with the existing document catalog; the XLSX source is reference-only.

The user-supplied Oracle Argus Safety Administration Guide (8.4.1, F84377-02, October 2023) supplies twelve derived configuration-reference areas. Users can pin guide/version/checksum/page references to private mappings and workbench drafts. Release mismatch warnings and synthetic review prompts help avoid assuming that an older administration guide establishes current regulatory behavior or exact field transformations. The Oracle PDF is not redistributed.

### E2B schema and configuration design

E2B Mapping Studio now includes an on-demand structural index of all 167 FDA-hosted ICH v2.5 XSD files (10,898 element/attribute declaration sites), two v3.1 reference XML structures and five v2.0 example XML structures. XML instance values are excluded. FDA ZIP downloads, checksums and HL7 notices remain visible. Local declarations are not expanded effective message constraints or legal obligations.

Approved users can pin a declaration to a private source-linked mapping; configure module, scope, conditions, requiredness, terminology, null policy and acceptance criteria; record business/system/process/data requirement IDs; and link up to eight other version-pinned E2B references. Configurations retain existing revision history and flow intact to Configuration Workbench. These are declarative specifications, not vendor imports, executed validation or compliance certification. No paid API, patient XML upload, homepage layout change or database migration is needed.

Reproduce the structural index offline after downloading FDA media 157992, 157991 and 157990:

```sh
python scripts/e2b-structures.py --schemas /path/schema.zip --reference /path/reference.zip --examples /path/examples.zip --output public/e2b-structures.json --notices public/e2b-third-party-notices.txt
```

Review changed versions, notices and metadata before committing a new index. The importer rejects DTD/entity declarations and oversized archives; it does not execute XSD/XSLT or retain XML case values. The source packages remain separate; no FDA endorsement is implied.

This product includes software developed by Health Level Seven. See the in-app third-party notices for applicable source notices and disclaimers.

### Automatic twice-daily public refresh

Updates/research default to 720 minutes. The GitHub cron wakes hourly at :23, acquires a managed lease only when due or queued, and publishes a complete runtime snapshot independently of app deployments. A failed collection is eligible for a retry after an hour; overlaps are blocked and the previous complete snapshot remains available. Product/clinical staging may queue an additional public publication. GitHub cron timing is best effort; this is not a guaranteed clock-time SLA.

The published status records `refreshIntervalMinutes`; health checks use that actual cadence, not deployment age. Admin → Data Refresh Center offers Twice daily and uses cadence-aware heartbeat warnings. Schema migration `twice_daily_data_refresh` enables the new option, sets updates to 720 minutes and queues one initial collection. Other pipeline frequencies are retained. Changes take effect at the next check; administrators can run Refresh public PV data manually with Force for immediate collection.
