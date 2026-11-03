// One-time, resumable public registry backfill. Persist normalized fields only.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {companyTrialContext,collectTrialPage} from './clinical-trials.mjs';
export const summary=p=>({status:p?.collectionStatus??'not-checked',studies:p?.studies?.length??0,scanned:p?.scanned??0,retrievedAt:p?.retrievedAt??null,lastAttempt:p?.lastAttempt??null,mappingVersion:p?.mappingVersion??null,sourceQueryTotal:p?.sourceQueryTotal??null});
export async function advance(previous,context,{collect=collectTrialPage,now=()=>new Date().toISOString()}={}){
 const old=previous?.mappingVersion===context.mappingVersion?previous:null;
 if(old?.collectionStatus==='complete')return old;
 const lastAttempt=now();
 try{const page=await collect(context,old?.nextCursor??'');
 if(page.nextCursor&&page.nextCursor===old?.nextCursor)throw Error('Repeated continuation token');
 const studies=[...new Map([...(old?.studies??[]),...page.studies].map(s=>[s.id,s])).values()];
 return {...page,studies,scanned:(old?.scanned??0)+page.scanned,excluded:(old?.excluded??0)+page.excluded,pages:(old?.pages??0)+1,collectionStatus:page.nextCursor?'partial':'complete',lastAttempt,collectionStartedAt:old?.collectionStartedAt??lastAttempt};
 }catch{return {...(old??{schema:1,companyId:context.id,companyName:context.name,mappingVersion:context.mappingVersion,studies:[],scanned:0,pages:0}),collectionStatus:old?.studies?.length?'partial':'failed',lastAttempt,collectionError:true};}
}
export async function runBulk(dir,{minutes=45}={}){
 await mkdir(dir,{recursive:true});const manifest=JSON.parse(await readFile(new URL('../companies/manifest.json',import.meta.url),'utf8')),states=new Map(),failed=new Set(),deadline=Date.now()+minutes*60000;
 const save=async(name,obj)=>{await writeFile(`${dir}/${name}.json.tmp`,JSON.stringify(obj)+'\n');await rename(`${dir}/${name}.json.tmp`,`${dir}/${name}.json`);};
 for(const c of manifest.companies){let old;try{old=JSON.parse(await readFile(`${dir}/${c.id}.json`,'utf8'));}catch{}const ctx=await companyTrialContext(c.id);states.set(c.id,{ctx,p:old?.mappingVersion===ctx.mappingVersion?old:null});}
 const checkpoint=async()=>{const entries=Object.fromEntries([...states].map(([id,{p}])=>[id,summary(p)]));await save('index',{schema:1,updatedAt:new Date().toISOString(),scope:'Configured exact sponsor/collaborator searches; interventional drug/biological studies only. Not comprehensive company/global coverage.',companies:entries});};
 // Round-robin gives every catalog company an initial page before deeper backfill.
 let pending=true;while(pending&&Date.now()<deadline){pending=false;for(const[id,s]of states){if(s.p?.collectionStatus==='complete'||failed.has(id))continue;if(Date.now()>=deadline)break;pending=true;s.p=await advance(s.p,s.ctx);await save(id,s.p);if(s.p.collectionError)failed.add(id);await checkpoint();console.log(`${id}: ${s.p.collectionStatus}, ${s.p.scanned} checked, ${s.p.studies.length} matched`);await new Promise(r=>setTimeout(r,600));}}
 await checkpoint();console.log(JSON.stringify({companies:states.size,complete:[...states.values()].filter(s=>s.p?.collectionStatus==='complete').length,failed:failed.size}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runBulk(process.argv[2]??'/tmp/clinical-cache');
