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
  const panel=make('div','nav-panel');panel.setAttribute('aria-label',g.label);panel.append(...anchors);details.append(panel);
  details.addEventListener('toggle',()=>{
   if(!details.open)return;
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
