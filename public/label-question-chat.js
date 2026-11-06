import {norm,safeURL} from './product-answers-lib.js';
import {displayDate,termMatches} from './label-history-lib.js';
import {parseLabelQuestion,repositoryCandidates,createRepositoryReader,assessLabelHistory,appNumber} from './label-question-lib.js';
import {safetyNotice} from './safety-notice.js';

export function createLabelQuestionChat({el,bubble,json,readRepository=createRepositoryReader(),fetcher=fetch}){
 let session=null,epoch=0;
 const p=text=>el('p',{textContent:text}),strong=text=>el('b',{textContent:text});
 const link=(url,text)=>/^(data-repository\.html|labels\.html#label-discovery)$/.test(url||'')?el('a',{href:url,textContent:text}):safeURL(url)?el('a',{href:safeURL(url),target:'_blank',rel:'noopener noreferrer',textContent:text}):p('Source reference unavailable');
 const live=s=>session===s&&s.epoch===epoch;
 const button=(text,action)=>el('button',{type:'button',className:'chat-chip',textContent:text,onclick:action});
 const say=(s,nodes)=>{if(!live(s))return null;const node=bubble('bot',nodes);s.nodes.push(node);return node;};
 const disable=s=>{for(const node of s?.nodes||[])for(const control of node.querySelectorAll('button,input'))control.disabled=true;};
 async function api(s,params){const response=await fetcher('/api/label-history?'+new URLSearchParams(params),{signal:s.controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Official evidence retrieval failed.');if(!live(s)||s.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');return data;}
 function reset(){epoch++;session?.controller.abort();disable(session);session=null;}
 const guard=(s,fn)=>async()=>{if(!live(s)||s.controller.signal.aborted)return;try{await fn();}catch(error){if(live(s)&&error.name!=='AbortError')say(s,[p(error.message),p('No date was inferred. Retry with the product, market and safety phrase.')]);}};
 function download(s){const result=s.history?assessment(s):null;const pack={schema:'pv-label-question-evidence/1',question:s.question,term:s.term,market:s.market,product:s.product,family:s.family,repository:s.repository,history:s.history,versions:[...s.versions.values()],failures:[...s.failures].map(([version,error])=>({version,error})),result,capturedChanges:s.changes??[],application:s.application??null,notice:safetyNotice()};const url=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));const a=el('a',{href:url,download:'pvinfo-label-question-evidence.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function assessment(s){return assessLabelHistory({entries:s.history.entries,versions:[...s.versions.values()],failures:[...s.failures].map(([version,error])=>({version,error})),term:s.term,indexComplete:s.history.indexComplete});}
 function termForm(s){const input=el('input',{type:'text',className:'chat-input',maxLength:100,placeholder:'Exact safety phrase','aria-label':'Safety phrase to investigate',value:s.term||''});const submit=el('button',{type:'submit',className:'chat-chip',textContent:'Investigate phrase'});const form=el('form',{className:'chat-research-term'},[input,submit]);form.onsubmit=e=>{e.preventDefault();const value=input.value.trim();if(value.length<2)return;const old=s;if(!live(old))return;reset();const next=newSession('When was '+value+' first added to '+old.product.brand+' in the '+old.market+' label?',value,old.market);next.product=old.product;next.repository=old.repository;next.family=old.family;next.history=old.history;next.versions=old.versions;next.textSize=old.textSize||0;next.wantsHistory=true;next.failures=new Map();next.changes=old.changes;next.application=old.application;if(next.history)guard(next,()=>research(next))();else guard(next,()=>families(next))();};return form;}
 function newSession(question,term,market){const s={epoch:++epoch,question,term,market,controller:new AbortController(),versions:new Map(),failures:new Map(),stage:'market',running:false,nodes:[]};session=s;return s;}
 async function products(s){
  disable(s);s.stage='loading';const loading=say(s,[p('Loading published product evidence…')]);
  try{const data=await readRepository(s.market,{signal:s.controller.signal,progress:text=>{if(live(s))loading?.replaceChildren(p(text));}});if(!live(s))return;s.records=data.records;s.repository={built:data.built,release:data.release};const rows=repositoryCandidates(data.records,s.lookup||s.question);s.stage='product';loading?.remove();
   let shown=0;const host=say(s,[strong('Confirm the product · '+s.market),p('Choose an application or source product. Different presentations and label families can have different histories.'),p(rows.length+' matching product/application groups. Type the exact product name to narrow these choices.')]);
   const more=button('Show more products',()=>draw());function draw(){if(!live(s)||s.stage!=='product')return;more.remove();for(const product of rows.slice(shown,shown+10)){const b=button(product.brand+' · '+(product.application||product.id)+' · '+product.company,guard(s,async()=>{if(s.stage!=='product')return;s.product=product;disable(s);s.stage='selected';say(s,[strong(product.brand+' · '+s.market+' · '+(product.application||'source product')),p(product.approvalDate?'Reported approval date: '+product.approvalDate+' · '+product.dateMeaning:'Approval date is not established in this source record.'),p('Source company: '+(product.company||'not captured')),link(product.url,'Product / approval reference ↗'),link(data.release,'Published repository snapshot ↗')]);if(!s.wantsHistory)return;if(!s.term){say(s,[p('Which exact safety phrase should I investigate?'),termForm(s)]);return;}await families(s);}));host?.append(b);}shown+=10;if(shown<rows.length)host?.append(more);}draw();
   if(!rows.length)say(s,[p('No matching product was found in this market’s connected repository sources. A missing match does not establish that the medicine is unapproved.'),link('data-repository.html','Explore source coverage ↗')]);
  }catch(error){loading?.remove();throw error;}
 }
 async function families(s,page=1){
  if(s.market!=='US'){say(s,[p('The approval evidence above is market-specific. Automated historical label-version retrieval currently covers US DailyMed families; this market needs its own historical-label connector. No US label date is substituted.'),link('labels.html#label-discovery','Open label evidence tools ↗')]);return;}
  disable(s);s.stage='finding';const loading=say(s,[p('Finding US label families. Confirm the exact family before the historical search…')]);
  try{const data=await api(s,{mode:'search',q:s.product.application||s.product.brand,field:s.product.application?'application':'brand',page});if(!live(s))return;loading?.remove();s.stage='family';
   const rows=data.results.filter(f=>!s.product.application||f.applications.map(appNumber).includes(s.product.application));
   const nodes=[strong('Choose the exact US label family'),p('Product: '+s.product.brand+' · phrase: '+s.term+'. Manufacturer/labeler, formulation and Set ID define the scope. The latest label date is not the first-addition date.')];
   for(const family of rows)nodes.push(el('article',{className:'chat-card'},[strong(family.brands.join(' / ')||family.title),p(family.companies.join('; ')+' · '+family.ingredients.join('; ')),p('Applications: '+family.applications.join(', ')+' · Set ID '+family.setid),link(family.sourceURL,'Review this label family ↗'),button('Investigate label '+family.setid,guard(s,async()=>{if(s.stage!=='family')return;disable(s);s.stage='history';s.family=family;await history(s);} ))]));
   if(!rows.length)nodes.push(p('No verified family on this result page. This does not establish absence of a historical label.'));
   if(page>1)nodes.push(button('Previous label families',guard(s,()=>families(s,page-1))));
   if(page*10<data.total&&page<100)nodes.push(button('More label families',guard(s,()=>families(s,page+1))));nodes.push(link(data.sourceURL,'Official label search reference ↗'));say(s,nodes);
  }catch(error){loading?.remove();throw error;}
 }
 async function history(s){
  const loading=say(s,[p('Reading the available version index…')]);
  try{let h=await api(s,{mode:'history',setid:s.family.setid,page:1});const entries=new Map(h.entries.map(e=>[e.version,e]));let pages=1;
   while(pages<h.totalPages&&pages<10){const next=await api(s,{mode:'history',setid:s.family.setid,page:pages+1});for(const e of next.entries)entries.set(e.version,e);pages++;}
   s.history={...h,entries:[...entries.values()].sort((a,b)=>a.version-b.version),indexComplete:pages>=h.totalPages&&entries.size===h.total};
   s.changes=(await json('data/labels.json'))?.records??null;if(!live(s))return;loading?.remove();await research(s);
  }catch(error){loading?.remove();throw error;}
 }
 async function research(s,retry=false){
  if(s.running||!live(s))return;s.running=true;s.stage='research';if(retry)s.failures.clear();
  const line=p('Retrieving historical wording…'),cancel=button('Stop investigation',()=>{if(!live(s))return;s.controller.abort();s.stage='stopped';disable(s);say(s,[p('Investigation stopped. Retrieved evidence remains downloadable; no complete-history conclusion is made.'),button('Download retrieved evidence',()=>download(s))]);});
  const progress=say(s,[strong(s.product.brand+' · '+s.term),line,cancel]);let attempts=0,limit=false;
  try{
   for(const entry of s.history.entries){
    if(!live(s)||s.controller.signal.aborted)return;
    if(s.versions.has(entry.version)){if(s.versions.get(entry.version).sections.some(sec=>termMatches(sec.title+' '+sec.text,s.term)))break;continue;}
    if(s.failures.has(entry.version))continue;
    if(attempts>=40){limit='batch';break;}if(s.versions.size>=200){limit='versions';break;}attempts++;line.textContent='Checking v'+entry.version+' · '+s.versions.size+' / '+s.history.total+' versions retrieved. Searching oldest to newest…';
    try{const version=await api(s,{mode:'version',setid:s.family.setid,version:entry.version});if(version.setid!==s.family.setid||version.version!==entry.version)throw Error('Version identity mismatch.');if(s.product.application&&version.applications.length&&!version.applications.includes(s.product.application))throw Error('Application identity differs in this historical version.');
     const size=JSON.stringify(version).length;if((s.textSize||0)+size>30_000_000){limit='text';break;}s.textSize=(s.textSize||0)+size;s.versions.set(entry.version,version);
    }catch(error){if(error.name==='AbortError')return;s.failures.set(entry.version,error.message);}
    const result=assessment(s);if(result.first)break;
   }
   if(live(s)&&!s.controller.signal.aborted){s.stage='answer';showResult(s,limit);}
  }finally{s.running=false;progress?.remove();}
 }
 function showResult(s,limit=false){
  const result=assessment(s),nodes=[strong(s.product.brand+' · '+s.term),p(result.status),p('Scope: US · '+s.family.setid+' · '+(s.product.application||'application not established'))];
  for(const [version,label]of [[result.before,'Earlier version'],[result.first,'Earliest retrieved matching version']])if(version)nodes.push(el('article',{className:'chat-card'},[strong(label+' · v'+version.version),p('SPL effective date: '+displayDate(version.effectiveTime)),p('DailyMed publication: '+(s.history.entries.find(e=>e.version===version.version)?.publishedDate||'not supplied')),link(version.sourceURL,'Original historical SPL ZIP ↗'),p('SHA-256: '+version.hash)]));
  if(result.before&&result.first)nodes.push(p('Observed change lies between these retrieved versions. These effective/publication dates do not establish the regulatory approval date or a product-wide first addition.'));
  for(const section of result.diff.slice(0,4)){const sides=[];for(const [side,title]of [['before','Earlier wording'],['after','Later wording']])sides.push(strong(title),...section[side].filter(x=>x.changed).slice(0,4).map(x=>p(x.text.slice(0,2400)+(x.text.length>2400?'…':''))));nodes.push(el('details',{},[el('summary',{textContent:section.title+' · observed wording changes'}),...sides]));}
  if(!result.before)for(const section of result.matchingSections.slice(0,3))nodes.push(el('article',{className:'chat-card'},[strong(section.title),p(section.text.slice(0,2400)+(section.text.length>2400?'…':''))]));
  const captured=(s.changes??[]).filter(r=>r.market==='US'&&r.kind==='approved_change'&&s.product.application&&appNumber(r.authId)===s.product.application&&(r.sections??[]).some(sec=>termMatches(sec.title+' '+(sec.paragraphs??[]).map(x=>x.text).join(' '),s.term)));
  nodes.push(strong('Regulatory change approval evidence'));
  if(s.changes===null)nodes.push(p('Captured regulatory-change records could not be loaded; this approval-date check is incomplete.'));
  else if(!captured.length)nodes.push(p('A term-specific regulatory approval date is not established in the captured change records. Version dates are not substituted.'));
  for(const change of captured.slice(0,8))nodes.push(el('article',{className:'chat-card'},[p('FDA approved-change capture · reported date '+(change.published||'unknown')+' · '+change.authId),link(change.url,change.locator||change.title),p('Application-matched evidence; review the source to confirm the same wording change and label family. This does not prove the first addition.')]));
  nodes.push(p('Coverage: '+s.versions.size+' / '+s.history.total+' listed versions retrieved · '+s.failures.size+' failed · index '+(s.history.indexComplete?'complete as returned':'incomplete')+'.'));
  if(result.coverage.numericGaps||!result.coverage.startsAtVersionOne)nodes.push(p('The available index omits earlier or intervening version numbers. First-ever addition cannot be established.'));
  for(const [version,error]of s.failures)nodes.push(p('Unavailable v'+version+': '+error));
  if(s.failures.size)nodes.push(button('Retry missing versions',guard(s,()=>research(s,true))));
  if(limit)nodes.push(p(limit==='batch'?'This pass checked 40 new versions. Continue to search the next batch.':'Session limit reached (200 versions or 30 MB of text). Download the retrieved evidence and review the remaining versions using the official history index.'));
  if(limit==='batch')nodes.push(button('Continue investigation (next 40 versions)',guard(s,()=>research(s))));
  nodes.push(p('Up to four matching section comparisons and eight captured change entries are displayed. The evidence download retains all retrieved version text.'),p('Matching is literal narrative text, including negated mentions. Images, synonyms and clinical significance require human review. Official first-addition date remains unestablished.'),link(s.history.sourceURL,'DailyMed history index ↗'),button('Download answer, references and compared wording',()=>{if(live(s))download(s);}),termForm(s));say(s,nodes);
 }
 const respond=async q=>{
  const parsed=parseLabelQuestion(q),simple=/^(?:(?:what|how) about |in |for )?(?:the )?(us|usa|united states|fda|eu|european union|ema|canada|ca|health canada)[?. ]*$/i.test(q);
  if(session&&/^show sources[?. ]*$/i.test(q)){say(session,[link(session.repository?.release,'Published product dataset ↗'),...(session.history?[link(session.history.sourceURL,'Selected history index ↗')]:[]),button('Download current evidence',()=>download(session))]);return true;}
  if(simple&&session&&parsed.market){const previous=session;if(previous.stage==='market'){previous.market=parsed.market;await guard(previous,()=>products(previous))();}else{reset();const next=newSession(previous.question+' [Market changed to '+parsed.market+' by user]',previous.term,parsed.market);next.wantsHistory=previous.wantsHistory;await guard(next,()=>products(next))();}return true;}
  if(session?.stage==='product'&&!parsed.history&&!parsed.approval&&!/\b(latest|updates|alerts|reporting|help|work|owns|company)\b/i.test(q)){session.lookup=q;await guard(session,()=>products(session))();return true;}
  if(!parsed.history&&!parsed.approval)return false;
  reset();const s=newSession(q,parsed.term,parsed.market);s.wantsHistory=parsed.history;
  if(!s.market){say(s,[p('Which market should I investigate? Approval dates and label histories differ by jurisdiction.'),...['US','EU','CA'].map(m=>button(m,guard(s,async()=>{if(s.stage!=='market')return;s.market=m;await products(s);})))]);return true;}
  await guard(s,()=>products(s))();return true;
 };
 respond.reset=reset;return respond;
}
