# PV Info

Pharmacovigilance and drug regulatory updates from every major regulator, in one page. Built for drug safety, PV and regulatory affairs teams: safety alerts and signals, recalls, label changes, new guidelines, regulatory and policy changes, inspections and approvals, filterable by region, country and topic.

Modelled on [Just Visual News](https://github.com/chalamalasetti/Justvisualnews): a Node script gathers public feeds into a JSON file, and a static site with no framework renders it.

## How it works

- `public/data/agencies.json` is the directory of 49 countries and international bodies (WHO, UMC, ICH, CIOMS, ICMRA, FDA, EMA, MHRA, PMDA, CDSCO, NMPA, MFDS, Health Canada, TGA, ANVISA, Swissmedic, SAHPRA, SFDA and more): region, agency names and aliases, and official site. It decides where each update is placed.
- The **data source registry** is the list of what the build collects: the official regulator feeds (FDA MedWatch, drugs, biologics, press releases and recalls; EMA news; MHRA Drug Safety Update, alerts and news; Health Canada recalls and alerts; TGA safety alerts; WHO news), a Google News search per agency so countries without their own feed are still covered, and PV topic searches (safety signals, boxed warnings, PSUR/PBRER, GVP, DHPC, nitrosamines, falsified medicines…). Admins manage it on **Admin → Data sources**; see [Data sources](#data-sources).
- `scripts/aggregate.mjs` fetches everything (8 at a time), keeps news only when it is about medicines, safety or regulation, tags each update with a country, region, agency and topic (`scripts/classify.mjs`), drops duplicates (the official notice wins over news coverage of it), keeps 60 days, and writes `public/data/updates.json` and an RSS feed at `public/feed.xml`. Earlier updates are kept when a feed is down.
- `public/` is the site: `index.html` (search, region, country, topic, source and date filters; key updates of the week; follow countries), `agencies.html` (the directory with links to each regulator) and `about.html`. Filters are in the URL, so any view can be shared or bookmarked.
- **Ask PV Info** (`public/chat.js`, logic in `public/chat-lib.js`): a chat bubble on every page. It reads the question for a country or agency (“PMDA”, “India”), a region, a topic (“recalls”, “guidelines”), a time window (“this week”) and any other words (a drug name), then answers with the matching updates, each linked to its source, plus a link to the same filters on the main page. Like Just Visual News' "Ask the news", it runs in the browser over the site's own data: no AI, no server, nothing invented.
- **PV Globe** (`public/globe.html`, `public/globe.js`): Just Visual News' Earth Pulse globe, re-pointed at PV updates. Countries glow by number of updates, red pulses mark a safety alert or recall in the last 7 days, and markers stand in for the EU, international bodies, Singapore and Hong Kong. It tours the newest updates; drag to spin, tap a country for its list. `public/map/globe.json` and `public/vendor/d3-geo.js` are copied from Just Visual News (built there by `scripts/build-globe.mjs`).
- **My PV Briefing** (`public/briefing.html`, `public/briefing.js`): a short daily view for one reader. They pick a role, countries, topics and a watchlist (products, substances, keywords); the page shows what is new in the last 24 hours (or since their last visit, 7 or 30 days), with watchlist hits first, new updates naming a substance they follow, a review queue ranked for their role, upcoming effective dates and consultation deadlines, and a "My work" area (saved, following, assigned, assessed, dismissed).
- **Role-based views** (`public/views.js`): five audiences, each leading with its own sections. *Case processing & operations*: submission interruptions, reporting changes, authority communications, process implications. *Safety scientists & physicians*: watchlist hits, PRAC outcomes, safety communications. *QPPV & compliance*: regulatory changes, effective dates and consultations, inspection themes, review status. *PV systems & configuration*: E2B and validation rules, gateway notices, terminology releases, configuration impact (technical impact shown first on cards). *PV leaders*: a weekly window with the week at a glance, major changes, pending assessments and coverage gaps (countries with no updates or only news coverage, unreachable sources). A two-step first-run setup picks the view and interests; a view bar switches at any time, and `briefing.html?view=systems` opens a view directly. Under **Groups** readers rename the five views and add their own groups, each based on one view plus extra topics and keywords.
- **Impact cards** (rules in `public/impact.js`, drawing in `public/impact-view.js`): every update, on the main page and in the briefing, opens into a structured card: what changed (quoted from the source's own summary, or the headline when there is none), who may be affected (roles, jurisdictions, substances detected by INN name pattern), potential business and technical impact (each with the words that triggered it), dates (published, effective, consultation deadline, transition period, each with the sentence it came from, or "not stated"), and evidence (source, official or news, any GVP module/article/section named, the date PV Info first retrieved it, and review status). Nothing is generated by AI; anything that is a judgement is labelled "potential". Actions: save, follow, assess (with status and note), assign (name, due date, note, and an email with the card), dismiss with a reason, copy as text.
- **Where per-user data lives**: the briefing profile and every action are kept in the browser's localStorage (`public/workspace.js`). Export/Import (JSON) moves a workspace to another browser or colleague, and the CSV export gives an assessment log. With the database connected (below), signed-in readers' workspaces also sync across devices.
- **Database (optional, Supabase)**: tables and access rules are in `supabase/schema.sql`; build-side code in `scripts/cloud.mjs`, browser side in `public/cloud.js`. It adds:
  - **Archive** (`public/archive.html`): every update is saved by the hourly build, with its impact card fields stored as `impact` for reporting, and kept after it leaves the 60-day feed. Search by words, country, topic, source type and dates. No sign-in needed.
  - **Sign-in and sync** (`public/account.html`): email magic link, no password. The profile, groups and saved, followed, assessed, assigned and dismissed items follow the reader to every device. If two devices both changed, item records merge newest first.
  - **Teams** (`public/team.html`): create a team, invite colleagues by link, and share one review queue. Assessments, assignments (to a teammate by name) and dismissals from any impact card go to the queue, with tabs for Assigned to me, Action needed, All open, Closed and Dismissed, overdue flags, and an activity log. The audit trail is written by a database trigger, so browsers cannot edit or delete it. The top bar shows how many open items are assigned to you.
  - Without the database every page works as before; the new pages say the feature isn't connected yet.

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

## Hosting

Same setup as Just Visual News: import the repo in Vercel (`vercel.json` runs the aggregator as the build and serves `public/`). Vercel rebuilds on every push to `main`; `.github/workflows/vercel-refresh.yml` asks it to rebuild every hour once you add a Vercel deploy hook URL as the repo secret `VERCEL_DEPLOY_HOOK`. The site lives at https://pharmacovigilance-info.vercel.app (Vercel project `pharmacovigilance`; with `pharmacovigilance-info.vercel.app` added under Settings → Domains). RSS links point there, and each build reads the live site's last `updates.json` so updates older than what the feeds still list are kept for the full 60 days. To host it elsewhere, set the `SITE_URL` environment variable to the new address.

## Data freshness and feed alerts

Each build also writes `public/data/status.json`: when the updates were last refreshed, and for every feed whether it was reachable, when it last succeeded and how long it has been failing. A strip under the menu on every page shows the last successful update and turns amber when a source is down or red when the data is more than 3 hours old; `status.html` lists every source. A feed that fails keeps its earlier updates on the site, and if every feed fails the build keeps the whole previous list instead of emptying the page.

`.github/workflows/feed-health.yml` runs `scripts/health.mjs` against the live site every hour (at :47, half an hour after the rebuild). If the site hasn't rebuilt for 3 hours, a regulator feed has been down for 6 hours, half the news searches fail, or a research source has failed for a day, it opens one GitHub issue labelled `feed-alert` assigned to the repo owner, so GitHub emails you. While the problem lasts it quietly updates that issue, and it comments and closes it once a check is healthy. Thresholds are in `FRESHNESS` in `public/lib.js`. Run it by hand from the Actions tab (Feed health check → Run workflow).

## Connecting the database

1. **Create it.** In Vercel, open the `pharmacovigilance` project → **Storage** → **Create Database** → **Supabase**, pick the Free plan and a region near your team, and connect it to all environments. Vercel adds `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and friends to the project.
2. **Create the tables.** Open the database in Supabase (**Open in Supabase** from the Vercel Storage page) → **SQL Editor** → **New query**, paste all of `supabase/schema.sql` and press **Run**. Running it again later is safe.
3. **Allow sign-in links back to the site.** Supabase → **Authentication** → **URL Configuration**: set Site URL to `https://pharmacovigilance-info.vercel.app`, and add `https://pharmacovigilance-info.vercel.app/**` and `https://pharmacovigilance-*.vercel.app/**` (preview deployments) under Redirect URLs.
4. **Email for colleagues.** Supabase's built-in email only sends a few messages an hour, and only to members of your Supabase organisation. Before inviting colleagues, add your own SMTP under **Authentication** → **Emails** → **SMTP Settings** (Resend, SendGrid, Postmark or your company's mail server; Resend's free tier is plenty).
5. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy). The build log shows `database: sign-in and team features on` and `database: archived N updates`.

Only the project URL and the public anon key reach the browser (`public/config.json`, written by the build). The service key is used only during the build to write the archive. Row-level security does the rest: anyone can read the archive, each reader sees only their own workspace, and team data only its members.

## Admin console

`admin.html` is one signed-in page for app admins (the emails in `research_admins`). It replaces editing repo files or running SQL for day-to-day admin work:

- **Company list approval:** one button approves the current version of `companies/manifest.json`, with your name and today's date. A new manifest version needs a fresh approval. Withdrawing puts the draft notice back.
- **Companies:** add a company, edit its names, matching phrases or holder prefixes, hide it, and undo any change. Signed-in readers can ask for a company from the bottom of the Companies page, and the requests wait here to be added or declined.
- **Site menu:** reorder the menu and hide pages from it for every visitor (a hidden page still opens from a direct link; Updates and Sign in always stay). Choose who sees the data status line under the menu: admins only (the default) or everyone. Saved in `site_settings`; each build writes them to `public/data/site.json`, which `public/nav.js` applies.
- **Admins:** add or remove admins by email (you cannot remove yourself).
- **Data sources and research review:** failing regulator, research and registry sources with a link to [Data sources](#data-sources), and the research review backlog with a link to the queue.
- **Publish now and activity:** rebuild the site at once instead of waiting for the hourly run, and see a log of every admin change.

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
- **Matching:** each hourly build matches updates and research papers to companies (`scripts/company-match.mjs`) in four lanes: direct (authorisation number, or a brand the company holds), substance, drug class (indirect) and company news (off by default). Every match stores its reason, and the rules version. A brand held by different companies in different markets is not matched unless the company is named. Results go to `public/data/companies/`, and each update gets a `co` list for the Updates page's "Related companies" line.
- **Following:** followed companies are kept in this browser's localStorage (`pv-companies`) and show in My Briefing.

Offline check: `node scripts/registry.mjs --fixtures test/fixtures/companies` (synthetic medicines; regenerate them with `python3 test/fixtures/companies/make-fixtures.py test/fixtures/companies`).

### Company Explorer runbook

- **Add, fix or hide a company:** use the Companies section of the Admin page. For a lasting change to the base list, edit `companies/manifest.json` (never change or reuse an `id`), run `npm test`, then run the registry workflow so its products are linked.
- **A large holder is not linked:** the Sources section of `companies.html` and `unmapped` in `companies/registry.json` list the biggest unlinked holder names. Add the right prefix to that company's `holders` after checking the holder really belongs to the group.
- **A source fails:** the Data status page shows it under "Company registry sources", and the company pages say products come from the last good copy. Check the download URL in `companies/sources.json`; the parsers find columns by name, so a renamed column is the usual cause.
- **A correction or company request:** both buttons open a public GitHub issue labelled `company-correction` or `company-request`. Signed-in readers can also ask from the "Missing a company?" box, and those requests wait on the Admin page.
- **Never** describe the list as exhaustive or the matches as validated: coverage is as stated on the pages.

## Data sources

`admin-sources.html` (Admin → Data sources) manages every source the hourly build collects, without a code change or a deployment. The registry in Supabase is the build's only list; there is no hard-coded one.

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
