// Import the public cache during a build; never query the trial registry in builds.
import {mkdir,writeFile} from 'node:fs/promises';
import {safeFetch} from './safe-fetch.mjs';
import {companyTrialContext} from './clinical-trials.mjs';
const BASE='https://raw.githubusercontent.com/chalamalasetti/Pharmacovigilance/clinical-data-cache/clinical/';
export async function importClinical({fetcher=safeFetch,dir='public/data/clinical'}={}){
 await mkdir(dir,{recursive:true});let index;try{index=JSON.parse((await fetcher(BASE+'index.json',{tries:1,timeoutMs:12000,maxBytes:512000})).body);if(index.schema!==1||!index.companies)throw Error('Invalid index');}catch{console.warn('Clinical bulk snapshot unavailable; live lookup remains available.');return;}
 const entries=Object.entries(index.companies),accepted={};let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<entries.length){const[id,meta]=entries[cursor++];if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id))continue;const ctx=await companyTrialContext(id);if(!ctx)continue;try{const p=JSON.parse((await fetcher(BASE+id+'.json',{tries:1,timeoutMs:20000,maxBytes:40*1024*1024})).body);if(p.schema!==1||p.companyId!==id||p.mappingVersion!==ctx.mappingVersion||!Array.isArray(p.studies))throw Error('Stale or invalid snapshot');await writeFile(`${dir}/${id}.json`,JSON.stringify(p));accepted[id]={...meta,status:p.collectionStatus,studies:p.studies.length,scanned:p.scanned,retrievedAt:p.retrievedAt,mappingVersion:p.mappingVersion};}catch{accepted[id]={status:'not-checked',studies:0,scanned:0};}}}));
 await writeFile(`${dir}/index.json`,JSON.stringify({...index,companies:accepted}));console.log(`Clinical snapshots imported: ${Object.keys(accepted).length}`);
}
if(process.argv[1]?.endsWith('/clinical-import.mjs'))await importClinical();
