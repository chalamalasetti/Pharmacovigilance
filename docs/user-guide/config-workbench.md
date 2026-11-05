# Safety Configuration Workbench

## Purpose and access

Open **My Briefing → Configuration Workbench**. An approved account is required for private configuration work. Choose your private account or a team you belong to. Public visitors and pending accounts can continue using public source documents and requirements.

This module creates configuration specifications. It does not connect to, execute, validate or deploy your safety system. Generated scenarios are draft prompts, not executed tests or an approved test protocol. No paid AI API is required.

## Start with your environment

Create a workspace. Enter a title, system, installed release, environment label, company and comma-separated markets. Capture enabled modules, customizations and dependencies using organizational details only. Do not enter passwords, credentials, patient data or contact information.

Choose Oracle Argus Safety, Veeva Safety, ARISg or another system. Argus and Veeva have vendor-linked field prompts. These are not verified adapters for your installed release. ARISg and other systems produce common specifications until release-specific mappings are verified.

A saved assessment includes its environment profile; create another workspace for another environment or change. There is no separate shared profile registry in this release.

## Capture current rules

Use **Current Rules** to add rules manually, or download the CSV template. Remove its example row and preserve the column headings. Imports support up to 200 rules and 300 KB, one physical line per rule. Quoted commas and double quotes are supported; multiline fields are not. The import replaces the unsaved baseline after confirmation. Save a revision to retain it.

Use unique rule identifiers. Capture jurisdiction, license scope, destination, clock start, timeframe, calendar/business days, format, conditions, scheduling and overlap handling. These are entered facts, not regulator-supplied defaults.

Mark the baseline incomplete until you have checked it for this assessment scope. Choose new scope only when no previous configuration exists for the proposed scope. Missing data is not evidence of a missing regulatory control.

## Link evidence and propose a change

Open a requirement in Requirements Library and choose **Draft safety-system configuration impact**, or open an Action Center case and choose **Assess safety-system configuration impact**. You can also choose a captured requirement inside the workbench or enter a source manually.

Pin the source title, URL, edition, section/page/article and exact supporting passage. The original requirement version ID is retained when selected. Captured requirement interpretations are shown separately; copy the exact supporting passage from the original source. Changing the source title, URL or edition clears the prior requirement pin; editing its quotation or date requires renewed source verification. Check the primary source, scope, exceptions and dates yourself. Effective dates may remain unknown; document uncertainty in the applicability rationale. A captured pending requirement remains unapproved.

Record relevant, not relevant or more information needed with a rationale. Choose expedited reporting, transmission/E2B mapping, masking/data controls, periodic reporting or workflow/SOP. For reporting changes, select the affected baseline rule, then adjust proposed values. Other areas use current-control and proposed-change descriptions. Add implementation dependencies and rollback instructions.

## Generate and review

Generate a draft under **Generate & Compare**. Review the gaps, before/after values, business/system/data/process requirements and synthetic test prompts. No legal deadlines or agency rule defaults are inferred. The gap list covers only the selected source and entered configuration.

Save a draft revision before export or submission. Saved revisions contain both the inputs and generated output. Every save or decision adds a timestamped immutable revision snapshot with account-ID attribution and reason. Concurrent updates are rejected; reload and compare before trying again. Switching workspaces, scope or reloading asks before discarding unsaved edits.

Submitting requires primary-source verification, relevant applicability, a confirmed baseline or declared new scope, required proposal fields and implementation instructions. A different team owner must approve a submitted team package; the creator and last editor cannot approve it. Private personal packages cannot be self-approved. Use your organization's independent change control after export or create the assessment in an appropriate team from the start.

Return an in-review or approved package to draft with a reason before editing. Previous snapshots remain available in revision history. Workbench approval approves the configuration specification only, not implementation or GxP validation.

## Implement and close

**Send to Action Center** creates an assessment in the same privacy scope and links the saved configuration revision. Enter a reason. Company, comma-separated markets and a source URL are required. Repeating handoff without changing the specification returns the existing case. Saving changed configuration enables a new handoff; previous cases remain unchanged.

In Action Center, review applicability, assign implementation, capture evidence and obtain closure verification using the existing workflow. Open the pinned configuration revision from the case evidence. If the workbench has changed, inspect the exact historical snapshot referenced by the case.

Export downloads a private JSON specification with inputs, output, state and revision. It is not an Argus or other vendor import file. The comparison CSV includes revision/source metadata, before/after values and draft test prompts; spreadsheet-formula prefixes are escaped. Print produces a saved review package. Share exported organizational configuration only with authorized recipients.

## E2B mapping handoff

Open the [E2B Studio](e2b-studio.md), save a private system mapping and choose Draft configuration change. The workbench retains the exact capture, field hash and mapping revision. Review the full source because the quoted passage can be partial. System mapping confirmation does not approve regulatory applicability or implementation.

## Troubleshooting and limits

If the database or revision history cannot load, retry rather than recreating saved work. A sign-out or account change clears private data from the screen; ordinary token refresh retains unsaved work. Workspaces are limited to 200 per selected scope in this view; older histories show the latest 100 revisions.

No automatic source monitoring-to-rule mapping, live rule execution, bulk agency-rule generation, spreadsheet test-result execution or production-system integration is included. Company applicability, vendor-version behavior and exact expected test results require human assessment. Unknown configuration and customizations remain explicit.

E2B Studio handoffs can include a structured configuration design: module, scope, proposed requiredness, missing-data policy, acceptance criteria, schema provenance and linked E2B source records. Inspect **Pinned E2B configuration design** in Evidence. Its complete structure is retained in exports; the implementation text is only a bounded summary. Changing the source title, URL or edition removes this source-specific design and its old pin.
