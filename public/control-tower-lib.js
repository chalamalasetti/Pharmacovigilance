import {productKey,portfolioState} from './company-briefing-lib.js';
import {matchedEvidence,labelEvidence,caseUrl} from './company-inbox-lib.js';
import {labelMatches} from './labels-lib.js';
import {caseMetrics,functionPrompts,FUNCTIONS} from './leadership-lib.js';
import {dayKey,STAGES} from './action-center-lib.js';
import {safeURL} from './product-answers-lib.js';
export const TOWER_SCHEMA='pv-control-tower/1';
export const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
export const dayAfter=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function towerEvidence(company,portfolio,labels){
 if(portfolioState(portfolio,company)!=='confirmed')return [];
 const rows=matchedEvidence(company,portfolio).map(i=>({...i,products:i.raw.confirmedProducts??[]}));
 if(labels)rows.push(...labelEvidence(labels,company,portfolio).map(i=>({...i,products:labelMatches(i.raw,portfolio,company)})));
 return [...new Map(rows.map(i=>[i.key,i])).values()];
}
export function towerCases(rows,{company,scope='local',userId=null,teamIds=[]}={}){
 if(scope!=='local'&&scope!=='personal'&&!teamIds.includes(scope))throw Error('Selected team is not available to this account.');
 return rows.filter(r=>r?.id&&STAGES[r.stage]&&r.snapshot?.companyContext?.companyId===company&&(scope==='local'||scope==='personal'?!r.team_id&&(scope==='local'||r.owner_id===userId):r.team_id===scope));
}
const productsForCase=r=>r.snapshot?.companyContext?.products??[];
const keyOf=p=>p.key||productKey(p);
export function towerModel({company,portfolio,evidence=[],cases=[],casesAvailable=true,market='',product='',today=dayKey(),coverage=[],scope='local',now=new Date().toISOString()}){
 if(portfolioState(portfolio,company)!=='confirmed')throw Error('Reconfirm the company portfolio before loading the Control Tower.');
 if(!validDay(today))throw Error('The snapshot date is invalid.');
 const all=company.products.filter(p=>portfolio.productKeys.includes(productKey(p)));
 const selected=all.filter(p=>(!market||p.market===market)&&(!product||productKey(p)===product));
 const keys=new Set(selected.map(productKey));
 const matches=ps=>ps.some(p=>keys.has(keyOf(p)));
 const es=evidence.filter(i=>matches(i.products??[]));
 // Company-wide cases without a product remain visible in the all-product view only.
 const cs=cases.filter(r=>(!market||r.snapshot.companyContext.markets?.includes(market))&&(!product||matches(productsForCase(r))));
 const linked=new Map(cs.map(r=>[r.source_key,r])),metrics=casesAvailable?caseMetrics(cs,today):null;
 const work=cs.filter(r=>r.stage!=='closed').map(r=>{const due=r.action?.due,valid=validDay(due),overdue=r.stage==='action'&&valid&&due<today,soon=r.stage==='action'&&valid&&due>=today&&due<=dayAfter(today,7);return {id:r.id,kind:'work',title:r.snapshot.title,stage:r.stage,band:overdue?0:r.stage==='verification'?1:soon?2:3,reason:overdue?'Assigned action is overdue':r.stage==='verification'?'Submitted evidence needs verification':soon?'Assigned action is due within 7 days':r.decision?.decision==='more_information'?'More information is needed':'Open assessment or action',owner:r.action?.owner||null,reviewer:r.completion?.reviewer||null,due:valid?due:null,href:caseUrl(r)+(scope==='local'?'&scope=local':''),source:safeURL(r.snapshot.link),products:productsForCase(r),row:r};});
 const incoming=es.filter(i=>!linked.has(i.key)).map(i=>({...i,id:i.key,kind:'evidence',evidenceKind:i.kind,band:4,reason:i.reason,sourceName:i.source,href:i.kind==='label'?i.url:scope==='local'?'company-briefing.html?company='+encodeURIComponent(portfolio.companyId):'company-inbox.html?'+new URLSearchParams({company:portfolio.companyId,...(scope!=='local'&&scope!=='personal'?{scope:'team',team:scope}:{}),item:i.key}),source:safeURL(i.url),functions:functionPrompts(i,{functions:FUNCTIONS})}));
 const priorities=[...work,...incoming].sort((a,b)=>a.band-b.band||(a.kind==='work'?(a.due||'9999').localeCompare(b.due||'9999'):(b.date||'').localeCompare(a.date||''))||a.id.localeCompare(b.id));
 const products=selected.map(p=>{const key=productKey(p),pc=cs.filter(r=>productsForCase(r).some(x=>keyOf(x)===key)),pe=es.filter(i=>i.products.some(x=>keyOf(x)===key));return {key,brand:p.brand,market:p.market,authId:p.authId,ingredients:p.ingredients||[],status:p.status,url:safeURL(p.url),open:casesAvailable?pc.filter(r=>r.stage!=='closed').length:null,overdue:casesAvailable?caseMetrics(pc,today).overdue:null,evidence:pe.length};}).sort((a,b)=>(b.overdue||0)-(a.overdue||0)||(b.open||0)-(a.open||0)||b.evidence-a.evidence||a.brand.localeCompare(b.brand));
 const dates=work.filter(r=>r.due&&r.due>=today&&r.due<=dayAfter(today,30)).sort((a,b)=>a.due.localeCompare(b.due));
 const functions=FUNCTIONS.map(name=>({name,items:incoming.filter(i=>i.functions.includes(name)).length}));
 const recent=cs.flatMap(r=>(r.history||[]).filter(h=>['decide','approve','reopen'].includes(h.command)&&Number.isFinite(Date.parse(h.at))).map(h=>({command:h.command,at:h.at,title:r.snapshot.title,href:caseUrl(r)+(scope==='local'?'&scope=local':'')}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,10);
 return {schema:TOWER_SCHEMA,company:{id:portfolio.companyId,name:portfolio.companyName},scope,today,loadedAt:now,filters:{market,product},portfolio:{revision:portfolio.revision,confirmedAt:portfolio.confirmedAt,markets:portfolio.markets,productCount:all.length,selectedCount:selected.length},casesAvailable,metrics,counts:{evidence:es.length,withoutCase:casesAvailable?incoming.length:null,closed:casesAvailable?cs.filter(r=>r.stage==='closed').length:null,unassigned:casesAvailable?cs.filter(r=>r.stage!=='closed'&&!r.action?.owner).length:null},priorities,products,dates,functions,recent,coverage};
}
export function towerExport(model){return {...model,priorities:model.priorities.map(({row,raw,...r})=>r),notice:'Management snapshot of available evidence and recorded work. Not a compliance attestation, complete worldwide obligation register or validated regulatory record. Assigned action dates are not inferred statutory reporting deadlines. No messages or assignments were created.'};}
