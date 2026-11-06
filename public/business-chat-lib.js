import {norm,labelIdentity,safeURL} from './product-answers-lib.js';
export const QUESTION_FAMILIES=['identity','company','portfolio','approval','status','indications','label','label-history','comparison','safety','timeline','clinical','reporting','work','sources'];
export function questionFamily(q){q=norm(q);
 for(const [family,re] of [['work',/my work|our actions|my actions|overdue|awaiting verification|already assessed|assessment draft/],['reporting',/reporting template|reporting rule|reporting requirement|reporting timeframe|reporting deadline|clock start/],['portfolio',/which (products|vaccines|medicines|drugs).*(company|associated|portfolio|gsk|pfizer|astrazeneca)|company portfolio|products.*(gsk|pfizer|astrazeneca)|what products.*(company|market|sell)/],['company',/who.*(own|manufactur|distribut|market|holder)|which compan(?:y|ies)|ownership|commercial rights|licens|subsidiary|acqui/],['sources',/show sources|what sources|confidence|coverage|missing evidence|data gaps|can.t.*establish/],['comparison',/compar|differ|versus| vs |both.*label|same warning/],['timeline',/timeline|over time|history of|last twelve months/],['clinical',/clinical trial|studies|study sponsor|investigat|development phase|paediatric stud|pediatric stud/],['label-history',/first added|when.*added|label history|previous label|wording chang|label version/],['indications',/\bindication|age group|paediatric|pediatric|population|approved use/],['label',/contraindication|warning|precaution|boxed|pregnan|breastfeed|interaction|label.*(say|mention|contain)|side effect/],['status',/withdraw|discontinu|shortage|suspend|revok|where.*(approved|authori)|which (countries|markets)|market status|prescription/],['approval',/approv|authori[sz]|supplement/],['identity',/ingredient|strength|dosage form|formulation|generic|biosimilar|what is|same medicine|brand name/],['safety',/safety signal|prac|recall|safety communication|safety alert/]])if(re.test(q))return family;
 return null;
}
const hit=(text,term)=>(' '+norm(text)+' ').includes(' '+norm(term)+' ');
export function productBusinessAnswer({product:p,question,products=[],labels=[],updates=[],company=null,trials=null}){
 const family=questionFamily(question)||'identity',findings=[],gaps=[],add=(text,url=p.url,kind='Registry evidence')=>findings.push({text,url:safeURL(url),kind});
 const exactLabels=labels.filter(r=>labelIdentity(r,p)),same=products.filter(x=>x.market===p.market&&x.authId===p.authId),sameIngredients=x=>norm((x.ingredients??[]).slice().sort().join(' '))===norm((p.ingredients??[]).slice().sort().join(' '));
 if(family==='identity'){
  add('Brand: '+p.brand+'. Ingredients: '+(p.ingredients??[]).join('; ')+'. Application: '+p.authId+'. Market: '+p.market+'.');
  add('Captured forms: '+((p.forms??[]).join('; ')||'not captured')+'. Strengths: '+((p.strengths??[]).join('; ')||'not captured')+'.');
  if(/generic|biosimilar|same medicine/i.test(question)){for(const x of products.filter(x=>sameIngredients(x)&&x.market===p.market).slice(0,8))add(x.brand+' · '+x.authId+' · '+x.companyName,x.url);gaps.push('Matching ingredient records do not establish therapeutic equivalence, interchangeability or biosimilarity. Strength, form, route and licensed reference relationships require review.');}
 }
 if(family==='company'){
  add('Registry holder: '+(p.holder||'not captured')+'. Recorded role: '+(p.role||'role not captured')+'. Associated catalog company: '+p.companyName+'.');
  if(typeof company?.history==='string')add('Catalog history note: '+company.history.slice(0,1500),null,'Catalog note; independently verify');
  if(company?.parent)add('Catalog parent association: '+(company.parent.name||company.parent.id)+'. This is not product-rights evidence.',null,'Catalog relationship');
  gaps.push('An application holder or catalog association does not prove manufacturer, distributor, commercial rights or current legal ownership. These roles and transfers require separate dated agreements or official records.');
 }
 if(family==='approval'){add('Application-level registry date: '+(p.date||'not captured')+'. Market: '+p.market+'.');gaps.push('This does not establish the earliest worldwide, presentation-specific, original-brand or indication-specific approval. Supplement history is not complete.');}
 if(family==='status'){
  add('Captured status: '+(p.status||'not captured')+'. This snapshot does not establish real-time availability or supply.');
  for(const x of products.filter(x=>norm(x.brand)===norm(p.brand)).slice(0,12))add(x.market+' · '+x.authId+' · '+(x.status||'status not captured'),x.url);
  gaps.push('Captured market entries are not a complete worldwide authorisation inventory. Commercial discontinuation, safety withdrawal and shortages must be established separately.');
 }
 if(['label','indications','comparison','label-history'].includes(family)){
  const term=/\b(?:mention|contain|include)\s+["']?([^?"']{2,100})/i.exec(question)?.[1]?.trim();
  const section=family==='indications'?/indication|usage|paediatric|pediatric|population|age/i:/warning|precaution|contraindication|reaction|interaction|pregnan|lactation|breastfeed/i;
  for(const r of exactLabels.slice().sort((a,b)=>(b.published||'').localeCompare(a.published||'')).slice(0,6)){
   const parts=(r.sections??[]).filter(s=>term||section.test(s.title));for(const s of parts.slice(0,6))for(const text of (s.paragraphs??[]).filter(p=>!term||hit(p.text,term)).slice(0,1))add(s.title+': '+text.text.slice(0,400)+(text.text.length>400?'…':''),r.url,r.kind==='approved_change'?'Captured approved-change extract · '+(r.published||'date unknown'):'Recommendation / unconfirmed implementation');
  }
  gaps.push('These are captured change extracts, not necessarily the complete current approved label. Missing sections do not establish absence of an indication, warning or restriction.');
  if(family==='label-history')gaps.push('First addition, original wording and before/after differences are not established without the original approval label and intervening approved versions.');
  if(family==='comparison'){for(const x of products.filter(x=>norm(x.brand)===norm(p.brand)&&x.market!==p.market).slice(0,6)){add('Other captured application: '+x.market+' · '+x.authId,x.url);for(const r of labels.filter(r=>labelIdentity(r,x)).slice(0,2))for(const s of (r.sections??[]).slice(0,2)){const paragraph=s.paragraphs?.[0]?.text;if(paragraph)add(x.market+' · '+(r.published||'undated')+' · '+s.title+': '+paragraph.slice(0,300),r.url,'Other-market capture; version alignment unconfirmed');}}gaps.push('No equivalence or timing conclusion across products/markets is inferred. Select the other application and inspect matching versions separately.');}
 }
 if(['timeline','safety'].includes(family)){
  if(family==='timeline'&&p.date)add('Registry application date: '+p.date+'.');
  for(const r of exactLabels.slice().sort((a,b)=>(a.published||'9999').localeCompare(b.published||'9999')).slice(0,15))add((r.published||r.meeting||'Date not captured')+' · '+r.title,r.url,r.kind==='approved_change'?'Approved-change capture':'Recommendation; implementation unconfirmed');
  for(const u of updates.filter(u=>hit([u.title,u.summary].join(' '),p.brand)).slice(0,8))add((u.published||'Date unknown')+' · '+u.title,u.link,'Related public update');
  gaps.push('The available timeline is incomplete. A signal, recommendation or news item is not proof of causation or approved label implementation.');
 }
 if(family==='clinical'){
  if(trials?.schema===1&&trials.companyId===p.company&&Array.isArray(trials.studies)){
   const matched=trials.studies.filter(s=>(s.medicines??[]).some(m=>hit(m.name,p.brand)||(p.ingredients??[]).some(i=>hit(m.name,i))));
   for(const s of matched.slice(0,8))add(s.id+' · '+s.title+' · phases '+(s.phases??[]).join(', ')+' · '+s.status+' · '+(s.conditions??[]).join('; '),s.url,'Registry study; not an approved indication');
   gaps.push('Searched '+trials.studies.length+' loaded company studies; '+matched.length+' lexical product/ingredient matches. Collection status: '+(trials.collectionStatus||'unknown')+'. No match does not prove no trial exists.');
  }else gaps.push('Company clinical-study capture is unavailable. No sponsor, development phase, termination reason or investigational indication is inferred.');
 }
 if(family==='sources'){add('Application source and locator: '+(p.locator||'locator not captured')+'.');for(const r of exactLabels.slice(0,8))add((r.locator||r.title)+' · '+(r.published||'date not captured'),r.url,'Captured label evidence');gaps.push('Source links and snapshot dates do not establish regulatory completeness. Conflicts, absent versions and unsupported roles need independent review.');}
 const dates=[...new Set(same.map(x=>x.date).filter(Boolean))];if(dates.length>1)gaps.push('Conflicting registry dates exist for this application: '+dates.join(', ')+'. They have not been reconciled.');
 if(!findings.length)gaps.unshift('No sufficient matching evidence was found for this category in the loaded snapshots.');
 return {schema:'pvinfo-business-answer/1',family,question,scope:{brand:p.brand,market:p.market,authId:p.authId,company:p.companyName},findings,gaps,review:'Qualified human review required. Uses available captured evidence, not a complete regulatory determination.'};
}
export function localWorkSummary(workspace){const rows=Object.values(workspace?.items??{});return {saved:rows.filter(r=>r.saved).length,following:rows.filter(r=>r.followed).length,assessed:rows.filter(r=>r.assess).length,assigned:rows.filter(r=>r.assign).length,scope:'This browser’s briefing workspace only. Not the company Action Center, team queue or verified closure status.'};}
