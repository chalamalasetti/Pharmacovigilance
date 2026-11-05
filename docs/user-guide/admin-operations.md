# Admin: refresh, navigation and publishing

Operate data refresh independently of app releases, inspect failures and manage menus.

## Open Data Refresh Center
From Admin choose Open refresh controls, or open [Data Refresh Center](https://www.pvinfo.org/admin-refresh.html). It shows Updates & research, Products & markets and Clinical portfolios, with scheduler check/attempt/success/next-due information and recent run outcomes. Reload status requests current state.

## Set a frequency or request a run
1. Choose a supported Refresh frequency for a pipeline and Save schedule. Updates defaults to twice daily (every 12 hours) and also supports hourly; other supported choices include daily/weekly and Paused as offered.
2. Use Queue refresh to request fresh work at the next scheduler check.
3. For unfinished clinical work, Resume unfinished requests continuation where supported.
4. Use Open GitHub workflow when a maintainer needs to run the workflow immediately with Force. A public app administrator is not automatically authorized to manage the GitHub repository.
5. Read collection outcome and publication state separately.

The updates scheduler checks hourly at minute 23; it collects only when the saved interval is due or work is queued. Other pipelines keep their own checks. GitHub can delay runs. The twice-daily setting is an interval target, not a guaranteed fixed clock time. Pausing stops scheduled eligibility and clears queued work; it does not cancel an already active run. An authorized forced manual run can still execute when paused. Schedule edits use revision checks; a conflict requires reload before saving again.

## Interpret run states
| State or indicator | Meaning |
| --- | --- |
| Queued | Work was requested but has not necessarily started. |
| Running | An active leased run is collecting/publishing. A missing heartbeat needs investigation. |
| Success | The reported collection completed successfully according to that pipeline's checks. |
| Partial | Some source/company work is incomplete; read failure counts and last-success evidence. |
| Failed/interrupted | The run did not complete normally. Earlier published data should remain available under its existing freshness rules. |
| Staged | Product/clinical results are in a non-deploying cache; the updates publisher still needs to publish a complete public snapshot. |
| Published | The public snapshot transaction committed. It does not prove every upstream source succeeded. |
| Legacy publication requested | An older run requested a deploy hook; it is not evidence of the new data-only commit. |

## Publish data without deploying the app
Admin's Refresh published data queues the updates publisher. Product and clinical completions stage their caches and normally queue that publisher when the updates schedule is not paused. Pages read the latest complete generated snapshot; a visitor may need to reload to see a newly published one.

Application code still deploys through the normal main-branch Vercel release. Data jobs no longer need the old Vercel deploy hook or a product-data push to main. The owner reported disabling the old cron-job.org hook job. The built-in GitHub cron supplies automatic data refresh without requiring that external account. Do not reintroduce a duplicate hourly app deployment to fix a source failure.

To verify separation: note the active Vercel deployment, run/queue a data refresh, confirm Published and working public pages/RSS, then confirm no new deployment was created by that data run. No new source item is required for this check; sources may legitimately have nothing new.

## Generated-cache retention
The implemented runtime cache keeps three completed snapshots. Abandoned uploads from a prior lease are cleaned when the next authorized publication starts; stale staging is also bounded by publication cleanup. This policy affects generated public caches only. Source originals/versions, baseline history, private company work and audit records are outside that cleanup.

Vercel deployment retention is a separate account/project setting. Repository code does not prove that setting changed. The recommended operational policy discussed for this project is seven days for eligible previews/errors/canceled builds and fourteen days for eligible production builds, keeping active production and platform-protected rollback versions. A maintainer must inspect available plan options and verify the actual saved policy; do not claim it is applied solely from this guide.

## Site menus
In Admin, use Site Menu/menu editor to rename groups, move/reorder pages and hide optional items. Save the menu after checking desktop and mobile labels. Keep every registered page assigned to a group; hide it instead of deleting it. Updates stays visible. The User Guide is under Resources by default and can be moved like other registered pages.

Existing saved menu layouts may receive newly registered pages in their default group until the administrator saves a new arrangement. Menu visibility does not grant/revoke server authorization. On a concurrent-save warning, reload rather than overwriting another administrator's changes.

## Diagnostics and release operations
[Data status](https://www.pvinfo.org/status.html) is an admin diagnostic screen; ordinary users should not receive feed-health UI on the homepage. Inspect failed sources separately from application deployment logs. GitHub run logs explain collector failures; Vercel deployment/build logs explain an application build failure. Never paste tokens, full deploy-hook URLs or private credentials into a public issue.

A code deployment rollback does not automatically roll back runtime data or database schema. Use a controlled, evidence-based recovery plan rather than deleting source history or editing published snapshots by hand.

Published data status pins the managed refresh interval. With a 12-hour interval, stale-data alerts begin after 18 hours; persistent official-source failures use a 24-hour threshold. The admin heartbeat warning also follows the configured cadence. These checks use data collection/publication, not app deployment time. Source failures remain visible and do not silently disable a source.
