import seed from './regulatory-catalog-seed.js';
let jurisdictions=seed.jurisdictions,agencies=seed.agencies;
export const countryNames=Object.fromEntries(seed.jurisdictions.map(c=>[c.code,c.name]));
export const catalog=()=>({jurisdictions,agencies});
export const agencyInfo=id=>agencies.find(a=>a.id===id);
export const agencyCountry=id=>agencyInfo(id)?.country??'';
export const agencyLabel=id=>{const a=agencyInfo(id);return a?`${a.abbr} · ${countryNames[a.country]??a.country}`:id;};
export function setCatalog(countries,rows){if(!Array.isArray(countries)||!Array.isArray(rows)||!countries.length||!rows.length||!countries.every(c=>c.code&&c.name)||!rows.every(a=>a.id&&a.country&&Array.isArray(a.domains)))throw Error('Agency directory unavailable');jurisdictions=countries;agencies=rows;for(const c of countries)countryNames[c.code]=c.name;}
export async function loadCatalog(sb){const read=async table=>{let out=[];for(let start=0;start<10000;start+=1000){const{data,error}=await sb.from(table).select('*').order(table==='pv_jurisdictions'?'code':'id').range(start,start+999);if(error)throw error;out.push(...data);if(data.length<1000)return out;}throw Error('Directory loading limit reached');};const [c,a]=await Promise.all([read('pv_jurisdictions'),read('pv_agencies')]);setCatalog(c,a);return catalog();}
export function officialAgencyUrl(value,id,policy=agencyInfo(id)){
 const u=new URL(value);if(!policy||policy.id!==id||policy.status!=='verified'||!Array.isArray(policy.domains)||u.protocol!=='https:'||u.username||u.password||u.port||!policy.domains.includes(u.hostname)||/@|%40|patient[-_]?id|token=|signature=/i.test(u.href))throw Error('Use an approved official HTTPS host for this agency. An admin must verify new agency domains before capture.');return u.href;
}
export function coverageFor(agency,docs,versions,requirements,checks){const ds=docs.filter(d=>d.agency===agency.id),ids=new Set(ds.map(d=>d.id)),vs=versions.filter(v=>ids.has(v.document_id)),current=new Map();for(const v of vs)if(!current.has(v.document_id)||v.revision>current.get(v.document_id).revision)current.set(v.document_id,v);const rs=requirements.filter(r=>r.body?.agency===agency.id);return {registered:ds.length,captured:[...current.values()].filter(v=>v.content_kind!=='metadata'&&v.archive_path).length,extracted:[...current.values()].filter(v=>['captured','partial'].includes(v.capture_status)).length,approved:rs.filter(r=>r.review_status==='approved').length,failed:checks.filter(c=>ids.has(c.document_id)&&c.status==='failed').length};}
