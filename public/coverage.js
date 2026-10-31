// Sources we cover (coverage.html): the public list of active sources, from
// data/coverage.json, which the build derives from the data source registry. It has no
// addresses, settings, credentials or collection health.
import { flag } from "./lib.js";
import { CLASSIFICATIONS, SOURCE_TYPES, TOPICS, label } from "./sources-lib.js";

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids.flat().filter((k) => k != null && k !== false));
  return n;
};

const [cov, agencies] = await Promise.all([
  fetch("data/coverage.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  fetch("data/agencies.json").then((r) => r.json()).catch(() => []),
]);
const names = new Map(agencies.map((c) => [c.code, c.country]));
const place = (code) => `${flag(code)} ${names.get(code) ?? code}`;

if (!cov?.sources?.length) {
  $("summary").replaceChildren(el("p", {}, "The list of sources appears after the next refresh."));
} else {
  const regions = [...new Set(cov.sources.flatMap((s) => s.regions))].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b));
  $("summary").replaceChildren(el("p", {}, `${cov.total} sources: `,
    CLASSIFICATIONS.filter((c) => cov.byClassification[c.id]).map((c, i) => `${i ? " · " : ""}${cov.byClassification[c.id]} ${c.label.toLowerCase()}`),
    `, covering ${regions.length} countries and regions directly and the rest through what the news mentions.`));
  for (const c of CLASSIFICATIONS.filter((c) => cov.byClassification[c.id])) $("cls").append(el("option", { value: c.id }, c.label));
  for (const r of regions) $("region").append(el("option", { value: r }, place(r)));
  $("filters").hidden = false;

  const draw = () => {
    const q = $("q").value.trim().toLowerCase();
    const cls = $("cls").value;
    const region = $("region").value;
    const list = cov.sources.filter((s) =>
      (!cls || s.classification === cls) &&
      (!region || s.regions.includes(region)) &&
      (!q || `${s.name} ${s.organization} ${s.regions.map((r) => names.get(r) ?? r).join(" ")}`.toLowerCase().includes(q)));
    $("list").replaceChildren(
      el("div", { class: "st-table-wrap" }, el("table", { class: "st-table cov-table" },
        el("thead", {}, el("tr", {}, ["Source", "Kind", "Covers", "Topics"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, list.length
          ? list.map((s) => el("tr", {},
              el("td", {}, el("b", {}, s.name), s.organization ? el("div", { class: "hint" }, s.organization) : null),
              el("td", {}, label(CLASSIFICATIONS, s.classification), el("div", { class: "hint" }, label(SOURCE_TYPES, s.type))),
              el("td", {}, s.regions.length ? s.regions.map(place).join(", ") : "Worldwide, placed by what each item mentions"),
              el("td", {}, s.topics.map((t) => label(TOPICS, t)).join(", "))))
          : el("tr", {}, el("td", { colspan: "4" }, "No source matches."))))));
  };
  for (const id of ["q", "cls", "region"]) $(id).addEventListener("input", draw);
  draw();
}
