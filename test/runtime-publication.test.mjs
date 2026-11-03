import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDataFetcher} from '../public/data-fetch.js';
import {validateManifest,validRuntimePath} from '../public/runtime-data-lib.js';
import {publishRuntime} from '../scripts/runtime-collect.mjs';
import {dataRefreshHandler} from '../api/data-refresh.js';
const bytes=gzipSync(Buffer.from('{"updated":"new-data"}')),sha=createHash('sha256').update(bytes).digest('hex');
const file={sha256:sha,bytes:bytes.length,rawBytes:22,parts:1};
file.rawBytes=gunzipSync(bytes).length;
const manifest={schema:1,files:Object.fromEntries(['feed.xml','data/site.json','data/updates.json','data/status.json'].map(p=>[p,{...file}]))};
const sid='00000000-0000-0000-0000-000000000001';
const cfg={runtimeData:true,supabaseUrl:'https://synthetic.supabase.co',supabaseKey:'public-test-key'};
test('runtime cache allows public generated paths only and rejects oversized or incomplete manifests',()=>{
 for(const p of ['../config.json','data/../../secret','config.json','data/documents/private.json','data/clinical/checkpoints/foo.json'])assert.equal(validRuntimePath(p),false);
 assert.equal(validRuntimePath('data/clinical/gsk.json'),true);assert.equal(validateManifest(manifest),manifest);
 assert.throws(()=>validateManifest({schema:1,files:{'feed.xml':file}}),/Required/);
 assert.throws(()=>validateManifest({...manifest,files:{...manifest.files,'data/site.json':{...file,bytes:16777217}}}),/Invalid/);
});
test('browser reads a fresh verified snapshot with public credentials, keeping the static layout',async()=>{
 const calls=[];const fetchImpl=async(url,opts={})=>{calls.push([url,opts]);if(url==='config.json')return Response.json(cfg);if(url.includes('pv_runtime_current'))return Response.json([{snapshot_id:sid,manifest}]);if(url.includes('pv_runtime_files'))return Response.json([{content:bytes.toString('base64')}]);return Response.json({updated:'old-build'});};
 const {fetchData}=createDataFetcher({fetchImpl});const r=await fetchData('data/updates.json');assert.equal((await r.json()).updated,'new-data');assert.equal(r.headers.get('x-pv-data-snapshot'),sid);assert.equal(calls.length,3);assert.ok(calls.every(([,o])=>!o.headers?.authorization));
 assert.equal((await fetchData('data/agencies.json')).status,200);assert.equal(calls.at(-1)[0],'data/agencies.json');
});
test('corrupt and expired snapshots retry the pointer once, then preserve built data',async()=>{
 let pointers=0;const fetchImpl=async url=>url==='config.json'?Response.json(cfg):url.includes('pv_runtime_current')?(pointers++,Response.json([{snapshot_id:sid,manifest}])):url.includes('pv_runtime_files')?Response.json([{content:Buffer.from('corrupt').toString('base64')}]):Response.json({old:true});const f=createDataFetcher({fetchImpl});assert.deepEqual(await(await f.fetchData('data/updates.json')).json(),{old:true});assert.equal(pointers,2);assert.equal(f.runtimeState().fallback,true);
});
test('external requests and sites without runtime configuration retain the existing fetch behavior',async()=>{const urls=[];const f=createDataFetcher({fetchImpl:async url=>(urls.push(url),Response.json({}))});await f.fetchData('https://other.example/data/updates.json');assert.deepEqual(urls,['https://other.example/data/updates.json']);await f.fetchData('data/updates.json');assert.deepEqual(urls.slice(1),['config.json','data/updates.json']);});
test('publication commits only after every chunk succeeds; private files never enter a snapshot',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pv-publish-'));try{await mkdir(join(root,'data'),{recursive:true});for(const p of ['site','updates','status'])await writeFile(join(root,`data/${p}.json`),'{}');await writeFile(join(root,'feed.xml'),'<rss/>');await writeFile(join(root,'config.json'),'{"secret":"excluded"}');const seen=[];let uploaded;const post=async body=>{seen.push(body.action);if(body.action==='begin'){uploaded=body.manifest;return{id:sid};}if(body.action==='commit')return{files:4};};assert.equal((await publishRuntime({root,post})).files,4);assert.equal(seen.at(-1),'commit');assert.equal(Object.keys(uploaded.files).length,4);
 const failed=[];await assert.rejects(publishRuntime({root,post:async b=>{failed.push(b.action);if(b.action==='begin')return{id:sid};throw Error('interrupted');}}));assert.ok(!failed.includes('commit'));}finally{await rm(root,{recursive:true,force:true});}
});
const claims={repository:'chalamalasetti/Pharmacovigilance',repository_id:'1439636720',repository_owner_id:'15839461',ref:'refs/heads/main',workflow_ref:'chalamalasetti/Pharmacovigilance/.github/workflows/fda-collector.yml@refs/heads/main',event_name:'schedule',run_id:'123',sub:'repo:chalamalasetti/Pharmacovigilance:ref:refs/heads/main'};
test('publication endpoint requires pinned worker identity and an active lease, without exposing source secrets',async()=>{
 let calls=0;const registry=async()=>({sources:[{id:'x',name:'Test',type:'rss',status:'active',secret:'never-public'}],secrets:new Map([['x',{TOKEN:'never-public'}]])});
 const invoke=async({verify=async()=>({payload:claims}),request=async()=>{calls++;return null;},body={action:'inputs',lease:sid}}={})=>{const res={setHeader(){},end(x){this.body=JSON.parse(x);}};await dataRefreshHandler({method:'POST',headers:{},body},res,{cfg:{url:'https://synthetic.invalid',serviceKey:'server-key',publicKey:'public-key'},verify,request,registry,overlay:async()=>({}),fetchImpl:async()=>({ok:true,json:async()=>[]})});return res;};
 assert.equal((await invoke({verify:async()=>({payload:{...claims,ref:'refs/heads/other'}})})).statusCode,403);assert.equal(calls,0);
 assert.equal((await invoke({request:async()=>{throw Error('expired');}})).statusCode,409);
 const r=await invoke();assert.equal(r.statusCode,200);assert.deepEqual(r.body.protectedIds,['x']);assert.ok(!JSON.stringify(r.body).includes('never-public'));assert.ok(!JSON.stringify(r.body).includes('server-key'));
});
