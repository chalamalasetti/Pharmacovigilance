# PV Info

Pharmacovigilance and drug regulatory updates from every major regulator, in one page. Built for drug safety, PV and regulatory affairs teams: safety alerts and signals, recalls, label changes, new guidelines, regulatory and policy changes, inspections and approvals, filterable by region, country and topic.

Modelled on [Just Visual News](https://github.com/chalamalasetti/Justvisualnews): a Node script gathers public feeds into a JSON file, and a static site with no framework renders it.

## How it works

- `public/data/agencies.json` is the directory of 49 countries and international bodies (WHO, UMC, ICH, CIOMS, ICMRA, FDA, EMA, MHRA, PMDA, CDSCO, NMPA, MFDS, Health Canada, TGA, ANVISA, Swissmedic, SAHPRA, SFDA and more): region, agency names and aliases, official site, and a news search query.
- `sources.json` lists the official regulator feeds (FDA MedWatch, drugs, biologics, press releases and recalls; EMA news; MHRA Drug Safety Update, alerts and news; Health Canada recalls and alerts; TGA safety alerts; WHO news) and PV topic searches (safety signals, boxed warnings, PSUR/PBRER, GVP, DHPC, nitrosamines, falsified medicines…).
- `scripts/sources.mjs` adds a Google News search feed for every agency with a `query`, so countries without their own feed are still covered.
- `scripts/aggregate.mjs` fetches everything (8 at a time), keeps news only when it is about medicines, safety or regulation, tags each update with a country, region, agency and topic (`scripts/classify.mjs`), drops duplicates (the official notice wins over news coverage of it), keeps 60 days, and writes `public/data/updates.json` and an RSS feed at `public/feed.xml`. Earlier updates are kept when a feed is down.
- `public/` is the site: `index.html` (search, region, country, topic, source and date filters; key updates of the week; follow countries), `agencies.html` (the directory with links to each regulator) and `about.html`. Filters are in the URL, so any view can be shared or bookmarked.

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

## Adding a country or source

- New agency: add it to `public/data/agencies.json` with its aliases and a `query`. It shows up in the country filter, the directory and the news searches.
- New official feed: add it to `sources.official` in `sources.json` with its `country`, an optional default `category`, and `relevance` (`all` for a pure drug-safety feed, `pv` for a mixed feed such as press releases).
- CI's "Live feed check" step prints which feeds are reachable and how many updates each gave.

Topic and country tags are automatic and can be wrong. PV Info is a reading aid; always confirm details with the official source.
