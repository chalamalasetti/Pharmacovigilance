import {createHash} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import JSZip from 'jszip';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DM='https://dailymed.nlm.nih.gov',FDA='https://api.fda.gov';
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
export function validateRequest(params){
 const mode=params.get('mode')||'search';if(!['search','history','version'].includes(mode))throw fail('Invalid label request.',400);const allowed={search:['mode','q','field','page'],history:['mode','setid','page'],version:['mode','setid','version']}[mode];
 if(!allowed||[...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1))throw fail('Invalid label request.',400);
 const page=Number(params.get('page')||1);if(!Number.isInteger(page)||page<1||page>100)throw fail('Choose a page from 1 to 100.',400);
 if(mode==='search'){const q=(params.get('q')||'').trim(),field=params.get('field')||'brand';if(q.length<2||q.length>120||!/^[\p{L}\p{N}][\p{L}\p{N}\s.,'()/-]*$/u.test(q)||!['brand','ingredient','company','term','application'].includes(field))throw fail('Enter 2–120 characters of public product metadata and a supported search field.',400);return {mode,q,field,page};}
 const setid=(params.get('setid')||'').toLowerCase();if(!UUID.test(setid))throw fail('Choose a valid SPL Set ID.',400);
 const version=params.get('version');if(mode==='version'&&!/^[1-9]\d{0,5}$/.test(version||''))throw fail('Choose a valid label version.',400);return {mode,setid,page,version:Number(version)};
}
export async function readBounded(response,limit){const size=Number(response.headers.get('content-length'));if(size>limit){await response.body?.cancel();throw fail('Source file exceeds the supported size; open the official source.',413);}const chunks=[];let total=0;for await(const part of response.body){total+=part.length;if(total>limit)throw fail('Source file exceeds the supported size; open the official source.',413);chunks.push(part);}return Buffer.concat(chunks,total);}
async function get(url,{fetchImpl=fetch,limit=4_000_000,empty404=false}={}){
 const u=new URL(url);if(![DM,FDA].includes(u.origin))throw fail('Unsupported source.');
 const response=await fetchImpl(u,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'application/json, application/zip, application/xml','user-agent':'PVInfo-LabelHistory/1.0 (+https://www.pvinfo.org)'}});
 if(response.status===404&&empty404){await response.body?.cancel();return null;}
 if(!response.ok){await response.body?.cancel();throw fail(response.status===429?'Official source rate limit reached. Retry later.':'The requested official source is unavailable.',response.status===429?429:response.status===404?404:502);}
 return readBounded(response,limit);
}
const values=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'):[];
export async function searchLabels({q,field,page},{fetchImpl=fetch}={}){
 if(field==='application'){const match=/^(NDA|ANDA|BLA)\s*(\d{6})$/i.exec(String(q).trim());if(!match)throw fail('Enter an FDA application such as NDA 020702, ANDA 000001 or BLA 125057.',400);q=match[1].toUpperCase()+match[2];}
 const fields={brand:['openfda.brand_name'],ingredient:['openfda.substance_name','openfda.generic_name'],company:['openfda.manufacturer_name'],application:['openfda.application_number'],term:['boxed_warning','warnings','warnings_and_cautions','adverse_reactions','contraindications','precautions','drug_interactions']};
 const url=new URL('/drug/label.json',FDA);url.searchParams.set('search','('+fields[field].map(f=>`${f}:"${q}"`).join(' OR ')+')');url.searchParams.set('limit','10');url.searchParams.set('skip',String((page-1)*10));url.searchParams.set('sort','effective_time:desc');
 const raw=await get(url,{fetchImpl,limit:8_000_000,empty404:true});if(!raw)return {results:[],total:0,page,sourceURL:url.href,checked:new Date().toISOString()};
 const data=JSON.parse(raw);if(!Array.isArray(data.results))throw fail('Unexpected openFDA response.');
 return {results:data.results.map(r=>({setid:r.set_id,version:String(r.version??''),effectiveTime:r.effective_time??null,brands:values(r.openfda?.brand_name),ingredients:values(r.openfda?.substance_name),companies:values(r.openfda?.manufacturer_name),applications:values(r.openfda?.application_number),productTypes:values(r.openfda?.product_type),title:values(r.spl_product_data_elements)[0]?.slice(0,250)||values(r.openfda?.brand_name).join(' / ')||'Label family',sourceURL:UUID.test(r.set_id??'')?`${DM}/dailymed/drugInfo.cfm?setid=${r.set_id}`:null})).filter(r=>UUID.test(r.setid??'')),total:Number(data.meta?.results?.total)||0,page,sourceUpdated:data.meta?.last_updated??null,sourceURL:url.href,checked:new Date().toISOString()};
}
export async function labelHistory({setid,page},{fetchImpl=fetch}={}){
 const url=`${DM}/dailymed/services/v2/spls/${setid}/history.json?pagesize=100&page=${page}`,data=JSON.parse(await get(url,{fetchImpl}));
 if(data.data?.spl?.setid?.toLowerCase()!==setid||!Array.isArray(data.data?.history))throw fail('DailyMed history identity could not be verified.');
 const entries=data.data.history.map(r=>({version:Number(r.spl_version),publishedDate:String(r.published_date??'')}));if(entries.some(r=>!Number.isSafeInteger(r.version)||r.version<1))throw fail('Invalid source version metadata.');
 return {setid,title:data.data.spl.title,entries,total:Number(data.metadata?.total_elements)||entries.length,totalPages:Number(data.metadata?.total_pages)||1,page,sourceUpdated:data.metadata?.db_published_date??null,sourceURL:url,checked:new Date().toISOString()};
}
const child=(nodes,key)=>nodes?.find(n=>Object.hasOwn(n,key));
const attr=(node,key)=>String(node?.[':@']?.['@_'+key]??'');
function plain(nodes){function raw(items,depth=0){if(depth>100)throw fail('SPL nesting exceeds supported limits.');return (items??[]).map(n=>Object.entries(n).filter(([k])=>k!==':@').map(([k,v])=>k==='#text'?String(v):Array.isArray(v)?(['br','paragraph','tr','item','caption','title'].includes(k)?'\n':'')+raw(v,depth+1)+(['paragraph','tr','item','td','th','br','caption','title'].includes(k)?'\n':''):'').join('')).join('');}return raw(nodes).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();}
export function parseSPL(xml,{setid,version}){
 if(Buffer.byteLength(xml)>4_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw fail('Unsupported SPL size or document declaration.',413);
 if(XMLValidator.validate(xml)!==true)throw fail('The source SPL XML is invalid.');
 const tree=new XMLParser({preserveOrder:true,ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,trimValues:false}).parse(xml),doc=child(tree,'document')?.document;
 if(!doc||attr(child(doc,'setId'),'root').toLowerCase()!==setid||Number(attr(child(doc,'versionNumber'),'value'))!==version)throw fail('Downloaded SPL does not match the selected family and version.');
 const sections=[],apps=new Set();let count=0;
 function walk(nodes,depth=0){if(depth>100)throw fail('SPL nesting exceeds supported limits.');for(const n of nodes??[])for(const[k,v]of Object.entries(n)){if(k==='approval'){const id=attr(child(v,'id'),'extension');if(/^(NDA|ANDA|BLA)\s*\d{6}$/i.test(id))apps.add(id.toUpperCase().replace(/\s/g,''));}if(k==='section'){const codeNode=child(v,'code'),code=attr(codeNode,'code'),title=plain(child(v,'title')?.title)||attr(codeNode,'displayName')||'Untitled section',body=child(v,'text')?.text;if(body){if(++count>500)throw fail('SPL has too many sections.');const text=plain(body);sections.push({code,title,text});}}if(k!==':@'&&Array.isArray(v))walk(v,depth+1);}}
 walk(doc);if(!sections.length)throw fail('No readable narrative sections were found; inspect the original SPL.');
 const output={setid,version,documentId:attr(child(doc,'id'),'root'),effectiveTime:attr(child(doc,'effectiveTime'),'value')||null,title:plain(child(doc,'title')?.title)||'SPL label',applications:[...apps],sections,hash:createHash('sha256').update(xml).digest('hex'),sourceURL:`${DM}/dailymed/getFile.cfm?type=zip&setid=${setid}&version=${version}`,checked:new Date().toISOString(),extraction:'Narrative text including table cells; images, layout and embedded media are not compared.',status:'Submitted SPL version; regulatory approval date not established'};
 if(Buffer.byteLength(JSON.stringify(output))>2_000_000)throw fail('Extracted label exceeds the supported response size.',413);return output;
}
export async function labelVersion({setid,version},{fetchImpl=fetch}={}){
 const url=`${DM}/dailymed/getFile.cfm?type=zip&setid=${setid}&version=${version}`,raw=await get(url,{fetchImpl,limit:20_000_000});
 const zip=await JSZip.loadAsync(raw),files=Object.values(zip.files).filter(f=>!f.dir&&/\.xml$/i.test(f.name));
 if(files.length!==1)throw fail('Archive must contain exactly one SPL XML document; inspect the source.');
 const file=files[0];if(!Number.isFinite(file._data?.uncompressedSize)||file._data.uncompressedSize>4_000_000)throw fail('SPL XML exceeds supported size.',413);
 return parseSPL(await file.async('string'),{setid,version});
}
export async function collectLabelRequest(request,deps){if(request.mode==='search')return searchLabels(request,deps);if(request.mode==='history')return labelHistory(request,deps);if(request.mode==='version')return labelVersion(request,deps);throw fail('Invalid label request.',400);}
