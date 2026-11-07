import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {newCase} from '../public/sandbox-case-lib.js';
import {SAMPLE_CASES} from '../public/sandbox-lib.js';
import {caseEditor} from '../public/sandbox-editor.js';
test('case editor keeps repeatable rows associated and exposes synthetic export status',()=>{
 const {document,window}=parseHTML('<html><body><main id="host"></main></body></html>');
 // linkedom select.value is read-only; supply the browser setter for this DOM check.
 const select=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:select.get,set(v){for(const o of this.options)o.selected=o.value===v;}});
 const previous=globalThis.document;globalThis.document=document;
 try{
  const c=newCase(SAMPLE_CASES[0]);let saved;
  const host=caseEditor(c,{save:value=>{saved=value;},cancel:()=>{},download:()=>{},tell:()=>{},existing:null});document.querySelector('#host').append(host);
  const click=name=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===name);assert.ok(b,name);b.click();};
  click('Add product');click('Add event');assert.equal(c.products.length,2);assert.equal(c.events.length,2);assert.equal(c.assessments.length,4);
  click('Add regimen to P-1');assert.equal(c.products[0].regimens.length,1);assert.equal(c.products[1].regimens.length,0);
  click('Add literature citation');assert.equal(c.literature.length,1);
  const narrative=host.querySelector('[aria-label="Fictional clinical narrative"]');narrative.value='Fictional clinical course';narrative.dispatchEvent(new window.Event('input'));assert.equal(c.narrative.summary,'Fictional clinical course');
  click('Save synthetic case');assert.equal(saved,c);click('Remove P-1');assert.equal(c.products.length,1);assert.equal(c.assessments.length,2);
  assert.ok([...host.querySelectorAll('button')].find(b=>b.textContent==='Coded E2B XML unavailable'&&b.disabled));
  assert.match(host.textContent,/CIOMS template filling and coded case XML are disabled/);
 }finally{globalThis.document=previous;Object.defineProperty(window.HTMLSelectElement.prototype,'value',select);}
});
