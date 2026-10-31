// Points a template page's canonical and social tags at the item shown
// (paper.html?id=..., company.html?id=...), so search engines treat each item as its own page.
// The base address comes from the static canonical tag written by scripts/seo.mjs.
export function describePage({ params = {}, title, description } = {}) {
  const canon = document.querySelector('link[rel="canonical"]');
  if (canon) {
    const url = new URL(canon.href);
    url.search = new URLSearchParams(params).toString();
    canon.href = url.href;
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", url.href);
  }
  if (title) document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  if (description) {
    const text = description.length > 160 ? `${description.slice(0, 157).replace(/\s+\S*$/, "")}…` : description;
    document.querySelector('meta[name="description"]')?.setAttribute("content", text);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", text);
  }
}
