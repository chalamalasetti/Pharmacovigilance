import {normalizeSubstance} from './substances-lib.js';
import {portfolioState,productKey} from './company-briefing-lib.js';
export const IMPACT_AREAS=['Product labeling / reference safety information','Case assessment and follow-up','Signal and benefit–risk review','Risk minimization / communications','SOPs and training','Safety system configuration','Interfaces and reporting rules','Data migration / testing'];
const norm=s=>normalizeSubstance(s)==='acetaminophen'?'paracetamol':normalizeSubstance(s);
export function labelMatches(record,portfolio,company,{outside=false}={}){if(portfolioState(portfolio,company)!=='confirmed')return [];return company.products.filter(p=>portfolio.productKeys.includes(productKey(p))&&(outside||p.market===record.market)).flatMap(p=>{const direct=record.authId&&p.market===record.market&&p.authId===record.authId;const ingredients=!record.classScope&&p.ingredients?.some(n=>record.ingredients.some(x=>norm(x)===norm(n)));return direct||ingredients?[{...p,matchReason:direct?'Same source application and market':'Exact ingredient / reviewed synonym; product applicability is undecided'}]:[];});}
export function filterLabels(rows,{q='',agency='',section='',kind='',since=''}={}){q=normalizeSubstance(q).replace(/\bacetaminophen\b/g,'paracetamol');return rows.filter(r=>(!agency||r.agency===agency)&&(!kind||r.kind===kind)&&(!since||(r.published??'')>=since)&&(!section||r.sections.some(s=>s.title===section))&&(!q||normalizeSubstance([r.title,r.authId,...r.ingredients,r.topic,...r.sections.map(s=>s.title)].join(' ')).replace(/\bacetaminophen\b/g,'paracetamol').includes(q)));}
export function labelContext(record,portfolio,company,{outside=false,reason='',areas=[]}={}){if(reason.trim().length<15||reason.length>1500)throw Error('Explain why this evidence needs assessment (15–1,500 characters).');const products=labelMatches(record,portfolio,company,{outside});if(!products.length)throw Error('No confirmed product matches. Review your portfolio or the source scope.');return {companyId:portfolio.companyId,companyName:portfolio.companyName,markets:[...new Set(products.map(p=>p.market))],products:products.slice(0,100).map(p=>({key:productKey(p),brand:p.brand,market:p.market,authId:p.authId,url:p.url})),portfolioConfirmedAt:portfolio.confirmedAt,portfolioRevision:portfolio.revision,fingerprint:portfolio.fingerprint,reason:reason.trim(),scopeReason:(outside?'Explicit cross-market monitoring. ':'')+'Source matching is not a decision on applicability. Proposed review areas: '+areas.filter(a=>IMPACT_AREAS.includes(a)).join('; '),lane:'substance'};}
export function labelSourceItem(record){return `label:${record.id}:${record.hash}`;}
export function parseLabelSourceItem(value){const m=/^label:(lc-[a-f0-9]{24}):([a-f0-9]{64})$/.exec(value??'');return m?{id:m[1],hash:m[2]}:null;}

// A reconfirmed session is not a sign-out or an account switch.
export function labelSessionAction(current,event,active){
 if(event==='SIGNED_OUT')return 'clear';
 if(!['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return 'ignore';
 if(!active?.id)return current?'clear':'ignore';
 if(current?.id===active.id&&(current.role==='pv_pending')===(active.role==='pv_pending'))return 'retain';
 return 'reload';
}
