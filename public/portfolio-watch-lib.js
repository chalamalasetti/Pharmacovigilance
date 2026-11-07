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
