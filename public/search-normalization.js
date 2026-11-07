// Search-only normalization. Never use this to establish product identity or regulatory equivalence.
export function searchFold(value){return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\b(nda|anda|bla)[\s\u00a0-]*(\d{6})\b/g,'$1$2').replace(/\bnct[\s-]*(\d{8})\b/g,'nct$1').replace(/[’']/g,'').replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export const searchTerms=value=>searchFold(value).split(' ').filter(Boolean);
export function searchMatches(query,fields){const terms=searchTerms(query);if(!terms.length)return true;const hay=searchFold(Array.isArray(fields)?fields.flat(Infinity).filter(v=>v!=null).join(' '):fields);return terms.every(term=>hay.includes(term));}
export function exactSearchMatch(a,b){const left=searchFold(a);return Boolean(left)&&left===searchFold(b);}
export function canonicalCountry(value,rows){const q=searchFold(value);if(!q)return null;return rows.find(c=>[c.code,c.country,...c.terms||[]].some(name=>exactSearchMatch(name,q)))||null;}
export const searchDebounce=(action,delay=180)=>{let timer;const run=(...args)=>{clearTimeout(timer);timer=setTimeout(()=>action(...args),delay);};run.cancel=()=>clearTimeout(timer);return run;};
