import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseHTML} from 'linkedom';import * as lib from '../public/portfolio-watch-lib.js';
test('import, explicit review, profile, restore and clear work together without uploading portfolio data',async()=>{
 const {document}=parseHTML(await readFile('public/portfolio-watch.html','utf8'));
 const proto=Object.getPrototypeOf(document.createElement('select'));Object.defineProperty(proto,'value',{configurable:true,get(){return this._value||'';},set(v){this._value=v;}});
 const product={id:'example',brand:'Example',market:'US',application:'NDA000001',ingredients:['Example ingredient'],status:'Prescription',hash:'abc',url:'https://www.fda.gov/'};
 const calls=[],layer={load:async market=>{calls.push(market);return {records:[product],coverage:{market,repository:'loaded',issues:[]}};}};
 const source=(await readFile('public/portfolio-watch.js','utf8')).replace(/^import .*;\n/gm,'');
 const names=['parsePortfolioCSV','portfolioCandidates','confirmPortfolio','restorePortfolio','comparePortfolioSnapshot'];
 new Function('document','createProductIntelligence','fetchData',...names,source)(document,()=>layer,()=>{throw Error('Portfolio must not upload');},...names.map(n=>lib[n]));
 const $=id=>document.getElementById(id),csv='brand,market\nExample,US';
 await $('pw-import').onchange({target:{files:[{size:csv.length,text:async()=>csv}],value:''}});
 assert.deepEqual(calls,['US']);assert.equal($('pw-confirm').disabled,false);$('pw-confirm').onclick();assert.match($('pw-status').textContent,/Resolve every/);
 const select=$('pw-rows').querySelector('select');select.value='example';select.onchange();$('pw-confirm').onclick();assert.match($('pw-profile').textContent,/Example ingredient/);assert.equal($('pw-export').disabled,false);assert.match($('pw-profile').querySelector('a:last-child').href,/NDA000001/);
 const saved=lib.confirmPortfolio(lib.parsePortfolioCSV(csv),{'row-1':'example'},[product]);const text=JSON.stringify(saved);
 await $('pw-restore').onchange({target:{files:[{size:text.length,text:async()=>text}],value:''}});assert.match($('pw-recheck').textContent,/unchanged/);assert.equal($('pw-export').disabled,true);$('pw-confirm').onclick();assert.match($('pw-status').textContent,/Resolve every/);
 await $('pw-refresh').onclick();assert.equal(calls.length,3);assert.equal($('pw-export').disabled,true);assert.match($('pw-status').textContent,/refreshed/);
 $('pw-clear').onclick();assert.equal($('pw-rows').children.length,0);assert.equal($('pw-export').disabled,true);
});
