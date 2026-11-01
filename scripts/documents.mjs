// Archive configured official public sources, then extract filtered normative text. Never accepts private uploads.
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cloudConfig} from './cloud.mjs';
import {safeFetch} from './safe-fetch.mjs';
import {officialUrl} from '../public/documents-lib.js';
import {EXTRACTOR,hash,matchCandidates,documentDownload} from './document-extract.mjs';
export const authHeaders=key=>({apikey:key,...(key.startsWith('eyJ')?{authorization:`Bearer ${key}`}:{})});
export async function dbRequest(cfg,route,{method='GET',body,fetchImpl=fetch}={}){
 const res=await fetchImpl(`${cfg.url}/rest/v1/${route}`,{method,headers:{...authHeaders(cfg.serviceKey),'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Object.assign(Error('Document database operation failed'),{status:res.status});return res.status===204?null:res.json();
}
export function extractIsolated(bytes,kind,{timeoutMs=18000}={}){return new Promise((resolve,reject)=>{
 const worker=new Worker(path.resolve('scripts/document-worker.mjs'),{workerData:{bytes,kind},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:192}});
 let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(Error('Unsupported or oversized document')),timeoutMs);
 worker.once('message',r=>finish(r.ok?null:Error('Unsupported or oversized document'),r));worker.once('error',()=>finish(Error('Document extraction failed')));worker.once('exit',code=>{if(!settled)finish(Error('Document extraction stopped'));});
});}
export async function archiveOriginal(bytes,kind,doc,cfg,{fetchImpl=fetch}={}){
 const archive_path=`${doc.id}/${hash(bytes)}.${kind}`;const endpoint=`${cfg.url}/storage/v1/object/pv-regulatory-documents/${archive_path}`;
 const res=await fetchImpl(endpoint,{method:'POST',headers:{...authHeaders(cfg.serviceKey),'content-type':kind==='pdf'?'application/pdf':'application/octet-stream','x-upsert':'false','cache-control':'max-age=31536000'},body:bytes,signal:AbortSignal.timeout(15000)});
 if(!res.ok){if(res.status!==409&&res.status!==400)throw Object.assign(Error('Archive unavailable'),{status:res.status});const existing=await fetchImpl(endpoint.replace('/object/','/object/public/'),{signal:AbortSignal.timeout(15000)});if(!existing.ok||hash(Buffer.from(await existing.arrayBuffer()))!==hash(bytes))throw Error('Archive integrity check failed');}
 return archive_path;
}
export async function fetchOfficialDocument(d,{fetchDocument=safeFetch}={}){
  const fetchOpts={headers:{accept:"application/pdf, text/html;q=0.95, application/xhtml+xml;q=0.9, */*;q=0.5"},binary:true,tries:1,timeoutMs:10000,maxBytes:8*1024*1024,validateUrl:url=>officialUrl(url,d.agency,d.agencyPolicy)};
  officialUrl(d.url,d.agency,d.agencyPolicy);let res=await fetchDocument(d.url,fetchOpts);officialUrl(res.url,d.agency,d.agencyPolicy);
  if(/html/i.test(res.contentType)&&/<title[^>]*>\s*(?:Access Denied|Just a moment|Request Rejected|Attention Required)|verify that you(?:.re| are) not a robot/i.test(res.body.toString('utf8')))throw Error('Source unavailable');
  if(/html/i.test(res.contentType)){const download=documentDownload(res.body.toString('utf8'),res.url,d);if(download)res=await fetchDocument(download,fetchOpts);else if(/\/search-fda-guidance-documents\//.test(res.url))throw Error('Unsupported document landing page; select its guidance PDF URL');}
  officialUrl(res.url,d.agency,d.agencyPolicy);if(!res.body.length)throw Error('Empty source response');const pdf=res.body.subarray(0,5).toString()==='%PDF-';
  if(!pdf&&!/html|xhtml/i.test(res.contentType))throw Error('Unsupported document format');
  return res;
}
export async function captureDocument(id,{cfg=cloudConfig(),request=dbRequest,fetchDocument=safeFetch,extract=extractIsolated,archive=archiveOriginal,sourceResponse=null,expectedConfig=null}={}){
 if(!cfg.url||!cfg.serviceKey)return {skipped:true,reason:'Collector database key is not configured'};
 const [d]=await request(cfg,`pv_documents?id=eq.${encodeURIComponent(id)}&select=*`);if(!d||d.status!=='active')throw Error('Document source is unavailable or inactive');
 if(expectedConfig&&d.updated_at!==expectedConfig)throw Error('Source configuration changed');
 const [policy]=await request(cfg,`pv_agencies?id=eq.${encodeURIComponent(d.agency)}&select=*`);if(!policy||policy.status!=='verified'||policy.country!==d.country)throw Error('Agency is not approved for capture');d.agencyPolicy=policy;
 let stage='read';try{
  const [prev]=await request(cfg,`pv_document_versions?document_id=eq.${encodeURIComponent(id)}&select=*&order=revision.desc&limit=1`);
  stage='fetch';const res=sourceResponse??await fetchOfficialDocument(d,{fetchDocument});officialUrl(res.url,d.agency,d.agencyPolicy);const pdf=res.body.subarray(0,5).toString()==='%PDF-';
  const kind=pdf?'pdf':/html|xhtml/i.test(res.contentType)?'html':null;if(!kind)throw Error('Unsupported or oversized document');
  const original_hash=hash(res.body);stage='archive';const archive_path=prev?.original_hash===original_hash&&prev.archive_path?prev.archive_path:await archive(res.body,kind,d,cfg);
  stage='extract';let candidates=[],capture={original_hash,archive_path,content_hash:prev?.content_hash??hash(''),source_url:res.url,content_kind:kind,parser_version:EXTRACTOR,partial:false,excluded:0};
  if(prev?.original_hash!==original_hash||prev?.metadata?.updated_at!==d.updated_at||prev?.parser_version!==EXTRACTOR){
   let parsed;try{parsed=await extract(res.body,kind);}catch{parsed={candidates:[],limited:false,excluded:0};}const previous=prev&&prev.content_kind!=='metadata'?await request(cfg,`pv_document_candidates?document_version_id=eq.${prev.id}&select=*&order=ordinal&limit=600`):[];
   const requirements=await request(cfg,`pv_requirement_versions?body->>source_family=eq.${encodeURIComponent(id)}&select=*&order=revision.desc&limit=500`);
   const latest=new Map();for(const r of requirements)if(!latest.has(r.requirement_key))latest.set(r.requirement_key,r);
   const partial=prev?.parser_version!==EXTRACTOR||parsed.limited||parsed.excluded>0||prev?.capture_status==='partial'||parsed.candidates.length===0;
   candidates=matchCandidates(parsed.candidates,previous,[...latest.values()],{partial});
   capture={...capture,content_hash:hash(JSON.stringify(parsed.candidates)),partial:parsed.limited||parsed.excluded>0,excluded:parsed.excluded};
  }
  stage='persist';const v=await request(cfg,'rpc/capture_pv_document',{method:'POST',body:{p_id:id,p_config:d.updated_at,p_previous:prev?.id??null,p_capture:capture,p_candidates:candidates}});
  return {id,version:v.id,revision:v.revision,status:v.capture_status,unchanged:prev?.id===v.id,reprocessed:prev?.original_hash===original_hash&&prev?.parser_version!==EXTRACTOR,candidates:candidates.length};
 }catch(e){
  const note=/Unsupported|oversized|extraction/.test(e.message)?'Unsupported or oversized document; manual capture required':/changed|deactivated/.test(e.message)?'Collection deferred; retry next check':'Source unavailable; previous capture preserved';
  await request(cfg,'rpc/record_pv_document_failure',{method:'POST',body:{p_id:id,p_note:note}}).catch(()=>{});throw Object.assign(Error(note),{stage,code:e.status??e.code??'operation'});
 }
}
export async function collectDocuments({cfg=cloudConfig(),request=dbRequest,capture=captureDocument,bootstrap=false}={}){
 if(!cfg.url||!cfg.serviceKey){console.log('documents: collector skipped (no server database configuration)');return {skipped:true};}
 const docs=await request(cfg,`pv_document_schedule?select=id&order=checked_at.asc.nullsfirst,id&limit=${bootstrap?3:24}${bootstrap?'&has_capture=eq.false':''}`);
 let ok=0,failed=0;const queue=[...docs];await Promise.all([0,1].map(async()=>{while(queue.length){const d=queue.shift();try{await capture(d.id,{cfg,request});ok++;}catch{failed++;}}}));
 console.log(`documents: ${ok} sources checked, ${failed} unavailable; prior captures preserved`);return {ok,failed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)collectDocuments({bootstrap:process.argv.includes('--bootstrap')}).catch(()=>{console.error('documents: collector unavailable; previous library preserved');process.exitCode=0;});
