import {readFile} from 'node:fs/promises';
import {cloudConfig} from '../scripts/cloud.mjs';
import {readRuntime,runtimeFile} from '../scripts/runtime-read.mjs';
export async function feedHandler(req,res,{cfg=cloudConfig(),read=readRuntime,load=runtimeFile,fallback=()=>readFile(new URL('../public/feed.xml',import.meta.url))}={}){
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
 let body=null;try{const snapshot=await read(cfg);if(snapshot)body=await load(cfg,snapshot,'feed.xml',{timeoutMs:15000});}catch{}
 try{body??=await fallback();res.setHeader('content-type','application/rss+xml; charset=utf-8');res.setHeader('cache-control','public, max-age=60, s-maxage=300, stale-while-revalidate=600');res.statusCode=200;res.end(req.method==='HEAD'?undefined:body);}catch{res.statusCode=503;res.setHeader('cache-control','no-store');res.end('Feed temporarily unavailable');}
}
export default feedHandler;
