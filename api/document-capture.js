import {adminEmail} from './source-test.js';
import {cloudConfig} from '../scripts/cloud.mjs';
import {captureDocument} from '../scripts/documents.mjs';
export default async function handler(req,res){
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method!=='POST')return send(405,{error:'Use POST'});
 try{
 const cfg=cloudConfig(),token=/^Bearer (\S+)$/i.exec(req.headers.authorization??'')?.[1];
 if(!await adminEmail(token,cfg))return send(403,{error:'Admin access required'});
 if(!cfg.serviceKey)return send(503,{error:'Server-side document collector is not configured'});
 let body=req.body;if(body===undefined){let s='';for await(const c of req){s+=c;if(s.length>2000)return send(413,{error:'Request too large'});}body=JSON.parse(s);}
 if(typeof body==='string')body=JSON.parse(body);
 if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(body?.id??''))return send(400,{error:'Choose a registered source document'});
 return send(200,await captureDocument(body.id,{cfg}));
 }catch{return send(502,{error:'Capture could not complete. Prior versions are preserved; check the source status and retry.'});}
}
