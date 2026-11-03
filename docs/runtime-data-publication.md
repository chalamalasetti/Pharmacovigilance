# Data publication without app deployments

Application releases use the existing main-branch Vercel build. Data-only jobs do not push to main or invoke Vercel deploy hooks. The homepage layout and authentication are unchanged.

## Pipeline

1. The updates job claims its existing admin-managed lease using pinned main-branch GitHub OIDC.
2. `/api/data-refresh` supplies current source configuration, public organization settings and published resource rows. Source credential values remain on Vercel; protected feeds are fetched there and only sanitized public items return.
3. The runner restores the last complete generated snapshot, reads the product/clinical cache branches and collects configured updates and research. Existing provider cadence and source failure rules still apply.
4. JSON and RSS are gzip-compressed. A manifest pins paths, compressed SHA-256, sizes and chunk counts. Files are staged privately, then published in one database transaction after all chunks pass integrity checks.
5. Browser data readers load the public current pointer and verify compressed checksums before decompression. RSS uses `/api/runtime-feed`. Static build files remain a fallback. Direct static `/data/*.json` URLs describe the build; clients needing current data should use the runtime reader. A page pins a consistent snapshot until reload.

No visitor session or private company record is included in this cache. No GPT API is required. The service key never leaves Vercel. The existing permanent update archive and admin source run history are synchronized after publication; a synchronization failure is logged separately and does not pretend the public snapshot failed.

## Retention boundaries

- Runtime generated cache: last **three completed snapshots**. Pending snapshots older than **three hours** are removed on the next successful publication. No cleanup occurs when publication fails. Source PDFs, source versions, approved baseline versions, company assessments and audit history are excluded.
- Publication limits: 600 files, 16 MiB compressed per file, 64 MiB compressed per snapshot, 64 MiB decompressed per file. These limits prevent unbounded generated-cache growth. Public base64 storage adds approximately one third to compressed bytes, plus database/WAL overhead; monitor Supabase usage independently.
- Vercel recommended deployment policy: 7 days for previews, errors and canceled deployments; 14 days for eligible production deployments, preserving the active production deployment and platform-protected rollback deployments. This is an account setting, **not applied by `vercel.json` or this document**. Record and verify the actual project policy after changing it. Do not manually purge deployments as part of this release.
- Existing regulatory evidence, user/company work and audit retention are unchanged. Never treat generated-cache retention as a GxP record-retention policy.

## Cutover and recovery

1. Apply `runtime_data_publication` migration; deploy the application code once.
2. Run **Refresh public PV data** with Force. Confirm **Published** in Admin → Data Refresh Center and the current runtime pointer/files. Verify a homepage update and RSS timestamp without another Vercel deployment.
3. Only after that succeeds, disable cron-job.org’s old hourly Vercel deploy-hook request. Its configuration is external to this repository and is not changed by this release. The GitHub schedules remain active. The repository’s `VERCEL_DEPLOY_HOOK` secret is no longer used by these workflows.
4. Admin → **Refresh published data** queues updates; the scheduler checks every 15 minutes. Product and clinical completions queue the same publication unless the updates schedule is paused. A forced manual run can still run a paused pipeline.
5. **Staged** means product/clinical collection awaits a public snapshot; **Published** means the transaction committed. Neither means every upstream source succeeded. Partial runs retain prior data under existing freshness rules.
6. A missing API during the first code deployment can fail a scheduled run; rerun after deployment is Ready. Failed/partial uploads leave the previous pointer intact. Never switch off authorization checks to force a publication.
7. Roll back app code using a retained deployment if needed. Rolling back code does not roll back data; investigate source/manifest evidence before publishing a replacement. Restoring an earlier generated snapshot requires an explicit controlled operation; do not edit published snapshot files.

Verification: Node runtime tests, browser runtime smoke test, and `test/runtime-publication.sql` (all SQL fixtures roll back) cover atomic publication, checksum failures, stale leases, anonymous read/write boundaries and three-snapshot retention.
