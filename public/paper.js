// One paper's detail page (paper.html?id=…): research question, approach, findings
// and limitations quoted from the abstract, then the app's own reading of business
// and technical relevance, clearly labelled. Section order follows the reader's lens.

import * as R from "./research-lib.js";

const $ = (id) => document.getElementById(id);
const watch = R.startVisit(R.loadWatch());
R.saveWatch(watch);
const persist = () => R.saveWatch(watch);

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.flat().filter((k) => k != null && k !== false));
  return n;
};

const NOT_REPORTED = "Not reported in the available source.";

const quote = (s) =>
  el("blockquote", { class: "r-quote" }, s.text, el("cite", {}, `Abstract${s.label ? ` · ${s.label}` : ""} · sentence ${s.ref}`));

const quotesOf = (list) => (list?.length ? list.map(quote) : [el("p", { class: "none" }, NOT_REPORTED)]);

const interp = () => el("span", { class: "pot" }, "app interpretation");

const withdrawn = () => [el("p", { class: "none" }, "Withdrawn after editorial review: the automated extraction did not reflect the paper well. Read the original publication.")];

function sections(p, tax) {
  const quotes = p.summaryWithdrawn ? withdrawn : quotesOf;
  const apps = p.tags.applications.map((t) => tax.applications.find((a) => a.id === t.id)).filter(Boolean);
  const methods = p.tags.methods.map((t) => tax.methods.find((m) => m.id === t.id)).filter(Boolean);
  const none = el("p", { class: "none" }, "No PV process was recognised in this paper, so there is no automated reading.");
  return {
    question: ["Research question", "What problem did the study investigate?", quotes(p.sections.question)],
    approach: ["Approach", "Method, data and comparison", quotes(p.sections.approach)],
    findings: [
      "Key findings",
      "Results as the authors report them, with their numbers and context",
      [...quotes(p.sections.findings), ...(p.sections.conclusion ? [el("h4", {}, "Authors' conclusion"), ...quotes(p.sections.conclusion)] : [])],
    ],
    limitations: ["Limitations", "Dataset, design, generalisability and other stated constraints", quotes(p.sections.limitations)],
    business: ["Business relevance", "Potential implications for PV operations", apps.length ? el("ul", { class: "imp-list" }, apps.map((a) => el("li", {}, el("strong", {}, `${a.label}: `), a.business))) : none, true],
    technical: [
      "Technical relevance",
      "Potential implications for systems, data, integration and evaluation",
      apps.length || methods.length ? el("ul", { class: "imp-list" }, [...apps.map((a) => el("li", {}, el("strong", {}, `${a.label}: `), a.technical)), ...methods.map((m) => el("li", {}, el("strong", {}, `${m.label}: `), m.technical))]) : none,
      true,
    ],
    explore: [
      "What to explore next",
      "Questions worth asking before relying on this work",
      el("ul", { class: "imp-list" }, [
        ...apps.flatMap((a) => a.explore).slice(0, 4).map((q) => el("li", {}, q)),
        p.type === "preprint" ? el("li", {}, "Has a peer-reviewed version been published since?") : null,
        !p.sections.limitations ? el("li", {}, "What limitations does the full paper report? None are stated in the abstract.") : null,
        el("li", {}, "Would the reported results hold on your own data and processes?"),
      ]),
      true,
    ],
  };
}

