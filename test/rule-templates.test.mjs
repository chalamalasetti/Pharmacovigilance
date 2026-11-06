import test from 'node:test';import assert from 'node:assert/strict';
import {TEMPLATES,forkTemplate,saveFork,libraryState,templatePackage,configurationFromTemplate,sandboxAssumption} from '../public/rule-templates-lib.js';
import {cleanRule} from '../public/sandbox-lib.js';
test('source-linked starters preserve distinct clocks and do not invent company approval or effective dates',()=>{
 assert.ok(TEMPLATES.length>1500);for(const t of TEMPLATES){assert.equal(t.source.verified,false);assert.equal(t.source.effective,'');assert.ok(t.source.url.startsWith('https://'));const c=configurationFromTemplate(templatePackage(t));assert.equal(c.source.verified,false);assert.equal(c.applicability,'more_information');assert.equal(c.source.templatePin.id,t.id);assert.deepEqual(c.proposal.rule,t.rule);}
 assert.match(TEMPLATES[1].rule.clockStart,/initial receipt/);assert.match(TEMPLATES[2].rule.clockStart,/determination/);assert.doesNotMatch(TEMPLATES[3].rule.condition,/unexpected/i);
});
test('fork revisions preserve source identity, prior values and browser watchlist boundaries',()=>{
 const d=forkTemplate(TEMPLATES[0]);d.rule.days='12';const first=saveFork(null,d,'Fictional local parameter');const second=saveFork(first,{...first,rule:{...first.rule,days:'10'}},'Explore a different parameter');assert.equal(second.revision,2);assert.equal(second.history[0].rule.days,'12');assert.equal(first.rule.days,'12');
 const state=libraryState({schema:1,forks:[second],watch:[second.id,'invalid',second.id]});assert.deepEqual(state.watch,[second.id]);assert.deepEqual(configurationFromTemplate(templatePackage(second)).source.templatePin,{id:TEMPLATES[0].id,version:1,forkId:second.id,forkRevision:2});
 assert.throws(()=>saveFork(first,{...first,baseId:TEMPLATES[1].id},'Wrong source'),/identity/);assert.throws(()=>saveFork(first,first,''),/reason/);assert.throws(()=>libraryState({schema:1,forks:[first,first],watch:[]}),/identifiers/);
});
test('sandbox handoff is explicitly a user-chosen subset, never an executable regulatory template',()=>{
 const h=sandboxAssumption(templatePackage(TEMPLATES[2]),{country:'US',scope:'clinical',days:'15',serious:'yes',unexpected:'yes',related:'any'});assert.equal(cleanRule(h.rule).days,15);assert.equal(h.rule.effective,'');assert.match(h.limitations,/determination clocks/);assert.match(h.limitations,/No automatic execution/);
 const packageCopy=templatePackage(TEMPLATES[0]);packageCopy.template.source.url='https://wrong.example';assert.equal(configurationFromTemplate(packageCopy).source.url,TEMPLATES[0].source.url);
});

test('worldwide discovery never turns missing evidence into assumed deadlines',()=>{
 const research=TEMPLATES.filter(t=>t.evidence==='research');assert.ok(research.length>1500);assert.ok(new Set(research.map(t=>t.region)).size>=251);for(const t of research){assert.equal(t.rule.days,'');assert.equal(t.rule.clockStart,'');assert.equal(t.source.checkedOn,'');assert.throws(()=>sandboxAssumption(templatePackage(t),{}),/Research worksheets/);}
 assert.equal(TEMPLATES.filter(t=>t.evidence==='source-linked').length,16);assert.equal(TEMPLATES.find(t=>t.id==='hc-foreign-15').rule.country,'CA');
});
