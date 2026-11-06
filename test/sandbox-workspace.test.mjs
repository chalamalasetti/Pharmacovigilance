import test from 'node:test';import assert from 'node:assert/strict';
import {SCENARIOS,blankCase,nextCaseId,caseReadiness,caseChanges,matchesCase} from '../public/sandbox-workspace-lib.js';
import {saveRevision,packageCases,importPackage} from '../public/sandbox-case-lib.js';
test('scenario fixtures retain edge cases, independent pairs and reproducible revision packages',()=>{
 const cases=SCENARIOS.map((s,i)=>s.make('SYN-'+String(i+1).padStart(3,'0')));assert.equal(nextCaseId(cases),'SYN-007');
 assert.equal(cases[1].assessments.length,4);assert.ok(cases[1].assessments.every(a=>a.causality==='unknown'));
 assert.equal(cases[2].gestation,'0');assert.ok(caseReadiness(cases[3]).structural.some(x=>x.includes('null flavor')));
 assert.equal(cases[4].revision,2);assert.equal(cases[4].received,cases[4].history[0].snapshot.received);assert.equal(caseReadiness(cases[5]).canTest,false);
 assert.deepEqual(importPackage(packageCases(cases)),cases);
});
test('review differences use row identifiers; filtering and blank drafts do not invent readiness',()=>{
 const original=SCENARIOS[1].make('SYN-001'),next=structuredClone(original);next.products[1].label='Fictional revised medicine';
 assert.ok(caseChanges(original,next).some(c=>c.path==='products / P-2 / label'&&c.before==='Fictional medicine B'));
 next.products.reverse();assert.equal(caseChanges(original,next).filter(c=>c.path.includes('label')).length,1);
 assert.equal(matchesCase(next,{query:'revised medicine',scope:'clinical',status:'ready'}),true);assert.equal(matchesCase(next,{scope:'marketed'}),false);
 const blank=blankCase('SYN-NEW');assert.equal(blank.serious,'unknown');assert.equal(blank.products.length,0);assert.equal(caseReadiness(blank).canTest,false);assert.equal(caseReadiness(blank).canValidate,false);
});
test('a missing receipt can be completed once, remains visible in history and cannot later change',()=>{
 const original=SCENARIOS.find(s=>s.id==='missing').make('SYN-001');
 const completed=saveRevision(original,{...original,received:'2027-01-10T10:00',latestReceived:'2027-01-12T10:00'},'Initial receipt supplied for fictional training','correction');
 assert.equal(completed.history[0].snapshot.received,'');assert.equal(completed.received,'2027-01-10T10:00');assert.deepEqual(importPackage(packageCases([completed])),[completed]);
 assert.throws(()=>saveRevision(completed,{...completed,received:'2027-01-11T10:00'},'Attempt clock change'),/initial receipt/);
 const forged=structuredClone(completed);forged.history[0].snapshot.received='2027-01-09T10:00';assert.throws(()=>packageCases([forged]),/history/);
});
