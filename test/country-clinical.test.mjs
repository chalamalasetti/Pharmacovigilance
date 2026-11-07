import test from 'node:test';import assert from 'node:assert/strict';
import {collectCountryTrials,countryTrialQuery} from '../scripts/country-clinical.mjs';
import {countryClinicalHandler} from '../api/country-clinical.js';
const country={code:'CA',country:'Canada'};
const raw={protocolSection:{identificationModule:{nctId:'NCT12345678',briefTitle:'Example trial'},sponsorCollaboratorsModule:{leadSponsor:{name:'Example Sponsor'}},designModule:{studyType:'INTERVENTIONAL'},armsInterventionsModule:{interventions:[{name:'Example medicine',type:'DRUG'}]},contactsLocationsModule:{centralContacts:[{email:'private@example.invalid'}],locations:[{country:'Canada',city:'Private city'}]}}};
test('country clinical projection filters locations and excludes contacts and non-medicine trials',async()=>{
 const foreign=structuredClone(raw);foreign.protocolSection.contactsLocationsModule.locations=[{country:'France'}];
 const nonDrug=structuredClone(raw);nonDrug.protocolSection.armsInterventionsModule.interventions=[{name:'Test device',type:'DEVICE'}];
 const page=await collectCountryTrials(country,'',{fetchSource:async(url,opts)=>{opts.validateUrl(url);assert.throws(()=>opts.validateUrl('https://example.invalid'));return {body:JSON.stringify({totalCount:20,studies:[raw,foreign,nonDrug],nextPageToken:'next'})};}});
 assert.equal(page.studies.length,1);assert.equal(page.excluded,2);assert.equal(page.sourceQueryTotal,20);assert.equal(page.nextCursor,'next');assert(!JSON.stringify(page).includes('private@example'));assert(!JSON.stringify(page).includes('Private city'));assert.match(page.coverage,/not local site status/);
 assert.equal(countryTrialQuery(country).searchParams.get('filter.advanced'),'AREA[LocationCountry]"Canada" AND AREA[StudyType]INTERVENTIONAL');
});
test('country endpoint restricts methods, duplicate inputs and caller-controlled source queries',async()=>{
 async function call(url,method='GET',collect=async()=>({studies:[]})){const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await countryClinicalHandler({url,method},res,{lookup:async code=>code==='CA'?country:null,collect});return res;}
 assert.equal((await call('/?country=ca')).statusCode,200);assert.equal((await call('/?country=EU')).statusCode,404);assert.equal((await call('/?country=CA&country=US')).statusCode,400);assert.equal((await call('/?country=CA&url=https://example.invalid')).statusCode,400);assert.equal((await call('/?country=CA','POST')).statusCode,405);
 const fail=await call('/?country=CA','GET',async()=>{throw Error('private internal error');});assert.equal(fail.statusCode,502);assert.equal(fail.headers['cache-control'],'no-store');assert(!JSON.stringify(fail.body).includes('private internal'));
});