function render(p, data) {
  document.title = `${p.title} · PV Info Research`;
  const byId = new Map(data.papers.map((x) => [x.id, x]));
  const lens = R.LENSES.find((l) => l.id === watch.lens) ?? R.LENSES[1];
  const secs = sections(p, data.taxonomy);
  const saved = Boolean(watch.saved[p.id]);
  const link = R.primaryLink(p);

  const lensPicker = el(
    "div",
    { class: "seg r-lens", role: "group", "aria-label": "Reading lens" },
    R.LENSES.map((l) => el("button", { type: "button", "aria-pressed": String(l.id === lens.id), onclick: () => ((watch.lens = l.id), persist(), render(p, data)) }, l.label)),
  );

  const status = (p.status ?? []).map((s) =>
    el("p", { class: `r-alert s-${s.type}` }, s.type === "retracted" ? "⚠ This paper has been retracted. Do not rely on its findings." : s.type === "concern" ? "⚠ An expression of concern has been published about this paper." : "A correction to this paper has been published; check the original for the corrected text."),
  );

  const note = el("textarea", { rows: "3", placeholder: "Your notes (kept in this browser)" });
  note.value = watch.saved[p.id]?.note ?? "";
  note.addEventListener("change", () => (R.setNote(watch, p, note.value), persist()));

  const copied = el("span", { class: "hint", "aria-live": "polite" });
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      copied.textContent = `${what} copied.`;
    } catch {
      prompt(`Copy the ${what.toLowerCase()}:`, text);
    }
  };

  const family = (p.family ?? []).map((f) => byId.get(f.id) && el("li", {}, `${f.relation === "preprint" ? "Preprint version" : "Published version"}: `, el("a", { href: `paper.html?id=${f.id}` }, byId.get(f.id).title), el("span", { class: "why" }, ` (linked by ${f.how})`)));
  const related = (p.related ?? []).map((id) => byId.get(id)).filter(Boolean);

  const parts = [
    el("p", {}, el("a", { href: "research.html", class: "link" }, "← Research & Innovation")),
    ...status,
    el(
      "div",
      { class: "meta" },
      el("span", { class: `r-type t-${p.type}` }, R.typeLabel(p.type)),
      el("span", { class: p.peerReview === "preprint" ? "badge warnb" : "badge" }, R.reviewLabel(p)),
      p.openAccess ? el("span", { class: "badge" }, `Open access${p.license ? ` (${p.license.toUpperCase()})` : ""}`) : null,
    ),
    el("h1", {}, p.title),
    el("p", { class: "r-by" }, el("span", {}, ...(p.authors ?? []).flatMap((a, i) => [i ? ", " : "", el("button", { type: "button", class: "r-author", "aria-pressed": String(watch.authors.includes(a)), title: watch.authors.includes(a) ? "Stop following this author" : "Follow this author", onclick: () => (R.toggleAuthor(watch, a), persist(), render(p, data)) }, a)])), p.authorCount > (p.authors ?? []).length ? " et al." : ""),
    el("p", { class: "r-by" }, [p.venue, p.published].filter(Boolean).join(" · ")),
    el(
      "div",
      { class: "imp-actions" },
      el("button", { type: "button", class: "act", "aria-pressed": String(saved), onclick: () => (R.toggleSaved(watch, p), persist(), render(p, data)) }, saved ? "★ Saved" : "☆ Save"),
      link ? el("a", { class: "act primary", href: link, target: "_blank", rel: "noopener" }, "Read the original ↗") : null,
      el("button", { type: "button", class: "act", onclick: () => (navigator.share ? navigator.share({ title: p.title, url: location.href }).catch(() => {}) : copy(location.href, "Link")) }, "Share"),
      el("button", { type: "button", class: "act", onclick: () => copy(R.citation(p), "Citation") }, "Copy citation"),
      el("button", { type: "button", class: "act", onclick: () => download(`${p.id}.ris`, R.ris([p])) }, "Export (RIS)"),
      copied,
    ),
    p.excluded ? el("p", { class: "r-alert" }, "An editor hid this paper from the research list because its link to PV is weak.") : null,
    p.review ? el("p", { class: "r-review" }, reviewSummary(p, data.taxonomy)) : null,
    el("p", { class: "r-basis" }, p.hasAbstract ? "Summary based on abstract. Sentences are quoted from the abstract, not from the full text." : "No abstract in the source record, so the sections below are empty. Read the original publication."),
    el("div", { class: "r-lensrow" }, el("span", { class: "label" }, "Reading lens"), lensPicker),
    ...lens.order.map((id) => {
      const [title, sub, body, isInterp] = secs[id];
      return el("section", { class: `r-sec${isInterp ? " r-interp" : ""}` }, el("h2", {}, title, isInterp ? interp() : null), el("p", { class: "hint" }, sub), body);
    }),
    el(
      "section",
      { class: "r-sec r-interp" },
      el("h2", {}, "Evidence maturity", el("span", { class: "pot" }, p.maturity.reviewed ? "set by an editor" : "automated")),
      el("p", {}, el("strong", { class: `r-mat m-${p.maturity.id}` }, p.maturity.label), " ", p.maturity.reason),
      p.maturity.quote ? quote({ text: p.maturity.quote, ref: p.maturity.ref }) : null,
      el("p", { class: "hint" }, "Maturity describes the evidence the abstract reports. It does not mean regulatory acceptance or that the approach suits your organisation."),
    ),
    el(
      "section",
      { class: "r-sec" },
      el("h2", {}, "Topics"),
      el("div", { class: "imp-chips" }, p.tags.applications.map((t) => el("a", { class: "chip-s place", href: `research.html?app=${t.id}`, title: `Matched: ${t.why.join(", ")}` }, data.taxonomy.applications.find((a) => a.id === t.id)?.label ?? t.id))),
      el("div", { class: "imp-chips" }, p.tags.methods.map((t) => el("a", { class: "chip-s", href: `research.html?method=${t.id}`, title: `Matched: ${t.why.join(", ")}` }, data.taxonomy.methods.find((m) => m.id === t.id)?.label ?? t.id))),
      el("p", { class: "why" }, `PV relevance: mentions ${p.relevance.join(", ")}. Tagged by keyword rules (taxonomy ${p.taxonomy}); hover a topic to see the words that matched.`),
    ),
    family.some(Boolean) ? el("section", { class: "r-sec" }, el("h2", {}, "Other versions"), el("ul", { class: "imp-list" }, family)) : null,
    p.abstract ? el("details", { class: "r-sec" }, el("summary", {}, "Full abstract (open access)"), el("p", {}, p.abstract)) : null,
    el("section", { class: "r-sec" }, el("h2", {}, "My notes"), note, el("p", { class: "hint" }, "Writing a note also saves the paper to your watchlist.")),
    related.length ? el("section", { class: "r-sec" }, el("h2", {}, "Related papers"), el("ul", { class: "imp-list" }, related.map((r) => el("li", {}, el("a", { href: `paper.html?id=${r.id}` }, r.title), el("span", { class: "why" }, ` · ${R.typeLabel(r.type)}, ${r.published ?? "undated"}`)))), el("p", { class: "hint" }, "Related by shared vocabulary, not by citation.")) : null,
    el(
      "section",
      { class: "r-sec r-record" },
      el("h2", {}, "Record"),
      el("dl", { class: "imp-dates" },
        ...Object.entries({ DOI: p.ids?.doi, PMID: p.ids?.pmid, PMCID: p.ids?.pmcid, "Europe PMC": p.ids?.epmc }).filter(([, v]) => v).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]),
        el("dt", {}, "Links"), el("dd", {}, ...Object.entries(p.links ?? {}).flatMap(([k, v], i) => [i ? " · " : "", el("a", { href: v, target: "_blank", rel: "noopener" }, { doi: "Publisher (DOI)", pubmed: "PubMed", pmc: "PubMed Central", europepmc: "Europe PMC", fulltext: "Full text" }[k] ?? k)])),
        el("dt", {}, "Collected"), el("dd", {}, `${p.firstSeen?.slice(0, 10)} from ${p.sources.map((s) => ({ europepmc: "Europe PMC", pubmed: "PubMed" })[s] ?? s).join(" and ")}`),
        el("dt", {}, "Method"), el("dd", {}, `Rule-based extraction (${p.method}), no AI model. Review status: ${R.reviewLine(p).toLowerCase()}.`),
      ),
    ),
  ];
  $("paper").replaceChildren(...parts.filter(Boolean));
}

