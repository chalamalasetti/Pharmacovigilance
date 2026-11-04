# Troubleshooting and safe support

Resolve common reading, account, workflow and refresh problems without losing evidence or exposing private data.

## Find the likely cause
| Symptom | Check and next step |
| --- | --- |
| No updates/research | Clear filters, widen the date window and reload. Empty loaded results do not prove no publications exist. |
| Ingredient name or manufacturer is missing | Try the source spelling or supported reviewed synonym in Substance Explorer. Salts/esters remain separate. Applicant/authorization-holder datasets do not establish manufacturers. |
| Label change is missing or index-only | Clear filters and inspect coverage. FDA discovery/detail capture is bounded; EMA recommendations require original wording review. Missing capture does not prove no change. |
| Label assessment asks for sign-in | Refresh the page once after an app update and confirm the current account/approval state. Same-account session reconfirmations should preserve an assessment draft; do not request repeated email links merely to work around an old page. |
| Label assessment cannot open | Confirm current portfolio products/markets, source review, a sufficient rationale and authorized privacy scope. If the pinned version is not published yet, retry after refresh; do not bypass evidence pinning. |
| Topic timeline has no matches | Reset type/source/date filters and inspect available collections. Negative/background mentions may match phrases; absent matches do not prove absent risk. |
| Some topic collections are unavailable | Reload later. Available evidence remains usable, but results are incomplete; this is not a complete all-source search. |
| A company/product/study is missing | Inspect Sources & coverage and mapping/collection status. Use the organizational company request route if appropriate. |
| Portfolio changed | Reconfirm products/markets in Company Briefing before a new assessment. Existing case snapshots remain pinned. |
| Pending after sign-in | Open Approval status & messages. Public browsing remains available; personal/team saves wait for approval. |
| Approved but still restricted | Sign out and sign in once to refresh access. Read any explicit account error. |
| Password or email link fails | Use the correct user-ID/password flow. For existing email users, use the newest link; do not repeatedly request emails during a rate limit. |
| Forgot password | Use the recovery-key route. If both credentials are lost, request administrator assistance; it does not automatically reset the account. |
| Admin cannot see a new signup | Reload Accounts & access requests and inspect Signup approvals, not only the legacy private-request section. |
| Cannot see Admin | Confirm the intended approved administrator account. A professional role or a hidden menu change cannot grant admin rights. |
| Source is not captured or partial | Inspect the official URL and capture/extraction status. An administrator may need to correct the official document URL or review unsupported/scanned content manually. |
| Baseline Review has no drafts | Select the intended archived capture, inspect candidate dispositions and coverage warnings. Accepted/rejected candidates may not be redrafted automatically. |
| Stable ID already exists | Revise that existing obligation in Requirements Library; do not invent a parallel ID to bypass the check. |
| Regulatory assessment is locked | Complete authorized human source-change triage first, then confirm the company scope. |
| Save conflicts with another revision | Preserve unsaved text, reload current state, compare and retry intentionally. |
| Closure control is missing | Check applicability, action/completion state, draft reviews, active scope and whether you are the designated owner/reviewer. |
| Evidence link rejected | Use a stable HTTPS document link without credentials, personal identifiers or expiring token/signature parameters. |
| Team work seems missing | Select the correct team and confirm membership. Personal, local and team records are separate. |
| Calendar time looks wrong | Check the chosen display zone and whether the event actually has a verified time or only a date. Recheck the official event. |
| Refresh collects sources but publication fails | Check the failed workflow phase. Temporary staging requests retry automatically; an exhausted retry leaves the previous complete snapshot live. Logs identify a public file/part and HTTP status. A successful feed-collection step alone is not a published refresh. |
| Refresh queued but no change | Allow the next scheduler check and possible GitHub delay. Admins should inspect collection and publication outcomes separately. No new upstream item may exist. |
| New data run but old page | Reload. Check Published rather than Staged/requested; a runtime outage can fall back to built data. |

## Protect unsaved and local work
Before clearing site data, switching browsers or reinstalling anything, export supported browser workspace data if it matters. Clearing local storage can remove local profiles, cases and preferences. A sign-out is not the same as an export or a backup. Keep private exports in approved storage and verify their scope/content.

## What to include in a support report
Provide the page name, time/time zone, public source URL or non-sensitive record ID, the action you attempted, the exact non-secret error and whether the problem affects public, personal or team work. A screenshot should be redacted before posting if it shows owner emails, private company decisions or internal evidence URLs.

Do not include passwords, recovery keys/codes, temporary credentials, session tokens, database/API secrets, full deploy-hook URLs, patient details or confidential exports. Use a public GitHub issue only for non-confidential reproducible app problems; do not use it as an identity-verification or password-reset channel.

## Know the current boundaries
This app is not a replacement for original regulator publications, a complete global legal repository, a patient case intake system, a general AI legal adviser, a full validated safety database, or an automatically compliant electronic-signature system. No paid GPT API is required for the current rule/parser-based extraction workflow. A future AI suggestion would still need separate labeling and human review.

Feature presence is not the same as validated intended use, universal source coverage, independent approval or guaranteed notification. Use the actual status and evidence shown for each record and your organization's approved procedures.
