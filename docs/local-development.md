# Local development

## Requirements

Use Node.js 22.13 or newer and npm. The repository is an ES-module application with static pages in `public/`, API handlers in `api/`, collection jobs in `scripts/` and tests in `test/`.

```sh
npm ci
npm run dev
```

Open `http://localhost:4330/`. The development command uses `--no-open --no-refresh`: it does not collect feeds automatically or require production credentials. Stop it with Ctrl+C. The default host is loopback. Do not expose a development server to the public internet.

## What works without connected services

Static pages, navigation, pure browser tools and code tests can run without Supabase. Some generated public snapshots are intentionally not tracked. A fresh checkout may therefore show unavailable or empty source states. That is not a populated product demonstration. Authentication, private synced workflows and administration require separately configured services.

Tests include synthetic clinical, product and workflow fixtures and injectable source readers. Run these before relying on live sources:

```sh
node --test test/country-explorer.test.mjs test/country-clinical.test.mjs test/country-trials.test.mjs
npm test
```

Some tests exercise local HTTP servers or external-source behavior and can fail in restricted execution environments. Report the failing test and error; do not disable validation to hide a failure.

## Data and configuration

Do not copy production secrets or private workspaces into a development checkout. Use a separate service instance when testing authenticated behavior. Read the repository's service and runtime-data documentation before provisioning services or applying SQL. Never run production migrations for a local UI change.

`npm run build` performs collection and generation as well as asset preparation. It can contact upstream services and change generated data; it is not an offline build. Review `package.json` before invoking individual collectors. Keep large evidence datasets outside routine deployment bundles.

Verified bulk product retrieval uses WebCrypto and checksums. Plain HTTP on a remote preview host may lack a secure browser context, so verified product lookup can report unavailable there. Do not weaken integrity checks. Live clinical and FDA APIs also require reachable official sources; preserve failure states and test source-independent logic with synthetic fixtures.

## Add a screen

Register routes in `public/navigation.js`, update the local SQL registry generator where necessary, add user-guide coverage and page metadata, and run the related navigation and SEO tests. Generated SQL is a review artifact, not authorization to apply it to a live database.

Use [CONTRIBUTING.md](../CONTRIBUTING.md) for evidence, privacy and review expectations. A general source-code licence is still pending; public visibility alone does not grant open-source reuse rights.
