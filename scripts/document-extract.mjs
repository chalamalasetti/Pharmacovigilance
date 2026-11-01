import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {publicText,unsafeNarrative} from '../public/privacy.js';
import {officialUrl} from '../public/documents-lib.js';
export const EXTRACTOR='normative-rules-v1';
export const hash=v=>createHash('sha256').update(v).digest('hex');
const tidy=s=>String(s??'').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
const contact=/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+\d[\d ().-]{7,}\d|\(\d{3}\)\s*\d{3}[- .]\d{4}|\b(?:contact|fax|telephone|tel|author|prepared by|signed by|patient name|patient id|reporter name|date of birth|dob|address)\s*[:=]|\b(?:Mr|Mrs|Ms|Dr)\.\s+[A-Z]|\b(?:John Doe|Jane Doe)\b/i;
const obligation=/\b(?:shall|must|should|is required to|are required to)\b/i;
export function safeParagraph(s){s=tidy(s);return s.length>=25&&s.length<=1800&&!contact.test(s)&&!unsafeNarrative(s)&&publicText(s)===s?s:null;}
export function htmlParagraphs(html){
 const {document}=parseHTML(html);document.querySelectorAll('script,style,nav,header,footer,form,aside,[role=navigation],.toc').forEach(n=>n.remove());
 const main=document.querySelector('article .main-content,article,main,[role=main],#main-content,.main-content')??document.body;
 // eCFR puts a second section copy in enhanced-content controls. Prefer the regulatory text.
 const root=main?.querySelector('.section[data-section],.section')??main;let n=0;
 return [...(root?.querySelectorAll('p,li,h2,h3,h4,h5')??[])].filter(e=>!e.querySelector('p,li')).map(e=>({anchor:(e.id||e.closest('[id]')?.id||`paragraph-${++n}`).slice(0,180),text:tidy(e.textContent)})).filter(x=>x.text);
}
export async function pdfParagraphs(bytes,{maxPages=120}={}){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const loading=getDocument({data:new Uint8Array(bytes),standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts')+'/',cMapUrl:path.resolve('node_modules/pdfjs-dist/cmaps')+'/',cMapPacked:true,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,disableAutoFetch:true});
 const doc=await loading.promise;let pages=[];
 try{if(doc.numPages>maxPages)throw Error(`Document exceeds ${maxPages} pages; requires scoped/manual capture.`);
 for(let i=1;i<=doc.numPages;i++){
  const content=await(await doc.getPage(i)).getTextContent();let lines=[],line='';
  for(const x of content.items){if(!('str'in x))continue;line+=' '+x.str;if(x.hasEOL){lines.push(tidy(line));line='';}}if(line.trim())lines.push(tidy(line));pages.push(lines);
 }
 }finally{await loading.destroy();}
 const freq=new Map();for(const ls of pages)for(const l of new Set(ls))freq.set(l,(freq.get(l)||0)+1);
 const out=[];pages.forEach((lines,p)=>{
  let paragraph='',seq=0;const flush=()=>{if(paragraph)out.push({anchor:`page-${p+1}-paragraph-${++seq}`,text:tidy(paragraph)});paragraph='';};
  for(const l of lines){if(!l||/^(?:page\s*)?\d+(?:\s+of\s+\d+)?$/i.test(l)||pages.length>2&&freq.get(l)>pages.length*.65){flush();continue;}
   if(/^\d{1,4}$/.test(l))continue; // FDA line numbers are not regulatory content.
   if(contact.test(l)){flush();continue;}
   if(paragraph.length+l.length>1700||/^(?:\d+(?:\.\d+)*[.)]?|[IVX]+\.|[A-Z]\.)(?:\s|$)/.test(l))flush();
   paragraph+=' '+l;if(/[.;:]$/.test(l)&&paragraph.length>70)flush();
  }flush();
 });return out;
}
export function extractCandidates(paragraphs,{maxCandidates=300}={}){
 const seen=new Set(),found=[];let excluded=0,limited=false;
 for(let i=0;i<paragraphs.length;i++){
  const p=paragraphs[i];if(!obligation.test(p.text))continue;const s=safeParagraph(p.text);if(!s){excluded++;continue;}
  // Exclude general navigation, nonbinding boilerplate and contact directions; retain qualifications beside candidates.
  if(/guidances? (?:do not|does not) establish|should be viewed only as|contact (?:the|your)|subscribe|privacy policy|cookie|enable javascript|verify.*(?:human|robot)|captcha/i.test(s))continue;
  const fingerprint=hash(s.toLowerCase());if(seen.has(fingerprint))continue;seen.add(fingerprint);
  if(found.length>=maxCandidates){limited=true;continue;}
  const neighbors=[paragraphs[i-1]?.text,paragraphs[i+1]?.text].filter(Boolean).map(safeParagraph).filter(Boolean).join(' ').slice(0,900);
  found.push({anchor:String(p.anchor).slice(0,200),statement:s,context:neighbors,fingerprint});
 }
 return {candidates:found,excluded,limited};
}
const stop=new Set('the a an and or of to in for on by be as is are this that with from shall should must'.split(' '));
const tokens=s=>new Set(tidy(s).toLowerCase().match(/[a-z0-9]+/g)?.filter(x=>x.length>1&&!stop.has(x))??[]);
function similarity(a,b){const aa=tokens(a),bb=tokens(b);return [...aa].filter(x=>bb.has(x)).length/Math.max(1,new Set([...aa,...bb]).size);}
export function matchCandidates(next,previous=[],requirements=[],{partial=false}={}){
 const used=new Set(),matched=[];
 for(const c of next){
  const choices=[...previous.filter(p=>p.classification!=='possible_removal'&&p.review_status!=='rejected').map(p=>({p,kind:'candidate'})),...requirements.map(p=>({p:{...p,statement:p.body.statement},kind:'requirement'}))].filter(x=>!used.has(x.p.id));
  const best=choices.map(x=>({...x,score:similarity(c.statement,x.p.statement)})).sort((a,b)=>b.score-a.score)[0];
  const match=best&&best.score>=.32?best:null;if(match)used.add(match.p.id);
  const exact=match&&tidy(c.statement).toLowerCase()===tidy(match.p.statement).toLowerCase()&&tidy(c.context)===tidy(match.p.context);
  matched.push({...c,classification:exact?'unchanged':match?'changed':previous.length?'new':'baseline',match_score:match?Number(match.score.toFixed(3)):null,previous_candidate_id:match?.kind==='candidate'?match.p.id:null,previous_requirement_id:match?.kind==='requirement'?match.p.id:null});
 }
 if(!partial)for(const p of previous)if(!used.has(p.id)&&p.classification!=='possible_removal'&&p.review_status!=='rejected')matched.push({anchor:p.anchor,statement:p.statement,context:'Previously extracted text was not found in this capture. Parser/layout changes, incomplete documents or moved clauses can cause this. Confirm the original before inferring withdrawal.',fingerprint:hash('possible-removal:'+p.id),classification:'possible_removal',match_score:null,previous_candidate_id:p.id,previous_requirement_id:null});
 return matched;
}
export function documentDownload(html,url,doc){
 const {document}=parseHTML(html),links=[...document.querySelectorAll('a[href]')];
 const expected=doc.id==='ema-gvp-i'?/module-i-pharmacovigilance-systems-and-their-quality-systems.*\.pdf$/i:null;
 let choices=links.flatMap(a=>{try{return [{url:new URL(a.getAttribute('href'),url).href,text:tidy(a.textContent)}];}catch{return [];}}).filter(a=>{try{officialUrl(a.url,doc.agency,doc.agencyPolicy);return !/superseded/i.test(a.url)&&(expected?expected.test(a.url):/\/media\/\d+\/download|\.pdf(?:$|\?)/i.test(a.url)&&/download|guidance|view|pdf/i.test(a.text));}catch{return false;}});
 choices=[...new Map(choices.map(x=>[x.url,x])).values()];
 const preferred=choices.filter(x=>/download.*(?:guidance|final)|final.*guidance/i.test(x.text));
 if(preferred.length===1)return preferred[0].url;
 return choices.length===1||expected?choices[0]?.url:null;
}
