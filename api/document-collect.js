import {verifyDocumentJob} from '../scripts/document-relay-auth.mjs';
import {captureDocument,dbRequest} from '../scripts/documents.mjs';
import {cloudConfig} from '../scripts/cloud.mjs';
export const MAX_RELAY_BYTES=3*1024*1024;
export function decodeDocumentRelay(body){
 if(!body||typeof body!=='object'||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(body.id??'')||typeof body.config!=='string'||body.config.length>60)throw Error('Invalid source identity');
 if(body.failure==='source_unavailable')return {id:body.id,config:body.config,failure:true};
 const raw=body.bytes_base64;if(typeof raw!=='string'||raw.length>MAX_RELAY_BYTES*4/3||raw.length%4!==0||!raw||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))throw Error('Invalid source bytes');
 const bytes=Buffer.from(raw,'base64');if(bytes.length>MAX_RELAY_BYTES||bytes.toString('base64')!==raw||typeof body.url!=='string'||body.url.length>1500||!['application/pdf','text/html'].includes(body.content_type))throw Error('Unsupported relay document');
 return {id:body.id,config:body.config,sourceResponse:{url:body.url,contentType:body.content_type,body:bytes}};
}
export default async function handler(req,res){
 const send=(status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
 if(req.method!=='POST')return send(405,{error:'Use authenticated POST'});
 const token=/^Bearer (\S+)$/i.exec(req.headers.authorization??'')?.[1];if(!token)return send(403,{error:'Trusted collection job required'});
 try{await verifyDocumentJob(token);}catch(e){return send(403,{error:'Trusted collection job required',code:e.code??'OIDC_PROVENANCE',claim:e.claim??null});}
 let body;try{body=req.body;if(body===undefined){let s='';for await(const c of req){s+=c;if(s.length>MAX_RELAY_BYTES*4/3+4000)return send(413,{error:'Source exceeds relay limit'});}body=JSON.parse(s);}if(typeof body==='string')body=JSON.parse(body);body=decodeDocumentRelay(body);}catch{return send(400,{error:'Invalid public document payload'});}
 try{
 const cfg=cloudConfig();if(!cfg.serviceKey)return send(503,{error:'Server collector configuration unavailable'});
 const [doc]=await dbRequest(cfg,`pv_documents?id=eq.${encodeURIComponent(body.id)}&select=*`);
 if(!doc||doc.status!=='active'||doc.updated_at!==body.config)return send(409,{error:'Source configuration changed or deactivated'});
 if(body.failure){await dbRequest(cfg,'rpc/record_pv_document_failure',{method:'POST',body:{p_id:body.id,p_note:'Source unavailable; previous capture preserved'}});return send(200,{id:body.id,status:'failed'});}
 return send(200,await captureDocument(body.id,{cfg,expectedConfig:body.config,sourceResponse:body.sourceResponse}));
 }catch(e){return send(502,{error:'Capture could not complete; prior copies preserved',stage:e.stage??'configuration',code:e.code??'operation'});}
}
