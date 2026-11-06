// ICH-shaped, XSD-validated training export. No agency profile or submission claim.
import {cleanSynthetic,caseIssues,packageCases} from './sandbox-case-lib.js';
export const XML_PROFILE='pvinfo-ich-r3-training/1';
export const SCHEMA_HASH='5111048743109b23b2ced8018f08204121a5aa3c139addde5a574387a40908c2';
export const ARCHIVE_HASH='b6bf2c2151ec13245b5895359af98f23057e504e4d204e4f6c6b171ef84fc233';
export const ENTRYPOINT='multicacheschemas/MCCI_IN200100UV01.xsd';
const ICH='2.16.840.1.113883.3.989.2.1.';
const n=(tag,attrs={},...children)=>({tag,attrs,children:children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false)});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function render(x,level=0){if(typeof x!=='object')return esc(x);const pad='  '.repeat(level),attrs=Object.entries(x.attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('');if(!x.children.length)return pad+'<'+x.tag+attrs+'/>';if(x.children.every(c=>typeof c!=='object'))return pad+'<'+x.tag+attrs+'>'+x.children.map(esc).join('')+'</'+x.tag+'>';return pad+'<'+x.tag+attrs+'>\n'+x.children.map(c=>typeof c==='object'?render(c,level+1):'  '.repeat(level+1)+esc(c)).join('\n')+'\n'+pad+'</'+x.tag+'>';}
const code=(value,system=ICH+'1.19',version='1.1')=>n('code',{code:value,codeSystem:system,...(version?{codeSystemVersion:version}:{})});
const obs=(c,value,...rest)=>n('observation',{classCode:'OBS',moodCode:'EVN'},code(c),value,...rest);
const scalar=(type,value,attrs={})=>n('value',{'xsi:type':type,...attrs},...(value===null?[]:[value]));
const bool=value=>n('value',{'xsi:type':'BL',...(value==='yes'?{value:'true'}:{nullFlavor:'NI'})});
const stamp=s=>s.replaceAll('-','').replaceAll(':','').replace('T','')+'00+0000';
const day=s=>s.replaceAll('-','');
const interval=(start,stop)=>start||stop?n('effectiveTime',{'xsi:type':'IVL_TS'},start?n('low',{value:day(start)}):null,stop?n('high',{value:day(stop)}):null):null;
const pq=(value,unit)=>n('value',{'xsi:type':'PQ',value,unit});
const property=(c,value)=>n('outboundRelationship2',{typeCode:'PERT'},obs(c,value));
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function uuid(name){const ns=Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g),v=>parseInt(v,16)),text=new TextEncoder().encode('pvinfo-training/'+name),all=new Uint8Array(ns.length+text.length);all.set(ns);all.set(text,ns.length);const b=new Uint8Array(await crypto.subtle.digest('SHA-1',all)).slice(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const hex=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}
export function xmlProfileIssues(raw){
 const c=cleanSynthetic(raw),issues=caseIssues(c);
 for(const [field,label]of [['sender','sender identifier'],['receiver','receiver identifier'],['worldwideId','worldwide case reference']])if(!c.report[field])issues.push('XML: provide a fictional '+label+'.');
 if(!c.report.creationTime)issues.push('XML: provide the simulated message creation UTC.');else if(c.report.creationTime<c.latestReceived)issues.push('XML: message creation precedes the latest receipt.');
 if(!c.narrative.summary)issues.push('XML: provide a fictional clinical narrative.');
 for(const e of c.events){if(e.nullFlavor!=='value')issues.push(e.id+': this XML profile requires a reported event term.');if(!/^\d{8}$/.test(e.meddraCode))issues.push(e.id+': enter an eight-digit, user-supplied MedDRA code.');if(!/^\d{1,2}(\.\d)?$/.test(e.meddraVersion))issues.push(e.id+': enter the MedDRA version associated with the code.');}
 if(!c.products.some(p=>p.role==='suspect'||p.role==='interacting'))issues.push('XML: at least one suspect or interacting product is required.');
 if(c.patient.sex==='other')issues.push('XML: this profile cannot map other sex to ISO 5218; choose unknown or retain the JSON package.');
 return issues;
}
export async function serializeTrainingXml(raw){
 const c=cleanSynthetic(raw),issues=xmlProfileIssues(c);if(issues.length)throw Error(issues.join('\n'));
 const eventIds=new Map(await Promise.all(c.events.map(async e=>[e.id,await uuid(c.id+'/event/'+e.id)]))),productIds=new Map(await Promise.all(c.products.map(async p=>[p.id,await uuid(c.id+'/product/'+p.id)])));
 const primary=n('primaryRole',{classCode:'INVSBJ'},n('player1',{classCode:'PSN',determinerCode:'INSTANCE'},n('name',{nullFlavor:'MSK'}),n('administrativeGenderCode',c.patient.sex==='unknown'?{nullFlavor:'UNK'}:{code:c.patient.sex==='female'?'2':'1',codeSystem:'1.0.5218'})));
 for(const [value,unit,id]of [[c.patient.age,{years:'a',months:'mo',days:'d'}[c.patient.ageUnit],'3'],[c.gestation,'wk','16'],[c.patient.weight,'kg','7'],[c.patient.height,'cm','17']])if(value!=='')primary.children.push(n('subjectOf2',{typeCode:'SBJ'},obs(id,pq(value,unit))));
 for(const e of c.events){const outcome={'recovered':'1','recovering':'2','not recovered':'3','sequelae':'4','fatal':'5','unknown':'0'}[e.outcome];primary.children.push(n('subjectOf2',{typeCode:'SBJ'},n('observation',{classCode:'OBS',moodCode:'EVN'},n('id',{root:eventIds.get(e.id)}),code('29'),interval(e.onset,e.end),n('value',{'xsi:type':'CE',code:e.meddraCode,codeSystem:'2.16.840.1.113883.6.163',codeSystemVersion:e.meddraVersion},n('originalText',{language:'en'},e.term)),n('location',{typeCode:'LOC'},n('locatedEntity',{classCode:'LOCE'},n('locatedPlace',{classCode:'COUNTRY',determinerCode:'INSTANCE'},n('code',{code:c.country,codeSystem:'1.0.3166.1.2.2'})))),...Object.entries({death:'34',lifeThreatening:'21',hospitalization:'33',disability:'35',congenital:'12',medicallyImportant:'26'}).map(([key,id])=>property(id,bool(e[key]))),property('27',n('value',{'xsi:type':'CE',code:outcome,codeSystem:ICH+'1.11',codeSystemVersion:'1.0'})))));}
 for(const p of c.products){const drug=n('substanceAdministration',{classCode:'SBADM',moodCode:'EVN'},n('id',{root:productIds.get(p.id)}),n('consumable',{typeCode:'CSM'},n('instanceOfKind',{classCode:'INST'},n('kindOfProduct',{classCode:'MMAT',determinerCode:'KIND'},n('name',{},p.label),p.ingredient?n('ingredient',{classCode:'ACTI'},n('ingredientSubstance',{classCode:'MMAT',determinerCode:'KIND'},n('name',{},p.ingredient))):null))));
  for(const d of p.regimens)drug.children.push(n('outboundRelationship2',{typeCode:'COMP'},n('substanceAdministration',{classCode:'SBADM',moodCode:'EVN'},n('text',{},[p.dose,d.amount&&'Dose '+d.amount+' '+d.unit,d.frequency,d.duration&&'Duration '+d.duration+' '+d.durationUnit,d.batch&&'Batch '+d.batch].filter(Boolean).join('; ')||'Fictional regimen'),interval(d.start,d.stop),d.route&&d.route!=='unknown'?n('routeCode',{},n('originalText',{},d.route)):null,d.amount!==''&&['mg','g','ug','mL','L','1'].includes(d.unit)?n('doseQuantity',{value:d.amount,unit:d.unit}):null)));
  primary.children.push(n('subjectOf2',{typeCode:'SBJ'},drug));
 }
 const assessment=n('adverseEventAssessment',{classCode:'INVSTG',moodCode:'EVN'},n('subject1',{typeCode:'SBJ'},primary));
 for(const p of c.products)assessment.children.push(n('component',{typeCode:'COMP'},n('causalityAssessment',{classCode:'OBS',moodCode:'EVN'},code('20'),n('value',{'xsi:type':'CE',code:{suspect:'1',concomitant:'2',interacting:'3'}[p.role],codeSystem:ICH+'1.13',codeSystemVersion:'1.0'}),n('subject2',{typeCode:'SUBJ'},n('productUseReference',{classCode:'SBADM',moodCode:'EVN'},n('id',{root:productIds.get(p.id)}))))));
 for(const a of c.assessments)assessment.children.push(n('component',{typeCode:'COMP'},n('causalityAssessment',{classCode:'OBS',moodCode:'EVN'},code('39'),scalar('ST',a.causality),n('methodCode',{},n('originalText',{},'Explicit sandbox pair assessment')),n('author',{typeCode:'AUT'},n('assignedEntity',{classCode:'ASSIGNED'},n('code',{},n('originalText',{},a.basis||'Fictional training assessment')))),n('subject1',{typeCode:'SUBJ'},n('adverseEffectReference',{classCode:'OBS',moodCode:'EVN'},n('id',{root:eventIds.get(a.eventId)}))),n('subject2',{typeCode:'SUBJ'},n('productUseReference',{classCode:'SBADM',moodCode:'EVN'},n('id',{root:productIds.get(a.productId)}))))));
 for(const [text,source]of [[c.narrative.reporterComments,'3'],[c.narrative.senderComments,'1']])if(text)assessment.children.push(n('component1',{typeCode:'COMP'},n('observationEvent',{classCode:'OBS',moodCode:'EVN'},code('10'),scalar('ED',text),n('author',{typeCode:'AUT'},n('assignedEntity',{classCode:'ASSIGNED'},code(source,ICH+'1.21','1.0'))))));
 const supplemental={...c};delete supplemental.history;
 const narrative='SYNTHETIC TRAINING ONLY. NOT FOR SUBMISSION.\n'+c.narrative.summary+'\n\nSupplemental sandbox context (not structured E2B mappings):\n'+JSON.stringify(supplemental);
 if(narrative.length>100000)throw Error('XML: training narrative exceeds 100,000 characters. Reduce this case or use its JSON package.');
 const inv=n('investigationEvent',{classCode:'INVSTG',moodCode:'EVN'},n('id',{extension:c.id,root:ICH+'3.1'}),n('id',{extension:c.report.worldwideId,root:ICH+'3.2'}),code('PAT_ADV_EVNT','2.16.840.1.113883.5.4',null),n('text',{},narrative),n('statusCode',{code:'active'}),n('effectiveTime',{},n('low',{value:stamp(c.received)})),n('availabilityTime',{value:stamp(c.latestReceived)}),n('component',{typeCode:'COMP'},assessment));
 inv.children.push(n('subjectOf2',{typeCode:'SUBJ'},n('investigationCharacteristic',{classCode:'OBS',moodCode:'EVN'},code('1',ICH+'1.23','1.0'),n('value',{'xsi:type':'CE',code:c.source==='study'?'2':c.source==='spontaneous'?'1':'3',codeSystem:ICH+'1.2',codeSystemVersion:'1.0'}))));
 const device=(tag,type,identifier,oid)=>n(tag,{typeCode:type},n('device',{classCode:'DEV',determinerCode:'INSTANCE'},n('id',{extension:identifier,root:ICH+oid})));
 const message=n('PORR_IN049016UV',{},n('id',{extension:c.id+'-R'+c.revision,root:ICH+'3.1'}),n('creationTime',{value:stamp(c.report.creationTime)}),n('interactionId',{extension:'PORR_IN049016UV',root:'2.16.840.1.113883.1.6'}),n('processingCode',{code:'T'}),n('processingModeCode',{code:'T'}),n('acceptAckCode',{code:'AL'}),device('receiver','RCV',c.report.receiver,'3.12'),device('sender','SND',c.report.sender,'3.11'),n('controlActProcess',{classCode:'CACT',moodCode:'EVN'},code('PORR_TE049016UV','2.16.840.1.113883.1.18',null),n('effectiveTime',{value:stamp(c.report.creationTime)}),n('subject',{typeCode:'SUBJ'},inv)));
 const root=n('MCCI_IN200100UV01',{xmlns:'urn:hl7-org:v3','xmlns:xsi':'http://www.w3.org/2001/XMLSchema-instance',ITSVersion:'XML_1.0','xsi:schemaLocation':'urn:hl7-org:v3 '+ENTRYPOINT},n('id',{extension:'SYNTHETIC-'+c.id+'-R'+c.revision,root:ICH+'3.22'}),n('creationTime',{value:stamp(c.report.creationTime)}),n('responseModeCode',{code:'D'}),n('interactionId',{extension:'MCCI_IN200100UV01',root:'2.16.840.1.113883.1.6'}),n('name',{code:'1',codeSystem:ICH+'1.1',codeSystemVersion:'1.0'}),message,device('receiver','RCV',c.report.receiver,'3.14'),device('sender','SND',c.report.sender,'3.13'));
 return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- SYNTHETIC TRAINING ONLY; NOT FOR SUBMISSION -->\n'+render(root)+'\n';
}

