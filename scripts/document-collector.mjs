// Runs on the trusted main-branch GitHub runner. It reads only the public source register; no Supabase server key is needed here.
import {pathToFileURL} from 'node:url';
import {extractIsolated,fetchOfficialDocument} from './documents.mjs';
import {RELAY_AUDIENCE} from './document-relay-auth.mjs';
const SITE='https://www.pvinfo.org';
async function oidcToken(){const url=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,token=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!url||!token)throw Error('Run from the trusted GitHub workflow');const r=await fetch(url+'&audience='+encodeURIComponent(RELAY_AUDIENCE),{headers:{authorization:`bearer ${token}`},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Job identity unavailable');return(await r.json()).value;}
async function deliver(payload){
 // A main push can start before its Vercel deployment is ready. Retry only transient/deployment failures.
 for(let n=0;n<8;n++){const token=await oidcToken();const r=await fetch(RELAY_AUDIENCE,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});if(r.ok)return r.json();const detail=await r.json().catch(()=>({}));if(r.status===502&&detail.stage||![404,502,503,504].includes(r.status)||n===7)throw Error(`Delivery ${r.status} (${detail.stage??'deployment'}/${detail.code??'unavailable'})`);await new Promise(resolve=>setTimeout(resolve,20000));}
}
export async function collectPublicDocuments({probe=false}={}){
 const cfg=await fetch(SITE+'/config.json',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());if(!cfg.supabaseUrl||!cfg.supabaseKey)throw Error('Public source register is unavailable');
 const response=await fetch(cfg.supabaseUrl+'/rest/v1/pv_documents?status=eq.active&select=*&order=id&limit=101',{headers:{apikey:cfg.supabaseKey},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Source register could not load');const docs=await response.json();if(docs.length>100)throw Error('Split the schedule before exceeding 100 sources');
 let ok=0,failed=0;for(const d of docs){
  let source;try{source=await fetchOfficialDocument(d);if(source.body.length>3*1024*1024)throw Error('Document exceeds relay size limit');}
  catch(e){failed++;console.log(`${d.id}: source unavailable (${e.status??e.code??e.message.slice(0,120)}); prior copies preserved`);if(!probe)await deliver({id:d.id,config:d.updated_at,failure:'source_unavailable'}).catch(()=>{});continue;}
  if(probe){const kind=source.body.subarray(0,5).toString()==='%PDF-'?'pdf':'html';const parsed=await extractIsolated(source.body,kind).catch(()=>({candidates:[]}));console.log(`${d.id}: source reachable (${source.body.length} bytes), ${parsed.candidates.length} normative candidates`);ok++;continue;}
  try{const result=await deliver({id:d.id,config:d.updated_at,url:source.url,content_type:source.body.subarray(0,5).toString()==='%PDF-'?'application/pdf':'text/html',bytes_base64:source.body.toString('base64')});ok++;console.log(`${d.id}: ${result.unchanged?'unchanged':result.status} · ${result.candidates} candidates`);}catch(e){failed++;console.log(`${d.id}: ${e.message}`);}
 }
 console.log(`documents: ${ok} sources delivered/probed, ${failed} unavailable`);return {ok,failed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)collectPublicDocuments({probe:process.argv.includes('--probe')}).then(r=>{process.exitCode=r.failed?1:0;}).catch(()=>{console.error('Document collection unavailable; previous library preserved');process.exitCode=1;});
