# Synthetic Safety Sandbox

## Open a temporary workspace

Open the sandbox from the Resources page or Configuration Workbench. It runs entirely in page memory. No case data is sent to a server or saved in browser storage. Load the starter cases or create fictional cases manually. Reloading or closing clears working data; downloaded files remain on your device.

## Import synthetic cases

Download the CSV template and retain the exact columns. Use SYN-prefixed fictional identifiers and only synthetic assessment values. Up to 200 cases and 200 KB are supported. No real or anonymized historical data, contact details, DOB or narrative columns are accepted. Imported IDs replace the current case set after confirmation. This is a narrow single-case schema; repeated products/events, detailed study records and full ICSR fields are future work.

## Configure and run rules

Configure current and proposed rules using country, clinical/marketed scope, seriousness, unexpectedness and relatedness. All conditions must match. Any condition can be ignored except country. Unknown case assessments remain indeterminate unless another condition definitively excludes the case. Missing or inconsistent timestamps block evaluation. Gestation zero remains a value and is flagged for review.

Set a simulation time. Deadlines use UTC receipt time plus the configured number of elapsed 24-hour calendar days. Effective dates are applied to receipt time. These demonstration policies are not agency-specific clock implementations. Business days, holidays, other clock-start events, follow-up versions, overlapping rule sets and vendor behavior are not implemented.

## Interpret and export

Compare triggered, not-triggered, indeterminate and blocked results. Expand each result to see matched/excluding conditions, flags and calculated deadlines. Met/missed compares the hypothetical submission time; pending/overdue uses the chosen simulation time. These results do not demonstrate actual reporting compliance.

Download a JSON test package containing inputs, both rules, the simulation time, engine version and results. CSV imports can restore cases; JSON session restoration is not implemented. Close clears the page instance. The sandbox has no real gateway, CIOMS form, E2B XML generator, terminology dictionary or safety-system connector. Those require separate future implementation and validation.
