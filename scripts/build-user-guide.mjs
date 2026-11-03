// One versioned source produces GitHub pages and safe, rendered in-app help.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function guideHref(raw,ids){
 const [file,anchor]=raw.split('#');if(file.endsWith('.md')){const id=file.slice(0,-3);if(!ids.has(id))throw Error('Unknown guide link: '+raw);return 'user-guide.html?chapter='+encodeURIComponent(id)+(anchor?'#'+id+'-'+slug(anchor):'');}
 const u=new URL(raw,'https://www.pvinfo.org/');if(u.protocol!=='https:'||u.username||u.password)throw Error('Unsupported guide link');
 return u.origin==='https://www.pvinfo.org'?u.pathname+u.search+u.hash:u.href;
}
function inline(text,ids){const tokens=/\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;let out='',last=0;for(const m of text.matchAll(tokens)){out+=escapeHtml(text.slice(last,m.index));out+=m[1]?`<a href="${escapeHtml(guideHref(m[2],ids))}">${escapeHtml(m[1])}</a>`:m[3]?`<strong>${escapeHtml(m[3])}</strong>`:`<code>${escapeHtml(m[4])}</code>`;last=m.index+m[0].length;}return out+escapeHtml(text.slice(last));}
export function renderGuide(markdown,id,ids){const lines=markdown.split(/\r?\n/),toc=[],html=[],used=new Set();let paragraph=[],list=null;
 const flush=()=>{if(paragraph.length){html.push('<p>'+inline(paragraph.join(' '),ids)+'</p>');paragraph=[];}};
 const close=()=>{flush();if(list){html.push(`</${list}>`);list=null;}};
 for(let i=0;i<lines.length;i++){const line=lines[i].trim();if(/^# /.test(line)){close();continue;}if(!line){close();continue;}
 const heading=line.match(/^(#{2,3}) (.+)$/);if(heading){close();let anchor=id+'-'+slug(heading[2]);if(used.has(anchor))throw Error('Duplicate guide heading');used.add(anchor);if(heading[1].length===2)toc.push({id:anchor,title:heading[2]});html.push(`<h${heading[1].length} id="${anchor}">${inline(heading[2],ids)}</h${heading[1].length}>`);continue;}
 if(line.startsWith('|')&&lines[i+1]?.match(/^\|[\s:|-]+\|\s*$/)){close();const cells=s=>s.trim().slice(1,-1).split('|').map(x=>inline(x.trim(),ids));const head=cells(line);i+=2;const rows=[];while(i<lines.length&&lines[i].trim().startsWith('|')){const row=cells(lines[i]);if(row.length!==head.length)throw Error('Guide table column mismatch');rows.push('<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>');i++;}i--;html.push('<div class="guide-table"><table><thead><tr>'+head.map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>');continue;}
 const item=line.match(/^(?:([-*]) |(\d+)\. )(.+)$/);if(item){flush();const type=item[1]?'ul':'ol';if(list!==type){if(list)html.push(`</${list}>`);html.push(`<${type}>`);list=type;}html.push('<li>'+inline(item[3],ids)+'</li>');continue;}
 if(list){html.push(`</${list}>`);list=null;}paragraph.push(line);
 }close();return {html:html.join('\n'),toc};
}
export async function buildGuide(root=ROOT,{write=true}={}){const dir=path.join(root,'docs/user-guide'),catalog=JSON.parse(await readFile(path.join(dir,'catalog.json'),'utf8')),ids=new Set(catalog.chapters.map(x=>x.id));if(ids.size!==catalog.chapters.length)throw Error('Duplicate guide chapter');const chapters=[];
 for(const chapter of catalog.chapters){if(!/^[a-z0-9-]+$/.test(chapter.id))throw Error('Unsafe chapter ID');const markdown=await readFile(path.join(dir,chapter.id+'.md'),'utf8');chapters.push({...chapter,...renderGuide(markdown,chapter.id,ids),text:markdown.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[#*`|]/g,'')});}
 const data={...catalog,chapters};const result=JSON.stringify(data)+'\n';if(write)await writeFile(path.join(root,'public/user-guide-data.json'),result);return {data,result};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await buildGuide();console.log(`User Guide: ${r.data.chapters.length} rendered chapters`);}
