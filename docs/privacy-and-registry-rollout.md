# Email-only privacy guard and managed-registry rollout

## Behavior

- Author names, author strings/counts and affiliations are not extracted into research records. They are removed from old research snapshots even on the six-hour cache path and all-source-failure path.
- Author following/search/export is disabled. Reloading the research watchlist rewrites stored snapshots without author fields. Paper identifiers and source links remain available for citation lookup at the original publisher.
- Title similarity no longer establishes a preprint/journal identity link through author matching. Editors may establish links from publication evidence; otherwise both versions remain visible.
- Accounts do not request display names. Team creation/join does not submit names. Assignment input requires email. The schema revokes direct name updates, ignores legacy member-name inputs and guards future queue assignments server-side.
- Company approval attribution is a generic public role; email attribution remains private.
- Updates have an explicit output-field allowlist. Source emails/recognizable telephone contacts are removed, obvious labeled patient identifiers or street addresses cause the record to be withheld, and unsafe/tracking query fields are removed from article links. The same guard runs before previews, publication and archival; prior feed snapshots are also processed.
- A configured database registry cannot fall back to repository seeds when unavailable or not migrated. It may use the last managed snapshot, including a deliberately empty list. Without either, the build fails and the host retains its last successful deployment. Bootstrap-only, database-free installs can still use the repository seed.

## Important limits

This is an initial guard, not a certification of no PII in arbitrary text. Names without labels, unusual contact formats, names embedded in source URLs, free-text notes and historical database rows require further controls. Do not activate patient-level feeds, individual case narratives or bulk case-report ingestion. Source content exists transiently in memory for parsing; these changes limit retained and published fields, not the bytes served by external sources. Automated text screening cannot guarantee every personal name is detected. Complete strict enforcement requires reviewed, narrowly scoped adapters or approved metadata-only outputs for each source.

This patch does not change infrastructure/proxy logging or existing analytics providers. Their settings and retention need a separate operational review. Accounts still use email and authentication IDs. No patient-level data feature is authorized.

## Deployment sequence

1. Review the branch and deploy to a preview environment with production collection disabled.
2. Apply the updated `supabase/schema.sql` to a test database first; then apply it to production through the normal migration process. No live database was changed by preparing this patch.
3. Test email sign-in, creation/join of a team, email assignments, rejection of name-only assignments, and direct attempts to update `team_members.name`.
4. Review existing personal display names, old author search queries, private assignments/notes, auth metadata and public approval attribution. Arrange a scoped cleanup/export-retention decision; this patch does not silently delete historical database/audit records. Old name-only assignments require correction to email before later updates will pass the new guard.
5. Rebuild published feeds/research and invalidate older public caches as appropriate. Opening the research page clears legacy author metadata in that browser's research watchlist. Other historical browser exports/caches are outside server control.
6. Confirm one successful collection run and inspect source provenance and preview output. Simulate database failure with a managed paused-source snapshot, then failure of both registry locations. Collection must never switch to the all-active seed.
7. Review the still-public registry settings snapshot separately before adding private endpoints or nonstandard credentials. This patch does not redesign its storage.

## Verification

Run `npm ci --ignore-scripts`, then `npm test` on Node 20+ (CI uses Node 22). `test/privacy.test.mjs` covers policy boundaries, legacy cache rewriting, archive filtering, scientific-number preservation and managed outage cases. Local-host HTTP integration tests may need a network-capable CI environment; do not relax production network protections to make tests pass. SQL changes require a real Supabase/PostgreSQL smoke test; text-based tests are not a substitute.
