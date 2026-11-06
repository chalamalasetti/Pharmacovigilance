import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PDFDocument} from 'pdf-lib';
import {ciomsFormPdfBytes,fillTrainingFormPdf} from '../scripts/cioms-entry.js';import {newCase,newProduct} from '../public/sandbox-case-lib.js';import {SAMPLE_CASES} from '../public/sandbox-lib.js';
const font=readFileSync(new URL('../public/fonts/PVContentSans.ttf',import.meta.url)),template=await syntheticForm();
async function syntheticForm(){const doc=await PDFDocument.create(),form=doc.getForm(),page=doc.addPage([595.2,841.68]);for(const name of ['Description','Initials','Country','Age','Sex','Day','Month','Year','Day2','Year2','Month2','Suspect_Drugs','Daily_Doses','Routes_of_Admin','Indications','Therapy','Duration','Concomitant','History','Manu_Name-Add','Control','Date_Rec','Report_Date']){const field=form.createTextField(name);if(['Description','Suspect_Drugs','Indications','Therapy','Duration','Concomitant','History','Manu_Name-Add'].includes(name))field.enableMultiline();field.addToPage(page,{x:30,y:30,width:name==='Year2'?40:360,height:name==='Description'?100:16});}for(let i=1;i<=15;i++)form.createCheckBox('Check'+i).addToPage(page,{x:400,y:30+i*15,width:8,height:8});return doc.save();}
test('field filler retains canonical editable values and deliberate checkbox states',async()=>{
 const c=newCase(SAMPLE_CASES[0]);c.patient.age='0';c.patient.sex='female';c.events[0].hospitalization='yes';c.events[0].serious='yes';c.events[0].onset='2027-01-03';c.products[0].dechallenge='yes';c.narrative.summary='Fictional clinical course.';
 const doc=await PDFDocument.load(await fillTrainingFormPdf(c,font,template)),form=doc.getForm();
 assert.equal(form.getFields().length,38);assert.equal(form.getTextField('Country').getText(),'US');assert.equal(form.getTextField('Age').getText(),'0');assert.equal(form.getTextField('Day').getText()??'','');assert.equal(form.getTextField('Year2').getText(),'2027');
 assert.equal(form.getCheckBox('Check2').isChecked(),true);assert.equal(form.getCheckBox('Check1').isChecked(),false);assert.equal(form.getCheckBox('Check5').isChecked(),true);assert.equal(form.getCheckBox('Check13').isChecked(),true);assert.equal(form.getCheckBox('Check14').isChecked(),false);
 assert.ok(doc.getPageCount()>1);assert.deepEqual(doc.getPage(0).getSize(),{width:595.2,height:841.68});
});
test('mixed dechallenge responses remain unselected; long text receives a continuation marker',async()=>{
 const c=newCase(SAMPLE_CASES[0]);c.products[0].dechallenge='yes';c.products.push({...newProduct('P-2'),dechallenge:'no'});c.narrative.summary='Fictional clinical detail. '.repeat(140);const doc=await PDFDocument.load(await fillTrainingFormPdf(c,font,template)),form=doc.getForm();
 assert.equal(form.getCheckBox('Check5').isChecked(),false);assert.equal(form.getCheckBox('Check6').isChecked(),false);assert.match(form.getTextField('Description').getText(),/continuation/);assert.ok(doc.getPageCount()>2);
});

test('a different template cannot be silently labeled CIOMS',async()=>{await assert.rejects(ciomsFormPdfBytes(newCase(SAMPLE_CASES[0]),font,new Uint8Array([1,2,3])),/template integrity/);});
