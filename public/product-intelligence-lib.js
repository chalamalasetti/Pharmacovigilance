import {norm,safeURL} from './product-answers-lib.js';
import {appNumber} from './label-question-lib.js';
export const INTELLIGENCE_SCHEMA='pv-product-intelligence/1';
const sameNames=(a,b)=>JSON.stringify((a||[]).map(norm).sort())===JSON.stringify((b||[]).map(norm).sort());
export function authorizationOf(record){
 if(record.market==='US'){
  const direct=appNumber(record.application||record.authId||record.id);if(direct)return {market:'US',kind:'FDA application',value:direct};
  const ob=/^fda-orange-book:fda-orange-book\|US\|([NA])(\d{6})\|\d+$/.exec(record.id||'');if(ob)return {market:'US',kind:'FDA application',value:(ob[1]==='A'?'ANDA':'NDA')+ob[2]};
 }
 if(record.market==='EU'){const value=record.authId||record.id?.replace(/^ema-medicines:/,'');if(/^EMEA\/H\/C\/\d+$/i.test(value||''))return {market:'EU',kind:'EMA product',value:value.toUpperCase()};}
 // A Canadian DPD drug code is not a DIN or a licence number.
 return null;
}
export const authorizationKey=a=>a?a.market+'|'+a.kind+'|'+a.value:null;
const ROLES={'fda-drugsfda':'Application sponsor','fda-orange-book':'Application holder (applicant)','fda-ndc':'NDC labeler','ema-medicines':'Source holder/applicant','hc-dpd':'DIN owner'};
export function normalizeProduct(record,{origin='bulk',snapshot=null}={}){
 const sourceId=origin==='registry'?(record.src||'company-registry'):record.sourceId||record.id?.split(':')[0]||'source';
 const authorization=authorizationOf(record),company=origin==='registry'?(record.holder||record.companyName||''):record.company||'';
 const id=record.id||'registry:'+sourceId+':'+record.market+':'+(record.authId||'')+':'+encodeURIComponent(record.brand||'')+':'+encodeURIComponent((record.ingredients||[]).join(';'));
 const identifiers=authorization?[{...authorization,reported:true}]:[];
 if(sourceId==='fda-ndc'){const ndc=/^fda-ndc:(\d{4,5}-\d{3,4})_/.exec(id)?.[1];if(ndc)identifiers.push({market:'US',kind:'product NDC',value:ndc,reported:true});}
 if(sourceId==='hc-dpd'&&/^hc-dpd:\d+$/.test(id))identifiers.push({market:'CA',kind:'DPD drug code',value:id.slice('hc-dpd:'.length),reported:true});
 const approvalDate=origin==='registry'?record.date:record.approvalDate;
 const dateMeaning=origin==='registry'?'Company registry application-level date; original product/presentation approval not established':record.dateMeaning;
 return {...record,id,sourceId,origin,authorization,identifiers,application:authorization?.kind==='FDA application'?authorization.value:null,authId:authorization?.value||record.authId||null,company,ingredients:record.ingredients||[],approvalDate:approvalDate||null,dateMeaning:dateMeaning||null,
  role:origin==='registry'?record.role||null:ROLES[sourceId]||null,statusMeaning:sourceId==='fda-ndc'?'NDC listing marketing category; not proof of approval or availability':'Reported source status/category',
  forms:record.forms||[],strengths:record.strengths||[],url:safeURL(record.url),hash:record.hash||null,snapshot,
  catalogCompanyIds:origin==='registry'&&record.company?[record.company]:[],registryEvidence:[],companyAssociations:[],dates:record.dates||[]};
}
export function buildProductLayer({sourceProducts=[],registryProducts=[],companies=[],market,snapshot=null,registryBuilt=null}){
 const registry=registryProducts.filter(p=>p.market===market).map(p=>normalizeProduct(p,{origin:'registry',snapshot:registryBuilt}));
 const byAuth=new Map();for(const r of registry){const key=authorizationKey(r.authorization);if(key){if(!byAuth.has(key))byAuth.set(key,[]);byAuth.get(key).push(r);}}
 const rows=sourceProducts.filter(p=>p.market===market).map(p=>normalizeProduct(p,{snapshot}));
 const represented=new Set(),companyById=new Map(companies.map(c=>[c.id,c])),companyByName=new Map(),registryCompanyName=new Map(registryProducts.map(r=>[r.company,r.companyName]));
 for(const c of companies)for(const name of [c.name,c.legal].filter(Boolean)){const key=norm(name);if(!companyByName.has(key))companyByName.set(key,[]);companyByName.get(key).push(c.id);}
 for(const p of rows){
  const candidates=byAuth.get(authorizationKey(p.authorization))||[];
  const matches=candidates.filter(r=>norm(r.brand)===norm(p.brand)&&sameNames(r.ingredients,p.ingredients));p.registryEvidence=matches;
  for(const r of matches){represented.add(r.id);for(const id of r.catalogCompanyIds)if(!p.catalogCompanyIds.includes(id))p.catalogCompanyIds.push(id);}
  for(const id of companyByName.get(norm(p.company))||[])if(!p.catalogCompanyIds.includes(id))p.catalogCompanyIds.push(id);
  p.companyAssociations=p.catalogCompanyIds.map(id=>({id,name:companyById.get(id)?.name||registryCompanyName.get(id)||id,method:matches.some(r=>r.catalogCompanyIds.includes(id))?'Registry application/market plus exact brand and ingredient names':'Exact reported legal/company name; role retained',kind:'Catalog association; commercial ownership not established'}));
 }
 for(const r of registry)r.companyAssociations=r.catalogCompanyIds.map(id=>({id,name:companyById.get(id)?.name||registryCompanyName.get(id)||id,method:'Company registry reported association',kind:'Catalog association; commercial ownership not established'}));
 return [...rows,...registry.filter(r=>!represented.has(r.id))];
}
export function intelligenceCandidates(records,question){
 const q=' '+norm(question)+' ',qApplication=' '+norm(question).replace(/\b(nda|anda|bla)\s+(\d{6})\b/g,'$1$2')+' ',out=new Map();
 for(const p of records){const brand=norm(p.brand),matches=brand.length>=3&&q.includes(' '+brand+' '),ingredient=(p.ingredients||[]).some(n=>norm(n).length>=4&&q.includes(' '+norm(n)+' ')),identifier=p.identifiers.some(i=>i.kind==='FDA application'?qApplication.includes(' '+norm(i.value).replaceAll(' ','')+' '):i.kind==='DPD drug code'?q.includes(' dpd '+i.value+' ')||q.includes(' drug code '+i.value+' '):q.includes(' '+norm(i.value)+' '));if(!matches&&!ingredient&&!identifier)continue;
  const key=(authorizationKey(p.authorization)||p.id)+'|'+brand+'|'+p.ingredients.map(norm).sort().join(';');
  const rank=(matches?1000+brand.length:0)+(p.origin==='bulk'?20:0)+(p.sourceId==='fda-drugsfda'?10:0);
  if(!out.has(key)||out.get(key).rank<rank)out.set(key,{...p,rank});
 }
 return [...out.values()].sort((a,b)=>b.rank-a.rank||a.market.localeCompare(b.market)||String(a.authId||a.id).localeCompare(String(b.authId||b.id)));
}
export function changeLinks(product,records){
 return records.filter(r=>{if(r.market!==product.market||!r.authId||!product.authorization)return false;return authorizationKey(authorizationOf({market:r.market,authId:r.authId}))===authorizationKey(product.authorization);}).map(record=>({record,match:'Reported authorisation identifier and market; label family/presentation not established'}));
}
export function productDossier(product,{changes=[],family=null,versions=[],coverage={}}={}){
 const facts=[],relationships=[],gaps=[];
 const fact=(kind,value,meaning,source=product,scope='source product record')=>{if(value!==null&&value!==undefined&&value!=='')facts.push({kind,value,meaning,scope,sourceId:source.sourceId,url:source.url,hash:source.hash||null,snapshot:source.snapshot||null,recordId:source.id});};
 fact('brand',product.brand,'Reported product name');for(const name of product.ingredients)fact('ingredient',name,'Exact source name; salts/synonyms not merged');
 fact('market',product.market,'Source jurisdiction');for(const id of product.identifiers)fact('identifier',id.value,id.kind);
 fact('company',product.company,product.role||'Role not supplied');fact('status',product.status,product.statusMeaning);fact('approval_date',product.approvalDate,product.dateMeaning);fact('withdrawal_date',product.withdrawalDate,'Reported withdrawn-authorisation date; safety reason not inferred');
 for(const event of product.dates)fact('event_date',event.date||event.raw,{type:event.type,status:event.status});
 for(const registry of product.registryEvidence){fact('company',registry.company,registry.role||'Source registry role',registry,'authorisation-level registry association');fact('approval_date',registry.approvalDate,registry.dateMeaning,registry,'authorisation-level registry record');for(const value of registry.forms)fact('form',value,'Registry application aggregation; exact presentation not established',registry,'authorisation');for(const value of registry.strengths)fact('strength',value,'Registry application aggregation; individual ingredient dose not assigned',registry,'authorisation');}
 if(product.origin==='registry'){for(const value of product.forms)fact('form',value,'Registry application aggregation',product,'authorisation');for(const value of product.strengths)fact('strength',value,'Registry application aggregation',product,'authorisation');}
 for(const c of product.companyAssociations)relationships.push({type:'catalog_company',...c});
 const linked=changeLinks(product,changes);for(const {record,match}of linked)relationships.push({type:'captured_change',id:record.id,match,url:record.url,date:record.published,kind:record.kind});
 if(family)relationships.push({type:'selected_label_family',setid:family.setid,match:product.application&&family.applications?.map(appNumber).includes(product.application)?'Reported FDA application plus user-confirmed Set ID':'User-confirmed candidate family; exact presentation link requires review',url:family.sourceURL});
 if(!product.authorization)gaps.push('An authorisation/licence identifier is not established for this record. DPD codes and NDC listings are not approval evidence.');
 if(!product.approvalDate)gaps.push('Approval date is not captured in the selected source product record.');
 const dates=new Set(facts.filter(f=>f.kind==='approval_date').map(f=>String(f.value)));if(dates.size>1)gaps.push('Different reported approval dates are retained with their source and scope; they have not been reconciled.');
 gaps.push('Company roles and catalog associations do not establish current commercial ownership.','Market status, marketing/cancellation events and safety withdrawal retain different meanings.','Label links at application level can span several brands, presentations and label families.');
 return {schema:INTELLIGENCE_SCHEMA,product:{id:product.id,brand:product.brand,market:product.market,authorization:product.authorization},facts,relationships,capturedChanges:linked,selectedFamily:family,versions,coverage,gaps};
}
