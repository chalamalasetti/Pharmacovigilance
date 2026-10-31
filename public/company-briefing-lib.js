// Pure portfolio scoping and assessment handoff. No identity fields or network calls.
export const productKey = p => `${p.src}|${p.market}|${p.authId}`;
export const selectableProducts = company => (company.products ?? []).filter(p => p.authId && p.market && !/discontinued|withdrawn|refused|suspended|expired|revoked|lapsed/i.test(p.status ?? ''));
const unique = a => [...new Set(a)].sort();
export function portfolioFingerprint(company, keys) {
  const selected = new Set(keys);
  const text = JSON.stringify((company.products ?? []).filter(p => selected.has(productKey(p))).map(p => [productKey(p),p.brand,p.ingredients,p.status,p.holder]).sort((a,b) => a[0].localeCompare(b[0])));
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0),16777619) >>> 0;
  return `${text.length}:${h.toString(16)}`;
}
export function confirmPortfolio(company, { markets = [], productKeys = [] }, previous, now = new Date().toISOString()) {
  const available = selectableProducts(company);
  const ms = unique(markets.filter(m => available.some(p => p.market === m)));
  const keys = unique(productKeys.filter(k => available.some(p => productKey(p) === k && ms.includes(p.market))));
  if (!ms.length || !keys.length) throw new Error('Confirm at least one available product and its market.');
  return { companyId: company.profile.id, companyName: company.profile.name, markets: ms, productKeys: keys, fingerprint: portfolioFingerprint(company,keys), confirmedAt: now, revision: (previous?.revision ?? 0)+1 };
}
export function portfolioState(portfolio, company) {
  if (!portfolio || portfolio.companyId !== company.profile.id) return 'unconfirmed';
  const available = new Set(selectableProducts(company).map(productKey));
  if (!portfolio.productKeys?.length || !portfolio.markets?.length || portfolio.productKeys.some(k => !available.has(k)) || portfolio.fingerprint !== portfolioFingerprint(company,portfolio.productKeys)) return 'needs-review';
  return 'confirmed';
}
const EU = new Set('EU AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
const originMarket = country => country === 'US' ? 'US' : EU.has(country) ? 'EU' : country === 'INT' || !country ? null : country;
export function scopedItems(company, portfolio, { days = 30, includeClass = false, includeOutside = false, now = Date.now() } = {}) {
  if (portfolioState(portfolio,company) !== 'confirmed') return { updates: [], research: [], legacy: 0 };
  const selected = new Set(portfolio.productKeys);
  let legacy = 0;
  const filter = list => (list ?? []).flatMap(x => {
    if (!['direct','substance',...(includeClass?['class']:[])].includes(x.lane)) return [];
    if (!Array.isArray(x.productKeys)) { legacy++; return []; }
    const keys = x.productKeys.filter(k => selected.has(k));
    if (!keys.length) return [];
    const date = Date.parse(x.published);
    if (days && Number.isFinite(date) && now-date > Number(days)*86400000) return [];
    const origin = originMarket(x.country);
    const outside = Boolean(origin && !portfolio.markets.includes(origin));
    if (outside && !includeOutside) return [];
    return [{ ...x, confirmedProducts: (company.products ?? []).filter(p => keys.includes(productKey(p))), scopeOutside: outside, scopeReason: `Matches ${keys.length} confirmed product record${keys.length===1?'':'s'} in your ${portfolio.markets.join(', ')} monitoring scope. Applicability is not established.` }];
  });
  return { updates: filter(company.updates), research: filter(company.research), get legacy() { return legacy; } };
}
export function assessmentKey(item, portfolio) {
  // Keep companies and markets separate, while repeated clicks on the same scope
  // cannot duplicate work. Reconfirming the same scope preserves its queue identity.
  return `company:${portfolio.companyId}:${[...portfolio.markets].sort().join('-')}:${item.id}`;
}
export function assessmentHandoff(item, portfolio, now = new Date().toISOString()) {
  if (!portfolio?.confirmedAt || !item.confirmedProducts?.length) throw new Error('Confirm portfolio and matching products first.');
  const paper = item.kind === 'paper';
  const link = paper ? new URL(`paper.html?id=${encodeURIComponent(item.paper)}`, 'https://pharmacovigilance-info.vercel.app/').href : item.link;
  if (!/^https?:\/\//i.test(link ?? '')) throw new Error('Original evidence link is missing.');
  return {
    id: assessmentKey(item,portfolio), title: item.title, link,
    category: paper?'news':item.category??'news', tags: [paper?'research':item.category??'news'], kind: item.official?'official':'news', source: paper?item.venue??'Research publication':item.source??'', country:item.country??'INT', published:item.published,
    summary: item.reason,
    companyContext: { companyId:portfolio.companyId, companyName:portfolio.companyName, markets:[...portfolio.markets], products:item.confirmedProducts.map(p=>({ key:productKey(p),brand:p.brand,market:p.market,authId:p.authId,url:p.url })), lane:item.lane, reason:item.reason, scopeReason:item.scopeReason, outside:item.scopeOutside===true, portfolioRevision:portfolio.revision, portfolioConfirmedAt:portfolio.confirmedAt, fingerprint:portfolio.fingerprint, sourceItem:item.id, evidenceKind:paper?'paper':'update', sentAt:now, ...(paper&&{paperId:item.paper}) },
  };
}
