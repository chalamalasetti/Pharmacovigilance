# PV Info

Pharmacovigilance and drug regulatory updates from every major regulator, in one page. Built for drug safety, PV and regulatory affairs teams: safety alerts and signals, recalls, label changes, new guidelines, regulatory and policy changes, inspections and approvals, filterable by region, country and topic.

Modelled on [Just Visual News](https://github.com/chalamalasetti/Justvisualnews): a Node script gathers public feeds into a JSON file, and a static site with no framework renders it.

## How it works

- `public/data/agencies.json` is the directory of 49 countries and international bodies (WHO, UMC, ICH, CIOMS, ICMRA, FDA, EMA, MHRA, PMDA, CDSCO, NMPA, MFDS, Health Canada, TGA, ANVISA, Swissmedic, SAHPRA, SFDA and more): region, agency names and aliases, official site, and a news search query.
- `sources.json` lists the official regulator feeds (FDA MedWatch, drugs, biologics, press releases and recalls; EMA news; MHRA Drug Safety Update, alerts and news; Health Canada recalls and alerts; TGA safety alerts; WHO news) and PV topic searches (safety signals, boxed warnings, PSUR/PBRER, GVP, DHPC, nitrosamines, falsified medicines…).
- `scripts/sources.mjs` adds a Google News search feed for every agency with a `query`, so countries without their own feed are still covered.
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

## Adding a country or source

- New agency: add it to `public/data/agencies.json` with its aliases and a `query`. It shows up in the country filter, the directory and the news searches.
- New official feed: add it to `sources.official` in `sources.json` with its `country`, an optional default `category`, and `relevance` (`all` for a pure drug-safety feed, `pv` for a mixed feed such as press releases).
- CI's "Live feed check" step prints which feeds are reachable and how many updates each gave.

Topic and country tags are automatic and can be wrong. PV Info is a reading aid; always confirm details with the official source.
