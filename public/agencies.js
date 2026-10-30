import { flag, REGIONS } from "./lib.js";

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k === "class" ? "class" : k, v);
  n.append(...kids.filter(Boolean));
  return n;
};

const agencies = await (await fetch("data/agencies.json")).json();
let counts = new Map();
try {
  const data = await (await fetch("data/updates.json", { cache: "no-cache" })).json();
  counts = new Map(data.countries.map((c) => [c.code, c.count]));
} catch {}

document.getElementById("regions").replaceChildren(
  ...REGIONS.map((region) =>
    el(
      "section",
      { class: "region" },
      el("h2", {}, region),
      el(
        "div",
        { class: "agency-grid" },
        ...agencies
          .filter((c) => c.region === region)
          .flatMap((c) =>
            c.agencies.map((a) =>
              el(
                "article",
                { class: "agency" },
                el("h3", {}, `${flag(c.code)} ${a.abbr}`),
                el("p", {}, `${a.name}${c.code === "INT" ? "" : ` · ${c.country}`}`),
                el(
                  "div",
                  { class: "links" },
                  el("a", { href: a.url, target: "_blank", rel: "noopener" }, "Official site"),
                  el("a", { href: `./?country=${c.code}` }, `Updates${counts.get(c.code) ? ` (${counts.get(c.code)})` : ""}`),
                ),
              ),
            ),
          ),
      ),
    ),
  ),
);
