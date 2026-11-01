// Public-source derivatives only. No company cases, identities or server keys enter these files.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {EXTRACTOR,hash,safeParagraph} from './document-extract.mjs';
import {publicText,unsafeNarrative} from '../public/privacy.js';
import {officialUrl} from '../public/documents-lib.js';
export const SNAPSHOT_VERSION='public-document-key-info-v1';
const text=(value,max=1800)=>{const s=String(value??'').replace(/\s+/g,' ').trim();return unsafeNarrative(s)?'':publicText(s).slice(0,max);};
export function publicDocumentSnapshot(doc,source,parsed,{retrievedAt=new Date().toISOString()}={}){
 if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(doc.id))throw Error('Invalid document identity');
 const sourceUrl=officialUrl(source.url,doc.agency,doc.agencyPolicy); // validate; never copy credentials/query identifiers
 const candidates=[];let excluded=Number(parsed.excluded)||0;
 for(const c of parsed.candidates??[]){const statement=safeParagraph(c.statement);if(!statement){excluded++;continue;}
  candidates.push({ordinal:candidates.length+1,anchor:text(c.anchor,200),statement,context:safeParagraph(c.context)||'',fingerprint:hash(statement.toLowerCase()),review_status:'pending'});
 }
 const originalHash=hash(source.body),kind=source.body.subarray(0,5).toString()==='%PDF-'?'pdf':'html';
 const metadata={};for(const key of ['title','country','agency','edition','norm','topic','lifecycle','legal_basis','applicability','published_on','effective_on','source_status'])metadata[key]=text(doc[key]);
 const partial=Boolean(parsed.limited||excluded),status=parsed.error?'extraction_failed':!candidates.length?'no_candidates':partial?'partial':'candidates_extracted';
 const facts={schema_version:SNAPSHOT_VERSION,document_id:doc.id,metadata,metadata_verification:'Source-register metadata; dates and legal status require human verification.',source_url:sourceUrl,original_sha256:originalHash,content_kind:kind,parser_version:EXTRACTOR,extraction_status:status,candidate_count:candidates.length,excluded_paragraphs:excluded,candidate_limit_reached:Boolean(parsed.limited),review_status:'pending',limitations:['English rule-based extraction; no GPT or paid API.','Candidates are not approved requirements. Read the original, qualifications and exceptions.','Scans, tables, other languages and implicit obligations may be missed. Zero candidates does not establish zero requirements.'],candidates};
 // Identity covers source bytes, configured metadata and extraction outcome, but not check/retrieval times.
 const digest=hash(JSON.stringify(facts));
 return {file:`documents/${doc.id}/${digest}.json`,snapshot:{...facts,retrieved_at:retrievedAt}};
}
export async function openSnapshotStore(directory,{now=()=>new Date().toISOString()}={}){
 await mkdir(directory,{recursive:true});let index={schema_version:SNAPSHOT_VERSION,documents:{}};
 try{index=JSON.parse(await readFile(path.join(directory,'index.json'),'utf8'));if(index.schema_version!==SNAPSHOT_VERSION||!index.documents||Array.isArray(index.documents))throw Error('Unsupported snapshot index');}catch(e){if(e.code!=='ENOENT')throw e;}
 const write=async()=>writeFile(path.join(directory,'index.json'),JSON.stringify(index,null,2)+'\n');
 return {
  async record(doc,source,parsed){const {file,snapshot}=publicDocumentSnapshot(doc,source,parsed,{retrievedAt:now()});const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});
   // Append-only local files; publication also refuses replacement of existing version files.
   try{await writeFile(target,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
   const prior=index.documents[doc.id];index.documents[doc.id]={document_id:doc.id,country:snapshot.metadata.country,agency:snapshot.metadata.agency,title:snapshot.metadata.title,latest:file,last_checked_at:now(),last_success_at:now(),status:snapshot.extraction_status,candidate_count:snapshot.candidate_count,...(prior?.latest&&prior.latest!==file?{previous:prior.latest}:prior?.previous?{previous:prior.previous}:{})};await write();return snapshot;
  },
  async failure(doc){const prior=index.documents[doc.id];index.documents[doc.id]={...(prior??{document_id:doc.id,country:text(doc.country),agency:text(doc.agency),title:text(doc.title),latest:null}),last_checked_at:now(),status:'source_unavailable',note:'Previous extraction preserved; source could not be retrieved.'};await write();},
 };
}
