// Deployment policy: no licensed dictionary or form rights have been established.
export const RIGHTS_POLICY=Object.freeze({licensedTerminology:false,ciomsTemplateExport:false,codedCaseXml:false});
export const RIGHTS_NOTICE='PV Info has no MedDRA or WHODrug subscription and provides no licensed dictionary, PT/LLT/SMQ expansion or dictionary validation. Use ordinary free-text phrases. Licensed terminology imports, CIOMS template filling and coded case XML downloads are disabled pending documented rights review. Public availability does not grant redistribution rights.';
export function requireLicensedTerms(){throw Error('Licensed terminology import is disabled. Use ordinary free-text phrases without dictionary codes, versions or PT/LLT/SMQ classifications.');}
