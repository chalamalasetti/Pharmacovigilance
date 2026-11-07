# Country and portfolio evidence release candidate

## User-facing changes

- Country Explorer connects available source product records, company roles, captured safety updates and on-demand clinical studies.
- Search accepts case differences, flexible word order and spaced FDA application identifiers.
- Portfolio Label Watch imports CSV product lists with explicit match confirmation, source profiles and US approval/label-journey links.
- Private portfolio packages can be exported and restored for source metadata rechecking. Saved packages are unverified inputs; restored products require confirmation again.
- Contributor, local setup and security reporting guidance is included. A general source-code licence remains undecided.

## Scope

Product evidence currently uses available US, EU and Canadian source records. EU centralised records do not establish national availability. Counts are source records and can overlap. Source company roles do not establish global ownership.

Portfolio packages remain in memory until downloaded. No account sync, scheduled watches or label alerts are enabled. A source metadata difference is not a verified label wording change, and a missing record is not proof of withdrawal. Use the US journey for available label version retrieval and comparison.

## Verification and rollout

Check public navigation, country switching, source failures, clinical pagination, portfolio import and restore, export and mobile layouts before promotion. Require passing CI on the final combined revision. Public source reachability and historical coverage require separate verification from synthetic tests.

Navigation registry SQL must be reviewed and applied through the approved database change process if the live menu editor requires the updated page allowlist. Keep private data untouched.

For rollback, retain the preceding production deployment and source revision. Restore the previous deployment if the new public journeys fail; do not delete private workspaces or reverse unrelated database changes as an application rollback.
