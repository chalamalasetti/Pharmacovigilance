# Security reporting

Do not put vulnerabilities, credentials, private company records or personal information in public issues, pull requests or screenshots.

**Status checked November 7, 2026:** GitHub reports private vulnerability reporting disabled. The repository owner needs to enable it in GitHub security settings before this channel can receive reports. No private reporting channel is currently verified.

Once GitHub private vulnerability reporting is enabled, use the repository Security tab and **Report a vulnerability**. Availability must be checked in GitHub; this document does not enable that feature. If it is unavailable, ask the maintainer through a public issue for a private reporting channel without including exploit details or affected private data. No dedicated security mailbox or response-time commitment is currently published here.

A useful private report includes the affected revision, prerequisites, minimal synthetic reproduction, expected access boundary and observed impact. Avoid accessing other users' data, modifying production records or running disruptive scans. This is reporting guidance, not authorization for penetration testing or a promise of legal safe harbor.

Only deploy revisions that have been reviewed for the intended environment. Keep server credentials outside public files and logs. Browser-visible public configuration must never contain a service-role key. Source access, authentication and tenant isolation failures require explicit review; hiding a control is not access enforcement.

PV Info supports information and training workflows under its published limitations. This policy does not establish regulatory validation or production safety-processing suitability.


## Repository checks and browser protections

Run `npm run security:audit` and `npm test` before release. The PowerPoint dependency chain pins image-size 2.1.0 through a scoped override; exporter regression tests must pass when changing it. A clean advisory scan is not proof that no vulnerabilities exist.

Global Vercel headers deny framing and object embeds, prevent MIME sniffing, set referrer and permission policies, and enforce a script policy using exact hashes for existing inline scripts. Run `npm run security:headers` after changing inline HTML scripts, then review the diff and run the header tests. Arbitrary inline scripts and JavaScript eval are not allowed; WebAssembly is allowed for existing local tooling. Styles allow inline styling for current UI controls, and HTTPS connections remain broadly allowed for source retrieval. These compatibility allowances should be narrowed as dependencies and connectors are consolidated.

The local app server mirrors the global response headers for verification. Protected session flows, database row-level policies, actual production headers and private vulnerability-reporting availability still require separate environment checks. No security certification is asserted.
