import {readFile} from 'node:fs/promises';
import {safeFetch} from './safe-fetch.mjs';
import {FIELDS,normalizeStudy,sponsorKey} from './clinical-trials.mjs';
export async function lookupCountry(code){const rows=JSON.parse(await readFile(new URL('../public/data/agencies.json',import.meta.url),'utf8'));return rows.find(c=>c.code===code&&!['EU','INT'].includes(code))||null;}
export function countryTrialQuery(country,cursor=''){
 if(!/^[A-Z]{2}$/.test(country.code)||!country.country||/["\\\[\]]/.test(country.country))throw Error('Invalid country');
 const u=new URL('https://clinicaltrials.gov/api/v2/studies');u.search=new URLSearchParams({'filter.advanced':`AREA[LocationCountry]"${country.country}" AND AREA[StudyType]INTERVENTIONAL`,fields:FIELDS,pageSize:'100',format:'json',countTotal:'true',sort:'LastUpdatePostDate:desc',...(cursor?{pageToken:cursor}:{})});return u;
}
export async function collectCountryTrials(country,cursor='',{fetchSource=safeFetch,now=()=>new Date().toISOString()}={}){
 const url=countryTrialQuery(country,cursor);const response=await fetchSource(url.href,{timeoutMs:12000,tries:1,maxBytes:6*1024*1024,headers:{accept:'application/json'},validateUrl:value=>{const u=new URL(value);if(u.origin!=='https://clinicaltrials.gov'||u.pathname!=='/api/v2/studies')throw Error('Unexpected clinical source');}});
 const data=JSON.parse(response.body);if(!Array.isArray(data.studies)||data.studies.length>100)throw Error('Invalid clinical response');
 const retrievedAt=now(),names=new Set([country.country,...country.registryNames||[]].map(sponsorKey)),studies=[];
 for(const raw of data.studies){const sp=raw.protocolSection?.sponsorCollaboratorsModule;const exactNames=[sp?.leadSponsor?.name,...(sp?.collaborators||[]).map(c=>c.name)].filter(n=>typeof n==='string'&&n.trim());const study=normalizeStudy(raw,{exactNames});if(study&&study.countries.some(n=>names.has(sponsorKey(n))))studies.push({...study,retrievedAt});}
 return {schema:'pv-country-clinical/1',country:country.code,studies:[...new Map(studies.map(s=>[s.id,s])).values()],scanned:data.studies.length,excluded:data.studies.length-studies.length,sourceQueryTotal:Number.isSafeInteger(data.totalCount)&&data.totalCount>=0?data.totalCount:null,nextCursor:typeof data.nextPageToken==='string'&&/^[A-Za-z0-9_=.-]{1,3000}$/.test(data.nextPageToken)?data.nextPageToken:null,retrievedAt,sourceUrl:url.href,coverage:'Available ClinicalTrials.gov location records; interventional drug/biological studies only. Query total can include excluded studies. Overall study recruitment status is not local site status. Sponsor/collaborator roles do not establish product ownership, approved indication or a complete national development pipeline.'};
}
