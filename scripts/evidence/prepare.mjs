// Preserve all source rows, independent of the editorial company manifest.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseOrangeBook} from '../registry.mjs';
import {unzip,readXlsx} from '../zip.mjs';
const dir=process.argv[2];if(!dir)throw Error('Output directory required');await mkdir(dir,{recursive:true});
const sources=JSON.parse(await readFile('evidence/sources.json','utf8')).sources;
for(const id of ['fda-orange-book','ema-medicines']){const source=sources.find(s=>s.id===id);try{const r=await fetch(source.url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('HTTP '+r.status);const buf=Buffer.from(await r.arrayBuffer());const rows=id==='fda-orange-book'?parseOrangeBook([...unzip(buf)].find(([n])=>/products.txt$/i.test(n))[1].toString('latin1'),{granular:true}):readXlsx(buf);await writeFile(dir+'/'+id+'.json',JSON.stringify({url:source.url,checked:new Date().toISOString(),rows}));await writeFile(dir+'/'+id+'.source',buf);console.log(id,rows.length);}catch(e){console.log(id,'failed:',e.message);}}
