import {norm} from './product-answers-lib.js';
import {termMatches,compareVersions} from './label-history-lib.js';
export const REPOSITORY_MANIFEST='https://raw.githubusercontent.com/chalamalasetti/Pharmacovigilance/evidence-data-cache/manifest.json';
export const appNumber=value=>/\b(NDA|ANDA|BLA)\s*(\d{6})\b/i.exec(String(value||''))?.slice(1).join('').toUpperCase()||null;
export function phraseExcerpt(text,term,limit=1800){
 const words=norm(term).split(' ').filter(Boolean),window=[];let position=-1;
 if(words.length)for(const token of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)){window.push({word:norm(token[0]),index:token.index});if(window.length>words.length)window.shift();if(window.length===words.length&&window.every((item,i)=>item.word===words[i])){position=window[0].index;break;}}
 const start=position>=0?Math.max(0,position-350):0,end=Math.min(text.length,start+limit);
 return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
}
export function parseLabelQuestion(question){
 const q=String(question).trim();
 const markets=[[/\b(us|usa|united states|fda)\b/i,'US'],[/\b(eu|european union|ema)\b/i,'EU'],[/\b(canada|canadian|health canada)\b/i,'CA']].filter(([re])=>re.test(q)).map(([,m])=>m);if((/\bCA\b/.test(q)||/^ca[?. ]*$/i.test(q))&&!markets.includes('CA'))markets.push('CA');const market=markets.length===1?markets[0]:null;
 const history=/\blabel(?:s|ling|ing)?\b/i.test(q)&&/\b(first|added|introduced|included|changed|change|history|when|date|since)\b/i.test(q);
 const approval=/\b(approved|approval|authorised|authorized|authorisation|authorization)\b/i.test(q)&&/\b(when|date)\b/i.test(q);
 const tail=q.split(/when\s+(?:was|were)\s+/i).at(-1);
 const term=/(?:^|\b)(.{2,100}?)\s+(?:first\s+)?(?:added|introduced|included|listed|mentioned)\s+(?:in|on|to)\b/i.exec(tail)?.[1]?.trim().replace(/^["'“]|["'”]$/g,'')||'';
 return {question:q,market,history,approval,term};
}
const phrase=(text,q)=>(' '+norm(q)+' ').includes(' '+norm(text)+' ');
export function repositoryCandidates(records,question){
 const grouped=new Map();
 for(const r of records){
  const brand=norm(r.brand);if(brand.length<3||!phrase(r.brand,question)&&!(r.ingredients||[]).some(i=>norm(i).length>=4&&phrase(i,question)))continue;
  const application=appNumber(r.application||r.id),key=r.market+'|'+(application||r.id)+'|'+brand;
  const score=(phrase(r.brand,question)?1000+brand.length:0)+(r.id.startsWith('fda-drugsfda:')?20:0);
  const product={...r,application,score};if(!grouped.has(key)||grouped.get(key).score<score)grouped.set(key,product);
 }
 return [...grouped.values()].sort((a,b)=>b.score-a.score||a.brand.localeCompare(b.brand));
}
export function createRepositoryReader(fetcher=fetch){
 let manifest=null;const markets=new Map();
 return async(market,{signal,progress=()=>{},refresh=false}={})=>{
  if(refresh){manifest=null;markets.clear();}
  if(markets.has(market))return markets.get(market);
  if(!manifest){const r=await fetcher(REPOSITORY_MANIFEST,{cache:'no-store',signal});if(!r.ok)throw Error('Published product repository unavailable. Retry later.');const candidate=await r.json();if(candidate.schema!=='pv-evidence-repository/1'||!candidate.completeLabelSnapshot||candidate.developmentSubset||!Array.isArray(candidate.indexes)||!Array.isArray(candidate.sourceCatalog?.sources))throw Error('Repository verification failed.');manifest=candidate;}
  const sources=new Set(manifest.sourceCatalog.sources.filter(s=>s.market===market).map(s=>s.id));
  const files=manifest.indexes.filter(i=>i.type==='products'&&sources.has(i.source));if(!files.length)throw Error('No connected product source for this market.');
  const rows=[];
  for(const [i,file]of files.entries()){
   progress('Loading verified '+market+' products · '+(i+1)+' / '+files.length+' files');
   if(!/^https:\/\/raw\.githubusercontent\.com\/chalamalasetti\/Pharmacovigilance\/[a-f0-9]{40}\/[a-z0-9-]+\.json\.gz$/.test(file.url))throw Error('Invalid repository index reference.');
   const response=await fetcher(file.url,{signal});if(!response.ok)throw Error('A product index is unavailable. No partial product list is used.');
   if(!globalThis.crypto?.subtle)throw Error('Verified product search requires a secure HTTPS browser context. Open the live PV Info site.');
   const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.bytes)throw Error('Product index size mismatch.');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw Error('Product index checksum mismatch.');
   const values=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());if(!Array.isArray(values)||values.length!==file.records)throw Error('Product index count mismatch.');rows.push(...values);
  }
  const result={records:rows,built:manifest.built,release:manifest.release};markets.set(market,result);return result;
 };
}
export function assessLabelHistory({entries,versions,failures=[],term,indexComplete=true}){
 const ordered=[...entries].sort((a,b)=>a.version-b.version),loaded=new Map(versions.map(v=>[v.version,v]));
 const hits=v=>v.sections.filter(s=>termMatches(s.title+' '+s.text,term));
 const first=ordered.map(e=>loaded.get(e.version)).find(v=>v&&hits(v).length)||null;
 const preceding=first?ordered.filter(e=>e.version<first.version):ordered;
 const missing=preceding.filter(e=>!loaded.has(e.version)).map(e=>e.version);
 const before=first?loaded.get(preceding.at(-1)?.version)||null:null;
 const numericGaps=ordered.some((e,i)=>i>0&&e.version!==ordered[i-1].version+1);
 const coverage={listed:ordered.length,retrieved:versions.length,indexComplete,missingBeforeFirst:missing,failures,numericGaps,startsAtVersionOne:ordered[0]?.version===1};
 const earlierIndex=first?ordered.filter(e=>e.version<=first.version):ordered;const priorGaps=earlierIndex[0]?.version!==1||earlierIndex.some((e,i)=>i>0&&e.version!==earlierIndex[i-1].version+1);
 const status=!first?'No phrase match in retrieved versions':missing.length||!indexComplete||priorGaps?'Earliest retrieved mention; history gaps remain':before?'First observed addition within the available label-family history':'Already present in the oldest available label';
 return {schema:'pv-label-question-answer/1',term,status,first,before,matchingSections:first?hits(first):[],diff:first&&before?compareVersions(before,first).filter(s=>s.before.some(p=>termMatches(p.text,term))||s.after.some(p=>termMatches(p.text,term))||termMatches(s.title,term)):[],coverage,officialFirstAddition:null,regulatoryApprovalDate:null,limits:['The result concerns one selected US SPL Set ID, not every product, presentation, country or label family.','SPL effective and DailyMed publication dates do not establish FDA approval or the official first addition.','Literal phrase matching ignores case and punctuation; no clinical interpretation or synonym/MedDRA expansion is performed.','Available narrative extraction omits images and original layout; earlier or unavailable labels may exist. Qualified human review required.']};
}
