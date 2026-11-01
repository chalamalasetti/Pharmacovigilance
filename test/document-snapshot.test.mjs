import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {publicDocumentSnapshot,openSnapshotStore} from '../scripts/document-snapshot.mjs';
import {extractCandidates,htmlParagraphs} from '../scripts/document-extract.mjs';
const doc={id:'fda-test',title:'Synthetic safety guidance',country:'US',agency:'FDA',edition:'Draft',published_on:'',effective_on:'',owner_email:'private@example.invalid',company:'Private company',agencyPolicy:{id:'FDA',country:'US',status:'verified',domains:['www.fda.gov']}};
const source={url:'https://www.fda.gov/synthetic-guidance',body:Buffer.from('<main><p id="reporting">The sponsor must maintain written procedures for expedited safety reporting.</p><p>Except where another applicable rule provides an exemption.</p><p>Contact: person@example.invalid must be notified.</p></main>')};
const parsed=extractCandidates(htmlParagraphs(source.body.toString()));
test('public key-info pins the source hash and citation, excludes private fields and leaves dates and approval unverified',()=>{
 const {snapshot,file}=publicDocumentSnapshot(doc,source,parsed,{retrievedAt:'2026-11-01T13:00:00Z'});
 assert.equal(snapshot.candidate_count,1);assert.equal(snapshot.extraction_status,'partial');assert.equal(snapshot.candidates[0].anchor,'reporting');assert.match(snapshot.candidates[0].context,/Except/);assert.equal(snapshot.review_status,'pending');assert.equal(snapshot.metadata.effective_on,'');assert.match(file,/^documents\/fda-test\/[a-f0-9]{64}\.json$/);
 assert.ok(!JSON.stringify(snapshot).includes('example.invalid'));assert.ok(!JSON.stringify(snapshot).includes('Private company'));assert.match(snapshot.metadata_verification,/human verification/);
 assert.throws(()=>publicDocumentSnapshot({...doc,id:'../bad'},source,parsed));assert.throws(()=>publicDocumentSnapshot(doc,{...source,url:'https://evil.invalid/x'},parsed));
});
test('snapshot identity ignores retrieval time but versions byte, metadata, and extraction changes',()=>{
 const a=publicDocumentSnapshot(doc,source,parsed,{retrievedAt:'first'}),b=publicDocumentSnapshot(doc,source,parsed,{retrievedAt:'second'});assert.equal(a.file,b.file);
 assert.notEqual(a.file,publicDocumentSnapshot({...doc,edition:'Final'},source,parsed).file);
 assert.notEqual(a.file,publicDocumentSnapshot(doc,{...source,body:Buffer.from('new bytes')},parsed).file);
 assert.equal(publicDocumentSnapshot(doc,source,{error:true,candidates:[]}).snapshot.extraction_status,'extraction_failed');
 assert.equal(publicDocumentSnapshot(doc,source,{candidates:[]}).snapshot.extraction_status,'no_candidates');
});
test('store retains earlier successful versions on source failure, marks freshness, and does not rewrite immutable files',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'pv-snapshot-'));try{let tick='first';const store=await openSnapshotStore(dir,{now:()=>tick});await store.record(doc,source,parsed);let index=JSON.parse(await readFile(path.join(dir,'index.json')));const original=await readFile(path.join(dir,index.documents[doc.id].latest),'utf8');tick='second';await store.record(doc,source,parsed);assert.equal(await readFile(path.join(dir,index.documents[doc.id].latest),'utf8'),original);
 await store.failure(doc);index=JSON.parse(await readFile(path.join(dir,'index.json')));assert.equal(index.documents[doc.id].status,'source_unavailable');assert.equal(index.documents[doc.id].last_success_at,'second');assert.ok(index.documents[doc.id].latest);
 await store.record({...doc,edition:'Final'},source,parsed);index=JSON.parse(await readFile(path.join(dir,'index.json')));assert.ok(index.documents[doc.id].previous);assert.equal((await readdir(path.join(dir,'documents',doc.id))).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('publisher makes one atomic non-force cache commit, preserves existing versions and carries only allowlisted snapshot paths',async()=>{
 const publish=createRequire(import.meta.url)('../scripts/document-snapshot-publish.cjs'),dir=await mkdtemp(path.join(os.tmpdir(),'pv-publish-'));try{
 const store=await openSnapshotStore(dir);await store.record(doc,source,parsed);const index=JSON.parse(await readFile(path.join(dir,'index.json')));const files=[],updates=[];
 const github={rest:{git:{getRef:async()=>({data:{object:{sha:'head'}}}),getCommit:async()=>({data:{tree:{sha:'base'}}}),createBlob:async x=>(files.push(x),{data:{sha:'blob'}}),createTree:async x=>{assert.equal(x.base_tree,'base');assert.equal(x.tree.length,1);return {data:{sha:'tree'}};},createCommit:async x=>{assert.deepEqual(x.parents,['head']);return {data:{sha:'commit'}};},updateRef:async x=>updates.push(x)},repos:{getContent:async x=>({data:{content:Buffer.from(x.path==='index.json'?'old manifest':'immutable earlier file').toString('base64')}})}}};
 await publish({github,context:{repo:{owner:'test',repo:'test'},sha:'main'},directory:dir});assert.equal(files.length,1);assert.equal(updates[0].force,false);assert.equal(updates[0].ref,'heads/regulatory-document-cache');assert.ok(index.documents[doc.id].latest);
 await writeFile(path.join(dir,'private.json'),'{}');await assert.rejects(()=>publish({github,context:{repo:{}},directory:dir}),/Unexpected/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
