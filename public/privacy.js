// Public-source policy: never retain structured personal fields or harvested contacts.
// This is a conservative guard, not a guarantee of detecting arbitrary personal names
// in prose. Sources capable of patient narratives require a separately reviewed adapter.
export const PRIVACY_VERSION = 'email-only-v1';
const CONTACT = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+\d{1,3}[ .()-]*\d[\d .()-]{6,}\d|\(\d{3}\)\s*\d{3}[- .]\d{4}|\b(?:phone|fax|tel(?:ephone)?)\s*[:=]?\s*\d[\d ().-]{6,}\d)/gi;
const PERSONAL = /\b(?:patient\s*(?:name|id|identifier)|reporter\s*(?:name|address)|date of birth|dob|social security|passport number|medical record number)\s*[:=]/i;
const ADDRESS = /\b\d{1,6}\s+[\p{L}\d .'-]+\s+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd)\b/iu;
export const unsafeNarrative = (text) => PERSONAL.test(String(text ?? '')) || ADDRESS.test(String(text ?? ''));
export function publicText(text) {
  return String(text ?? '').replace(CONTACT, '[contact removed]');
}
export function publicUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    // Query values may carry identifiers; only bibliographic/pagination keys survive.
    for (const key of [...u.searchParams.keys()]) {
      if (!/^(?:id|doi|pmid|pmcid|page|lang|language|oc)$/i.test(key) || /@|%40/i.test(u.searchParams.get(key))) u.searchParams.delete(key);
    }
    u.hash = '';
    if (/@|%40|\b(?:patient|reporter)[-_]?id\b/i.test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}
export function publicUpdate(raw) {
  if (!raw || unsafeNarrative(`${raw.title ?? ''} ${raw.summary ?? ''}`)) return null;
  const link = publicUrl(raw.link);
  if (!link) return null;
  // Explicit allowlist: extra fields returned by APIs must never pass through.
  const out = {};
  for (const k of ['id','kind','country','region','agency','category','tags','priority','published','retrieved','sourceId']) if (raw[k] !== undefined) out[k] = raw[k];
  Object.assign(out, { title: publicText(raw.title), link, source: publicText(raw.source) });
  if (raw.summary) out.summary = publicText(raw.summary);
  return out;
}
export function withoutPersonalFields(value) {
  if (Array.isArray(value)) return value.map(withoutPersonalFields);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:authors?|authorString|authorCount|authorList|firstName|lastName|fullName|foreName|dob|dateOfBirth|phone|fax|address|affiliations?|orcid|email|patientId|reporterName)$/i.test(key)) continue;
      out[key] = withoutPersonalFields(child);
    }
    return out;
  }
  return typeof value === 'string' ? (unsafeNarrative(value) ? '[personal details withheld]' : publicText(value)) : value;
}