// What an editor changed, against the automated values.
function reviewSummary(p, tax) {
  const r = p.review;
  const label = (id) => [...tax.applications, ...tax.methods].find((t) => t.id === id)?.label ?? id;
  const parts = [];
  if (r.summary === "approved") parts.push("summary checked against the abstract");
  if (r.summary === "rejected") parts.push("summary withdrawn");
  if (r.tags && p.autoTags) {
    const before = new Set([...p.autoTags.applications, ...p.autoTags.methods].map((t) => t.id));
    const after = new Set([...r.tags.applications, ...r.tags.methods]);
    const added = [...after].filter((id) => !before.has(id)).map(label);
    const removed = [...before].filter((id) => !after.has(id)).map(label);
    if (added.length) parts.push(`added ${added.join(", ")}`);
    if (removed.length) parts.push(`removed ${removed.join(", ")}`);
    if (!added.length && !removed.length) parts.push("topics confirmed");
  }
  if (r.maturity && p.autoMaturity) parts.push(`maturity set to ${p.maturity.label} (was ${p.autoMaturity.label})`);
  if (r.relevance === "ok") parts.push("PV relevance confirmed");
  if (r.versionOf === "none") parts.push("version link removed");
  else if (r.versionOf) parts.push("version link added");
  return `✓ ${R.reviewLine(p)}${parts.length ? `: ${parts.join("; ")}.` : "."}`;
}

function download(name, body) {
  const url = URL.createObjectURL(new Blob([body], { type: "application/x-research-info-systems" }));
  el("a", { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function main() {
  const id = new URLSearchParams(location.search).get("id");
  let data;
  try {
    const res = await fetch("data/research.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    R.applyReviews(data.papers);
  } catch {
    $("lede").textContent = "The research collection couldn't be loaded.";
    return;
  }
  const p = data.papers.find((x) => x.id === id);
  if (!p) {
    const kept = watch.saved[id]?.paper;
    $("lede").replaceChildren(
      "This paper is no longer in the collection.",
      kept ? el("span", {}, " You saved it: ", el("a", { href: R.primaryLink(kept) ?? "#", target: "_blank", rel: "noopener" }, kept.title), ".") : "",
    );
    return;
  }
  render(p, data);
}

main();
