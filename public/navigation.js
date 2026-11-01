// One registry shared by the build, menu editor and navigation renderer. Routes are fixed.
export const PAGES = {
 index:{label:'Updates',href:'./',hint:'Latest safety and regulatory news',icon:'◈'},
 briefing:{label:'My Briefing',href:'briefing.html',hint:'Your saved updates and daily priorities',icon:'◎'},
 'company-briefing':{label:'Company Briefing',href:'company-briefing.html',hint:'Confirm products and markets',icon:'▦'},
 'action-center':{label:'Action Center',href:'action-center.html',hint:'Assess, assign and verify closure',icon:'✓'},
 team:{label:'Team queue',href:'team.html',hint:'Shared assessments and assignments',icon:'♧'},
 events:{label:'Events & Training',href:'events.html',hint:'Verified dates and calendar downloads',icon:'◷'},
 research:{label:'Research',href:'research.html',hint:'Papers, ideas and innovation',icon:'⌕'},
 companies:{label:'Companies',href:'companies.html',hint:'Explore company products and evidence',icon:'▦'},
 globe:{label:'Global view',href:'globe.html',hint:'Explore updates around the world',icon:'◉'},
 resources:{label:'Safety resources',href:'resources.html',hint:'Public safety databases and reference tools',icon:'▤'},
 documents:{label:'Source documents',href:'documents.html',hint:'Country, agency, versions and extracted clauses',icon:'▤'},
 requirements:{label:'Requirements Library',href:'requirements.html',hint:'Source evidence, baselines and changes',icon:'▤'},
 agencies:{label:'Regulators',href:'agencies.html',hint:'Countries and regulatory agencies',icon:'◇'},
 archive:{label:'Archive',href:'archive.html',hint:'Search previously collected updates',icon:'◷'},
 about:{label:'About PV Info',href:'about.html',hint:'Coverage, sources and how it works',icon:'ⓘ'},
};
const GROUPS=[['updates','Updates',['index']],['my-briefing','My Briefing',['briefing','company-briefing','action-center','team']],['explore','Explore',['research','companies','globe','events']],['resources','Resources',['resources','documents','requirements','agencies','archive','about']]];
export const defaultNavigation=()=>({version:1,groups:GROUPS.map(([id,label,items])=>({id,label,items:items.map(id=>({id,label:PAGES[id].label,hidden:false}))}))});
export const cleanLabel=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,32):fallback;
export function normalizeNavigation(raw,{navOrder=[],hiddenNav=[]}={}) {
 const defaults=defaultNavigation();
 const custom=raw?.version===1&&Array.isArray(raw.groups)&&raw.groups.length>0&&raw.groups.length<=12;
 const base=custom?raw.groups:defaults.groups;
 const seen=new Set(),groups=[],ids=new Set();
 for(const g of base){
  if(!g||!Array.isArray(g.items)||typeof g.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(g.id)||ids.has(g.id))continue;
  ids.add(g.id);const items=[];
  for(const item of g.items){
   if(!item||!Object.hasOwn(PAGES,item.id)||seen.has(item.id))continue;
   seen.add(item.id);items.push({id:item.id,label:cleanLabel(item.label,PAGES[item.id].label),hidden:item.id!=='index'&&(custom?item.hidden===true:hiddenNav.includes(item.id))});
  }
  if(!custom&&navOrder.length)items.sort((a,b)=>(navOrder.includes(a.id)?navOrder.indexOf(a.id):999)-(navOrder.includes(b.id)?navOrder.indexOf(b.id):999));
  groups.push({id:g.id,label:cleanLabel(g.label,'Menu group'),items});
 }
 if(!groups.length)return normalizeNavigation(null,{navOrder,hiddenNav});
 // New or omitted pages remain reachable; malformed/cached settings cannot remove Updates.
 for(const group of defaults.groups){
  const missing=group.items.filter(i=>!seen.has(i.id)).map(i=>({...i,hidden:i.id!=='index'&&hiddenNav.includes(i.id)}));
  if(!missing.length)continue;
  const into=groups.find(g=>g.id===group.id)??groups[0];into.items.push(...missing);
 }
 return {version:1,groups};
}
export function validateNavigation(raw){
 if(raw?.version!==1||!Array.isArray(raw.groups)||!raw.groups.length||raw.groups.length>12)throw Error('Use between 1 and 12 menu groups.');
 const pages=new Set(),groups=new Set();
 for(const g of raw.groups){
  if(!g||typeof g.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(g.id)||groups.has(g.id)||!Array.isArray(g.items))throw Error('Each menu group needs a unique ID and an item list.');
  groups.add(g.id);
  if(typeof g.label!=='string'||!g.label.trim()||g.label.length>32)throw Error('Group names must be between 1 and 32 characters.');
  for(const i of g.items){
   if(!i||!Object.hasOwn(PAGES,i.id)||pages.has(i.id)||typeof i.label!=='string'||!i.label.trim()||i.label.length>32||typeof i.hidden!=='boolean')throw Error('Each page must appear once with a label and visibility setting.');
   if(i.id==='index'&&i.hidden)throw Error('Updates must stay visible.');pages.add(i.id);
  }
 }
 if(pages.size!==Object.keys(PAGES).length)throw Error('Keep every page in a group; hide optional pages instead of removing them.');
 return normalizeNavigation(raw);
}
