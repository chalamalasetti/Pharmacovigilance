import {agencyInfo,agencyCountry,officialAgencyUrl} from './regulatory-catalog.js';
import { text } from './action-center-lib.js';
export const FIELDS = ['title','statement','agency','topic','lifecycle','norm','source_title','source_family','source_edition','source_url','clause','legal_basis','applicability','exceptions','systems','processes','valid_from','valid_to','published_on','source_status','change_kind','change_summary','predecessor_note'];
export const CHANGE_KINDS=['Baseline capture','New obligation','Scope change','Deadline change','Technical change','Clarification','Removal','Editorial change','Unclassified'];
export const label = key => ({norm:'Authority type',valid_from:'Applies from (inclusive)',valid_to:'Applies until (exclusive)',published_on:'Source publication date',source_status:'Source status',predecessor_note:'Historical coverage',systems:'System assessment prompts'})[key]??key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function validateBody(raw) {
 const b=Object.fromEntries(FIELDS.map(k=>[k,String(raw[k]??'').trim()]));
 for(const k of ['title','statement','source_title','source_family','source_edition','clause','legal_basis','applicability','exceptions','change_summary','predecessor_note'])text(b[k],label(k),k==='statement'?1800:1000);
 if(!agencyInfo(b.agency)||!['Clinical','Marketed','Both'].includes(b.lifecycle)||!['Regulation','Guidance','Technical instruction'].includes(b.norm)||!['current','draft','superseded','withdrawn','uncertain'].includes(b.source_status)||!CHANGE_KINDS.includes(b.change_kind))throw Error('Choose valid agency, lifecycle, authority, status and change type.');
 if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+\d[\d ().-]{7,}\d|\b(?:phone|fax|dob|date of birth)\s*[:=]/i.test(Object.values(b).join(' ')))throw Error('Remove contact details and personal data from public requirement records.');
 officialAgencyUrl(b.source_url,b.agency);
 for(const k of ['valid_from','valid_to','published_on'])if(b[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(b[k])||!Number.isFinite(Date.parse(b[k]))||new Date(b[k]).toISOString().slice(0,10)!==b[k]))throw Error('Use valid dates, or leave an unknown date blank.');
 if(b.valid_to&&(!b.valid_from||b.valid_to<=b.valid_from))throw Error('The end date must follow the start date.');
 return b;
}
export function historyFor(rows,key) {return rows.filter(r=>r.requirement_key===key).sort((a,b)=>b.revision-a.revision);}
export function baseline(rows,effectiveOn,knownOn) {
 const knownAt=knownOn?knownOn+'T23:59:59.999Z':'9999';const groups=new Map();
 for(const r of rows){const b=r.body;if(r.review_status!=='approved'||!r.reviewed_at||r.reviewed_at>knownAt||r.created_at>knownAt||!b.valid_from||b.valid_from>effectiveOn)continue;
  const prev=groups.get(r.requirement_key);if(!prev||b.valid_from>prev.body.valid_from||b.valid_from===prev.body.valid_from&&r.revision>prev.revision)groups.set(r.requirement_key,r);
 }
 // Select the applicable successor first: withdrawal/end cannot resurrect an older obligation.
 return [...groups.values()].filter(r=>r.body.source_status==='current'&&(!r.body.valid_to||r.body.valid_to>effectiveOn));
}
export function compare(before,after) {return FIELDS.filter(k=>(before?.body[k]??'')!==(after?.body[k]??'')).map(k=>({field:k,before:before?.body[k]??'',after:after?.body[k]??''}));}
export function upcoming(rows,effectiveOn,knownOn) {const knownAt=knownOn+'T23:59:59.999Z';return rows.filter(r=>r.review_status==='approved'&&r.reviewed_at&&r.reviewed_at<=knownAt&&r.created_at<=knownAt&&r.body.source_status==='current'&&r.body.valid_from>effectiveOn);}
export function latest(rows) {const m=new Map();for(const r of rows)if(!m.has(r.requirement_key)||m.get(r.requirement_key).revision<r.revision)m.set(r.requirement_key,r);return [...m.values()];}
export function assessmentSnapshot(r,p,company=null,{allowOutside=false}={}) {
 if(!p?.confirmedAt||!p.companyId||!p.markets?.length||!p.productKeys?.length)throw Error('Confirm a company portfolio in Company Briefing first.');
 const market=agencyCountry(r.body.agency);if(!market)throw Error('The source jurisdiction must be identified before assessment.');const outside=!p.markets.includes(market);if(outside&&!allowOutside)throw Error(`This source concerns ${market}, outside the selected company markets. Confirm monitoring outside your markets before assessing.`);const markets=outside?[...p.markets]:[market];
 const key=`requirement:${r.id}:${p.companyId}:${[...p.markets].sort().join(',')}`;
 return {id:key,title:`${r.body.title} — ${r.requirement_key} v${r.revision}`,link:r.body.source_url,source:r.body.source_title,published:r.body.published_on||null,country:market,
 companyContext:{companyId:p.companyId,companyName:p.companyName,markets,outside,products:(company?.products??[]).filter(x=>markets.includes(x.market)&&p.productKeys.includes(`${x.src}|${x.market}|${x.authId}`)).slice(0,300).map(x=>({key:`${x.src}|${x.market}|${x.authId}`,brand:x.brand,market:x.market,authId:x.authId,url:x.url})),reason:`${outside?'Monitoring outside confirmed markets; no local product authorization inferred':'Jurisdiction match only'}: ${market}. ${r.body.applicability}`,scopeReason:`${r.body.statement}\nAuthority: ${r.body.norm}. Clause: ${r.body.clause}. Qualifications: ${r.body.exceptions}\nLibrary review: ${r.review_status}. Confirm role, product scope, clinical/marketed status and local controls; relevance is undecided.`,lane:'jurisdiction',evidenceKind:'requirement',sourceItem:`requirement:${r.id}`,portfolioRevision:p.revision,portfolioConfirmedAt:p.confirmedAt,fingerprint:p.fingerprint}};
}
