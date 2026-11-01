import {createRemoteJWKSet,jwtVerify} from 'jose';
export const RELAY_AUDIENCE='https://www.pvinfo.org/api/document-collect';
export const RELAY_REPO='chalamalasetti/Pharmacovigilance';
const keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),{timeoutDuration:10000});
export function trustedDocumentJob(p){return p.repository===RELAY_REPO&&p.repository_id==='1439636720'&&p.ref==='refs/heads/main'&&p.sub===`repo:${RELAY_REPO}:ref:refs/heads/main`&&p.workflow_ref===`${RELAY_REPO}/.github/workflows/documents.yml@refs/heads/main`&&['push','schedule','workflow_dispatch'].includes(p.event_name);}
export async function verifyDocumentJob(token,keySet=keys){
 const {payload}=await jwtVerify(token,keySet,{issuer:'https://token.actions.githubusercontent.com',audience:RELAY_AUDIENCE,algorithms:['RS256'],maxTokenAge:'10m',clockTolerance:5,requiredClaims:['exp','iat','sub','repository','repository_id','ref','workflow_ref','event_name']});
 if(!trustedDocumentJob(payload))throw Error('Untrusted document collection job');return payload;
}
