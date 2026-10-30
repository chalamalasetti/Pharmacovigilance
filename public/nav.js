// Shared header behaviour for every page with the top links: marks the current page,
// folds the links behind a Menu button on small screens, and points the skip link
// at the page's main content, and shows when the data was last refreshed. The links
// themselves are identical on every page.

import { ago, dataHealth } from "./lib.js";

const nav = document.getElementById("site-nav");
const btn = document.querySelector(".menu-btn");

// "/briefing", "/briefing.html" and "/" all resolve; paper and review pages belong to Research.
const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "");
const current = page === "paper" || page === "research-admin" ? "research" : page === "company" ? "companies" : page;
for (const a of nav?.querySelectorAll("a") ?? []) {
  const target = (a.getAttribute("href") === "./" ? "index" : a.getAttribute("href")).replace(/\.html$/, "");
  if (target === current) a.setAttribute("aria-current", "page");
  else a.removeAttribute("aria-current");
}

function setOpen(open) {
  document.body.classList.toggle("menu-open", open);
  btn?.setAttribute("aria-expanded", String(open));
}

btn?.addEventListener("click", () => setOpen(!document.body.classList.contains("menu-open")));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("menu-open")) {
    setOpen(false);
    btn?.focus();
  }
});
document.addEventListener("click", (e) => {
  if (document.body.classList.contains("menu-open") && !e.target.closest(".top")) setOpen(false);
});

const main = document.querySelector("main");
document.querySelector(".skip")?.addEventListener("click", (e) => {
  if (!main) return;
  e.preventDefault();
  main.tabIndex = -1;
  main.focus();
  main.scrollIntoView();
});

// Status strip under the header: when the updates were last refreshed, and a warning when
// a source is down or the hourly refresh has stopped. Links to the Data status page.
async function freshness() {
  const top = document.querySelector(".top");
  if (!top || page === "status") return;
  let status = null;
  try {
    const res = await fetch("data/status.json", { cache: "no-cache" });
    if (res.ok) status = await res.json();
  } catch {}
  if (!status) return;
  const { level, problems } = dataHealth(status);
  const when = new Date(status.updated);
  const strip = document.createElement("div");
  strip.className = `freshness f-${level}`;
  strip.setAttribute("role", "status");
  const text = document.createElement("span");
  text.title = when.toLocaleString();
  const official = problems.filter((p) => p.source).length;
  text.textContent =
    level === "stale"
      ? `⚠ Data may be out of date. Last successful update ${ago(when)}.`
      : `${level === "ok" ? "✓" : "⚠"} Updated ${ago(when)} · ${status.feeds.ok} of ${status.feeds.total} sources reachable${official ? ` · ${official} regulator feed${official > 1 ? "s" : ""} down, earlier updates kept` : ""}`;
  const link = Object.assign(document.createElement("a"), { href: "status.html", textContent: "Source status" });
  strip.append(text, " ", link);
  top.after(strip);
}
freshness();
