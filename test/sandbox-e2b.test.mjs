import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {e2bReadiness} from '../public/sandbox-e2b.js';
import {newCase,newDose} from '../public/sandbox-case-lib.js';
import {SAMPLE_CASES} from '../public/sandbox-lib.js';
const catalog=JSON.parse(readFileSync(new URL('../public/e2b-catalog.json',import.meta.url)));
test('mapping review pins references, preserves repeatable zero values and never claims validated XML',()=>{
 const c=newCase(SAMPLE_CASES[0]);c.patient.age='0';c.products[0].regimens=[{...newDose(),amount:'0'},{...newDose('D-2'),amount:'2'}];
 const r=e2bReadiness(c,catalog),dose=r.fields.find(f=>f.fieldId==='G.k.4.r.1a');
 assert.equal(r.xmlExportEnabled,false);assert.equal(r.coverage.validatedElements,0);assert.equal(r.catalogHash,catalog.contentHash);assert.equal(r.profile,null);
 assert.deepEqual(dose.values.map(v=>v.value),['0','2']);assert.match(dose.values[1].path,/products\[0\].regimens\[1\].amount/);assert.ok(dose.sourceHash);assert.ok(dose.location.page);assert.equal(r.fields.find(f=>f.fieldId==='D.2.2a').populated,true);assert.equal(r.fields.find(f=>f.fieldId==='E.i.2.1b').status,'not mapped');
 assert.equal(r.fields.length,catalog.records.filter(x=>x.layer==='ICH').length);
});
test('mapping refuses a mismatched or incomplete reference catalog',()=>{
 const c=newCase(SAMPLE_CASES[0]);assert.throws(()=>e2bReadiness(c,{}),/Unsupported/);assert.throws(()=>e2bReadiness(c,{...catalog,records:[]}),/do not match/);
});
