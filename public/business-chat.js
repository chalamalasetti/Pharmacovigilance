import {questionFamily,localWorkSummary} from './business-chat-lib.js';
import {norm,safeURL} from './product-answers-lib.js';
import {load as workspace} from './workspace.js';
export function createBusinessChat({el,bubble,json}){
 let companyIndex=null,catalog=null,active=true;const render=bubble;bubble=(...args)=>active?render(...args):null;
 const cite=(url,text)=>safeURL(url)?el('a',{href:safeURL(url),textContent:text,target:'_blank',rel:'noopener'}):el('span',{textContent:'Source URL unavailable'});
 async function companyAnswer(company,q){
  catalog??=await json('data/product-answers.json');const rows=(catalog?.products??[]).filter(p=>p.company===company.id);const data=await json('data/companies/'+encodeURIComponent(company.id)+'.json');const profile=data?.profile?.id===company.id?data.profile:company;
  const parts=[el('b',{textContent:company.name+' · public company evidence'}),el('p',{textContent:rows.length+' captured product/application records, not necessarily unique brands or a complete current portfolio.'})];
  if(/subsidiary|parent|acqui|ownership|former/i.test(q)){parts.push(el('p',{textContent:profile.parent?'Catalog parent association: '+(profile.parent.name||profile.parent.id):'No parent relationship established in the loaded catalog.'}));parts.push(el('p',{className:'chat-gap',textContent:'Product commercial-rights transfers, acquisition dates and historical ownership need dated primary evidence; a corporate relationship does not establish product rights.'}));}
  for(const p of rows.slice(0,10))parts.push(el('p',{},[cite(p.url,p.brand+' · '+p.market+' · '+p.authId)]));if(rows.length>10)parts.push(el('p',{textContent:'Showing ten records. Narrow by a specific product for application-level evidence.'}));parts.push(el('a',{href:'company.html?id='+encodeURIComponent(company.id),textContent:'Company source profile ↗'}),el('p',{className:'chat-card-src',textContent:'Company associations are not proof of manufacturer, distributor or current commercial ownership. Human review required.'}));bubble('bot',parts);
 }
 const handle=async q=>{
  const family=questionFamily(q);
  if(/^(help|what can (i ask|you answer)|question categories|explore questions)[?!. ]*$/i.test(q)){bubble('bot',[el('b',{textContent:'Ask PV Info · business question guide'}),el('p',{textContent:'Ask about a product’s ingredients, company roles, approval, market status, indications, label sections/history, comparisons, safety evidence, timeline or trials. Also ask about a company portfolio, reporting templates, your local work, or evidence sources.'}),el('p',{textContent:'Examples: “Who holds the authorisation for [product]?”, “What warnings are captured for it?”, “Show its timeline”, “Which products are associated with [company]?”, “Show US reporting templates”, “What is in my work?”'}),el('p',{className:'chat-gap',textContent:'Available snapshots are incomplete. I will identify missing evidence rather than infer manufacturer roles, commercial rights, first label additions or regulatory applicability.'})]);return true;}
  if(family==='work'){
   const summary=localWorkSummary(workspace());bubble('bot',[el('b',{textContent:'Your local briefing work'}),...Object.entries(summary).filter(([k])=>k!=='scope').map(([k,v])=>el('p',{textContent:k+': '+v})),el('p',{className:'chat-gap',textContent:summary.scope}),el('p',{textContent:'Overdue actions, reviewer verification and team decisions require the signed-in Action Center’s authoritative records; those have not been fetched.'}),el('a',{href:'action-center.html',textContent:'Open authorised Action Center view ↗'})]);return true;
  }
  if(family==='reporting'){
   const {TEMPLATES}=await import('./rule-templates-lib.js');const {COUNTRY_OPTIONS}=await import('./rule-template-expansion.js');const words=' '+norm(q)+' ';let countries=COUNTRY_OPTIONS.filter(c=>words.includes(' '+norm(c.name)+' ')||new RegExp('\\b'+c.code+'\\b').test(q));
   if(/\bfda\b/i.test(q))countries=[{code:'US',name:'United States'}];else if(/\bmhra\b|\bUK\b/i.test(q))countries=[{code:'GB',name:'United Kingdom'}];else if(/\bema\b|eudravigilance/i.test(q))countries=[{code:'EU',name:'European Union'}];
   if(countries.length!==1){const buttons=['US','EU','CA','AU','SG','NZ','GB'].map(code=>{const b=el('button',{type:'button',className:'chat-chip',textContent:code+' reporting templates'});b.onclick=()=>{const name=COUNTRY_OPTIONS.find(c=>c.code===code)?.name||code;const next=q+' '+name;respond(next);};return b;});bubble('bot',[el('p',{textContent:'Which reporting jurisdiction? I can show source-linked starters and research gaps, not determine applicability without product and case context.'}),...buttons]);return true;}
   const code=countries[0].code;const scope=/clinical|trial|ind safety/i.test(q)?'clinical':/marketed|postmarket/i.test(q)?'marketed':null;const rows=TEMPLATES.filter(t=>(t.region===code||t.countries?.includes(code))&&t.evidence==='source-linked'&&(!scope||t.scope===scope));
   bubble('bot',[el('b',{textContent:countries[0].name+' · reporting evidence starters'}),...rows.slice(0,12).map(t=>el('article',{className:'chat-card'},[el('b',{textContent:t.title}),el('p',{textContent:t.rule.days+' '+t.rule.dayType+' · '+t.rule.clockStart}),el('p',{textContent:t.rule.condition}),cite(t.source.url,t.source.title+' · '+t.source.location)])),el('p',{className:'chat-gap',textContent:rows.length?'These are unverified planning starters, not a conclusion that a rule applies. Review scope, source version, exceptions, clock and initial/follow-up distinctions.':'No source-linked starter is established for this selection. Research worksheets have blank deadlines; no timeframe is inferred.'}),el('a',{href:'rule-templates.html',textContent:'Full template evidence and research coverage ↗'})]);return true;
  }
  if(family==='portfolio'||/parent company|subsidiary|acquired.*company/i.test(q)){
   companyIndex??=await json('data/companies/index.json');const rows=(companyIndex?.companies??[]).filter(c=>[c.name,...c.aliases??[]].some(n=>norm(n).length>2&&(' '+norm(q)+' ').includes(' '+norm(n)+' ')));
   if(rows.length===1){await companyAnswer(rows[0],q);return true;}
   bubble('bot',[el('p',{textContent:rows.length?'Several company identities match. Choose the intended public catalog company.':'Please name the company as it appears in the company catalog. A portfolio or corporate relationship has not been inferred.'}),...rows.slice(0,8).map(c=>{const b=el('button',{type:'button',className:'chat-chip',textContent:c.name});b.onclick=()=>companyAnswer(c,q);return b;})]);return true;
  }
  return false;
 };
 handle.reset=()=>{active=false;};return handle;
 // Local helper re-enters only the reporting selector; no server-side action is performed.
 async function respond(q){const again=createBusinessChat({el,bubble,json});await again(q);}
}
