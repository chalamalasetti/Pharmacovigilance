import {catalog,loadCatalog,agencyCountry,agencyLabel} from './regulatory-catalog.js';
import {el} from './impact-view.js';
import * as C from './cloud.js';
import * as W from './workspace.js';
import {portfolioState} from './company-briefing-lib.js';
import {FIELDS,CHANGE_KINDS,label,validateBody,historyFor,baseline,upcoming,compare,latest,assessmentSnapshot} from './requirements-lib.js';
const $=id=>document.getElementById(id),replace=(n,...x)=>n.replaceChildren(...x.flat().filter(x=>x!=null&&x!==false));
const sourceFilter=new URLSearchParams(location.search).get('source');
const ws=W.load();let rows=[],shown=[],selected=new URLSearchParams(location.search).get('version'),sb,admin=false,live=false,busy=false;
const today=new Date().toISOString().slice(0,10);$('req-effective').value=today;$('req-known').value=today;
const msg=(s,bad=false)=>{$('req-status').textContent=s;$('req-status').className=bad?'req-notice':'hint';};
const external=(url,title)=>el('a',{href:url,target:'_blank',rel:'noopener'},title);
const badge=(s,cls='')=>el('span',{class:`req-badge ${cls}`},s);
const dt=(k,v)=>[el('dt',{},k),el('dd',{},v||'Unknown / not captured')];
function filtered(){
 const mode=$('req-mode').value,day=$('req-effective').value,known=$('req-known').value;
 let result=mode==='baseline'?baseline(rows,day,known):mode==='upcoming'?upcoming(rows,day,known):latest(rows);
 if(mode==='pending')result=result.filter(r=>r.review_status==='pending');
 const q=$('req-search').value.toLowerCase().trim();
 return result.filter(r=>(!sourceFilter||r.body.source_family===sourceFilter)&&(!$('req-country').value||agencyCountry(r.body.agency)===$('req-country').value)&&(!$('req-agency').value||r.body.agency===$('req-agency').value)&&(!$('req-topic').value||r.body.topic===$('req-topic').value)&&(!$('req-lifecycle').value||r.body.lifecycle===$('req-lifecycle').value||r.body.lifecycle==='Both')&&(!q||[r.requirement_key,...Object.values(r.body)].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.body.agency.localeCompare(b.body.agency)||a.body.title.localeCompare(b.body.title));
}
function render(){
 const heads=latest(rows);replace($('req-stats'),...[[heads.length,'Captured requirements'],[heads.filter(r=>r.review_status==='pending').length,'Awaiting expert review'],[baseline(rows,today,today).length,'Approved & dated today'],[new Set(rows.map(r=>r.body.source_family)).size,'Source families']].map(([n,t])=>el('div',{class:'req-stat'},el('strong',{},n),t)));
 shown=filtered();$('req-count').textContent=`${shown.length} records · ${$('req-mode').value==='baseline'?'Only approved, dated interpretations known by the selected date. Unknown start dates are excluded.':'Latest capture can be unapproved. Open history to inspect earlier versions.'}`;
 replace($('req-list'),...shown.map(r=>el('button',{type:'button',class:'req-card','aria-pressed':r.id===selected,onclick:()=>select(r.id,true)},el('div',{class:'req-badges'},badge(agencyLabel(r.body.agency)),badge(r.review_status,r.review_status),badge(r.body.norm)),el('strong',{},r.body.title),el('span',{class:'hint'},`${r.requirement_key} · v${r.revision} · ${r.body.topic}`))),!shown.length?el('p',{class:'req-notice'},'No records meet these criteria. No complete approved baseline can be inferred from an empty result. Review pending captures and coverage gaps.'):null);
 if(sourceFilter)$('req-count').append(' · Source: '+sourceFilter+' · ',el('a',{href:'requirements.html'},'Clear source filter'));
 renderDetail();renderSources();
}
function select(id,focus=false){selected=id;history.replaceState(null,'',`?version=${encodeURIComponent(id)}`);render();if(focus)$('req-detail').focus();}
function renderSources(){const sources=new Map();for(const r of rows){const b=r.body;sources.set([b.source_family,b.source_edition,b.source_url].join('|'),b);}
 replace($('req-sources'),...[...sources.values()].map(b=>el('div',{class:'req-source'},external(b.source_url,b.source_title),el('p',{class:'hint'},`${b.agency} · ${b.source_edition} · ${b.source_status} · Published ${b.published_on||'unknown'}`))));}
function renderDetail(){
 const r=rows.find(r=>r.id===selected);if(!r){replace($('req-detail'),el('p',{},selected?'This version is unavailable. Reload the library or select another record.':'Select a requirement to see evidence, version history and assessment options.'));return;}
 const b=r.body,h=historyFor(rows,r.requirement_key),before=rows.find(x=>x.id===r.supersedes),changes=compare(before,r);
 const compareBox=el('details',{class:'req-section'},el('summary',{},'Compare with predecessor'),!before?el('p',{class:'req-notice'},'Earlier clause text has not been captured. A first library capture is not evidence of a new regulatory obligation.'):el('div',{},el('p',{},`Compared with v${before.revision} (${before.review_status}). Change classification: ${b.change_kind}. ${b.change_summary}`),el('table',{class:'req-compare'},el('thead',{},el('tr',{},...['Field','Before','This version'].map(s=>el('th',{scope:'col'},s)))),el('tbody',{},...changes.map(c=>el('tr',{},el('th',{scope:'row'},label(c.field)),el('td',{},c.before||'Not captured'),el('td',{},c.after||'Not captured'))))),!changes.length?el('p',{},'No captured fields changed.'):null));
 replace($('req-detail'),el('div',{class:'req-badges'},badge(`${r.requirement_key} · v${r.revision}`),badge(r.review_status,r.review_status),badge(b.source_status),badge(b.norm)),el('h2',{},b.title),r.document_version_id?el('p',{},el('a',{href:`documents.html?doc=${encodeURIComponent(b.source_family)}&capture=${r.document_version_id}`},'Open captured source document and extraction history')):null,el('p',{},b.statement),
 r.review_status!=='approved'?el('p',{class:'req-notice'},'This interpretation is not approved. Use it as a review candidate.'):el('p',{class:'hint'},'Approved library interpretation. Company applicability remains undecided.'),
 el('dl',{},...dt('Source',external(b.source_url,b.source_title)),...dt('Edition / clause',`${b.source_edition} · ${b.clause}`),...dt('Legal basis',b.legal_basis),...dt('Applies from',b.valid_from),...dt('Applies until',b.valid_to?b.valid_to+' (exclusive)':''),...dt('Publication date',b.published_on),...dt('Captured',r.created_at),...dt('Reviewed',r.reviewed_at),...dt('Review rationale',r.review_note)),
 ...[['Who may be affected',b.applicability],['Qualifications & exceptions',b.exceptions],['Processes to assess',b.processes],['Systems to assess',b.systems],['Historical coverage',b.predecessor_note]].map(([t,s])=>el('section',{class:'req-section'},el('h3',{},t),el('p',{},s))),
 compareBox,el('details',{class:'req-section'},el('summary',{},`Version timeline (${h.length})`),...h.map(v=>el('div',{class:'req-history'},el('button',{class:'act',type:'button',onclick:()=>select(v.id)},`v${v.revision} · ${v.review_status} · ${v.body.source_edition}`),el('p',{class:'hint'},`Captured ${v.created_at} · Applies from ${v.body.valid_from||'unknown'} · Reviewed ${v.reviewed_at||'not yet'}`)))),assessmentPanel(r),admin?reviewPanel(r):null);
}
function assessmentPanel(r){
 const portfolios=Object.values(ws.companyPortfolios??{}).filter(p=>p.confirmedAt),co=el('select',{'aria-label':'Company portfolio'},el('option',{value:''},'Choose a confirmed company portfolio'),...portfolios.map(p=>el('option',{value:p.companyId},p.companyName)));
 const destination=el('select',{'aria-label':'Assessment destination'},el('option',{value:'personal'},'My private workspace'),...C.team.list.map(t=>el('option',{value:t.id},`Team: ${t.name}`)));
 const outside=el('input',{type:'checkbox','aria-label':'Monitor outside confirmed markets'});const feedback=el('p',{role:'status',class:'hint'}),button=el('button',{class:'btn primary',type:'button',onclick:async()=>{
 button.disabled=true;try{
  const p=ws.companyPortfolios?.[co.value];if(!p)throw Error('Choose a confirmed portfolio.');
  const res=await fetch(`data/companies/${encodeURIComponent(p.companyId)}.json`,{cache:'no-cache'});if(!res.ok)throw Error('Cannot verify portfolio freshness. Try again later.');
  const company=await res.json();if(portfolioState(p,company)!=='confirmed')throw Error('Product coverage changed. Reconfirm the company scope in Company Briefing.');
  const snapshot=assessmentSnapshot(r,p,company,{allowOutside:outside.checked}),key=snapshot.id,isTeam=destination.value!=='personal';
  if(isTeam){await C.setActiveTeam(ws,destination.value);if(!C.team.items.has(key))await C.teamAction(snapshot,{assess:{status:'open',at:new Date().toISOString()}});}
  else if(!W.item(ws,key).assess)W.update(ws,key,{snapshot:W.snapshot(snapshot),assess:{status:'open',at:new Date().toISOString()}});
  replace(feedback,'Evidence and company scope saved. ',el('a',{href:`action-center.html?${new URLSearchParams({item:key,...(isTeam?{scope:'team'}:{})})}`},'Open Action Center to start the assessment →'));
 }catch(e){feedback.textContent=e.message;}finally{button.disabled=false;}
 }},'Send this version for assessment');
 return el('section',{class:'req-section req-assess'},el('h3',{},'Assess for my company'),el('p',{},'Jurisdiction is a screening signal only. Review the role, clinical/marketed scope and exceptions. This preserves the exact requirement version and confirmed portfolio revision.'),co,destination,el('label',{},outside,'Assess outside my confirmed markets (monitoring only)'),button,feedback,el('a',{href:'company-briefing.html'},'Set up or reconfirm company products and markets'));
}
function reviewPanel(r){
 const note=el('textarea',{'aria-label':'Editorial review rationale',maxlength:1000,placeholder:'Why is this interpretation accurate, or why is it rejected? Public organizational rationale only.'}),feedback=el('p',{role:'status'});
 const box=el('section',{class:'req-section req-review'},el('h3',{},'Admin review'),el('button',{type:'button',class:'act',onclick:()=>editor(r)},'Append a revised version'));
 if(r.review_status==='pending')box.append(note,...['approved','rejected'].map(status=>el('button',{type:'button',class:'act',onclick:async e=>{
 const buttons=box.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const reason=note.value.trim();if(!reason)throw Error('Enter a public review rationale.');const {error}=await sb.rpc('admin_review_requirement',{p_id:r.id,p_status:status,p_reason:reason});if(error)throw error;await load();}catch(err){feedback.textContent=err.message;}finally{buttons.forEach(b=>b.disabled=false);}
 }},status==='approved'?'Approve interpretation':'Reject interpretation')),feedback);
 return box;
}
async function editor(r=null){
 const opts={agency:catalog().agencies.filter(a=>a.status==='verified').map(a=>a.id),lifecycle:['Clinical','Marketed','Both'],norm:['Regulation','Guidance','Technical instruction'],source_status:['current','draft','superseded','withdrawn','uncertain'],change_kind:CHANGE_KINDS};
 if(busy)return;
 const b=r?.body??{},form=el('form',{class:'req-editor'}),inputs={};let limits=await fetch('requirements-fields.json').then(r=>r.json());
 const key=el('input',{required:true,maxlength:80,value:r?.requirement_key??'',...(r?{readonly:true}:{})});form.append(el('label',{class:'wide'},'Stable requirement ID (retain this when revising the same obligation)',key));
 for(const k of FIELDS){
 const attrs={name:k,maxlength:limits[k],...(k.endsWith('_on')||k.startsWith('valid_')?{type:'date'}:{})};
 const input=opts[k]?el('select',attrs,...opts[k].map(v=>el('option',{value:v,selected:(b[k]??(k==='change_kind'&&r?'Unclassified':opts[k][0]))===v},v))):limits[k]>400?el('textarea',attrs,b[k]??''):el('input',{...attrs,value:b[k]??''});inputs[k]=input;
 form.append(el('label',{class:limits[k]>400?'wide':''},label(k),input));
 }
 const feedback=el('p',{role:'status',class:'wide'}),save=el('button',{class:'btn primary',type:'submit'},r?'Publish next pending version':'Publish pending capture');
 form.append(el('p',{class:'wide hint'},'Dates may be blank when unknown. Apply-until is exclusive. Use a dated source URL or a specific document edition when available. Captures and review rationales are public; company data belongs in Action Center.'),save,el('button',{class:'act',type:'button',onclick:()=>replace($('req-editor'))},'Cancel'),feedback);
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=true;form.inert=true;try{
 const body=validateBody(Object.fromEntries(FIELDS.map(k=>[k,inputs[k].value])));
 const {data,error}=await sb.rpc('admin_version_requirement',{p_key:key.value.trim(),p_body:body,p_expected:r?.id??null});if(error)throw error;
 selected=data.id;await load();replace($('req-editor'));$('req-detail').focus();
 }catch(err){feedback.textContent=err.message;}finally{busy=false;save.disabled=false;form.inert=false;}});
 replace($('req-editor'),form);key.focus();
}
async function load(){
 try{
 sb=await C.client();if(!sb)throw Error('Cloud connection is not configured.');try{await loadCatalog(sb);}catch{}let all=[];
 for(let start=0;start<20000;start+=1000){const {data,error}=await sb.from('pv_requirement_versions').select('*').order('requirement_key').order('revision').range(start,start+999);if(error)throw error;all.push(...data);if(data.length<1000)break;if(start===19000)throw Error('Library exceeds the current loading limit.');}
 rows=all;live=true;msg('Live library · source editions and review states loaded from the database. No automatic legal approval.');
 }catch{rows=(await fetch('data/requirements.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Starter file unavailable.');return r.json();})).versions;live=false;msg('Live library unavailable. Showing the initial unapproved starter set. Newer versions and reviews may be missing; do not use this copy as a current baseline.',true);}
 for(const [id,options,title] of [['req-country',catalog().jurisdictions.map(c=>[c.code,c.name]),'All countries / jurisdictions'],['req-agency',catalog().agencies.map(a=>[a.id,agencyLabel(a.id)]),'All agencies']]){const old=$(id).value;replace($(id),el('option',{value:''},title),...options.map(([v,t])=>el('option',{value:v,selected:old===v},t)));}
 const topic=$('req-topic').value;replace($('req-topic'),el('option',{value:''},'All topics'),...[...new Set(rows.map(r=>r.body.topic))].sort().map(t=>el('option',{selected:t===topic},t)));
 if(!live){admin=false;$('req-admin').hidden=true;}$('req-mode').querySelector('[value=baseline]').disabled=!live;$('req-mode').querySelector('[value=upcoming]').disabled=!live;if(!live&&['baseline','upcoming'].includes($('req-mode').value))$('req-mode').value='latest';render();
}
for(const id of ['req-search','req-country','req-agency','req-topic','req-lifecycle','req-mode','req-effective','req-known'])$(id).addEventListener(id==='req-search'?'input':'change',render);
$('req-new').addEventListener('click',()=>editor());
$('req-export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({exported_at:new Date().toISOString(),live,coverage:'Incomplete curated library; no company information included',effective_on:$('req-effective').value,known_by:$('req-known').value,view:$('req-mode').value,versions:shown},null,2)],{type:'application/json'}));const a=el('a',{href:url,download:'pv-requirements.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
(async()=>{try{await load();await C.initCloud(ws,renderDetail);admin=live&&await C.isAdmin();$('req-admin').hidden=!admin;renderDetail();}catch(e){msg(`The library could not load. ${e.message} Refresh to retry.`,true);}})();
