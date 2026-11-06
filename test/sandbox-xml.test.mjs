import {NOTICE_TEXT,NOTICE_VERSION} from '../public/safety-notice.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {validateXML} from 'xmllint-wasm';import {XMLParser} from 'fast-xml-parser';
import {newCase,newProduct,newEvent,newDose,saveRevision} from '../public/sandbox-case-lib.js';import {SAMPLE_CASES} from '../public/sandbox-lib.js';import {serializeTrainingXml,validatedTrainingExport,validateWithSchemas,loadSchemaBundle,sha256,SCHEMA_HASH} from '../public/sandbox-xml.js';import {xmlTrainingZip} from '../scripts/e2b-export-entry.js';import JSZip from 'jszip';
const bytes=readFileSync(new URL('../public/e2b/ich-schema-2.5.bin',import.meta.url)),bundle=JSON.parse(gunzipSync(bytes));
const config={engine:validateXML,loadSchemas:async()=>bundle};
export function fixture(){const c=newCase(SAMPLE_CASES[0]);Object.assign(c.report,{sender:'SYN-SENDER',receiver:'SYN-RECEIVER',worldwideId:'US-SYN-001',creationTime:'2027-01-18T10:00'});Object.assign(c.events[0],{meddraCode:'10037157',meddraVersion:'15',term:'Fictional & reaction "A"'});c.narrative.summary='Fictional clinical course only.';return c;}
test('real pinned ICH XSD validator passes generated initial and multi-product/event follow-up XML',async()=>{
 const c=fixture();c.products.push(newProduct('P-2'));c.events.push({...newEvent('E-2'),meddraCode:'10037157',meddraVersion:'15'});c.products[0].regimens=[{...newDose(),amount:'0',unit:'mg',start:'2027-01-01',stop:'2027-01-02'}];c.patient.age='0';c.gestation='0';
 for(const [p,e]of [['P-1','E-2'],['P-2','E-1'],['P-2','E-2']])c.assessments.push({id:'A-'+(c.assessments.length+1),productId:p,eventId:e,causality:'no',expected:'unknown',basis:'Synthetic reference'});
 const initial=await validatedTrainingExport(c,config);assert.equal(initial.report.xsd.valid,true,JSON.stringify(initial.report));assert.equal(initial.report.downloadEnabled,true);assert.equal(initial.report.xmlSha256,await sha256(initial.xml));assert.match(initial.xml,/value="0" unit="wk"/);assert.match(initial.xml,/Fictional &amp; reaction &quot;A&quot;/);assert.match(initial.xml,/<processingCode code="T"/);
 const saved=saveRevision(c,{...c,latestReceived:'2027-01-12T10:00'},'Fictional follow-up','follow-up');const followup=await validatedTrainingExport(saved,config);assert.equal(followup.report.xsd.valid,true);assert.match(followup.xml,/extension="SYN-001-R2"/);
 const initialRoots=[...initial.xml.matchAll(/<id root="([a-f0-9-]{36})"/g)].map(x=>x[1]);const laterRoots=[...followup.xml.matchAll(/<id root="([a-f0-9-]{36})"/g)].map(x=>x[1]);assert.deepEqual(initialRoots,laterRoots);assert.equal(new Set(initialRoots).size,4);
 const zip=await JSZip.loadAsync(await xmlTrainingZip(saved,followup));assert.equal(await zip.file('synthetic-case.xml').async('string'),followup.xml);assert.equal(JSON.parse(await zip.file('validation-report.json').async('string')).xmlSha256,await sha256(followup.xml));assert.equal(JSON.parse(await zip.file('synthetic-case-package.json').async('string')).cases[0].history.length,1);assert.ok(zip.file('multicacheschemas/MCCI_IN200100UV01.xsd'));assert.equal(await zip.file('PV-INFO-NOTICE.txt').async('string'),NOTICE_TEXT);assert.equal(followup.report.notice.version,NOTICE_VERSION);
 await assert.rejects(xmlTrainingZip({...saved,narrative:{...saved.narrative,summary:'Changed after validation'}},followup),/changed/);await assert.rejects(xmlTrainingZip(saved,{...followup,xml:followup.xml+' '}),/changed/);
 new XMLParser({ignoreAttributes:false}).parse(followup.xml);
});
test('real XSD validation rejects wrong namespace and broken element structure',async()=>{
 const xml=await serializeTrainingXml(fixture());for(const mutated of [xml.replace('xmlns="urn:hl7-org:v3"','xmlns="urn:invalid"'),xml.replace('<acceptAckCode code="AL"/>','<notAnIcsrElement/>')])assert.equal((await validateWithSchemas(mutated,bundle,validateXML)).valid,false);
 await assert.rejects(validateWithSchemas('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>',bundle,validateXML),/not allowed/);
});
test('missing code, inconsistent chronology and dangling pairs block before XSD execution',async()=>{
 for(const change of [c=>c.events[0].meddraCode='',c=>c.report.creationTime='2027-01-01T00:00',c=>c.report.sender='']){const c=fixture();change(c);let called=false;const r=await validatedTrainingExport(c,{...config,engine:()=>{called=true;throw Error('must not execute');}});assert.equal(r.xml,null);assert.equal(r.report.downloadEnabled,false);assert.equal(called,false);assert.ok(r.report.profileChecks.errors.length);}
 const c=fixture();c.assessments[0].eventId='E-99';await assert.rejects(validatedTrainingExport(c,config),/missing product or event/);
});
test('pinned bundle integrity and validator failures never enable XML download',async()=>{
 assert.equal(await sha256(bytes),SCHEMA_HASH);const loaded=await loadSchemaBundle(async()=>new Response(bytes));assert.equal(loaded.files.length,167);
 await assert.rejects(loadSchemaBundle(async()=>new Response('altered')),/integrity/);
 const result=await validatedTrainingExport(fixture(),{...config,engine:async()=>{throw Error('WASM unavailable');}});assert.equal(result.xml,null);assert.equal(result.report.downloadEnabled,false);assert.match(result.report.xsd.errors[0].message,/WASM/);await assert.rejects(xmlTrainingZip(fixture(),result),/has not passed/);
});
