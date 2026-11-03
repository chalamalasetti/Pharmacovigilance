// Only the pinned main-branch updates job can stage a public runtime snapshot.
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {cloudConfig,archiveUpdates} from '../scripts/cloud.mjs';
import {dbRequest} from '../scripts/cloud-request.mjs';
import {fetchRegistry,buildFeeds,recordRuns} from '../scripts/sources.mjs';
import {fetchResources} from '../scripts/resources.mjs';
import {fetchOverlay} from '../scripts/admin.mjs';
import {safeFetch} from '../scripts/safe-fetch.mjs';
import {parseItems,updateId} from '../scripts/parse.mjs';
import {fillSecrets} from '../public/sources-lib.js';
import {publicUpdate} from '../public/privacy.js';
import {allowedWorker} from './refresh-worker.js';
import {validateManifest} from '../public/runtime-data-lib.js';
import {gunzipSync} from 'node:zlib';
export const DATA_AUDIENCE='https://www.pvinfo.org/api/data-refresh';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export async function dataRefreshHandler(req,res,{cfg=cloudConfig(),request=dbRequest,fetchImpl=fetch,registry=fetchRegistry,overlay=fetchOverlay,verify=token=>jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:DATA_AUDIENCE,algorithms:['RS256'],maxTokenAge:'10m'})}={}){
 const send=(n,v)=>{res.statusCode=n;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(v));};
 if(req.method!=='POST')return send(405,{error:'Use authenticated POST'});
 let claims;try{claims=(await verify(String(req.headers.authorization??'').replace(/^Bearer /,''))).payload;if(!allowedWorker(claims,'updates'))throw Error();}catch{return send(403,{error:'Approved updates workflow required'});}
 let b;try{b=req.body;if(b===undefined){let text='';for await(const part of req){text+=part;if(text.length>1100000)return send(413,{error:'Data chunk too large'});}b=JSON.parse(text);}if(typeof b==='string'){if(b.length>1100000)throw Error();b=JSON.parse(b);}if(!b||!['inputs','source','begin','stage','commit','archive','history'].includes(b.action)||!/^[a-f0-9-]{36}$/.test(b.lease??''))throw Error();}catch{return send(400,{error:'Invalid data publication request'});}
 if(!cfg.url||!cfg.serviceKey||!cfg.publicKey)return send(503,{error:'Data publication is not configured'});
 const rpc=(name,args)=>request(cfg,'rpc/'+name,{method:'POST',body:args,fetchImpl}),identity={p_run:claims.run_id,p_lease:b.lease};
 try{
 await rpc('refresh_runtime_assert',identity);
 if(b.action==='inputs'){
  const live=await registry(cfg,fetchImpl);if(!live||live.missing)throw Error();
  const sources=live.sources.map(s=>Object.fromEntries(['id','name','organization','type','classification','regions','topics','status','url','settings','collect_from'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]])));
  // Values never leave Vercel; protected sources are fetched through action=source.
  const protectedIds=[...live.secrets.keys()];return send(200,{registry:{from:'database',sources},protectedIds,overlay:await overlay(cfg,fetchImpl),resources:await fetchResources(cfg,fetchImpl),config:{url:cfg.url,publicKey:cfg.publicKey}});
 }
 if(b.action==='source'){
  const live=await registry(cfg,fetchImpl);const feed=buildFeeds(live).feeds.find(f=>f.id===b.id);if(!feed)throw Error();
  const secrets=live.secrets.get(feed.id)??{},url=fillSecrets(feed.url,secrets);if(url.missing.length)throw Error();const headers=Object.fromEntries(Object.entries(feed.headers??{}).map(([k,v])=>[k,fillSecrets(v,secrets).value]));const r=await safeFetch(url.value,{headers,tries:1,timeoutMs:15000,maxBytes:2000000});
  const items=parseItems(r.body,feed,{contentType:r.contentType,url:r.url}).items.slice(0,100).map(x=>publicUpdate({...x,id:updateId(x.link),source:feed.source})).filter(Boolean);return send(200,{items});
 }
 if(b.action==='begin'){validateManifest(b.manifest);return send(200,{id:await rpc('refresh_runtime_begin',{...identity,p_manifest:b.manifest})});}
 if(!/^[a-f0-9-]{36}$/.test(b.id??''))return send(400,{error:'Invalid publication identity'});
 if(b.action==='stage'){if(typeof b.content!=='string'||b.content.length>1000000)return send(413,{error:'Data chunk too large'});await rpc('refresh_runtime_stage',{...identity,p_id:b.id,p_path:b.path,p_part:b.part,p_parts:b.parts,p_content:b.content});return send(200,{ok:true});}
 if(b.action==='commit')return send(200,await rpc('refresh_runtime_commit',{...identity,p_id:b.id}));
 // Bounded post-publication synchronization cannot delay the atomic commit response.
 const snapshots=await request(cfg,`pv_runtime_snapshots?id=eq.${b.id}&published_at=not.is.null&select=id`,{fetchImpl});if(!snapshots?.length)throw Error();
 const get=async path=>{const rows=await request(cfg,`pv_runtime_files?snapshot_id=eq.${b.id}&path=eq.${encodeURIComponent(path)}&select=content`,{fetchImpl});return JSON.parse(gunzipSync(Buffer.from(rows[0].content,'base64'),{maxOutputLength:64*1024*1024}).toString());};
 if(b.action==='archive'){if(!Number.isSafeInteger(b.offset)||b.offset<0||b.offset>100000)throw Error();const data=await get('data/updates.json');const batch=data.updates.slice(b.offset,b.offset+200);await archiveUpdates(batch,{cfg,fetchImpl,withSourceId:true,batch:200});return send(200,{next:b.offset+batch.length,done:b.offset+batch.length>=data.updates.length});}
 const status=await get('data/status.json');await recordRuns(status.sources.map(s=>({source_id:s.id,run_at:status.checked,ok:s.ok&&!s.stale&&s.collectorOk!==false,items_seen:s.count??0,items_kept:s.count??0,items_new:0,attempts:1,http_status:s.ok?200:null,error:s.ok&&!s.stale&&s.collectorOk!==false?null:'Source collection failed; prior items retained'})),{cfg,fetchImpl});return send(200,{ok:true});
 }catch{return send(409,{error:'Data publication could not complete; the previous snapshot is preserved'});}
}
export default dataRefreshHandler;
