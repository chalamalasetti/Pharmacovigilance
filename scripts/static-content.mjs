// Progressive enhancement: the same visible list is replaced by the existing client renderer.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const escapeHTML=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const safeURL=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const date=s=>/^\d{4}-\d{2}-\d{2}/.test(s??'')?String(s).slice(0,10):'';
export function headlineHTML(data){
 const seen=new Set();const rows=(Array.isArray(data?.updates)?data.updates:[]).filter(r=>r?.title&&safeURL(r.link)).sort((a,b)=>String(b.published??'').localeCompare(String(a.published??''))).filter(r=>{const key=safeURL(r.link);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,30);
 return {count:rows.length,html:rows.map(r=>'<article class="card"><h3><a href="'+escapeHTML(safeURL(r.link))+'">'+escapeHTML(r.title)+'</a></h3><p class="hint">'+escapeHTML([r.source||r.agency,date(r.published)].filter(Boolean).join(' · '))+'</p></article>').join('\n')};
}
export function resourceHTML(data){const rows=(Array.isArray(data?.resources)?data.resources:[]).filter(r=>r?.name&&safeURL(r.url));return {count:rows.length,html:rows.map(r=>'<article class="profile"><h3><a href="'+escapeHTML(safeURL(r.url))+'">'+escapeHTML(r.name)+'</a></h3><p>'+escapeHTML(r.purpose??'')+'</p><p class="hint">'+escapeHTML(r.organization??'')+'</p></article>').join('\n')};}
export async function renderStaticLists(dir){
 for(const [file,json,render,label]of [['index.html','updates.json',headlineHTML,'Latest updates'],['resources.html','resources.json',resourceHTML,'Public safety resources']]){
  let data;try{data=JSON.parse(await readFile(path.join(dir,'data',json),'utf8'));}catch{continue;}
  if(!Array.isArray(data?.[file==='index.html'?'updates':'resources']))continue;
  const result=render(data);if(!result.count)result.html='<p>No published entries in this build snapshot.</p>';let html;try{html=await readFile(path.join(dir,file),'utf8');}catch{continue;}
  const marked='<!-- static-list:start -->'+result.html+'<!-- static-list:end -->';
  // The build owns only the list's marked contents, not filters, cards above it or scripts.
  html=html.replace(/(<div id="list"[^>]*>)([\s\S]*?)(<\/div>)/,(_,open)=>open+marked+'</div>');
  html=html.replace(/(<(?:h2|p)[^>]*id="count"[^>]*>)[\s\S]*?(<\/(?:h2|p)>)/,(_,open,close)=>open+label+' ('+result.count+')'+close);
  await writeFile(path.join(dir,file),html);
 }
}
