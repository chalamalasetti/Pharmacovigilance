// Authenticate with short-lived GitHub OIDC; no stored GitHub/Supabase credentials.
import {readFile,appendFile} from 'node:fs/promises';
import {AUDIENCE} from '../api/refresh-worker.js';
async function rpc(body){const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);if(u.protocol!=='https:'||!u.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Unexpected GitHub identity endpoint');u.searchParams.set('audience',AUDIENCE);const t=await fetch(u,{headers:{authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`}});if(!t.ok)throw Error('GitHub identity unavailable');const{value}=await t.json();const r=await fetch(AUDIENCE,{method:'POST',headers:{authorization:`Bearer ${value}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`Refresh controller returned ${r.status}`);return r.json();}
const [action,pipeline]=process.argv.slice(2);
if(action==='claim'){const r=await rpc({action,pipeline,force:process.env.FORCE==='true'});await appendFile(process.env.GITHUB_OUTPUT,`run=${r.run===true}\nlease=${r.lease??''}\nmode=${r.mode??'fresh'}\n`);console.log(r.run?'Refresh lease acquired':`Skipped: ${r.reason}`);}
else if(action==='finish'){
 let result=process.env.RUN_RESULT==='success'?'success':'failed',stats={};
 const json=async path=>JSON.parse(await readFile(path,'utf8'));
 try{if(pipeline==='clinical'){const d=await json('/tmp/clinical-cache/index.json'),rows=Object.values(d.companies);stats={companies:rows.length,complete:rows.filter(x=>x.status==='complete').length,partial:rows.filter(x=>x.status==='partial').length,failed:rows.filter(x=>x.status==='failed').length,checked:rows.reduce((n,x)=>n+x.scanned,0),matched:rows.reduce((n,x)=>n+x.studies,0)};for(const key of ['added','changed','archived'])stats[key]=rows.reduce((n,x)=>n+(x.changes?.[key]??0),0);if(result==='success'&&stats.complete!==stats.companies)result='partial';}
 if(pipeline==='products'){const d=await json('/tmp/refresh-products-result.json');stats={checked:d.sources.length,matched:d.products.length,failed:d.sources.filter(s=>!s.ok).length};if(result==='success'&&stats.failed)result='partial';}
 if(pipeline==='updates'){const d=await json('/tmp/fda-feeds.json');stats={checked:d.entries.length,matched:d.entries.reduce((n,s)=>n+(s.items?.length??0),0),failed:d.entries.filter(s=>!s.ok).length};if(result==='success'&&stats.failed)result='partial';}}
 catch{result='failed';}
 await rpc({action,pipeline,lease:process.env.RUN_LEASE,result,stats,publication:process.env.PUBLICATION==='failure'?'failed':process.env.PUBLICATION==='success'?(pipeline==='products'?'automatic':'requested'):'not-requested'});console.log(`Recorded ${pipeline}: ${result}`);
}else throw Error('Unknown refresh command');
