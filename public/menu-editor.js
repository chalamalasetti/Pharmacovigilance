import {defaultNavigation,normalizeNavigation,validateNavigation,PAGES} from './navigation.js';
import {renderNavigation} from './navigation-view.js';
const el=(tag,attrs={},...children)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);}n.append(...children.flat().filter(x=>x!=null&&x!==false));return n;};
export function menuEditor({value,legacy={},expected=null,onSave}) {
 let saved=normalizeNavigation(value,legacy),draft=structuredClone(saved),saving=false;
 const root=el('section',{class:'profile menu-studio',id:'menu'}),body=el('div'),preview=el('nav',{class:'toplinks menu-preview','aria-label':'Menu preview'}),notice=el('p',{class:'hint',role:'status','aria-live':'polite'});
 const save=el('button',{type:'button',class:'btn primary',onclick:async()=>{
  if(saving)return;
  try{const clean=validateNavigation(draft);saving=true;refreshDirty();const result=await onSave(clean,expected);expected=result??expected;saved=structuredClone(clean);draft=structuredClone(clean);notice.textContent='Menu saved. Use Publish now above to make it live, or wait for the next scheduled build.';draw();}
  catch(e){notice.textContent=e.message;notice.className='warn';}finally{saving=false;draw();}
 }},'Save menu');
 const discard=el('button',{type:'button',class:'act',onclick:()=>{draft=structuredClone(saved);notice.textContent='Draft discarded.';draw();}},'Discard draft');
 const reset=el('button',{type:'button',class:'act',onclick:()=>{draft=defaultNavigation();notice.textContent='Default grouping loaded as a draft. Save to apply it.';draw();}},'Use default grouping');
 function refreshDirty(){body.inert=saving;reset.disabled=saving;add.disabled=saving;const changed=JSON.stringify(saved)!==JSON.stringify(draft);save.disabled=saving||!changed;discard.disabled=saving||!changed;renderNavigation(preview,{navigation:draft},{current:'action-center'});}
 function rename(label,value,onChange){return el('input',{type:'text',value,maxlength:32,required:true,'aria-label':label,oninput:e=>{onChange(e.target.value);refreshDirty();}});}
 function move(list,index,delta){const to=index+delta;if(to<0||to>=list.length)return;[list[index],list[to]]=[list[to],list[index]];draw();}
 function arrow(label,disabled,callback,symbol){return el('button',{type:'button',class:'menu-icon-btn','aria-label':label,title:label,disabled:saving||disabled,onclick:callback},symbol);}
 function draw(){
  body.replaceChildren(...draft.groups.map((g,gi)=>el('article',{class:'menu-group-card'},
   el('div',{class:'menu-group-head'},el('span',{class:'menu-group-symbol','aria-hidden':'true'},String(gi+1).padStart(2,'0')),
    el('div',{class:'menu-group-name'},el('label',{},'Group name',rename(`Rename group ${g.label}`,g.label,v=>g.label=v)),el('span',{class:'hint'},`${g.items.filter(i=>!i.hidden).length} visible · ${g.items.length} pages`)),
    el('div',{class:'menu-move'},arrow(`Move group ${g.label} up`,gi===0,()=>move(draft.groups,gi,-1),'↑'),arrow(`Move group ${g.label} down`,gi===draft.groups.length-1,()=>move(draft.groups,gi,1),'↓'),el('button',{type:'button',class:'act',disabled:g.items.length>0||saving,title:g.items.length?'Move all pages out before removing a group':'Remove empty group',onclick:()=>{draft.groups.splice(gi,1);draw();}},'Remove'))),
   el('div',{class:'menu-group-items'},...g.items.map((item,ii)=>{
    const target=el('select',{'aria-label':`Group for ${PAGES[item.id].label}`,onchange:e=>{const dest=draft.groups.find(x=>x.id===e.target.value);if(dest&&dest!==g){g.items.splice(ii,1);dest.items.push(item);draw();}}},...draft.groups.map(to=>el('option',{value:to.id,selected:to.id===g.id},to.label)));
    return el('div',{class:`menu-item-row${item.hidden?' is-hidden':''}`},el('span',{class:'menu-item-icon','aria-hidden':'true'},PAGES[item.id].icon),
     el('div',{class:'menu-item-name'},rename(`Label for ${PAGES[item.id].label}`,item.label,v=>item.label=v),el('small',{},PAGES[item.id].href)),
     el('label',{class:'check menu-visibility'},el('input',{type:'checkbox',checked:!item.hidden,disabled:item.id==='index'||saving,'aria-label':`Show ${PAGES[item.id].label}`,onchange:e=>{item.hidden=!e.target.checked;draw();}}),'Show'),
     el('label',{class:'menu-destination'},el('span',{},'Group'),target),
     el('div',{class:'menu-move'},arrow(`Move ${PAGES[item.id].label} up`,ii===0,()=>move(g.items,ii,-1),'↑'),arrow(`Move ${PAGES[item.id].label} down`,ii===g.items.length-1,()=>move(g.items,ii,1),'↓')));
   }),!g.items.length?el('p',{class:'hint menu-empty'},'Empty group. Move a page here using its Group selector. Empty groups are not shown to visitors.'):null))));
  refreshDirty();
 }
 const add=el('button',{type:'button',class:'act',onclick:()=>{if(draft.groups.length>=12){notice.textContent='You can have up to 12 groups.';return;}draft.groups.push({id:'group-'+crypto.randomUUID().slice(0,8),label:'New group',items:[]});draw();}},'+ Add group');
 root.append(el('div',{class:'menu-studio-title'},el('div',{},el('h2',{},'Navigation studio'),el('p',{class:'hint'},'Group related work together. Rename, reorder or move pages, then preview before saving.')),add),
  el('p',{class:'menu-note'},'Admin access stays restricted to admins. Sign in / Sign out stays separate. Updates cannot be hidden. Hiding a page removes its menu link, not direct access.'),
  el('div',{class:'menu-preview-wrap'},el('span',{class:'menu-eyebrow'},'Live draft preview'),preview),body,
  el('div',{class:'menu-studio-actions'},save,discard,reset),notice);
 draw();return root;
}
