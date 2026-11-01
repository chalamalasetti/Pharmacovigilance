import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PAGES,defaultNavigation,normalizeNavigation,validateNavigation} from '../public/navigation.js';
test('default grouping puts work under My Briefing; all registered pages occur once',()=>{
 const n=defaultNavigation();const work=n.groups.find(g=>g.id==='my-briefing');assert.ok(work.items.some(i=>i.id==='action-center'));
 assert.deepEqual(n.groups.flatMap(g=>g.items.map(i=>i.id)).sort(),Object.keys(PAGES).sort());assert.deepEqual(validateNavigation(n),n);
});
test('custom grouping retains moves, labels, order and visibility; unknown destinations and duplicates never become links',()=>{
 const n=defaultNavigation();const action=n.groups[1].items.splice(2,1)[0];action.label='Safety actions';n.groups[2].items.unshift(action);n.groups[2].label='Discover';n.groups[3].items[0].hidden=true;
 assert.deepEqual(normalizeNavigation(n),n);assert.deepEqual(validateNavigation(n),n);
 n.groups[0].items.push({id:'javascript:alert(1)',label:'Bad',hidden:false});n.groups[0].items.push({...action});assert.throws(()=>validateNavigation(n));
 const repaired=normalizeNavigation(n);assert.equal(repaired.groups.flatMap(g=>g.items).filter(i=>i.id==='action-center').length,1);assert.ok(repaired.groups.flatMap(g=>g.items).every(i=>PAGES[i.id]));
});
test('legacy menu order and hidden pages survive migration; Updates cannot disappear',()=>{
 const n=normalizeNavigation(null,{navOrder:['team','action-center','briefing'],hiddenNav:['resources','index','globe']});
 assert.deepEqual(n.groups[1].items.slice(0,3).map(i=>i.id),['team','action-center','briefing']);
 const all=n.groups.flatMap(g=>g.items);assert.equal(all.find(i=>i.id==='resources').hidden,true);assert.equal(all.find(i=>i.id==='index').hidden,false);
 const bad=defaultNavigation();bad.groups[0].items[0].hidden=true;assert.throws(()=>validateNavigation(bad));assert.equal(normalizeNavigation(bad).groups[0].items[0].hidden,false);
});
test('editor validation rejects missing pages and invalid groups while renderer normalization safely repairs cached configurations',()=>{
 for(const n of [null,{version:1,groups:[]},{version:1,groups:[{id:'bad id',label:'Bad',items:[]}]}])assert.throws(()=>validateNavigation(n));
 const n=defaultNavigation();n.groups[0].label=' ';assert.throws(()=>validateNavigation(n));
 const missing=defaultNavigation();missing.groups.pop();assert.throws(()=>validateNavigation(missing));assert.equal(normalizeNavigation(missing).groups.flatMap(g=>g.items).length,Object.keys(PAGES).length);
});
