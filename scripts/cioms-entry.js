import {PDFDocument,PDFCheckBox,PDFTextField,rgb,setCharacterSpacing,setWordSpacing,setCharacterSqueeze} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {sha256} from '../public/sandbox-xml.js';
import {cleanSynthetic,reportSections} from '../public/sandbox-case-lib.js';
import {wrapLines} from './content-studio/export-entry.js';
// Fill the supplied CIOMS form without redrawing its artwork or inventing identities.
export async function ciomsFormPdfBytes(raw,fontBytes,templateBytes){
 if(await sha256(templateBytes)!=='e6f6bad7ad09225e30d8b0e4dec1f033732260db0464439ff94d0e17e8a805dc')throw Error('CIOMS template integrity check failed. Use PDF print.');
 return fillTrainingFormPdf(raw,fontBytes,templateBytes);
}
// Generic field-filling implementation; artwork is provided locally by the caller.
export async function fillTrainingFormPdf(raw,fontBytes,templateBytes){
 const c=cleanSynthetic(raw),doc=await PDFDocument.load(templateBytes);doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fontBytes,{subset:true}),formFont=await doc.embedFont(fontBytes,{subset:false,customName:'PVFormSans'}),supported=new Set(font.getCharacterSet()),form=doc.getForm(),page=doc.getPages()[0],overflow=[];
 for(const field of form.getFields())if(field instanceof PDFCheckBox)field.uncheck();
 const text=(name,value)=>{
  value=String(value??'');for(const ch of value)if(ch.codePointAt(0)>31&&!supported.has(ch.codePointAt(0)))throw Error('Unsupported CIOMS PDF character. Use JSON for lossless export.');
  const field=form.getTextField(name),rect=field.acroField.getWidgets()[0].getRectangle();let size=8;
  if(!field.isMultiline())while(size>6&&formFont.widthOfTextAtSize(value.replace(/[^\x20-\x7e]/g,'?'),size)>rect.width-2)size-=.5;
  let compatible=true;try{formFont.encodeText(value.replaceAll('\n',''));}catch{compatible=false;}
  const lines=wrapLines(compatible?value:'See continuation',Math.max(8,rect.width-2),s=>formFont.widthOfTextAtSize(s,size)),limit=field.isMultiline()?Math.max(1,Math.floor((rect.height-5)/(formFont.heightAtSize(size)*1.2))):1;
  let displayed=value;
  if(lines.length>limit||!compatible){overflow.push({title:name,text:value});displayed=limit>2?[...lines.slice(0,limit-2),'[See continuation]'].join('\n'):rect.width<65?'More':'See continuation';}
  field.setFontSize(size);field.setText(displayed);
 };
 const joined=items=>items.filter(Boolean).join('\n');
 const suspects=c.products.filter(p=>p.role!=='concomitant'),others=c.products.filter(p=>p.role==='concomitant');
 text('Initials','SYN');text('Country',c.country);text('Age',c.patient.ageUnit==='years'?c.patient.age:'');text('Sex',{female:'F',male:'M',unknown:'UNK',other:'Other'}[c.patient.sex]);
 for(const name of ['Day','Month','Year'])text(name,'');
 const first=c.events.map(e=>e.onset).filter(Boolean).sort()[0]??'';
 const [year,month,day]=(first||'--').split('-');text('Day2',day);text('Month2',month);text('Year2',year);
 text('Description',joined([c.narrative.summary,...c.events.map(e=>e.id+': '+e.term+'; onset '+(e.onset||'unknown')+'; outcome '+e.outcome+'; serious '+e.serious),...c.tests.map(t=>t.name+': '+(t.nullFlavor==='value'?t.value+' '+t.unit:t.nullFlavor)),c.patient.age!==''?'Age: '+c.patient.age+' '+c.patient.ageUnit:'',c.gestation!==''?'Gestation: '+c.gestation+' weeks':'']));
 for(const [name,key]of [['Check1','death'],['Check2','hospitalization'],['Check3','disability'],['Check4','lifeThreatening']])if(c.events.some(e=>e[key]==='yes'))form.getCheckBox(name).check();
 text('Suspect_Drugs',joined(suspects.map(p=>p.id+' '+p.label+(p.ingredient?' ('+p.ingredient+')':''))));
 text('Daily_Doses',joined(suspects.flatMap(p=>p.regimens.length?p.regimens.map(d=>p.id+': '+[d.amount,d.unit,d.frequency].filter(Boolean).join(' ')):[p.id+': '+(p.dose||'unknown')])));
 text('Routes_of_Admin',joined(suspects.flatMap(p=>p.regimens.length?p.regimens.map(d=>p.id+': '+d.route):[p.id+': '+p.route])));
 text('Indications',joined(suspects.map(p=>p.id+': '+(p.indication||'unknown'))));
 text('Therapy',joined(suspects.flatMap(p=>p.regimens.length?p.regimens.map(d=>p.id+': '+(d.start||'?')+' to '+(d.stop||'?')):[p.id+': '+(p.start||'?')+' to '+(p.stop||'?')])));
 text('Duration',joined(suspects.flatMap(p=>p.regimens.map(d=>p.id+': '+(d.duration!==''?d.duration+' '+d.durationUnit:'unknown')))));
 for(const [key,yes,no]of [['dechallenge','Check5','Check6'],['rechallenge','Check8','Check9']]){const values=new Set(suspects.map(p=>p[key]));if(values.size===1&&values.has('yes'))form.getCheckBox(yes).check();if(values.size===1&&values.has('no'))form.getCheckBox(no).check();}
 text('Concomitant',joined(others.map(p=>p.id+' '+p.label+' '+(p.start||'?')+' to '+(p.stop||'?'))));
 text('History',joined([...c.medicalHistory.map(h=>h.term+' '+(h.start||'?')+' to '+(h.end||'?')+'; ongoing '+h.ongoing),'Pregnancy: '+c.patient.pregnancy,c.parent.applicable==='yes'?'Parent context: '+c.parent.history:'']));
 text('Manu_Name-Add',c.report.sender?'Fictional sender: '+c.report.sender:'Not recorded (synthetic case)');text('Control',c.id);text('Date_Rec',c.received.slice(0,10));text('Report_Date',c.report.creationTime?.slice(0,10)||c.latestReceived.slice(0,10));
 if(c.source==='study')form.getCheckBox('Check11').check();if(c.source==='literature')form.getCheckBox('Check12').check();if(['physician','pharmacist','other health professional'].includes(c.reporter))form.getCheckBox('Check15').check();
 if(c.revision===1)form.getCheckBox('Check13').check();else if(raw.history?.at(-1)?.kind==='follow-up')form.getCheckBox('Check14').check();
 form.updateFieldAppearances(formFont);
 for(const field of form.getFields())if(field instanceof PDFTextField)for(const widget of field.acroField.getWidgets()){const stream=doc.context.lookup(widget.getNormalAppearance());if(stream?.operators)stream.operators.unshift(setCharacterSpacing(0),setWordSpacing(0),setCharacterSqueeze(100));}
 const header='SYNTHETIC TRAINING ONLY - NOT FOR SUBMISSION';page.drawText(header,{x:86,y:803,size:9,font,color:rgb(.55,.1,.1)});page.drawText('PV Info | '+c.id+' | revision '+c.revision+' | current form / draft',{x:86,y:39,size:8,font});
 const note=['No real patient identity or DOB collected.','Unchecked fields may be unknown.','Mixed product responses: see continuation.','Independent PV Info additions; not endorsed.'];for(let i=0;i<note.length;i++)page.drawText(note[i],{x:333,y:181-i*13,size:8,font});
 // Always include the complete supported record; base form space never truncates data.
 let continuation,y;function newPage(){continuation=doc.addPage([595.2,841.68]);y=771;continuation.drawText('CIOMS FORM - CONTINUATION',{x:42,y:800,size:13,font});continuation.drawText(header,{x:42,y:783,size:8,font,color:rgb(.55,.1,.1)});continuation.drawText(c.id+' | revision '+c.revision+' | page '+doc.getPageCount(),{x:42,y:27,size:8,font});}
 function write(value,size=9){for(const line of wrapLines(value,511,s=>font.widthOfTextAtSize(s,size))){if(y<54)newPage();if(line)continuation.drawText(line,{x:42,y,size,font});y-=size*1.35;}y-=8;}
 newPage();write('Complete supported case details',15);if(overflow.length)write('Fields continued from the first page: '+overflow.map(x=>x.title).join(', '));
 for(const section of reportSections(raw)){if(section.title==='Training classification')continue;if(y<125)newPage();write(section.title,12);write(section.text);}
 doc.setTitle('CIOMS synthetic training form - '+c.id);doc.setSubject('Synthetic training only; not for submission');doc.setAuthor('PV Info');return doc.save();
}
