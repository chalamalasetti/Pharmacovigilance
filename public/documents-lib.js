import {text} from './action-center-lib.js';
import {assessmentSnapshot} from './requirements-lib.js';
export {countryNames as COUNTRIES} from './regulatory-catalog.js';
import {officialAgencyUrl} from './regulatory-catalog.js';
export const KINDS={baseline:'Baseline candidate',new:'Potential addition',changed:'Potential change',unchanged:'Text unchanged',possible_removal:'Possible omission — verify source'};
export const officialUrl=officialAgencyUrl;
export function publicNarrative(v,max=3000){const s=text(v,'Organizational text',max);if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:contact|telephone|fax|date of birth|patient name|reporter name)\s*[:=]/i.test(s))throw Error('Remove contact and individual details.');return s;}
export function candidateBody(candidate,version,doc){
 return {title:doc.title.slice(0,110)+' · '+candidate.anchor.slice(0,45),statement:candidate.statement,agency:doc.agency,topic:doc.topic,lifecycle:doc.lifecycle,norm:doc.norm,source_title:doc.title,source_family:doc.id,source_edition:version.edition,source_url:version.source_url,clause:candidate.anchor,legal_basis:doc.legal_basis,applicability:doc.applicability,exceptions:candidate.context||'Review the complete source, definitions, conditions and regional exceptions before approving.',systems:'Assess configured safety systems, interfaces, validation and reporting rules; no vendor-specific impact is inferred.',processes:doc.topic,valid_from:version.effective_on||'',valid_to:'',published_on:version.published_on||'',source_status:version.source_status,change_kind:candidate.classification==='baseline'?'Baseline capture':candidate.classification==='unchanged'?'Editorial change':'Unclassified',change_summary:'Rule-based extraction and matching suggestion. A human must verify meaning, scope, dates and source authority.',predecessor_note:candidate.previous_candidate_id||candidate.previous_requirement_id?'Potential predecessor match; confirm the mapping and all qualifications.':'No verified predecessor clause is captured. First capture does not establish a new obligation.'};
}
export function candidateAssessment(c,v,d,p,company,options={}){
 const r={id:c.id,requirement_key:d.id,revision:v.revision,review_status:c.review_status,body:candidateBody(c,v,d)};
 const s=assessmentSnapshot(r,p,company,options);s.id=s.id.replace(/^requirement:/,'candidate:');s.title=`${d.title} · ${c.anchor} · document v${v.revision}`;s.companyContext.sourceItem=`candidate:${c.id}`;s.companyContext.scopeReason=`${c.statement}\n${c.context??''}\n${KINDS[c.classification]}. Extraction is unapproved; verify applicability and source evidence.`.slice(0,1000);return s;
}
export function filterDocuments(docs,{country='',agency='',q='',status=''}={}){return docs.filter(d=>(!country||d.country===country)&&(!agency||d.agency===agency)&&(!status||d.status===status)&&(!q||`${d.title} ${d.topic} ${d.id}`.toLowerCase().includes(q.toLowerCase())));}
