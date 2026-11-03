// Dedicated machine endpoint. Only the three pinned main-branch GitHub workflows.
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {cloudConfig} from '../scripts/cloud.mjs';
export const AUDIENCE='https://www.pvinfo.org/api/refresh-worker';
const repo='chalamalasetti/Pharmacovigilance',files={updates:'fda-collector.yml',products:'company-registry.yml',clinical:'clinical-backfill.yml'};
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export function allowedWorker(p,pipeline){return Boolean(files[pipeline]&&p.repository===repo&&p.repository_id==='1439636720'&&p.repository_owner_id==='15839461'&&p.ref==='refs/heads/main'&&p.workflow_ref===`${repo}/.github/workflows/${files[pipeline]}@refs/heads/main`&&['schedule','workflow_dispatch','push'].includes(p.event_name)&&/^\d{1,30}$/.test(p.run_id)&&[`repo:${repo}:ref:refs/heads/main`,'repo:chalamalasetti@15839461/Pharmacovigilance@1439636720:ref:refs/heads/main'].includes(p.sub));}
export async function workerHandler(req,res,{cfg=cloudConfig(),verify=token=>jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:AUDIENCE,algorithms:['RS256'],maxTokenAge:'10m'}),fetchImpl=fetch}={}){
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');const send=(s,x)=>{res.statusCode=s;res.end(JSON.stringify(x));};
 if(req.method!=='POST')return send(405,{error:'Use POST'});
 let body;try{let raw=req.body;if(raw===undefined){raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)return send(413,{error:'Request too large'});}}if(typeof raw==='string'&&raw.length>10000)return send(413,{error:'Request too large'});body=typeof raw==='string'?JSON.parse(raw):raw;if(!body||!files[body.pipeline]||!['claim','finish'].includes(body.action))throw Error();}catch{return send(400,{error:'Invalid worker request'});}
 let claims;try{const token=String(req.headers.authorization??'').replace(/^Bearer /,'');claims=(await verify(token)).payload;if(!allowedWorker(claims,body.pipeline))throw Error();}catch{return send(403,{error:'Approved workflow identity required'});}
 if(!cfg.url||!cfg.serviceKey)return send(503,{error:'Server database worker configuration unavailable'});
 const args={pipeline:body.pipeline,run_number:claims.run_id};let rpc;
 if(body.action==='claim'){rpc='refresh_worker_claim';args.forced=claims.event_name==='workflow_dispatch'&&body.force===true;}else{if(!/^[a-f0-9-]{36}$/.test(body.lease??'')||!['success','partial','failed'].includes(body.result)||!['requested','not-requested','failed','automatic','staged','published'].includes(body.publication))return send(400,{error:'Invalid run result'});rpc='refresh_worker_finish';Object.assign(args,{token:body.lease,result:body.result,published:body.publication,counts:Object.fromEntries(Object.entries(body.stats??{}).filter(([k,v])=>['checked','matched','added','changed','retained','archived','complete','partial','failed','companies'].includes(k)&&Number.isSafeInteger(v)&&v>=0))});}
 try{const r=await fetchImpl(`${cfg.url}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:cfg.serviceKey,...(cfg.serviceKey.startsWith('eyJ')?{authorization:`Bearer ${cfg.serviceKey}`} : {}),'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});if(!r.ok)return send(409,{error:'Worker state could not be updated'});return send(200,body.action==='finish'?{ok:true}:await r.json());}catch{return send(502,{error:'Worker database unavailable'});}
}
export default workerHandler;
