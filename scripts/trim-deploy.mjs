// Keep each Vercel deployment small. Every deployment Vercel keeps counts toward the
// free 10 GB Deployment Storage, and main deploys many times a day.
// The per-company clinical snapshots and the substance evidence shards are already
// served at runtime from the published Supabase snapshot (public/data-fetch.js), and
// clinical pages fall back to /api/clinical-trials. So the deployment does not need its
// own copies. Index files stay so pages still load if the runtime snapshot is down.
// Runs only on Vercel (VERCEL=1) or with --force, so local builds keep the full data.
import {readdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validRuntimePath} from '../public/runtime-data-lib.js';

// A file is only dropped when the runtime snapshot is allowed to serve that exact path.
export const TRIM_DIRS=['data/clinical','data/substances'];

async function size(p){const s=await stat(p);if(!s.isDirectory())return s.size;let n=0;for(const e of await readdir(p))n+=await size(path.join(p,e));return n;}

export async function trimDeploy({root='public',dirs=TRIM_DIRS}={}){
 let removed=0,bytes=0;
 for(const rel of dirs){
  const dir=path.join(root,rel);let names;try{names=await readdir(dir);}catch{continue;}
  for(const name of names){if(name==='index.json'||!validRuntimePath(`${rel}/${name}`))continue;const p=path.join(dir,name);bytes+=await size(p);await rm(p);removed++;}
 }
 return {removed,bytes};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 if(process.env.VERCEL!=='1'&&!process.argv.includes('--force')){console.log('trim-deploy: not a Vercel build, keeping all data files');process.exit(0);}
 const {removed,bytes}=await trimDeploy();
 const mb=n=>(n/1048576).toFixed(1)+' MB';
 console.log(`trim-deploy: removed ${removed} runtime-served files (${mb(bytes)}); deployment output now ${mb(await size('public'))}`);
}
