import JSZip from 'jszip';
import {NOTICE_TEXT} from '../public/safety-notice.js';
import {sha256} from '../public/sandbox-xml.js';
import {packageCases} from '../public/sandbox-case-lib.js';
export async function xmlTrainingZip(raw,result){
 if(!result.xml||!result.report.downloadEnabled||!result.report.xsd.valid)throw Error('XML validation has not passed.');
 if(await sha256(result.xml)!==result.report.xmlSha256||await sha256(packageCases([raw]))!==result.report.caseInputSha256)throw Error('Validated XML or case inputs changed. Validate again before download.');
 const zip=new JSZip();zip.file('PV-INFO-NOTICE.txt',NOTICE_TEXT);for(const file of result.schemaFiles??[])zip.file(file.fileName,file.contents);zip.file('synthetic-case.xml',result.xml);zip.file('validation-report.json',JSON.stringify(result.report,null,2));zip.file('synthetic-case-package.json',packageCases([raw]));
 zip.file('READ-ME.txt','SYNTHETIC TRAINING ONLY — NOT FOR SUBMISSION\n\nThis XML passed the pinned ICH 2.5 XSD set and the listed PV Info training-profile checks. See validation-report.json for exact hashes, mapped sections, assumptions and limits. The official dependency XSDs are included at their original relative paths for offline revalidation. Regional business rules and licensed dictionary membership were NOT checked. No FDA/EMA acceptance is claimed. All current fields are additionally retained in supplemental narrative; history is retained only in the case package.\n\nDo not send this package to an agency or use real patient data.\n');
 return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
