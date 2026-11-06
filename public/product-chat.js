import {parseQuestion,productCandidates,answerProduct,safeURL,norm} from './product-answers-lib.js';
export function createProductChat({el,bubble,json}){
 let catalog=null,sequence=0,pending=null,current=null,lastQuestion='';
 const history=q=>/(when|date|history|added).*(approv|authori[sz]|label)|(approv|authori[sz]|label).*(when|date|history|added)/i.test(q);
 const market=q=>/^(?:(?:what|how) about |in |for )?(?:the )?(us|usa|united states|fda)(?: market)?$/.test(norm(q))?'US':/^(?:(?:what|how) about |in |for )?(?:the )?(eu|europe|european union|ema)(?: market)?$/.test(norm(q))?'EU':null;
 const link=(url,text)=>safeURL(url)?el('a',{href:safeURL(url),target:'_blank',rel:'noopener',textContent:text}):el('span',{textContent:'Source link unavailable'});
 async function choose(product,question,topic,turn){
  pending=null;const loading=bubble('bot',[el('p',{textContent:'Checking the captured evidence for '+product.brand+' · '+product.market+' · '+product.authId+'…'})]);
  const [labels,updates]=await Promise.all([json('data/labels.json'),json('data/updates.json')]);loading.remove();if(turn!==sequence)return;
  current={product,topic};lastQuestion=question;
  const r=answerProduct({product,question,topic,labels:labels?.records??[],updates:updates?.updates??[],coverage:{registryBuilt:catalog.registryBuilt,labelChecked:labels?.checked??null,labelsAvailable:Array.isArray(labels?.records)}});
  const parts=[el('b',{textContent:product.brand+' · '+product.market+' · '+product.authId}),el('p',{textContent:'Company association: '+product.companyName+(product.holder?' · source holder: '+product.holder:'')}),el('p',{textContent:r.approval.date?'Registry application date: '+r.approval.date+'. This is market/application-specific, not necessarily the first worldwide, indication or presentation approval.':'Approval date is not established in the available records.'})];
  if(r.approval.url)parts.push(link(r.approval.url,'Approval registry source ↗'));
  if(topic){parts.push(el('p',{textContent:topic+' — '+r.labelTiming.status+'. A captured mention or revision does not prove the first addition.'}));if(!labels)parts.push(el('p',{textContent:'Label records could not be loaded; no label conclusion was inferred.'}));else if(!r.mentions.length)parts.push(el('p',{textContent:'No exact-application mention was found in this capture. This does not prove absence from the label.'}));for(const m of r.mentions.slice(0,3))parts.push(el('article',{className:'chat-card'},[el('p',{className:'chat-card-meta',textContent:m.classification+' · '+(m.date||'date not captured')}),link(m.url,m.title||m.locator||'Label source'),...m.snippets.slice(0,1).map(s=>el('p',{textContent:s.section+': '+s.text+(s.truncated?'…':'')}))]));}
  for(const u of r.related.slice(0,2))parts.push(link(u.url,'Related update: '+u.title));
  parts.push(el('p',{className:'chat-card-src',textContent:'Registry snapshot: '+(catalog.registryBuilt||'unknown')+' · labels checked: '+(labels?.checked||'unavailable')+'. Qualified human review required.'}));
  const detail=el('a',{href:'product-answers.html',textContent:'Open detailed evidence and download ↗'});detail.onclick=()=>{try{sessionStorage.setItem('pv-product-question',question);}catch{}};parts.push(detail,el('p',{textContent:'You can ask “What about the EU?”, “Show sources”, or another label-history question. I will ask again if the product scope is unclear.'}));bubble('bot',parts);
 }
 function choices(rows,question,topic,turn){pending={rows,question,topic};const options=rows.slice(0,8).map(p=>{const b=el('button',{type:'button',className:'chat-chip',textContent:[p.brand,p.market,p.authId].join(' · ')});b.onclick=()=>{if(turn!==sequence)return;bubble('me',[el('p',{textContent:b.textContent})]);choose(p,question,topic,++sequence).catch(()=>bubble('bot',[el('p',{textContent:'Evidence could not be prepared. Retry the question; no date was inferred.'})]));};return b;});bubble('bot',[el('p',{textContent:rows.length?'Which product/application and market do you mean? Choose below or type US / EU.':'I could not match a product in the available registry. Please provide the exact brand or ingredient; I will not infer an identity.'}),...options,...(rows.length>8?[el('p',{textContent:'Showing eight candidates. Add a market or use the detailed evidence view to narrow further.'})]:[])]);}
 return async function respondProduct(q){
  const selectedMarket=market(q),isContext=current&&(/\b(it|its|this product|that product|same product)\b|show sources|what about|when was .+added to (the )?label/i.test(q));
  if(!history(q)&&!pending&&!selectedMarket&&!isContext)return false;
  if(selectedMarket&&!pending&&!current)return false;
  const turn=++sequence;
  try{
   if(!catalog){catalog=await json('data/product-answers.json');if(turn!==sequence)return true;}if(!Array.isArray(catalog?.products)){catalog=null;bubble('bot',[el('p',{textContent:'Product evidence is temporarily unavailable. No approval or label date has been inferred. Please retry.'})]);return true;}
   if(selectedMarket&&pending){const p=pending;choices(p.rows.filter(r=>r.market===selectedMarket),p.question,p.topic,turn);return true;}
   if(selectedMarket&&current){const rows=productCandidates(catalog.products,current.product.brand,selectedMarket);choices(rows,lastQuestion,current.topic,turn);return true;}
   const parsed=parseQuestion(q);let topic=parsed.topic||'';
   if(isContext&&!topic)topic=current.topic;
   const rows=productCandidates(catalog.products,q);
   if(!rows.length&&isContext&&/^what about/i.test(q)){bubble('bot',[el('p',{textContent:'Do you mean a different market or a different safety term? Type US / EU for market selection, or ask a full label question such as “When was rash added to the label?”. I have not changed the product scope.'})]);return true;}
   if(!rows.length&&isContext){await choose(current.product,q,topic,turn);return true;}
   choices(rows,q,topic,turn);return true;
  }catch{bubble('bot',[el('p',{textContent:'I could not complete this evidence check. Please retry or narrow the product and market. No date has been inferred.'})]);return true;}
 };
}
