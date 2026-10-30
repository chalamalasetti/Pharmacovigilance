// Shared header behaviour for every page with the top links: marks the current page,
// folds the links behind a Menu button on small screens, and points the skip link
// at the page's main content. The links themselves are identical on every page.

const nav = document.getElementById("site-nav");
const btn = document.querySelector(".menu-btn");

// "/briefing", "/briefing.html" and "/" all resolve; paper and review pages belong to Research.
const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "");
const current = page === "paper" || page === "research-admin" ? "research" : page;
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
