// Preserve all source rows, independent of the editorial company manifest.
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseOrangeBook} from '../registry.mjs';
import {unzip,readXlsx} from '../zip.mjs';
export async function downloadSource(url,{fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let failure;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetcher(url,{headers:{'user-agent':'PVInfo/0.1 (+https://www.pvinfo.org)'},signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(!bytes.length||bytes.length>64*1024*1024)throw Error('Invalid source file size');
   return bytes;
  }catch(error){failure=error;if(attempt<2)await pause(2000*(attempt+1));}
 }
 throw failure;
}
export async function prepare(dir){
 if(!dir)throw Error('Output directory required');await mkdir(dir,{recursive:true});
 const sources=JSON.parse(await readFile('evidence/sources.json','utf8')).sources;
 for(const id of ['fda-orange-book','ema-medicines']){
  const source=sources.find(s=>s.id===id);
  // Never silently reuse an older prepared source after a retrieval failure.
  await rm(dir+'/'+id+'.json',{force:true});await rm(dir+'/'+id+'.source',{force:true});
  try{
   const bytes=await downloadSource(source.url);
   const rows=id==='fda-orange-book'?parseOrangeBook([...unzip(bytes)].find(([name])=>/products.txt$/i.test(name))[1].toString('latin1'),{granular:true}):readXlsx(bytes);
   if(!rows.length)throw Error('Empty source');
   await writeFile(dir+'/'+id+'.json',JSON.stringify({url:source.url,checked:new Date().toISOString(),rows}));
   await writeFile(dir+'/'+id+'.source',bytes);console.log(id,rows.length);
  }catch(error){console.log(id,'failed:',error.message);if(id==='fda-orange-book')throw error;}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await prepare(process.argv[2]);
