import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {NOTICE_SHORT,NOTICE_TEXT,NOTICE_VERSION,safetyNotice} from '../public/safety-notice.js';
import {newCase,packageCases,importPackage,reportSections,adverseReactionSections} from '../public/sandbox-case-lib.js';
import {SAMPLE_CASES} from '../public/sandbox-lib.js';
import {emptyBody,packageExport,specificationCsv} from '../public/config-workbench-lib.js';
test('tool notices and full policy remain available without running page JavaScript',async()=>{
 for(const name of ['sandbox','config-workbench','e2b-studio']){
  const {document}=parseHTML(await readFile(new URL('../public/'+name+'.html',import.meta.url),'utf8'));
  const notice=document.querySelector('.pv-safety-notice');assert.ok(notice,name);assert.ok(notice.textContent.includes(NOTICE_SHORT));assert.equal(notice.querySelector('a').getAttribute('href'),'disclaimer.html');
 }
 const {document}=parseHTML(await readFile(new URL('../public/disclaimer.html',import.meta.url),'utf8'));
 assert.match(document.querySelector('main').textContent,/Nothing in this notice excludes or restricts/);
 assert.ok(document.querySelector('main').textContent.includes(NOTICE_VERSION));assert.match(document.querySelector('main').textContent,/Claude and ChatGPT/);assert.match(document.querySelector('main').textContent,/Human review is mandatory/);
});
test('case and configuration exports carry the versioned notice without changing restore semantics',()=>{
 const c=newCase(SAMPLE_CASES[0]),saved=packageCases([c]);assert.deepEqual(JSON.parse(saved).notice,safetyNotice());assert.deepEqual(importPackage(saved),[c]);
 for(const sections of [reportSections(c),adverseReactionSections(c)])assert.ok(sections.some(s=>s.text===NOTICE_TEXT));
 const row={id:'draft',revision:1,state:'draft',body:emptyBody()};assert.deepEqual(packageExport(row).notice,safetyNotice());assert.ok(specificationCsv(row).includes('Nothing in this notice excludes or restricts'));
});
