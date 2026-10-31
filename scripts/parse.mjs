// Turns what a source returns into update items, and tags each item with its country,
// section and priority. Shared by the hourly build (aggregate.mjs) and the admin's
// Test now check (api/source-test.js), so a test shows exactly what collection would keep.
//
// RSS 2.0, RSS 1.0 (RDF) and Atom are read as feeds. A JSON API is read from the list at
// settings.itemsPath with settings.fields naming the title, link, date and summary. A web
// page gives its links whose address matches settings.linkPattern.

import { publicUpdate } from "../public/privacy.js";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { categorize, isRelevant, detectCountry } from "./classify.mjs";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text" });

export const updateId = (link) => createHash("sha1").update(link).digest("hex").slice(0, 10);

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (v == null ? "" : typeof v === "object" ? String(v["#text"] ?? "") : String(v));

// Same update, different tracking tags: strip them so duplicates collapse.
export function normalizeLink(link) {
  try {
    const u = new URL(link.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|at_|cmp|ito|ns_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    }
    u.protocol = "https:";
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");
    return u.href.replace(/\/$/, "");
  } catch {
    return link.trim();
  }
}

// Loose key for spotting the same headline from two outlets.
export function titleKey(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function stripHtml(s) {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&(amp|quot|apos|#39|lt|gt|nbsp);/g, (m, e) => ({ amp: "&", quot: '"', apos: "'", "#39": "'", lt: "<", gt: ">", nbsp: " " })[e])
    .replace(/\s+/g, " ")
    .trim();
}

function linkFromItem(item) {
  for (const l of asArray(item.link)) {
    if (typeof l === "string" && l.trim()) return l.trim();
    if (l && l["@href"] && (!l["@rel"] || l["@rel"] === "alternate")) return l["@href"];
  }
  const guid = text(item.guid) || text(item.id);
  return guid.startsWith("http") ? guid : null;
}

const isoDate = (v) => {
  const date = new Date(v);
  if (date.getTime() > Date.now()) date.setTime(Date.now());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// News searches name the outlet in <source> and at the end of the headline
// ("Title - Outlet"); both are split back out.
export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const items = doc.rss?.channel
    ? asArray(doc.rss.channel.item)
    : doc["rdf:RDF"]
      ? asArray(doc["rdf:RDF"].item)
      : asArray(doc.feed?.entry);

  return items
    .map((item) => {
      const raw = linkFromItem(item);
      if (!raw) return null;
      let title = stripHtml(text(item.title));
      const outlet = text(item.source).trim();
      if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3)).trim();
      let summary = stripHtml(text(item.description) || text(item.summary) || text(item.content)).slice(0, 500);
      // News search descriptions just repeat the headline and outlet.
      if (summary && (summary.startsWith(title) || (outlet && summary.endsWith(outlet) && summary.length < title.length + outlet.length + 10))) summary = "";
      return {
        title,
        link: normalizeLink(raw),
        summary,
        source: outlet || feed.source,
        published: isoDate(text(item.pubDate) || text(item["dc:date"]) || text(item.published) || text(item.updated)),
      };
    })
    .filter((i) => i && i.title);
}

const dig = (obj, path) => String(path ?? "").split(".").filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), obj);

// A JSON API: itemsPath is a dotted path to the list ("" for a top-level list), fields
// maps title, link, published and summary to dotted paths inside each item.
export function parseJson(body, feed) {
  const doc = typeof body === "string" ? JSON.parse(body) : body;
  const list = feed.itemsPath ? dig(doc, feed.itemsPath) : Array.isArray(doc) ? doc : (doc?.items ?? doc?.results ?? doc?.data);
  if (!Array.isArray(list)) throw new Error(`No list of items found${feed.itemsPath ? ` at "${feed.itemsPath}"` : ""}. Set the items path to where the list is.`);
  const f = { title: "title", link: "link", published: "published", summary: "summary", ...(feed.fields ?? {}) };
  return list
    .map((item) => {
      const raw = String(dig(item, f.link) ?? dig(item, "url") ?? "").trim();
      const title = stripHtml(dig(item, f.title) ?? "");
      if (!raw.startsWith("http") || !title) return null;
      const date = dig(item, f.published) ?? dig(item, "date");
      return { title, link: normalizeLink(raw), summary: stripHtml(dig(item, f.summary) ?? "").slice(0, 500), source: feed.source, published: date ? isoDate(date) : null };
    })
    .filter(Boolean);
}

