import { unsafeNarrative } from './privacy.js';
export const ACTION_TYPES = ['Label / product information','Signal evaluation','Risk management','Regulatory submission','Safety system / process','Literature follow-up','Other'];
export const STAGES = {assessment:'Awaiting assessment',action:'Action needed',verification:'Awaiting verification',closed:'Closed'};
export const DECISIONS = {relevant:'Relevant',not_relevant:'Not relevant',more_information:'More information needed'};
export const dayKey = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function text(value, label='Reason', max=2000) {
 const v=String(value??'').trim();
 if(!v || v.length>max)throw Error(`${label} is required (up to ${max} characters).`);
 if(unsafeNarrative(v)||/\+\d[\d ().-]{7,}\d|\(\d{3}\)\s*\d{3}[- .]\d{4}|\b(?:phone|fax|dob|date of birth)\s*[:=]/i.test(v))throw Error('Remove personal or patient details. Use organizational information only.');
 return v;
}
export function email(value) {
 const v=String(value??'').trim().toLowerCase();
 if(v.length>254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v))throw Error('Enter an email address, without a name.');
 return v;
}
export function evidenceLink(value) {
 const u=new URL(String(value??'').trim());
 if(u.protocol!=='https:'||u.username||u.password||/@|%40|patient[-_]?id|token=|signature=/i.test(u.href))throw Error('Use an HTTPS document link without personal identifiers, credentials or expiring access tokens.');
 return u.href;
}
export function validDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value??'')||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Choose a valid due date.');
 return value;
}
export function payloadFor(command, raw) {
 if(command==='decide') {
  if(!DECISIONS[raw.decision])throw Error('Choose an applicability decision.');
  return {decision:raw.decision,reason:text(raw.reason)};
 }
 if(command==='assign') {
  if(!ACTION_TYPES.includes(raw.type))throw Error('Choose an action type.');
  return {type:raw.type,owner:email(raw.owner),due:validDate(raw.due),instruction:text(raw.instruction,'Action instructions')};
 }
 if(command==='complete')return {changed:text(raw.changed,'What changed'),evidence:[{label:text(raw.label??raw.evidence?.[0]?.label,'Evidence label',200),url:evidenceLink(raw.url??raw.evidence?.[0]?.url)}],reviewer:raw.reviewer?email(raw.reviewer):''};
 if(['approve','return','reopen'].includes(command))return {reason:text(raw.reason,command==='approve'?'Verification note':'Reason')};
 throw Error('Unknown workflow command.');
}
export function transition(row, command, raw, actor='local', now=new Date().toISOString()) {
 const p=payloadFor(command,raw), r=structuredClone(row);
 if(r.stage==='closed'&&command!=='reopen')throw Error('Reopen the case with a reason before changing it.');
 if(command==='decide') {
  if(r.stage==='verification')throw Error('Return this case for rework before changing applicability.');
  r.decision=p;r.action=null;r.completion=null;r.approval=null;r.stage='assessment';
 } else if(command==='assign') {
  if(r.decision?.decision!=='relevant'||!['assessment','action'].includes(r.stage))throw Error('Decide that the item is relevant before assigning action.');
  r.action=p;r.stage='action';
 } else if(command==='complete') {
  if(!((r.stage==='action'&&r.action)||(r.stage==='assessment'&&r.decision?.decision==='not_relevant')))throw Error('Assign a relevant action or record a not-relevant decision first.');
  r.completion={...p,by:actor,at:now};r.stage='verification';
 } else if(command==='approve'||command==='return') {
  if(r.stage!=='verification')throw Error('Submit closure evidence for verification first.');
  if(command==='approve'){r.approval={...p,by:actor,at:now,selfReview:!r.team_id};r.stage='closed';}
  else {r.completion=null;r.stage=r.action?'action':'assessment';}
 } else if(command==='reopen') {
  if(r.stage!=='closed')throw Error('Only a closed case can be reopened.');
  r.stage='assessment';r.decision=null;r.action=null;r.completion=null;r.approval=null;
 }
 r.version=(r.version??0)+1;r.updated_at=now;
 r.history=[...(r.history??[]),{command,at:now,by:actor,detail:p,version:r.version}];
 return r;
}
export function isOverdue(row,today=dayKey()) {return row.stage==='action'&&Boolean(row.action?.due&&row.action.due<today);}
export function matchesCase(row,{company='',market='',status='all',q='',today=dayKey()}={}) {
 const c=row.snapshot?.companyContext??{};
 return (!company||c.companyId===company)&&(!market||c.markets?.includes(market))&&(!q||`${row.snapshot?.title} ${c.companyName} ${row.action?.owner??''}`.toLowerCase().includes(q.toLowerCase()))&&(status==='all'||status==='overdue'&&isOverdue(row,today)||status==='due'&&row.stage==='action'&&!isOverdue(row,today)||row.stage===status);
}
export function dashboard(rows,today=dayKey()) {return {assessment:rows.filter(r=>r.stage==='assessment').length,due:rows.filter(r=>r.stage==='action'&&!isOverdue(r,today)).length,overdue:rows.filter(r=>isOverdue(r,today)).length,verification:rows.filter(r=>r.stage==='verification').length,closed:rows.filter(r=>r.stage==='closed').length};}
export function localCase(snapshot,key,now=new Date().toISOString()) {
 if(!snapshot?.companyContext?.companyId||!snapshot.companyContext.markets?.length)throw Error('This item needs company and market context from My Company Briefing.');
 return {id:key,source_key:key,snapshot,stage:'assessment',version:1,created_at:now,updated_at:now,history:[{command:'created',at:now,by:'local',version:1}]};
}
