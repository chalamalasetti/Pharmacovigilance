// Turns sources.json and the agency directory into the list of feeds to fetch:
// the official regulator feeds, plus a news search per agency and per PV topic so
// countries without their own feed are still covered.

const NEWS_WINDOW = "when:30d";

export function newsSearchUrl(query, { hl = "en-US", gl = "US" } = {}) {
  const q = encodeURIComponent(`${query} ${NEWS_WINDOW}`);
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;
}

export function buildFeeds(sources, agencies) {
  const feeds = sources.official.map((f) => ({ ...f, kind: "official" }));
  for (const c of agencies) {
    for (const a of c.agencies) {
      if (!a.query) continue;
      feeds.push({
        source: `${a.abbr} in the news`,
        country: c.code,
        kind: "news",
        relevance: "pv",
        url: newsSearchUrl(a.query),
      });
    }
  }
  for (const topic of sources.topics) {
    feeds.push({ source: "PV news search", label: `News search: ${topic}`, country: null, kind: "news", relevance: "pv", url: newsSearchUrl(topic) });
  }
  return feeds;
}