// A web page without a feed: each link whose address matches linkPattern becomes an
// item titled by its link text. Pages rarely give dates, so these sort after dated items.
export function parseHtml(html, feed, base) {
  if (!feed.linkPattern) throw new Error("Set a link pattern so only the page's announcement links are collected.");
  const pattern = new RegExp(feed.linkPattern, "i");
  const seen = new Set();
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let link;
    try {
      link = normalizeLink(new URL(m[1].replace(/&amp;/g, "&"), base).href);
    } catch {
      continue;
    }
    const title = stripHtml(m[2]);
    if (!pattern.test(link) || title.length < 8 || seen.has(link)) continue;
    seen.add(link);
    out.push({ title, link, summary: "", source: feed.source, published: null });
  }
  return out;
}

// What a response is, from its content type and first characters.
export function detectFormat(body, contentType = "") {
  const head = String(body).slice(0, 2000).trimStart().toLowerCase();
  if (/json/.test(contentType) || head.startsWith("{") || head.startsWith("[")) return "json";
  if (/<rss[\s>]/.test(head) || /<rdf:rdf[\s>]/.test(head)) return "rss";
  if (/<feed[\s>]/.test(head)) return "atom";
  if (/<html[\s>]|<!doctype html/.test(head)) return "html";
  if (/xml/.test(contentType) || head.startsWith("<?xml")) return "xml";
  return "unknown";
}

const EXPECTS = { rss: ["rss", "atom", "xml"], news_search: ["rss", "atom", "xml"], api: ["json"], webpage: ["html", "xml"] };
const FORMAT_LABEL = { rss: "RSS", atom: "Atom", xml: "XML", json: "JSON", html: "HTML web page", unknown: "an unknown format" };

// Items from a response, read as the source's type says. A response in another format
// than the type expects is an error that says so, rather than an empty result.
export function parseItems(body, feed, { contentType = "", url = feed.url } = {}) {
  const format = detectFormat(body, contentType);
  const type = feed.type ?? "rss";
  if (!EXPECTS[type].includes(format)) {
    const want = type === "api" ? "JSON" : type === "webpage" ? "a web page" : "an RSS or Atom feed";
    throw Object.assign(new Error(`Expected ${want} but the address returned ${FORMAT_LABEL[format]}.`), { format });
  }
  const items = type === "api" ? parseJson(body, feed) : type === "webpage" ? parseHtml(body, feed, url) : parseFeed(body, feed);
  return { format, items };
}

const CATEGORY_WEIGHT = { safety: 5, recall: 4, label: 4, regulation: 4, guideline: 4, policy: 2, inspection: 2, approval: 1, news: 0 };

// Tags each raw item with its country, region, agency and section, and a priority score
// used to pick the "Key updates" at the top of the page.
export function enrich(item, feed, { matchers, byCode }) {
  const found = detectCountry(`${item.title}. ${item.summary}`, matchers);
  if (feed.relevance === "pv" && !isRelevant(item.title, item.summary, { namesRegulator: Boolean(found?.agency) })) return null;
  // Official feeds speak for their own country; news is placed by what it mentions.
  const code = feed.kind === "official" ? feed.country : (found?.code ?? feed.country ?? "INT");
  const place = byCode.get(code) ?? byCode.get("INT");
  const agency = feed.kind === "official" ? place.agencies[0].abbr : found?.code === code ? found.agency : null;
  const { category, tags } = categorize(item.title, item.summary, feed.category);
  const priority = CATEGORY_WEIGHT[category] + (feed.kind === "official" ? 3 : 0) + (agency ? 1 : 0);
  return publicUpdate({
    id: updateId(item.link),
    title: item.title,
    link: item.link,
    ...(item.summary && { summary: item.summary }),
    source: item.source,
    kind: feed.kind,
    country: place.code,
    region: place.region,
    ...(agency && { agency }),
    category,
    tags,
    priority,
    published: item.published,
    // Which registry source collected it, so its provenance survives a pause or a new address.
    ...(feed.id && { sourceId: feed.id }),
  });
}
