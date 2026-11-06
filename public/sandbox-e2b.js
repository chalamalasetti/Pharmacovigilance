// Review aid only: no XML serialization, terminology conversion or validation claim.
import {cleanSynthetic,caseIssues,CASE_SCHEMA} from './sandbox-case-lib.js';
const CANDIDATES={
 'C.1.1':'id','C.1.3':'source','C.1.4':'received','C.1.5':'latestReceived',
 'C.1.8.1':'report.worldwideId','C.1.10.r':'report.linkedCase','C.1.11.2':'report.amendmentReason',
 'N.1.3':'report.sender','N.1.4':'report.receiver','C.2.r.3':'report.reporterCountry','C.2.r.4':'reporter',
 'D.2.2a':'patient.age','D.2.2b':'patient.ageUnit','D.2.2.1a':'gestation','D.3':'patient.weight','D.4':'patient.height','D.5':'patient.sex',
 'D.7.1.r.2':'medicalHistory.*.start','D.7.1.r.3':'medicalHistory.*.ongoing','D.7.1.r.4':'medicalHistory.*.end',
 'D.9.1':'death.date','D.9.2.r.2':'death.cause','D.9.3':'death.autopsy','D.9.4.r.2':'death.autopsyResult',
 'D.10.2.2a':'parent.age','D.10.4':'parent.weight','D.10.6':'parent.sex','D.10.7.2':'parent.history',
 'E.i.1.1a':'events.*.term','E.i.3.2a':'events.*.death','E.i.3.2b':'events.*.lifeThreatening',
 'E.i.3.2c':'events.*.hospitalization','E.i.3.2d':'events.*.disability','E.i.3.2e':'events.*.congenital',
 'E.i.3.2f':'events.*.medicallyImportant','E.i.4':'events.*.onset','E.i.5':'events.*.end','E.i.7':'events.*.outcome',
 'F.r.1':'tests.*.date','F.r.2.1':'tests.*.name','F.r.3.2':'tests.*.value','F.r.3.3':'tests.*.unit',
 'G.k.1':'products.*.role','G.k.2.2':'products.*.label','G.k.2.3.r.1':'products.*.ingredient',
 'G.k.4.r.1a':'products.*.regimens.*.amount','G.k.4.r.1b':'products.*.regimens.*.unit',
 'G.k.4.r.4':'products.*.regimens.*.start','G.k.4.r.5':'products.*.regimens.*.stop',
 'G.k.4.r.6a':'products.*.regimens.*.duration','G.k.4.r.6b':'products.*.regimens.*.durationUnit',
 'G.k.4.r.7':'products.*.regimens.*.batch','G.k.4.r.8':'products.*.dose',
 'G.k.4.r.9.1':'products.*.form','G.k.4.r.10.1':'products.*.regimens.*.route',
 'G.k.7.r.1':'products.*.indication','G.k.8':'products.*.action',
 'H.1':'narrative.summary','H.2':'narrative.reporterComments','H.4':'narrative.senderComments'
};
function valuesAt(value,tokens,path='$'){
 if(!tokens.length)return [{path,value}];
 const [token,...rest]=tokens;
 if(token==='*')return Array.isArray(value)?value.flatMap((row,i)=>valuesAt(row,rest,path+'['+i+']')):[];
 return value&&Object.hasOwn(value,token)?valuesAt(value[token],rest,path+'.'+token):[];
}
export function e2bReadiness(raw,catalog){
 const c=cleanSynthetic(raw);
 if(catalog?.schema!==1||!Array.isArray(catalog.records)||!Array.isArray(catalog.sources)||!catalog.contentHash)throw Error('Unsupported E2B reference catalog.');
 const records=catalog.records.filter(r=>r.layer==='ICH');
 const known=new Set(records.map(r=>r.fieldId));
 if(Object.keys(CANDIDATES).some(id=>!known.has(id)))throw Error('Mapping references do not match this catalog; review is required.');
 const fields=records.map(r=>{
  const path=CANDIDATES[r.fieldId],values=path?valuesAt(c,path.split('.')):[];
  return {fieldId:r.fieldId,title:r.title,source:r.source,sourceHash:r.sourceHash,location:r.location,
   candidatePath:path??null,status:path?'candidate — semantic and coding review required':'not mapped',
   populated:values.some(x=>x.value!==''&&x.value!==null&&x.value!==undefined),values};
 });
 return {schema:'pvinfo-e2b-mapping-review/1',caseSchema:CASE_SCHEMA,classification:'SYNTHETIC TRAINING ONLY',
  caseId:c.id,revision:c.revision,formState:'current form / draft; may contain unsaved changes',
  outputType:'Mapping review JSON — NOT an E2B message',xmlExportEnabled:false,profile:null,
  catalogHash:catalog.contentHash,sources:catalog.sources,structuralIssues:caseIssues(c),
  coverage:{catalogElements:fields.length,candidateElements:fields.filter(f=>f.candidatePath).length,
   populatedCandidateElements:fields.filter(f=>f.candidatePath&&f.populated).length,validatedElements:0},
  gates:[{check:'Field mapping and repeatable association review',status:'not executed'},
   {check:'ICH XML serialization and pinned XSD validation',status:'not implemented'},
   {check:'Regional profile and business rules',status:'not selected / not executed'},
   {check:'Terminology versions, code conversion and null flavors',status:'not validated'},
   {check:'Representative XML examples and roundtrip tests',status:'not executed'}],
  notes:['Candidate values retain training strings; no coded values or XML paths are inferred.',
   'Populated does not mean valid; unknown, null flavors, dates and units require field-specific review.',
   'Pair assessments, literature and history remain in the case package; not all are mapped here.',
   'Structural warnings and mapping coverage are not regulatory acceptance or case completeness.'],fields};
}
