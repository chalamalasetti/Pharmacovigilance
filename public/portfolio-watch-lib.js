import {searchFold} from './search-normalization.js';
const columns=new Set(['brand','ingredient','company','market','application','ndc']);
// Parse quoted CSV without accepting an arbitrary object or executable content.
export function parsePortfolioCSV(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>200000)throw Error('Use a CSV file smaller than 200 KB.');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const cell=()=>{row.push(field.trim());field='';closed=false;};const line=()=>{cell();if(row.some(Boolean))rows.push(row);row=[];};
 text=text.replace(/^\ufeff/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
 else if(c==='"'){if(field||closed)throw Error('Invalid CSV quotation.');quoted=true;}
 else if(c===',')cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
 else{if(closed&&!/\s/.test(c))throw Error('Unexpected text after a quoted field.');field+=c;}}
 if(quoted)throw Error('Unclosed CSV quotation.');if(field||row.length)line();
 if(rows.length<2)throw Error('Include a header and at least one product.');if(rows.length>501)throw Error('Import at most 500 rows.');
 const headers=rows.shift().map(x=>x.toLowerCase());if(new Set(headers).size!==headers.length||headers.some(h=>!columns.has(h)))throw Error('Use unique columns: brand, ingredient, company, market, application, ndc.');
 if(!headers.includes('market'))throw Error('A market column is required.');
 return rows.map((cells,i)=>{if(cells.length!==headers.length)throw Error('Column count differs on product row '+(i+1));if(cells.some(c=>c.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(c)))throw Error('Invalid or oversized cell.');const r=Object.fromEntries(headers.map((h,n)=>[h,cells[n]]));r.market=r.market.toUpperCase();if(!['US','EU','CA'].includes(r.market))throw Error('Supported evidence markets: US, EU, CA.');if(!r.brand&&!r.ingredient&&!r.application&&!r.ndc)throw Error('Each row needs a brand, ingredient or identifier.');if(r.application){r.application=r.application.toUpperCase().replace(/[\s-]/g,'');if(r.market!=='US'||!/^(NDA|ANDA|BLA)\d{6}$/.test(r.application))throw Error('Use a US FDA application such as NDA020702.');}if(r.ndc&&(r.market!=='US'||!/^\d{4,5}-\d{3,4}(?:-\d{1,2})?$/.test(r.ndc)))throw Error('Use a hyphenated source NDC; no automatic zero padding.');return {...r,id:'row-'+(i+1)};});
}
export function portfolioCandidates(row,records){
 return records.filter(p=>p.market===row.market&&(!row.application||p.application===row.application)&&(!row.ndc||(p.identifiers||[]).some(i=>/NDC/.test(i.kind)&&i.value===row.ndc))&&(!row.brand||searchFold(row.brand)===searchFold(p.brand))&&(!row.ingredient||(p.ingredients||[]).some(n=>searchFold(n)===searchFold(row.ingredient)))&&(!row.company||searchFold(row.company)===searchFold(p.company)));
}
export function confirmPortfolio(rows,selections,records,{now=()=>new Date().toISOString(),coverage=[]}={}){
 const confirmed=[],excluded=[];
 for(const row of rows){const choice=selections[row.id];if(choice==='exclude'){excluded.push(row.id);continue;}if(typeof choice!=='string')throw Error('Resolve every imported row before saving.');const p=portfolioCandidates(row,records).find(p=>p.id===choice);if(!p)throw Error('Evidence changed or selection is outside the candidate set. Reconfirm the row.');confirmed.push({importRow:row.id,product:{...p},confirmedAt:now(),decision:'user-confirmed source record; ownership and presentation equivalence not established'});}
 if(!confirmed.length)throw Error('Confirm at least one product.');
 return {schema:'pv-portfolio-watch/1',createdAt:now(),products:confirmed,excludedRows:excluded,coverage,watchStatus:'not-scheduled',notice:'Local review package. No scheduled alerts, source monitoring or regulatory deadline inference. Contains portfolio selections; keep private.'};
}
export function restorePortfolio(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>3000000)throw Error('Use a portfolio package below 3 MB.');
 const value=JSON.parse(text);if(value?.schema!=='pv-portfolio-watch/1'||!Array.isArray(value.products)||!value.products.length||value.products.length>500)throw Error('Invalid portfolio package.');
 const rows=[],baseline=[];
 for(const [i,entry]of value.products.entries()){
  const p=entry?.product;if(!p||typeof p.id!=='string'||p.id.length>600||!['US','EU','CA'].includes(p.market))throw Error('Invalid saved product identity.');
  const clean=v=>typeof v==='string'&&v.length<=500?v:'';
  const input={brand:clean(p.brand),market:p.market,application:clean(p.application)};
  if(!input.brand&&!input.application)throw Error('Saved product needs a brand or application for source rechecking.');
  // Reuse CSV validation; saved package claims never become verified live evidence.
  const csv=['brand,market,application',[input.brand,input.market,input.application].map(v=>'"'+v.replaceAll('"','""')+'"').join(',')].join('\n');
  rows.push({...parsePortfolioCSV(csv)[0],id:'row-'+(i+1)});
  baseline.push({rowId:'row-'+(i+1),id:p.id,market:p.market,brand:input.brand,application:input.application,hash:clean(p.hash)||null,status:clean(p.status)||null,approvalDate:clean(p.approvalDate)||null,snapshot:clean(p.snapshot)||null});
 }
 return {rows,baseline,savedAt:typeof value.createdAt==='string'?value.createdAt:null};
}
export function comparePortfolioSnapshot(baseline,records){
 return baseline.map(saved=>{const current=records.find(p=>p.market===saved.market&&p.id===saved.id);if(!current)return {saved,current:null,state:'not-found',changes:[],meaning:'Not found in loaded source coverage; withdrawal is not established.'};
 const fields=['hash','status','approvalDate'];const changes=fields.filter(k=>(saved[k]||null)!==(current[k]||null)).map(field=>({field,before:saved[field]||null,after:current[field]||null}));
 return {saved,current,state:changes.length?'changed':'unchanged',changes,meaning:changes.length?'Source record metadata differs from the imported baseline; this is not proof of a label wording change.':'No difference in compared source metadata; label history was not checked.'};});
}