export async function loadSchemaBundle(fetcher=fetch){
 const response=await fetcher(new URL('./e2b/ich-schema-2.5.bin',import.meta.url));if(!response.ok)throw Error('Pinned XSD bundle is unavailable.');
 const bytes=await response.arrayBuffer();if(await sha256(bytes)!==SCHEMA_HASH)throw Error('Pinned XSD bundle integrity check failed.');
 const json=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 const bundle=JSON.parse(json);if(bundle.version!=='2.5'||bundle.archiveSha256!==ARCHIVE_HASH||bundle.files.length!==167)throw Error('Unsupported XSD bundle.');
 return bundle;
}
export async function validateWithSchemas(xml,bundle,engine){
 if(new TextEncoder().encode(xml).byteLength>1000000)throw Error('XML exceeds the 1 MB training limit.');
 if(/<!\s*(DOCTYPE|ENTITY)/i.test(xml))throw Error('DTD and entity declarations are not allowed.');
 const schema=bundle.files.find(f=>f.fileName===ENTRYPOINT);if(!schema)throw Error('ICH batch entrypoint missing.');
 return engine({xml:[{fileName:'training-case.xml',contents:xml}],schema:[schema],preload:bundle.files.filter(f=>f!==schema),initialMemoryPages:1024,maxMemoryPages:2048});
}
function browserEngine(options){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./sandbox-xsd-worker.js',import.meta.url),{type:'module'});
 const finish=(error,result)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
 const timer=setTimeout(()=>finish(Error('XSD validation timed out; no XML download was enabled.')),30000);
 worker.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(null,e.data.result);
 worker.onerror=()=>finish(Error('Local XSD validator could not start. No XML download was enabled.'));
 worker.postMessage(options);
});}
export async function validatedTrainingExport(raw,{loadSchemas=loadSchemaBundle,engine=browserEngine}={}){
 const c=cleanSynthetic(raw),issues=xmlProfileIssues(c);
 const report={schema:'pvinfo-xml-validation/1',classification:'SYNTHETIC TRAINING ONLY',profile:XML_PROFILE,formState:'current form / draft',caseId:c.id,revision:c.revision,
  schemaSet:{version:'2.5',archiveSha256:ARCHIVE_HASH,bundleSha256:SCHEMA_HASH,entrypoint:ENTRYPOINT},
  validator:{package:'xmllint-wasm',version:'5.3.0',libxml2:'2.13.8'},
  profileChecks:{passed:issues.length===0,errors:issues},xsd:{executed:false,valid:false,errors:[]},
  downloadEnabled:false,regionalBusinessRules:'not executed — no regional profile',terminologyDictionary:'not checked — user-supplied MedDRA code/version; format checks only',agencyAcceptance:'not tested',
  structuredCoverage:['batch/message test headers','case identifiers and receipt clocks','age, gestation, sex, weight and height','event terms, user-supplied MedDRA codes, dates, outcomes, seriousness criteria and occurrence country','product names, ingredients, roles, dose-regimen dates, route text and supported dose quantities','independent product–event causality references','clinical narrative and reporter/sender comments'],
  supplementalCoverage:'All current sandbox fields are additionally retained as clearly labeled supplemental JSON text in H.1; this is not a structured mapping of every field. Prior revision history is retained in the companion case JSON only.',
  assumptions:['English reported-event text. Single case per batch. Processing and processing-mode codes are T (training/test).','Negative or unknown seriousness criteria use NI in the ICH true-or-NI fields; the original tri-state values remain in supplemental context.','Dose units mg, g, ug, mL, L and 1 use structured quantities; other units, frequency, duration and batch remain regimen text and supplemental context.','Source spontaneous maps to report type 1; study maps to 2; literature/other map to 3 in this training profile.','No clinical judgment, expectedness, expedited-report classification or agency due date is inferred.'],
  references:['https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2br3-electronic-transmission-individual-case-safety-reports-implementation-guide-data-elements-and','https://admin.ich.org/node/348']};
 if(issues.length)return {xml:null,report};
 try{
  report.caseInputSha256=await sha256(packageCases([raw]));
  const xml=await serializeTrainingXml(c),bundle=await loadSchemas(),result=await validateWithSchemas(xml,bundle,engine);
  report.xmlSha256=await sha256(xml);report.xsd={executed:true,valid:result.valid===true,errors:result.errors??[]};
  report.downloadEnabled=report.profileChecks.passed&&report.xsd.valid;
  return {xml:report.downloadEnabled?xml:null,report,schemaFiles:report.downloadEnabled?bundle.files:[]};
 }catch(error){report.xsd.errors=[{message:error.message}];return {xml:null,report};}
}
