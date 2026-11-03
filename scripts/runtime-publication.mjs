import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {validRuntimePath,validateManifest,RUNTIME_SCHEMA} from '../public/runtime-data-lib.js';
import {readRuntime,runtimeFile,sha256} from './runtime-read.mjs';
export {readRuntime,runtimeFile,sha256};
export async function packRuntime(root='public'){
 let activeCompanies=null;try{activeCompanies=new Set(JSON.parse(await readFile(path.join(root,'data/companies/index.json'),'utf8')).companies.map(c=>c.id));}catch{}
 const files={},chunks=[];async function walk(dir,relative=''){for(const ent of await readdir(dir,{withFileTypes:true})){const p=relative?`${relative}/${ent.name}`:ent.name;if(ent.isDirectory()){if(p==='data'||p==='data/companies'||p==='data/clinical'||p==='data/sources'||p==='data/substances')await walk(path.join(dir,ent.name),p);continue;}if(!validRuntimePath(p))continue;if(activeCompanies&&p.startsWith('data/companies/')){const id=ent.name.replace(/\.json$/,'');if(!['index','products','admin','matches'].includes(id)&&!activeCompanies.has(id))continue;}const raw=await readFile(path.join(dir,ent.name));if(p.endsWith('.json'))JSON.parse(raw.toString());const zipped=gzipSync(raw),base64=zipped.toString('base64'),parts=Math.ceil(base64.length/1000000);files[p]={sha256:sha256(zipped),bytes:zipped.length,rawBytes:raw.length,parts};for(let i=0;i<parts;i++)chunks.push({path:p,part:i,parts,content:base64.slice(i*1000000,(i+1)*1000000)});}}
 await walk(root);const manifest=validateManifest({schema:RUNTIME_SCHEMA,generatedAt:new Date().toISOString(),files});return {manifest,chunks};
}
export async function restoreRuntime(cfg,root='public',{fetchImpl=fetch}={}){const m=await readRuntime(cfg,{fetchImpl});if(!m)return null;const names=Object.keys(m.manifest.files);let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<names.length){const p=names[next++],raw=await runtimeFile(cfg,m,p,{fetchImpl});await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),raw);}}));return m;}
