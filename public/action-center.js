import {impactDraftPanel,assertLocalDraftsReady} from './impact-requirements.js';
import * as W from './workspace.js';
import * as C from './cloud.js';
import {el} from './impact-view.js';
import {ACTION_TYPES,STAGES,DECISIONS,payloadFor,transition,isOverdue,matchesCase,dashboard,localCase} from './action-center-lib.js';
const $=id=>document.getElementById(id);
const replace=(node,...children)=>node.replaceChildren(...children.flat().filter(x=>x!=null&&x!==false));
const link=(url,label)=>el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},label);
const ws=W.load();const LOCAL='pv-company-action-cases-v1';
let user=null,sb=null,rows=[],selected=null,scope='local',busy=false,local={},loadGeneration=0,query={company:'',market:'',status:'all',q:''};
const params=new URLSearchParams(location.search),incoming=params.get('item');
try{local=JSON.parse(localStorage.getItem(LOCAL)||'{}');if(!local||Array.isArray(local))local={};}catch{}
const announce=(msg,bad=false)=>{$('notice').textContent=msg;$('notice').className=bad?'warn':'hint';};
const teamMode=()=>scope!=='personal'&&scope!=='local';
const getRow=()=>rows.find(r=>r.id===selected);
const field=(label,node)=>{if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',label);return el('label',{class:'action-field'},el('span',{},label),node);};
const input=(name,type='text',value='')=>el('input',{name,type,value,required:true,maxlength:type==='email'?254:2000});
const area=(name,value='')=>el('textarea',{name,rows:3,required:true,maxlength:2000},value);
const pick=(name,options,value='')=>el('select',{name,required:true},...options.map(([v,t])=>el('option',{value:v,selected:v===value},t)));
const members=()=>C.team.members.map(m=>[m.email,m.email]);
async function rpc(name,args){const {data,error}=await sb.rpc(name,args);if(error)throw error;return data;}
function candidates(){
 const items=teamMode()?[...C.team.items.values()].map(r=>({key:r.update_id,snapshot:r.snapshot})):Object.entries(ws.items).filter(([,r])=>r.assess&&r.snapshot?.companyContext).map(([key,r])=>({key,snapshot:r.snapshot}));
 return items.filter(x=>x.snapshot?.companyContext?.companyId&&!rows.some(r=>r.source_key===x.key));
}
async function loadRows(){
 const generation=++loadGeneration,target=scope;let loaded=[];
 if(target==='local')loaded=Object.values(local);
 else {
  for(let from=0;from<10000;from+=500){
   let q=sb.from('company_cases').select('*').order('updated_at',{ascending:false}).order('id').range(from,from+499);
   q=target!=='personal'?q.eq('team_id',target):q.is('team_id',null).eq('owner_id',user.id);
   const {data,error}=await q;if(error)throw error;loaded.push(...data);if(data.length<500)break;
  }
  if(loaded.length===10000)announce('Showing the first 10,000 cases. Narrow the company scope in your database before adding more.',true);
 }
 if(generation!==loadGeneration||target!==scope)return;
 rows=loaded;rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 if(incoming&&!selected)selected=rows.find(r=>r.source_key===incoming)?.id??null;
 if(!rows.some(r=>r.id===selected))selected=null;
 render();
}
async function startCase(candidate,button){
 if(busy)return;busy=true;button.disabled=true;
 try{
  const snapshot=W.snapshot(candidate.snapshot);
  let row;
  if(scope==='local'){
   row=local[candidate.key]??localCase(snapshot,candidate.key);
   const next={...local,[candidate.key]:row};localStorage.setItem(LOCAL,JSON.stringify(next));local=next;
  }else row=await rpc('open_company_case',{p_source_key:candidate.key,p_snapshot:snapshot,p_team_id:teamMode()?scope:null});
  selected=row.id;await loadRows();announce('Case opened. Existing applicability decisions remain in the original queue; review and confirm the decision here.');
 }catch(e){announce(e.message,true);}finally{busy=false;button.disabled=false;}
}
async function command(row,verb,raw,form){
 if(busy)return;busy=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{
  const payload=payloadFor(verb,raw);
  if(scope==='local'&&verb==='approve')assertLocalDraftsReady(row);
  // The local validator is for usability; the server independently enforces team rules.
  transition(row,verb,payload,user?.email??'local');
  let next;
  if(scope==='local'){
   const current=JSON.parse(localStorage.getItem(LOCAL)||'{}')[row.source_key];
   if(current?.version!==row.version)throw Error('This case changed in another tab. Refresh before saving.');
   next=transition(row,verb,payload,'local');
   const updated={...local,[row.source_key]:next};localStorage.setItem(LOCAL,JSON.stringify(updated));local=updated;
  }else next=await rpc('advance_company_case',{p_id:row.id,p_version:row.version,p_command:verb,p_payload:payload});
  rows=rows.map(r=>r.id===next.id?next:r);render();announce(verb==='approve'?'Closure verified and recorded.':'Saved. The case history records this change.');
 }catch(e){announce(e.message+' Your unsaved form is still available.',true);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
}
function workflowForm(row,verb,title,fields,buttonText){
 const form=el('form',{class:'action-form',onsubmit:e=>{e.preventDefault();command(row,verb,Object.fromEntries(new FormData(form)),form);}},el('h3',{},title),...fields,el('button',{type:'submit',class:'btn primary'},buttonText));return form;
}
function filters(){
 const companies=new Map(rows.map(r=>[r.snapshot.companyContext.companyId,r.snapshot.companyContext.companyName]));
 const markets=[...new Set(rows.flatMap(r=>r.snapshot.companyContext.markets))].sort();
 const scopes=[['local','This browser only'],...(user?[['personal','My private account'],...C.team.list.map(t=>[t.id,`Team: ${t.name}`])]:[])];
 const select=pick('scope',scopes,scope);select.setAttribute('aria-label','Work visibility');select.onchange=async()=>{
  if(busy){select.value=scope;return;}busy=true;scope=select.value;select.disabled=true;selected=null;query={company:'',market:'',status:'all',q:''};replace($('case-list'));replace($('case-detail'));replace($('candidates'));replace($('counts'));
  try{if(teamMode())await C.setActiveTeam(ws,scope);await loadRows();announce('Workspace loaded.');}catch(e){rows=[];render();announce(e.message,true);}finally{busy=false;select.disabled=false;}
 };
 const company=pick('company',[['','All companies'],...[...companies]],query.company);company.setAttribute('aria-label','Filter company');company.onchange=()=>{query.company=company.value;render();};
 const market=pick('market',[['','All markets'],...markets.map(m=>[m,m])],query.market);market.setAttribute('aria-label','Filter market');market.onchange=()=>{query.market=market.value;render();};
 const search=input('search','search',query.q);search.required=false;search.placeholder='Search cases or owner email';search.setAttribute('aria-label','Search cases');search.oninput=()=>{query.q=search.value;renderList();};
 replace($('filters'),field('Work visibility',select),field('Company',company),field('Market',market),field('Search',search),el('button',{type:'button',class:'act',onclick:async()=>{try{await loadRows();announce('Latest cases loaded.');}catch(e){announce(e.message,true);}}},'Refresh'));
 $('privacy-note').textContent=scope==='local'?'Browser-only work: not synced or shared. Anyone using this browser profile can access it. Personal closure is self-reviewed.':teamMode()?`Shared only with current members of ${C.team.name}. Closure requires a different designated teammate to verify.`:'Private to your signed-in account (authorized database administrators can access stored records). Closure is explicitly self-reviewed.';
}
function renderCandidates(){
 const all=candidates().filter(x=>!incoming||x.key===incoming);const visible=all.slice(0,20);
 replace($('candidates'),visible.length?el('details',{open:Boolean(incoming)},el('summary',{},`${all.length} assessment handoff${all.length===1?'':'s'} ready to start`),...visible.map(c=>{
  const button=el('button',{class:'act',type:'button',onclick:()=>startCase(c,button)},'Start case');
  return el('div',{class:'action-candidate'},el('span',{},`${c.snapshot.companyContext.companyName} · ${c.snapshot.title}`),button);
 }),all.length>20?el('p',{class:'hint'},'Showing 20 handoffs. Start a case to see the next one.'):null):null);
}
function renderList(){
 const filtered=rows.filter(r=>matchesCase(r,query));
 replace($('case-list'),el('h2',{},`Cases (${filtered.length})`),...filtered.map(r=>el('button',{type:'button',class:`action-case${r.id===selected?' selected':''}`,'aria-pressed':r.id===selected,onclick:()=>{selected=r.id;renderList();renderDetail();}},el('span',{class:'meta'},`${r.snapshot.companyContext.companyName} · ${r.snapshot.companyContext.markets.join(', ')}`),el('strong',{},r.snapshot.title),el('span',{class:isOverdue(r)?'warn':'hint'},`${STAGES[r.stage]}${isOverdue(r)?' · OVERDUE':''}${r.action?.due?' · Due '+r.action.due:''}`))),!filtered.length?el('p',{class:'empty'},'No cases match these filters. Send a matched item from My Company Briefing to start.'):null);
}
function renderDetail(){
 const row=getRow();if(!row){replace($('case-detail'),el('p',{class:'empty'},'Select a case to review evidence and manage its next step.'));return;}
 const s=row.snapshot,c=s.companyContext,forms=[];
 if(['assessment','action'].includes(row.stage))forms.push(workflowForm(row,'decide',row.action?'Reassess applicability (clears the current action)':'2. Decide applicability',[
  field('Applicability',pick('decision',Object.entries(DECISIONS),row.decision?.decision??'more_information')),field('Decision reason',area('reason',row.decision?.reason??''))],'Save applicability'));
 if(['assessment','action'].includes(row.stage)&&row.decision?.decision==='relevant')forms.push(workflowForm(row,'assign','3. Assign action',[
  field('Action type',pick('type',ACTION_TYPES.map(t=>[t,t]),row.action?.type??ACTION_TYPES[0])),field('Owner email',teamMode()?pick('owner',members(),row.action?.owner??user?.email):input('owner','email',row.action?.owner??user?.email??'')),field('Due date',input('due','date',row.action?.due??'')),field('Action instructions',area('instruction',row.action?.instruction??''))],'Save action'));
 const canComplete=!teamMode()||!row.action||row.action.owner===user?.email?.toLowerCase();
 if((row.stage==='action'||row.stage==='assessment'&&row.decision?.decision==='not_relevant')&&canComplete)forms.push(workflowForm(row,'complete','4. Submit closure evidence',[
  field(row.action?'What changed / work performed':'Why no action is required',area('changed')),
  field('Supporting evidence label',input('label','text')),
  field('Supporting evidence HTTPS document link',input('url','url')),
  teamMode()?field('Independent reviewer email',pick('reviewer',[['','Choose a different teammate'],...members().filter(([v])=>v.toLowerCase()!==user.email.toLowerCase())])):el('p',{class:'hint'},'You will verify this personal case yourself. It will be marked self-reviewed.')
 ],'Submit for verification'));
 if(row.stage==='action'&&!canComplete)forms.push(el('p',{class:'hint'},`Only ${row.action.owner} can submit completion.`));
 if(row.stage==='verification'){
  const canReview=!teamMode()||row.completion?.reviewer===user?.email?.toLowerCase();
  if(canReview){forms.push(workflowForm(row,'approve',teamMode()?'5. Verify closure':'5. Verify closure (self-review)',[field('Reviewer verification note',area('reason'))],teamMode()?'Approve and close':'Confirm self-review and close'));
   forms.push(workflowForm(row,'return','Return for rework',[field('Rework reason',area('reason'))],'Return to work'));
  }else forms.push(el('p',{class:'warn'},`Awaiting independent verification by ${row.completion.reviewer}. The submitter cannot approve closure.`));
 }
 if(row.stage==='closed')forms.push(workflowForm(row,'reopen','Reopen with a reason',[field('Reopen reason',area('reason'))],'Reopen case'));
 const history=el('details',{},el('summary',{},`Case history (${row.history?.length??0} events)`),...(row.history??[]).slice().reverse().map(h=>el('div',{class:'action-event'},el('strong',{},`${h.command} · version ${h.version}`),el('p',{class:'hint'},`${h.at} · ${h.by??'local'}`),h.detail?el('p',{},JSON.stringify(h.detail)):null)));
 const exportButton=el('button',{class:'act',type:'button',onclick:()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(row,null,2)],{type:'application/json'}));const a=el('a',{href:url,download:'pv-company-case.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}},'Export this private case');
 replace($('case-detail'),el('h2',{},s.title),el('p',{class:'meta'},`${c.companyName} · ${c.markets.join(', ')} · ${STAGES[row.stage]} · Version ${row.version}`),
  el('section',{class:'action-evidence'},el('h3',{},'1. Review evidence'),c.sourceItem?.startsWith('candidate:')?el('p',{},el('a',{href:`documents.html?candidate=${encodeURIComponent(c.sourceItem.slice(10))}`},'Open pinned document extraction and comparison')):null,c.sourceItem?.startsWith('requirement:')?el('p',{},el('a',{href:`requirements.html?version=${encodeURIComponent(c.sourceItem.slice(12))}`},'Open pinned requirement version and comparison')):null,link(s.link,c.evidenceKind==='paper'?'Open paper and original publication links':'Open original source'),el('p',{},`${s.source??''} · Published ${s.published?s.published.slice(0,10):'date not reported'}`),el('p',{},'Why it matched: ',c.reason??'Not reported'),el('p',{},c.scopeReason??''),el('p',{class:'hint'},`Portfolio revision ${c.portfolioRevision??'unknown'} · confirmed ${c.portfolioConfirmedAt??'date unknown'}. Frozen evidence snapshot; a match does not establish applicability.`),...(c.products??[]).slice(0,12).map(p=>el('p',{},`${p.brand} · ${p.market} · ${p.authId}`))),
  row.decision?el('p',{class:'whyhere'},`${DECISIONS[row.decision.decision]}: ${row.decision.reason}`):null,
  row.action?el('p',{},`${row.action.type} · ${row.action.owner} · Due ${row.action.due}: ${row.action.instruction}`):null,
  row.completion?el('section',{class:'action-evidence'},el('h3',{},'Submitted closure evidence'),el('p',{},row.completion.changed),...row.completion.evidence.map(e=>el('p',{},link(e.url,e.label))),el('p',{class:'hint'},`Submitted by ${row.completion.by} · ${row.completion.at}`)):null,
  row.approval?el('p',{class:'whyhere'},`${row.approval.selfReview?'Self-reviewed':'Independently verified'} by ${row.approval.by} · ${row.approval.at}: ${row.approval.reason}`):null,
  ...forms,impactDraftPanel({row,scope,user,sb,members:C.team.members}),history,exportButton);
}
function render(){
 filters();const scoped=rows.filter(r=>matchesCase(r,{...query,status:'all'})),counts=dashboard(scoped);
 replace($('counts'),...Object.entries({assessment:'Awaiting assessment',due:'Actions due',overdue:'Overdue',verification:'Awaiting verification',closed:'Closed'}).map(([key,label])=>el('button',{class:`tile${key==='overdue'&&counts[key]?' safety':''}`,type:'button','aria-pressed':query.status===key,onclick:()=>{query.status=query.status===key?'all':key;render();}},el('b',{},String(counts[key])),el('span',{},label))));
 renderCandidates();renderList();renderDetail();
}
async function main(){
 try{sb=await C.client();user=await C.currentUser();if(user)await C.initCloud(ws);else await C.navOnly();
  scope=user?(params.get('scope')==='team'&&C.team.id?C.team.id:'personal'):'local';await loadRows();announce('Choose an assessment handoff or an existing case.');
 }catch(e){rows=[];render();announce(`Action Center could not load: ${e.message}. Sign in again or use This browser only.`,true);}
}
main();
