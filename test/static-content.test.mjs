import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {parseHTML} from 'linkedom';
import {headlineHTML,resourceHTML,renderStaticLists} from '../scripts/static-content.mjs';
test('build snapshot selects 30 unique recent headlines and escapes labels and URLs',()=>{
 const updates=Array.from({length:35},(_,i)=>({title:'Headline '+i,link:'https://agency.example/'+i,published:'2026-10-'+String(i%28+1).padStart(2,'0')}));updates.push({title:'Bad',link:'javascript:alert(1)'},{title:'<script>alert(1)</script>',link:'https://agency.example/a?x="',published:'2026-11-01'});
 const out=headlineHTML({updates:[...updates,updates[0]]});assert.equal(out.count,30);const {document}=parseHTML('<div>'+out.html+'</div>');assert.equal(document.querySelectorAll('article').length,30);assert.equal(document.querySelector('script'),null);assert.match(document.querySelector('h3').textContent,/script/);assert.equal(new Set([...document.querySelectorAll('a')].map(a=>a.href)).size,30);
 assert.equal(resourceHTML({resources:[{name:'Unsafe',url:'javascript:x'},{name:'Public <source>',url:'https://agency.example',purpose:'A & B'}]}).count,1);
});
test('HTML lists are visible without JS, regenerated idempotently and preserve the surrounding UI',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'pv-static-'));await mkdir(path.join(dir,'data'));await writeFile(path.join(dir,'index.html'),'<h1>Keep cards</h1><h2 id="count">Loading</h2><div id="list" class="list"></div><script src="app.js"></script>');await writeFile(path.join(dir,'resources.html'),'<p id="count">Loading</p><div id="list"></div>');
 await writeFile(path.join(dir,'data/updates.json'),JSON.stringify({updates:[{title:'Safety notice',link:'https://agency.example/notice',published:'2026-11-01'}]}));await writeFile(path.join(dir,'data/resources.json'),JSON.stringify({resources:[{name:'Safety resource',url:'https://agency.example/data'}]}));
 await renderStaticLists(dir);const first=await readFile(path.join(dir,'index.html'),'utf8');await renderStaticLists(dir);assert.equal(await readFile(path.join(dir,'index.html'),'utf8'),first);assert.match(first,/Safety notice/);assert.match(first,/Keep cards/);assert.match(first,/src="app.js"/);assert.match(await readFile(path.join(dir,'resources.html'),'utf8'),/Safety resource/);
 await writeFile(path.join(dir,'data/updates.json'),'broken');await renderStaticLists(dir);assert.equal(await readFile(path.join(dir,'index.html'),'utf8'),first);
});
