# Security reporting

Do not put vulnerabilities, credentials, private company records or personal information in public issues, pull requests or screenshots.

If GitHub private vulnerability reporting is enabled, use the repository Security tab and **Report a vulnerability**. Availability must be checked in GitHub; this document does not enable that feature. If it is unavailable, ask the maintainer through a public issue for a private reporting channel without including exploit details or affected private data. No dedicated security mailbox or response-time commitment is currently published here.

A useful private report includes the affected revision, prerequisites, minimal synthetic reproduction, expected access boundary and observed impact. Avoid accessing other users' data, modifying production records or running disruptive scans. This is reporting guidance, not authorization for penetration testing or a promise of legal safe harbor.

Only deploy revisions that have been reviewed for the intended environment. Keep server credentials outside public files and logs. Browser-visible public configuration must never contain a service-role key. Source access, authentication and tenant isolation failures require explicit review; hiding a control is not access enforcement.

PV Info supports information and training workflows under its published limitations. This policy does not establish regulatory validation or production safety-processing suitability.
