import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transition,localCase,payloadFor,matchesCase,dashboard,isOverdue,validDate} from '../public/action-center-lib.js';
const snapshot={title:'Synthetic alert',link:'https://regulator.example/alert',companyContext:{companyId:'acme',companyName:'Acme',markets:['EU'],reason:'Substance match'}};
const base=()=>localCase(snapshot,'company:acme:EU:source-1','2026-10-30T12:00:00Z');
const decide={decision:'relevant',reason:'Applies to the confirmed product.'};
const assign={type:'Signal evaluation',owner:'owner@example.invalid',due:'2026-10-30',instruction:'Evaluate the source evidence.'};
const complete={changed:'Evaluation completed and report stored.',label:'Evaluation report',url:'https://documents.example/report'};
test('complete private journey requires applicability, assignment, evidence and explicit self-review; reopen retains history',()=>{
 let r=base();assert.throws(()=>transition(r,'approve',{reason:'Reviewed'}));assert.throws(()=>transition(r,'complete',complete));
 r=transition(r,'decide',decide);r=transition(r,'assign',assign);assert.ok(isOverdue(r,'2026-10-31'));
 r=transition(r,'complete',payloadFor('complete',complete));assert.equal(r.stage,'verification');assert.equal(isOverdue(r,'2026-10-31'),false);
 r=transition(r,'approve',{reason:'Reviewed against the evidence.'},'local');assert.equal(r.stage,'closed');assert.equal(r.approval.selfReview,true);
 assert.throws(()=>transition(r,'decide',decide));const n=r.history.length;r=transition(r,'reopen',{reason:'New supporting evidence.'});assert.equal(r.stage,'assessment');assert.equal(r.history.length,n+1);assert.equal(r.approval,null);
});
test('uncertainty and not-relevant cannot skip review; return removes stale completion and requires rework',()=>{
 let r=transition(base(),'decide',{decision:'more_information',reason:'Need product details.'});assert.throws(()=>transition(r,'assign',assign));assert.throws(()=>transition(r,'complete',complete));
 r=transition(r,'decide',{decision:'not_relevant',reason:'No overlap in product formulation.'});r=transition(r,'complete',complete);assert.equal(r.stage,'verification');
 assert.throws(()=>transition(r,'decide',decide));r=transition(r,'return',{reason:'Confirm authorization coverage.'});assert.equal(r.stage,'assessment');assert.equal(r.completion,null);
});
test('email-only owners, identifier guard, valid dates and safe evidence links are enforced',()=>{
 for(const owner of ['Someone','Someone <a@example.invalid>'])assert.throws(()=>payloadFor('assign',{...assign,owner}));
 assert.throws(()=>payloadFor('decide',{...decide,reason:'Patient ID: X123'}));
 for(const url of ['javascript:alert(1)','https://secret@documents.example/x','https://documents.example/patient-id/123','https://documents.example/report?token=secret'])assert.throws(()=>payloadFor('complete',{...complete,url}));
 assert.throws(()=>validDate('2026-02-30'));assert.equal(validDate('2026-10-30'),'2026-10-30');
});
test('dashboard partitions scoped cases, respects date-only overdue boundary and keeps companies/markets separate',()=>{
 const a=transition(transition(base(),'decide',decide),'assign',assign);const b={...base(),id:'other',snapshot:{...snapshot,companyContext:{companyId:'other',markets:['US']}}};
 const c={...a,id:'closed',stage:'closed'};
 assert.equal(matchesCase(a,{company:'acme',market:'EU'}),true);assert.equal(matchesCase(b,{company:'acme'}),false);assert.equal(matchesCase(a,{market:'US'}),false);
 assert.equal(isOverdue(a,'2026-10-30'),false);assert.deepEqual(dashboard([a,b,c],'2026-10-31'),{assessment:1,due:0,overdue:1,verification:0,closed:1});
});
