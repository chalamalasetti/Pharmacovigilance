// Shared header behaviour for every page with the top links: marks the current page,
// folds the links behind a Menu button on small screens, and points the skip link
// at the page's main content. The links are identical in every page's HTML; the order
// and hidden links an admin chose (data/site.json, from the Admin page) are applied
// here. Only verified admins also see when the data was last
// refreshed.

import { ago, dataHealth } from "./lib.js";
import {watchAdmin} from "./admin-visibility.js";
import { renderNavigation, closeGroups } from "./navigation-view.js";

const nav = document.getElementById("site-nav");
const btn = document.querySelector(".menu-btn");
const accountLink = nav?.querySelector('[data-nav="account"]');
let latestSite = null;
let adminAllowed = false;
// Hide until the server confirms this account's role. Never trust cached menu settings.
const adminLink = document.createElement("a");
adminLink.href = "admin.html";
adminLink.textContent = "Admin";
adminLink.dataset.nav = "admin";
adminLink.dataset.adminOnly = "";
adminLink.hidden = true;
if (nav) nav.insertBefore(adminLink, nav.querySelector(".signin"));
// "/briefing", "/briefing.html" and "/" all resolve; paper and review pages belong to Research.
const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "");
const current = page === "paper" || page === "research-admin" ? "research" : page === "company" ? "companies" : page.startsWith("admin") ? "admin" : page;

// Menu order and hidden links. The last copy is kept in this browser, so the menu is
// arranged at once on the next page, and refreshed from the site in the background.
const SITE_KEY = "pv-site";
export function arrangeNav(site, links = nav) {
  latestSite = site;
  renderNavigation(links,site,{current,account:accountLink,admin:adminLink,adminAllowed});
}
const readSite = () => {
  try {
    return JSON.parse(localStorage.getItem(SITE_KEY));
  } catch {
    return null;
  }
};
arrangeNav(readSite());
watchAdmin({onHide:()=>{adminAllowed=false;adminLink.hidden=true;arrangeNav(latestSite);},onAdmin:()=>{adminAllowed=true;adminLink.hidden=false;arrangeNav(latestSite);}});
const siteP = fetch("data/site.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null)
  .then((site) => {
    if (!site) return readSite();
    arrangeNav(site);
    try {
      localStorage.setItem(SITE_KEY, JSON.stringify(site));
    } catch {}
    return site;
  });

function setOpen(open) {
  document.body.classList.toggle("menu-open", open);
  btn?.setAttribute("aria-expanded", String(open));
}

btn?.addEventListener("click", () => setOpen(!document.body.classList.contains("menu-open")));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeGroups(nav,true);
  if (e.key === "Escape" && document.body.classList.contains("menu-open")) {
    setOpen(false);
    btn?.focus();
  }
});
document.addEventListener("click", (e) => {
  if (!nav?.contains(e.target) || !e.target.closest(".nav-group")) closeGroups(nav);
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
// The admin role is confirmed before fetching or drawing source diagnostics.
// Legacy public/cached status-strip settings never bypass the admin role check.
function freshness() {
  const top=document.querySelector('.top');
  if(!top||page==='status'||page==='index')return;
  let strip=null;
  watchAdmin({onHide:()=>{strip?.remove();strip=null;},onAdmin:async current=>{
    let status;try{const res=await fetch('data/status.json',{cache:'no-cache',signal:AbortSignal.timeout(6000)});if(!res.ok)return;status=await res.json();}catch{return;}
    if(!current()||!status?.feeds||!Array.isArray(status.sources))return;
  const { level, problems } = dataHealth(status);
  const when = new Date(status.updated);
  strip = document.createElement("div");
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
  }});
}
freshness();
