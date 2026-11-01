import { searchCompanies, COVERAGE } from './companies-lib.js';
import { productKey, selectableProducts, confirmPortfolio, portfolioState, scopedItems, assessmentHandoff, assessmentKey } from './company-briefing-lib.js';
import { el, impactSection } from './impact-view.js';
import * as workspace from './workspace.js';
import * as cloud from './cloud.js';

const $ = id => document.getElementById(id);
const replace = (node,...children) => node.replaceChildren(...children.flat().filter(x=>x!=null && x!==false));
const ws = workspace.load();
let index, company, draft, editing = true, generation = 0, productQuery = '', limit = 40;
let filters = { days: 30, includeClass: false, includeOutside: false };
const portfolio = () => ws.companyPortfolios?.[company?.profile.id];
const external = (url,text) => el('a',{href:url,target:'_blank',rel:'noopener'},text);
const message = (text,bad=false) => { $('notice').textContent=text; $('notice').className=bad?'warn':'hint'; };
const scopeCounts = () => $('scope-count').textContent = `${draft.productKeys.size} selected product records · ${draft.markets.size} markets`;

function renderSearch() {
  const result = searchCompanies(index,$('company-search').value,10);
  replace($('company-results'),
    result.ambiguous ? el('p',{class:'warn'},`“${result.ambiguous.term}” identifies different companies. Choose the correct organization below.`) : null,
    ...result.results.map(({company:c,via})=>el('button',{type:'button',class:'co-choice',onclick:()=>choose(c.id)},el('strong',{},c.name),el('span',{class:'hint'},`${c.legal??c.name} · ${c.region}${via?' · '+via:''}`))),
    !result.results.length && $('company-search').value.trim().length>=2 ? el('p',{class:'empty'},'No company matches. Try an alias, or browse ',el('a',{href:'companies.html'},'Company Explorer'),'.') : null);
}
async function choose(id) {
  if (!index.companies.some(c=>c.id===id)) { message('Choose a company from the directory.',true); return; }
  const version=++generation;
  message('Loading company products and evidence…');
  try {
    const res=await fetch(`data/companies/${encodeURIComponent(id)}.json`,{cache:'no-cache'});
    if(!res.ok)throw new Error();
    const data=await res.json();
    if(version!==generation)return;
    if(data.profile?.id!==id || !Array.isArray(data.products))throw new Error();
    company=data;
    ws.activeCompany=id;
    workspace.save(ws);
    const p=portfolio();
    draft={markets:new Set(p?.markets??[]),productKeys:new Set(p?.productKeys??[])};
    editing=portfolioState(p,company)!=='confirmed';
    history.replaceState(null,'',`?company=${encodeURIComponent(id)}`);
    replace($('company-results'),);
    $('company-search').value=company.profile.name;
    productQuery='';limit=40;message('');render();
  }catch{if(version===generation)message('Company data could not load. Your saved scope is preserved. Try selecting the company again.',true);}
}
function renderProducts() {
  const all=selectableProducts(company).filter(p=>draft.markets.has(p.market));
  const q=productQuery.toLowerCase();
  const rows=all.filter(p=>`${p.brand} ${p.ingredients.join(' ')} ${p.authId}`.toLowerCase().includes(q));
  replace($('product-list'),...rows.slice(0,limit).map(p=>{
    const key=productKey(p);
    const check=el('input',{type:'checkbox',checked:draft.productKeys.has(key),onchange:e=>{if(e.target.checked)draft.productKeys.add(key);else draft.productKeys.delete(key);scopeCounts();}});
    return el('div',{class:'portfolio-product'},el('label',{class:'check'},check,el('span',{},el('strong',{},p.brand),el('span',{class:'hint'},` ${p.ingredients.join(' + ')} · ${p.market} · ${p.authId}`))),el('p',{class:'hint'},`${p.holder} · ${p.status} · `,external(p.url,'Source record')));
  }),!rows.length?el('p',{class:'empty'},all.length?'No products match your search.':'Choose at least one market to see products.'):null,
  rows.length>limit?el('button',{type:'button',class:'more',onclick:()=>{limit+=40;renderProducts();}},`Show more (${rows.length-limit} remaining)`):null);
  scopeCounts();
}
function setup() {
  const available=selectableProducts(company);
  const markets=[...new Set(available.map(p=>p.market))].sort();
  $('scope-editor').hidden=!editing;
  if(!editing)return;
  replace($('scope-editor'),
    el('h2',{},'2. Confirm products and markets'),
    el('p',{class:'hint'},'This defines your monitoring scope. It does not confirm commercial availability, company responsibility, or regulatory applicability. Only sourced US/EU records are currently available.'),
    el('fieldset',{class:'portfolio-markets'},el('legend',{},'Markets'),...markets.map(m=>el('label',{class:'check'},el('input',{type:'checkbox',checked:draft.markets.has(m),onchange:e=>{if(e.target.checked)draft.markets.add(m);else{draft.markets.delete(m);for(const p of available.filter(p=>p.market===m))draft.productKeys.delete(productKey(p));}renderProducts();}}),m==='US'?'United States':'European Union'))),
    el('div',{class:'row'},el('input',{type:'search','aria-label':'Search product records',placeholder:'Filter brand, substance or authorization',value:productQuery,oninput:e=>{productQuery=e.target.value;limit=40;renderProducts();}}),
      el('button',{type:'button',class:'act',onclick:()=>{for(const p of available.filter(p=>draft.markets.has(p.market)))draft.productKeys.add(productKey(p));renderProducts();}},'Select all current products in chosen markets'),
      el('button',{type:'button',class:'act',onclick:()=>{draft.productKeys.clear();renderProducts();}},'Clear selection')),
    el('p',{id:'scope-count',class:'hint','aria-live':'polite'}),el('div',{id:'product-list',class:'portfolio-products'}),
    el('button',{type:'button',class:'btn primary',disabled:!available.length,onclick:()=>{
      try{
        const p=confirmPortfolio(company,{markets:[...draft.markets],productKeys:[...draft.productKeys]},portfolio());
        ws.companyPortfolios={...(ws.companyPortfolios??{}),[company.profile.id]:p};workspace.save(ws);editing=false;message('Monitoring scope confirmed. Review matches below.');render();
      }catch(e){message(e.message,true);}
    }},'Confirm scope and build briefing'),
    !available.length?el('p',{class:'warn'},'No current products are mapped for this company. ',el('a',{href:`company.html?id=${encodeURIComponent(company.profile.id)}&tab=sources`},'Review coverage and sources'),'. No company-wide matches will be treated as product matches.'):null);
  renderProducts();
}
async function send(item,button,feedback) {
  button.disabled=true;
  try{
    if(portfolioState(portfolio(),company)!=='confirmed')throw new Error('The portfolio changed. Reconfirm the monitoring scope first.');
    const u=assessmentHandoff(item,portfolio());
    const existing=workspace.item(ws,u.id);
    const shared=cloud.team.items.get(u.id);
    const assess=shared?.assess??existing.assess??{status:'open',at:new Date().toISOString()};
    // Preserve the evidence and scope used for an existing assessment.
    const target=shared?.snapshot??existing.snapshot??u;
    if(!existing.assess)workspace.update(ws,u.id,{assess,snapshot:workspace.snapshot(target)});
    if(cloud.team.id){
      if(!cloud.team.items.has(u.id))await cloud.teamAction({...target,id:u.id},{assess});
      replace(feedback,'In ',el('a',{href:'team.html'},`${cloud.team.name} → All open`),'. No duplicate created.');
    }else replace(feedback,'Saved under assessment in your workspace. ',el('a',{href:'briefing.html'},'Open My Briefing → My work'),'. Sign in and join a team to share it.');
    const box=button.closest('article').querySelector('.company-assessment');
    replace(box,impactSection({...target,id:u.id},{ws,countryName:c=>c}));
    button.textContent=cloud.team.id?'In team assessment queue':'Under assessment';
  }catch(e){feedback.textContent=`${e.message} Your local assessment, if saved, is preserved. Retry to share it.`;}finally{button.disabled=false;}
}
function itemCard(item) {
  const isPaper=item.kind==='paper';
  const feedback=el('p',{class:'hint',role:'status'});
  const key=assessmentKey(item,portfolio());
  const inTeam=cloud.team.id && cloud.team.items.has(key);
  const exists=Boolean(workspace.item(ws,key).assess);
  const label=inTeam || (!cloud.team.id && exists) ? 'Open assessment' : cloud.team.id ? `Send to ${cloud.team.name} for assessment` : 'Send for assessment';
  const button=el('button',{type:'button',class:'btn primary',onclick:()=>send(item,button,feedback)},label);
  const source=isPaper?`paper.html?id=${encodeURIComponent(item.paper)}`:item.link;
  return el('article',{class:`card c-${item.category??'news'} portfolio-item`},
    el('div',{class:'meta'},el('span',{class:'tag'},isPaper?'Research':item.official?'Official notice':'News'),el('span',{class:`co-lane lane-${item.lane}`},`${item.lane} match`),item.published?el('time',{datetime:item.published},item.published.slice(0,10)):null),
    el('h3',{},isPaper?el('a',{href:source},item.title):external(source,item.title)),
    el('p',{class:'whyhere'},'Why it matched: ',item.reason),el('p',{class:'why'},item.scopeReason),
    el('ul',{class:'portfolio-evidence'},...item.confirmedProducts.slice(0,8).map(p=>el('li',{},`${p.brand} · ${p.market} · ${p.authId} · `,external(p.url,'Portfolio evidence')))),
    item.confirmedProducts.length>8?el('p',{class:'hint'},`And ${item.confirmedProducts.length-8} additional confirmed product records; the full scope is saved with the assessment.`):null,
    item.scopeOutside?el('p',{class:'warn'},'Outside your selected markets. Monitoring relevance only.'):null,
    isPaper?el('p',{class:'hint'},`${item.peerReview==='preprint'?'Preprint—not peer reviewed. ':''}Research does not establish causality or a regulatory obligation.`):null,
    button,feedback,el('a',{class:'act',href:`action-center.html?${new URLSearchParams({item:key,...(cloud.team.id?{scope:'team'}:{})})}`},'Continue in Action Center'),el('div',{class:'company-assessment'}));
}
function renderBriefing() {
  const valid=portfolioState(portfolio(),company)==='confirmed';
  $('company-feed').hidden=!valid || editing;
  if(!valid||editing){replace($('company-feed'),);return;}
  const p=portfolio();
  const results=scopedItems(company,p,filters);
  const select=el('select',{'aria-label':'Company briefing time window',onchange:e=>{filters.days=Number(e.target.value);renderBriefing();}},...[['30','Last 30 days'],['90','Last 90 days'],['365','Last year'],['0','All collected dates']].map(([v,t])=>el('option',{value:v,selected:Number(v)===filters.days},t)));
  const controls=el('div',{class:'co-filters'},select,...[['includeClass','Include indirect class matches'],['includeOutside','Include notices outside selected markets']].map(([key,label])=>el('label',{class:'check'},el('input',{type:'checkbox',checked:filters[key],onchange:e=>{filters[key]=e.target.checked;renderBriefing();}}),label)));
  const section=(title,items)=>el('section',{class:'brief-sec'},el('h2',{},`${title} (${items.length})`),...items.slice(0,20).map(itemCard),!items.length?el('p',{class:'empty'},'No matches in this scope and time window. This does not establish an absence of safety concerns.'):null,
    items.length>20?el('button',{type:'button',class:'more',onclick:e=>e.target.replaceWith(...items.slice(20).map(itemCard))},`Show ${items.length-20} more`):null);
  replace($('company-feed'),el('h2',{},'3. Your company briefing'),
    el('div',{class:'tiles'},...[[p.productKeys.length,'confirmed product records'],[p.markets.join(', '),'monitoring markets'],[results.updates.length,'related updates'],[results.research.length,'related papers']].map(([n,t])=>el('div',{class:'tile'},el('b',{},String(n)),el('span',{},t)))),
    el('p',{class:'hint'},`Confirmed ${p.confirmedAt.slice(0,10)} · revision ${p.revision}. ${cloud.team.id?`Assessment destination: ${cloud.team.name}.`:'Assessments stay in your workspace until you explicitly share them with a team.'}`),controls,
    results.legacy?el('p',{class:'warn'},`${results.legacy} older matches lack product-level evidence and are excluded until reprocessed.`):null,
    section('Updates to review',results.updates),section('Research to explore',results.research));
}
function render() {
  if(!company)return;
  const state=portfolioState(portfolio(),company);
  if(state!=='confirmed')editing=true;
  replace($('company-head'),el('h2',{},company.profile.name),el('p',{class:'hint'},`${COVERAGE[company.coverage.status]??company.coverage.status} · Public relationships, private monitoring preferences.`),
    el('p',{},company.coverage.note),company.coverage.staleSources?el('p',{class:'warn'},'A product registry source is failing; review source freshness before confirming scope.'):null,
    state==='needs-review'?el('p',{class:'warn'},'A selected product was removed or its public details changed. Reconfirm before matching or sending new assessments. Existing assessments retain their original context.'):null,
    el('div',{class:'row'},el('a',{class:'act',href:`company.html?id=${encodeURIComponent(company.profile.id)}`},'Public company page'),state==='confirmed'?el('button',{type:'button',class:'act',onclick:()=>{editing=!editing;render();}},editing?'Back to confirmed briefing':'Edit products and markets'):null));
  setup();renderBriefing();
}
async function main() {
  try{
    const r=await fetch('data/companies/index.json',{cache:'no-cache'});if(!r.ok)throw new Error();index=await r.json();
    await cloud.initCloud(ws,()=>{if(company)render();});
    $('company-search').disabled=false;$('company-search').addEventListener('input',renderSearch);
    const id=new URLSearchParams(location.search).get('company')??ws.activeCompany;
    if(id)await choose(id);else message('Search for a company to start. No account or personal details required.');
    cloud.onTeam(()=>{if(company)renderBriefing();});
  }catch{message('The company directory is unavailable. Your saved workspace is preserved. Reload to retry.',true);}
}
main();
