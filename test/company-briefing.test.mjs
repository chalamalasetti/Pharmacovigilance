import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productKey, confirmPortfolio, portfolioState, scopedItems, assessmentHandoff } from '../public/company-briefing-lib.js';
import { buildIndex, matchText } from '../scripts/company-match.mjs';
import { buildCompanyData, matchItems } from '../scripts/companies.mjs';
import * as workspace from '../public/workspace.js';
import { cleanItem } from '../public/cloud.js';
const p={company:'acme',src:'ema-medicines',market:'EU',authId:'EMEA/H/C/000001',brand:'Examplor',ingredients:['ritonavir'],moieties:['ritonavir'],status:'Authorised',holder:'Acme Pharma',url:'https://www.ema.europa.eu/en/medicines/human/EPAR/examplor'};
const other={...p,authId:'EMEA/H/C/000002',brand:'Othermab',ingredients:['adalimumab'],moieties:['adalimumab']};
const manifest={version:'test',status:'draft',companies:[{id:'acme',name:'Acme',mentions:['Acme'],country:'GB',region:'Europe',types:[],aliases:[],former:[],entities:[]}]};
const idx=buildIndex(manifest,{products:[p,other]});
const company={profile:{id:'acme',name:'Acme'},products:[p,other],updates:[],research:[]};
const at='2026-10-31T12:00:00Z';
const confirmed=()=>confirmPortfolio(company,{markets:['EU'],productKeys:[productKey(p)]},null,at);
test('confirmation validates sourced market/product pairs and detects changed or removed records',()=>{
 assert.throws(()=>confirmPortfolio(company,{markets:['US'],productKeys:[productKey(p)]}),/Confirm/);
 const scope=confirmed();assert.equal(portfolioState(scope,company),'confirmed');
 assert.equal(portfolioState(scope,{...company,products:[{...p,holder:'Transferred holder'},other]}),'needs-review');
 assert.equal(portfolioState(scope,{...company,products:[other]}),'needs-review');
 assert.equal(portfolioState(scope,{...company,profile:{id:'another'}}),'unconfirmed');
});
test('matcher supplies exact product evidence; company-wide relevance does not leak into a selected product scope',()=>{
 const found=matchText(idx,'A new signal for ritonavir',{country:'EU'});
 assert.deepEqual(found[0].productKeys,[productKey(p)]);
 const unrelated=matchText(idx,'Adalimumab safety warning',{country:'EU'});
 const c={...company,updates:[{id:'one',country:'EU',published:at,...found[0]},{id:'two',country:'EU',published:at,...unrelated[0]}]};
 const r=scopedItems(c,confirmed(),{now:Date.parse(at)});
 assert.equal(r.updates.length,1);assert.equal(r.updates[0].confirmedProducts[0].authId,p.authId);
});
test('outside-market and indirect-class matches are opt-in; old unscopable records are excluded',()=>{
 const item={id:'one',lane:'substance',country:'US',productKeys:[productKey(p)],published:at};
 const c={...company,updates:[item,{...item,id:'old',productKeys:undefined,country:'EU'},{...item,id:'class',lane:'class',country:'EU'}]};
 assert.equal(scopedItems(c,confirmed(),{now:Date.parse(at)}).updates.length,0);
 const all=scopedItems(c,confirmed(),{includeOutside:true,includeClass:true,now:Date.parse(at)});
 assert.equal(all.updates.length,2);assert.equal(all.updates[0].scopeOutside,true);assert.equal(all.legacy,1);
});
test('assessment keys prevent repeat-click duplicates, isolate companies and preserve portfolio evidence into team snapshots',()=>{
 const scope=confirmed();const item={id:'u1',kind:'paper',paper:'p1',title:'Safety research',lane:'substance',reason:'Substance evidence',confirmedProducts:[p],scopeReason:'Confirmed product',published:at};
 const u=assessmentHandoff(item,scope,at);
 assert.equal(u.id,assessmentHandoff(item,{...scope,revision:2},at).id);
 assert.notEqual(u.id,assessmentHandoff(item,{...scope,companyId:'other'},at).id);
 const snap=workspace.snapshot(u);assert.equal(snap.companyContext.evidenceKind,'paper');
 const team=cleanItem({update_id:u.id,snapshot:{...snap,companyContext:{...snap.companyContext,patientName:'must not survive'}}});
 assert.equal(team.snapshot.companyContext.patientName,undefined);assert.equal(team.snapshot.companyContext.products[0].key,productKey(p));
 const local={version:1,profile:{},items:{},changedAt:'2026-10-31T12:00:00Z',syncedAt:'2026-10-31T10:00:00Z',companyPortfolios:{acme:scope}};
 const remote={...local,changedAt:'2026-10-31T13:00:00Z',companyPortfolios:{acme:{...scope,revision:2}}};
 assert.equal(workspace.reconcile(local,remote).ws.companyPortfolios.acme.revision,2);
});
