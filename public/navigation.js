// One registry shared by the build, menu editor and navigation renderer. Routes are fixed.
export const PAGES = {
 index:{label:'Updates',href:'./',hint:'Latest safety and regulatory news',icon:'◈'},
 briefing:{label:'My Briefing',href:'briefing.html',hint:'Your saved updates and daily priorities',icon:'◎'},
 'control-tower':{label:'PV Control Tower',href:'control-tower.html',hint:'Company priorities, product impact and recorded actions',icon:'◈'},
 'company-briefing':{label:'Company Briefing',href:'company-briefing.html',hint:'Confirm products and markets',icon:'▦'},
 'config-workbench':{label:'Configuration Workbench',href:'config-workbench.html',hint:'System profiles, rule baselines and evidence-linked change packages',icon:'⚙'},
 leadership:{label:'Leadership Cockpit',href:'leadership.html',hint:'Company safety watch, priorities and weekly brief',icon:'◈'},
 'company-inbox':{label:'Company Change Inbox',href:'company-inbox.html',hint:'New evidence and your company priorities',icon:'▣'},
 'account-settings':{label:'Account & team',href:'account.html',hint:'Password, user ID and private team settings',icon:'◎'},
 changes:{label:'Regulatory Change Review',href:'changes.html',hint:'Compare source evidence and record human triage',icon:'⇄'},
 'action-center':{label:'Action Center',href:'action-center.html',hint:'Assess, assign and verify closure',icon:'✓'},
 team:{label:'Team queue',href:'team.html',hint:'Shared assessments and assignments',icon:'♧'},
 events:{label:'Events & Training',href:'events.html',hint:'Verified dates and calendar downloads',icon:'◷'},
 research:{label:'Research',href:'research.html',hint:'Papers, ideas and innovation',icon:'⌕'},
 'safety-topics':{label:'Safety Topics',href:'safety-topics.html',hint:'Follow safety evidence across updates, labels and research',icon:'◎'},
 labels:{label:'Label Intelligence',href:'labels.html',hint:'Safety wording, evidence and company impact',icon:'⇄'},
 substances:{label:'Substances',href:'substances.html',hint:'Ingredients, products and company relationships',icon:'⌬'},
 companies:{label:'Companies',href:'companies.html',hint:'Explore company products and evidence',icon:'▦'},
 globe:{label:'Global view',href:'globe.html',hint:'Explore updates around the world',icon:'◉'},
 'e2b-studio':{label:'E2B Mapping Studio',href:'e2b-studio.html',hint:'ICH and FDA field evidence, baselines and private system mappings',icon:'⌘'},
 'content-studio':{label:'Template Library & Studio',href:'content-studio.html',hint:'Template Library and Document Studio: SOPs, training, review and downloads',icon:'▤'},
 'rule-templates':{label:'Rule Template Library',href:'rule-templates.html',hint:'Source-linked rule starters, forks and sandbox comparisons',icon:'▧'},
 sandbox:{label:'Synthetic Safety Sandbox',href:'sandbox.html',hint:'Create fictional cases, compare rules and export training reports',icon:'⚗'},
 resources:{label:'Safety resources',href:'resources.html',hint:'Public safety databases and reference tools',icon:'▤'},
 documents:{label:'Source documents',href:'documents.html',hint:'Country, agency, versions and extracted clauses',icon:'▤'},
 requirements:{label:'Requirements Library',href:'requirements.html',hint:'Source evidence, baselines and changes',icon:'▤'},
 agencies:{label:'Regulators',href:'agencies.html',hint:'Countries and regulatory agencies',icon:'◇'},
 archive:{label:'Archive',href:'archive.html',hint:'Search previously collected updates',icon:'◷'},
 'user-guide':{label:'User Guide',href:'user-guide.html',hint:'Step-by-step help for every module',icon:'▤'},
 about:{label:'About PV Info',href:'about.html',hint:'Coverage, sources and how it works',icon:'ⓘ'},
 'product-answers':{label:'Product Evidence Answers',href:'product-answers.html',hint:'Ask about approval dates, label mentions and supporting evidence',icon:'✦'},
 'label-analysis':{label:'Label Safety Analysis',href:'label-analysis.html',hint:'Compare product cohorts, safety wording and captured evidence timelines',icon:'◈'},
 'data-repository':{label:'Evidence Data Repository',href:'data-repository.html',hint:'Products, ingredients, dates, labels and downloadable source-linked datasets',icon:'◈'},
};
const GROUPS=[['updates','Updates',['index']],['my-briefing','My Briefing',['control-tower','briefing','company-briefing','leadership','config-workbench','company-inbox','action-center','team','account-settings']],['explore','Explore',['product-answers','research','companies','substances','safety-topics','globe','events']],['resources','Resources',['content-studio','sandbox','rule-templates','e2b-studio','resources','documents','changes','requirements','agencies','archive','user-guide','about']],['label-intelligence','Label Intelligence',['labels','label-analysis','data-repository']]];
export const defaultNavigation=()=>({version:1,groups:GROUPS.map(([id,label,items])=>({id,label,items:items.map(id=>({id,label:PAGES[id].label,hidden:false}))}))});
export const cleanLabel=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,32):fallback;
export function normalizeNavigation(raw,{navOrder=[],hiddenNav=[]}={}) {
 const defaults=defaultNavigation();
 const custom=raw?.version===1&&Array.isArray(raw.groups)&&raw.groups.length>0&&raw.groups.length<=12;
 const base=custom?structuredClone(raw.groups):defaults.groups;
 // Promote the existing label tools once; preserve their saved labels and visibility.
 if(custom&&!base.some(g=>g.id==='label-intelligence')&&base.length<12){const items=[];for(const g of base){if(!Array.isArray(g?.items))continue;for(const item of g.items)if(['labels','label-analysis'].includes(item?.id))items.push(item);g.items=g.items.filter(item=>!['labels','label-analysis'].includes(item?.id));}if(items.length)base.push({id:'label-intelligence',label:'Label Intelligence',items});}
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
  const into=groups.find(g=>g.id===group.id)??groups[0];for(const item of missing){if(item.id==='control-tower'){const work=groups.find(g=>g.items.some(i=>i.id==='company-briefing'))??into;work.items.unshift(item);}else if(item.id==='sandbox'){const studio=into.items.findIndex(i=>i.id==='content-studio');into.items.splice(studio<0?0:studio+1,0,item);}else into.items.push(item);}
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
