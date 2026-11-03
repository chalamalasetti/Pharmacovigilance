# Substance Explorer

Use **Explore → Substances** to find an active ingredient and inspect the products and companies recorded against it. This public browser does not require sign-in or account approval.

## Find an ingredient

1. Enter an ingredient name, for example **paracetamol** or **acetaminophen**.
2. Select a result. A spelling suggestion is a navigation aid; it does not create a new synonym.
3. Narrow the directory by market, source, company role, source status or single/combination product. Use the alphabet buttons or clear filters to start again.

The initial reviewed synonym pilot groups paracetamol and acetaminophen. Other ingredient names, including salts and esters, remain distinct unless a reviewed rule explicitly connects them. Original ingredient strings remain visible on product evidence.

## Review the evidence

The ingredient page has four views:

- **Overview:** identity approach, source-record counts and coverage limitations.
- **Companies:** entities named in the source, their recorded roles and linked product evidence. Optional corporate grouping uses existing curated company mappings; it does not prove legal identity or manufacturing.
- **Products:** source-level product records, ingredient combinations, strengths/forms as supplied, source status and original links. FDA presentation numbers distinguish presentations; EMA authorization records may not supply individual presentations.
- **Sources:** capture dates, source coverage and reviewed naming evidence.

An FDA application holder or EMA marketing authorization holder is **not automatically a manufacturer**. The initial datasets do not establish API manufacturers or manufacturing sites. Selecting the manufacturer filter can return no records; this means manufacturing evidence is unavailable, not that no manufacturers exist. An unmapped holder is still shown even when no curated Company Explorer profile exists.

## Continue company work

Open a linked company profile to inspect its wider portfolio. A briefing link can preselect a company, but you must confirm your own products and markets before private assessment. Browsing an ingredient does not create or alter your private company profile.

## Interpret coverage and freshness

Counts describe records in the captured FDA Orange Book and EMA medicine datasets, not all global products, suppliers or currently marketed stock. Source status does not establish present commercial availability. Refer to the source dates and official record before relying on a relationship.

New product collection feeds the same data-only publication pipeline as other public datasets. Code deployment is independent of data refresh. If collection fails, a prior captured dataset may remain available with its capture date; an unavailable initial dataset shows an explanatory empty state.

Naming rules are versioned editorial configuration in the repository for this release. Changes require reviewed evidence and a code review; there is no automatic fuzzy-name merge or public alias editing. Clinical medicines, global API supplier discovery and substance-specific signal interpretation are outside this initial release.
