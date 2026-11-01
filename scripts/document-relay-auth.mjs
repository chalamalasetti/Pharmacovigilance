import {createRemoteJWKSet,jwtVerify} from 'jose';
export const RELAY_AUDIENCE='https://www.pvinfo.org/api/document-collect';
export const RELAY_REPO='chalamalasetti/Pharmacovigilance';
const keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),{timeoutDuration:10000});
// GitHub allows customized subjects. Signed repository ID, ref and workflow claims bind the authorized job; the signed subject is still required.
export function trustedDocumentJob(p){return p.repository===RELAY_REPO&&p.repository_id==='1439636720'&&p.ref==='refs/heads/main'&&typeof p.sub==='string'&&p.sub.length>0&&p.sub.length<=2048&&p.workflow_ref===`${RELAY_REPO}/.github/workflows/documents.yml@refs/heads/main`&&['push','schedule','workflow_dispatch'].includes(p.event_name);}
export async function verifyDocumentJob(token,keySet=keys){
 const {payload}=await jwtVerify(token,keySet,{issuer:'https://token.actions.githubusercontent.com',audience:RELAY_AUDIENCE,algorithms:['RS256'],maxTokenAge:'10m',clockTolerance:5,requiredClaims:['exp','iat','sub','repository','repository_id','ref','workflow_ref','event_name']});
 if(!trustedDocumentJob(payload)){const expected={repository:RELAY_REPO,repository_id:'1439636720',ref:'refs/heads/main',workflow_ref:`${RELAY_REPO}/.github/workflows/documents.yml@refs/heads/main`};const fields=Object.keys(expected).filter(k=>payload[k]!==expected[k]);if(!['push','schedule','workflow_dispatch'].includes(payload.event_name))fields.push('event_name');if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>2048)fields.push('sub');throw Object.assign(Error('Untrusted document collection job'),{code:'OIDC_'+fields.join('_')});}return payload;
}
