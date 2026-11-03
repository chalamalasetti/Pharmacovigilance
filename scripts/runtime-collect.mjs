// GitHub runner only. Publishes generated public caches, never company work or source evidence.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {jobPost} from './job-identity.mjs';
import {packRuntime,restoreRuntime} from './runtime-publication.mjs';
export const DATA_AUDIENCE='https://www.pvinfo.org/api/data-refresh';
export async function publishRuntime({post,root='public'}={}){
 const {manifest,chunks}=await packRuntime(root);const {id}=await post({action:'begin',manifest});let next=0;
 await Promise.all(Array.from({length:4},async()=>{while(next<chunks.length){const chunk=chunks[next++];await post({action:'stage',id,...chunk});}}));
 return post({action:'commit',id});
}
async function main(){
 const post=body=>jobPost(DATA_AUDIENCE,{...body,lease:process.env.RUN_LEASE});
 if(process.argv[2]==='prepare'){
  let inputs;
  // The first main push starts this worker while the one-time app release builds.
  // Wait only for a missing/unavailable endpoint; never retry denied identities.
  for(let attempt=0;attempt<10;attempt++){try{inputs=await post({action:'inputs'});break;}catch(e){if(![404,503].includes(e.status)||attempt===9)throw e;console.log('Waiting for the application publication endpoint.');await new Promise(resolve=>setTimeout(resolve,20000));}}
  if(!inputs.registry?.sources||!inputs.resources?.rows||!inputs.overlay)throw Error('Current publication configuration unavailable');
  await writeFile('/tmp/runtime-inputs.json',JSON.stringify(inputs));await writeFile('/tmp/runtime-source-registry.json',JSON.stringify(inputs.registry));return;
 }
 const inputs=JSON.parse(await readFile('/tmp/runtime-inputs.json','utf8'));
 process.env.SUPABASE_URL=inputs.config.url;process.env.SUPABASE_ANON_KEY=inputs.config.publicKey;process.env.SITE_URL='https://www.pvinfo.org';
 // No service key is supplied to the runner. Do not fall back to repository defaults
 // after a database read error: the last complete snapshot remains live instead.
 await restoreRuntime(inputs.config);
 const {importClinical}=await import('./clinical-import.mjs');await importClinical();
 const {aggregate}=await import('./aggregate.mjs');const protectedIds=new Set(inputs.protectedIds);
 await aggregate({registryOverride:{...inputs.registry,from:'last build',secrets:new Map()},overlayOverride:{...inputs.overlay,from:'database'},resourcesOverride:{...inputs.resources,from:'database'},fdaSnapshotOverride:JSON.parse(await readFile('/tmp/fda-feeds.json','utf8')),sourceLoader:feed=>protectedIds.has(feed.id)?post({action:'source',id:feed.id}):null});
 const result=await publishRuntime({post});
 try{let offset=0,done=false;for(let i=0;i<500&&!done;i++){const r=await post({action:'archive',id:result.snapshot_id,offset});offset=r.next;done=r.done;}await post({action:'history',id:result.snapshot_id});}catch{console.warn('Public snapshot published; permanent archive or source-history synchronization needs attention.');}
 const status=JSON.parse(await readFile('public/data/status.json','utf8'));
 const stats={checked:status.sources.length,matched:status.sources.reduce((n,s)=>n+(s.count??0),0),failed:status.sources.filter(s=>!s.ok||s.stale||s.collectorOk===false).length};
 await writeFile('/tmp/runtime-publication-result.json',JSON.stringify({stats,...result}));console.log(`Published complete public snapshot: ${result.files} files, ${stats.checked} sources checked`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Public data refresh failed; previous snapshot is preserved. Review the collection step for source failures.');process.exitCode=1;});
