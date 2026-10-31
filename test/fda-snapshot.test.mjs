import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FDA_URLS, eligibleSnapshot, snapshotEntry, collectRegulators, MAX_AGE_MS } from '../scripts/fda-snapshot.mjs';
import { feedStatus } from '../scripts/aggregate.mjs';
import { dataHealth } from '../public/lib.js';
const now = Date.parse('2026-10-31T12:00:00Z');
const source = {id:'fda-medwatch',url:FDA_URLS['fda-medwatch'],name:'FDA MedWatch',type:'rss',classification:'regulator',status:'active'};
const feed = {...source,kind:'official'};
const entry = {id:feed.id,url:feed.url,collectedAt:new Date(now).toISOString(),lastAttempt:new Date(now).toISOString(),ok:true,items:[{title:'FDA drug safety notice',link:'https://www.fda.gov/safety/notice',summary:'Contact example@example.invalid',published:'2026-10-30T10:00:00Z',authors:['not retained']}]};
const snapshot = e => ({version:1,entries:[e]});
test('FDA snapshots are bounded by exact origin, source identity, expiry and official item links',()=>{
  assert.equal(eligibleSnapshot(feed),true);
  for(const f of [{...feed,url:'https://evil.example/rss'}, {...feed,id:'other'}, {...feed,kind:'news'}])assert.equal(snapshotEntry(snapshot(entry),f,now),null);
  assert.ok(snapshotEntry(snapshot(entry),feed,now));
  assert.equal(snapshotEntry(snapshot({...entry,collectedAt:new Date(now-MAX_AGE_MS-1).toISOString()}),feed,now),null);
  assert.equal(snapshotEntry(snapshot({...entry,collectedAt:new Date(now+120000).toISOString()}),feed,now),null);
  assert.equal(snapshotEntry(snapshot({...entry,items:[{title:'Unrelated proxy',link:'https://evil.example/notice'}]}),feed,now),null);
  const clean=snapshotEntry(snapshot(entry),feed,now).items[0];
  assert.equal(clean.authors,undefined);assert.ok(!clean.summary.includes('example@example.invalid'));
});
test('collector respects paused sources and preserves actual collection age on failure',async()=>{
  let calls=0;
  const failed=await collectRegulators({registry:{sources:[source,{...source,id:'fda-drugs',url:FDA_URLS['fda-drugs'],status:'paused'}]},previous:snapshot(entry),fetcher:async()=>{calls++;throw new Error('sensitive upstream details');},now:new Date(now+3600000)});
  assert.equal(calls,1);assert.equal(failed.entries.length,1);assert.equal(failed.entries[0].collectedAt,entry.collectedAt);assert.equal(failed.entries[0].ok,false);assert.ok(!JSON.stringify(failed).includes('sensitive upstream details'));
  const expired=await collectRegulators({registry:{sources:[source]},previous:snapshot(entry),fetcher:async()=>{throw new Error();},now:new Date(now+MAX_AGE_MS+1)});
  assert.equal(expired.entries[0].items,undefined);
});
test('collector parses and privacy-screens official RSS without retaining raw documents',async()=>{
  const body=await readFile(new URL('fixtures/regulator-rss.xml',import.meta.url),'utf8');
  const r=await collectRegulators({registry:{sources:[source]},fetcher:async()=>({body:body.replaceAll('https://regulator.example.org','https://www.fda.gov'),contentType:'application/rss+xml',url:feed.url}),now:new Date(now)});
  assert.equal(r.entries.length,1);
  assert.equal(r.entries[0].ok,true);
  assert.equal(r.entries[0].items.length,2);
  assert.ok(r.entries[0].items.every(x=>x.link.startsWith('https://www.fda.gov/')));
  assert.equal(r.entries[0].items[0].published,'2026-10-26T14:00:00.000Z');
});
test('status retains FDA fetch time and warns on aging cached delivery',()=>{
  const items=[];items.meta={delivery:'github-actions',collectedAt:entry.collectedAt,stale:true,collectorOk:false};
  const s=feedStatus([feed],[{status:'fulfilled',value:items}],[],new Date(now+3*3600000).toISOString())[0];
  assert.equal(s.lastSuccess,entry.collectedAt);
  const h=dataHealth({checked:new Date(now+3*3600000).toISOString(),updated:new Date(now+3*3600000).toISOString(),sources:[s]},now+3*3600000);
  assert.equal(h.level,'warn');assert.match(h.problems[0].text,/aging regulator snapshot/);
});
test('TGA snapshot uses only its fixed feed and TGA evidence links, preserving expiry and pause controls',async()=>{
  const source={id:'tga-safety-alerts',url:'https://www.tga.gov.au/feeds/alert/safety-alerts.xml',name:'TGA safety alerts',type:'rss',classification:'regulator',status:'active'};
  const feed={...source,kind:'official'};
  const e={...entry,id:source.id,url:source.url,items:[{title:'TGA safety alert',link:'https://www.tga.gov.au/safety/alert',published:'2026-10-30T10:00:00Z'}]};
  assert.ok(snapshotEntry(snapshot(e),feed,now));
  assert.equal(snapshotEntry(snapshot(e),{...feed,url:source.url+'?proxy=1'},now),null);
  for(const link of ['https://www.fda.gov/safety/notice','https://tga.gov.au.evil.example/alert','http://www.tga.gov.au/alert'])assert.equal(snapshotEntry(snapshot({...e,items:[{title:'Wrong origin',link}]}),feed,now),null);
  assert.equal(snapshotEntry(snapshot({...e,collectedAt:new Date(now-MAX_AGE_MS-1).toISOString()}),feed,now),null);
  const body=(await readFile(new URL('fixtures/regulator-rss.xml',import.meta.url),'utf8')).replaceAll('https://regulator.example.org','https://www.tga.gov.au');
  const r=await collectRegulators({registry:{sources:[source]},fetcher:async()=>({body,contentType:'application/rss+xml',url:source.url}),now:new Date(now)});
  assert.equal(r.entries[0].ok,true);assert.equal(r.entries[0].items.length,2);
  const paused=await collectRegulators({registry:{sources:[{...source,status:'paused'}]},fetcher:async()=>{throw new Error('Must not fetch');},now:new Date(now)});
  assert.deepEqual(paused.entries,[]);
});
