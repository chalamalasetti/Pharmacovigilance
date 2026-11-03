# Label Change Intelligence — release review

## Proposed release

A public Explore → Label Intelligence workspace provides FDA source-marked safety-label changes, EMA recommendation index entries, source history and a human-confirmed company assessment handoff. Label matches appear in Company Change Inbox; Action Center links and exports retain the pinned evidence. The homepage layout is unchanged.

The bootstrap contains 62 captured FDA entries and 40 EMA recommendation index entries. Coverage is partial and explicitly stated. The release does not reconstruct previous label wording, infer implementation deadlines or automatically approve applicability. FDA annotations and earlier-label links are evidence for manual comparison, not a generated complete consecutive-label diff. Full EMA wording extraction and automated consecutive-label PDF comparison remain future work.

## Production migration requiring approval

`supabase/migrations/20261103213535_label_change_intelligence.sql`

The migration adds a public, append-only regulatory evidence table and worker-only ingestion, plus an authenticated, human-confirmed handoff into the existing private company case engine. It restricts the generic case path from impersonating the new specialized handoff. Anonymous and pending users can browse evidence but cannot create label assessments.

It also extends the existing navigation validator and bounded public runtime file whitelist for the new module. Existing runtime lease validation, file limits, atomic publication and staging cleanup are retained. The DELETE statement inside the replaced runtime function is pre-existing abandoned-generated-snapshot cleanup; the migration does not invoke it, remove published evidence or delete company/user records. Normal subsequent runtime publication continues to use that existing cleanup behavior.

Automatic approval review rejected applying this production migration because it adds privileged functions and replaces navigation/runtime functions containing cleanup. No production migration was applied and this release must not merge into main until the database migration is approved, applied and verified. Existing hourly production refresh remains on the current release.

## Verification

- Node tests: 264 passed before final browser verification.
- Browser scenarios: source highlights, recommendation distinction, human source confirmation, product matching, exact evidence fingerprint handoff, 390/320px layouts and safe search; run through GitHub CI.
- Existing application browser journeys remain part of the CI gate.
- Synthetic SQL assertions are in `test/label-change-intelligence.sql`; they roll back all test data and must be executed after the approved migration. They have not been executed against production.

## Release after approval

1. Apply the migration and run the rollback SQL scenarios plus existing runtime/navigation regression checks.
2. Check that anonymous and pending accounts cannot write evidence or create assessments, and that private/team case scope is retained.
3. Merge only after CI and database verification pass.
4. Verify Vercel deployment and the public evidence screen.
5. Queue the existing updates data pipeline without changing its configured frequency. Confirm immutable evidence archive synchronization and one approved-account company handoff before declaring production complete.
