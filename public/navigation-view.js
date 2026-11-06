import {normalizeNavigation,PAGES} from './navigation.js';
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
export function renderNavigation(nav,site,{current='',account,admin,adminAllowed=false}={}){
 if(!nav)return;
 const layout=normalizeNavigation(site?.navigation,site??{}),nodes=[];
 for(const g of layout.groups){
  const items=g.items.filter(i=>!i.hidden);if(!items.length)continue;
  const anchors=items.map(i=>{const p=PAGES[i.id],a=make('a','nav-page');a.href=p.href;a.dataset.nav=i.id;
   const icon=make('span','nav-icon',p.icon);icon.setAttribute('aria-hidden','true');
   const words=make('span','nav-words');words.append(make('strong','',i.label),make('small','',p.hint));a.append(icon,words);
   if(current===i.id)a.setAttribute('aria-current','page');return a;});
  if(items.length===1){anchors[0].classList.add('nav-direct');nodes.push(anchors[0]);continue;}
  const details=make('details','nav-group'),summary=make('summary','nav-group-title');
  summary.append(make('span','',g.label),make('span','nav-chevron','⌄'));details.append(summary);
  if(items.some(i=>i.id===current))details.dataset.current='true';
  const panel=make('div','nav-panel');panel.setAttribute('aria-label',g.label);const heading=make('div','nav-panel-heading',g.label+' · '+items.length+' places');const search=make('input','nav-search');search.type='search';search.placeholder='Find a tool or workspace…';search.setAttribute('aria-label','Find in '+g.label);search.addEventListener('input',()=>{let count=0;for(const a of anchors){a.hidden=!a.textContent.toLowerCase().includes(search.value.trim().toLowerCase());if(!a.hidden)count++;}empty.hidden=count!==0;});const links=make('div','nav-grid');links.append(...anchors);const empty=make('p','nav-empty','No matching items in this menu.');empty.hidden=true;panel.append(heading,search,links,empty);details.append(panel);
  details.addEventListener('toggle',()=>{
   if(!details.open){search.value='';for(const a of anchors)a.hidden=false;empty.hidden=true;return;}
   for(const other of nav.querySelectorAll('details.nav-group'))if(other!==details)other.open=false;
   panel.style.left='';panel.style.right='';
   if(matchMedia('(min-width:901px)').matches&&panel.getBoundingClientRect().right>innerWidth-12){panel.style.left='auto';panel.style.right='0';}
  });
  nodes.push(details);
 }
 if(admin){admin.hidden=!adminAllowed;if(current==='admin')admin.setAttribute('aria-current','page');else admin.removeAttribute('aria-current');nodes.push(admin);}
 if(account)nodes.push(account);
 nav.replaceChildren(...nodes);
}
export function closeGroups(nav,focus=false){for(const d of nav?.querySelectorAll('details.nav-group[open]')??[]){d.open=false;if(focus)d.querySelector('summary')?.focus();}}
