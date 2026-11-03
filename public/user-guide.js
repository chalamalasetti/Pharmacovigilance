// Static, public help. Never reads a visitor's session, company profile or private cases.
const $=id=>document.getElementById(id);
const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
let guide,current,all=false;
const urlFor=id=>'user-guide.html?chapter='+encodeURIComponent(id);
const sourceFor=id=>'https://github.com/chalamalasetti/Pharmacovigilance/blob/main/docs/user-guide/'+id+'.md';
const sourceIndex='https://github.com/chalamalasetti/Pharmacovigilance/tree/main/docs/user-guide';
function chapterHeader(c){const header=el('header');header.append(el('p',c.group+' · '+c.audience,{class:'guide-eyebrow'}),el(all?'h2':'h1',c.title));return header;}
function setCurrent(id,{focus=false,replace=false}={}){
 const chapter=guide.chapters.find(c=>c.id===id)??guide.chapters[0];current=chapter.id;all=false;
 const u=new URL(location.href);u.searchParams.set('chapter',current);u.searchParams.delete('view');if(focus)u.hash='';history[replace?'replaceState':'pushState'](null,'',u);
 render();if(focus){$('guide-article').focus();window.scrollTo({top:$('guide-main').offsetTop-16,behavior:'auto'});$('guide-layout').classList.remove('contents-open');$('guide-contents-toggle').setAttribute('aria-expanded','false');}
}
function render(){
 $('guide-results').hidden=true;$('guide-reader').hidden=false;
 document.title=(all?'Complete User Guide':guide.chapters.find(c=>c.id===current)?.title??'User Guide')+' · PV Info';
 const article=$('guide-article');article.replaceChildren();const chapters=all?guide.chapters:guide.chapters.filter(c=>c.id===current);
 if(all)article.append(el('h1','PV Info · Complete User Guide'),el('p',`Version ${guide.version} · Reviewed ${guide.reviewed} · ${guide.chapters.length} chapters`,{class:'guide-meta'}));
 for(const c of chapters){const section=el('section',null,{class:'guide-chapter',id:'chapter-'+c.id});section.append(chapterHeader(c));const body=el('div',null,{class:'guide-prose'});body.innerHTML=c.html;section.append(body,el('p',null,{class:'guide-source'}));section.lastChild.append(el('a','View this chapter on GitHub ↗',{href:sourceFor(c.id),target:'_blank',rel:'noopener noreferrer'}));article.append(section);}
 const toc=$('guide-toc');toc.replaceChildren(el('h2',all?'Chapters':'On this page'));for(const c of chapters){const items=all?[{id:'chapter-'+c.id,title:c.title}]:c.toc;for(const h of items)toc.append(el('a',h.title,{href:'#'+h.id}));}
 const index=guide.chapters.findIndex(c=>c.id===current),pager=$('guide-pager');pager.replaceChildren();pager.hidden=all;
 if(!all){if(index>0)pager.append(el('a','← '+guide.chapters[index-1].title,{href:urlFor(guide.chapters[index-1].id)}));if(index<guide.chapters.length-1)pager.append(el('a',guide.chapters[index+1].title+' →',{href:urlFor(guide.chapters[index+1].id)}));}
 for(const a of $('guide-chapters').querySelectorAll('a')){if(!all&&a.dataset.chapter===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 $('guide-version').textContent=`Guide ${guide.version} · Reviewed ${guide.reviewed} · App reference ${guide.appRevision}`;
 $('guide-github').href=all?sourceIndex:sourceFor(current);
}
function search(){const q=$('guide-search').value.trim().toLowerCase(),audience=$('guide-audience').value;if(!q&&!audience){render();$('guide-search-status').textContent='';return;}
 const terms=q.split(/\s+/).filter(Boolean),matches=guide.chapters.filter(c=>(!audience||c.audience===audience)&&terms.every(t=>(c.title+' '+c.summary+' '+c.text).toLowerCase().includes(t))).sort((a,b)=>Number(terms.some(t=>b.title.toLowerCase().includes(t)))-Number(terms.some(t=>a.title.toLowerCase().includes(t))));
 $('guide-reader').hidden=true;$('guide-results').hidden=false;$('guide-search-status').textContent=`${matches.length} chapter${matches.length===1?'':'s'} found`;
 const list=$('guide-result-list');list.replaceChildren();for(const c of matches){const card=el('article',null,{class:'guide-result'});card.append(el('p',c.group+' · '+c.audience,{class:'guide-eyebrow'}));const h=el('h3');h.append(el('a',c.title,{href:urlFor(c.id)}));card.append(h,el('p',c.summary));if(q){const text=c.text.replace(/\s+/g,' '),pos=text.toLowerCase().indexOf(terms[0]);if(pos>=0)card.append(el('p',(pos>80?'… ':'')+text.slice(Math.max(0,pos-80),pos+180)+'…',{class:'guide-snippet'}));}list.append(card);}
 if(!matches.length)list.append(el('p','No guide chapters match. Try “password”, “baseline”, “clinical”, “closure” or clear the filters.',{class:'guide-empty'}));
}
async function main(){try{const res=await fetch('user-guide-data.json',{cache:'no-cache'});if(!res.ok)throw Error();guide=await res.json();if(!guide.chapters?.length)throw Error();const nav=$('guide-chapters');nav.replaceChildren();for(const group of [...new Set(guide.chapters.map(c=>c.group))]){const section=el('section');section.append(el('h3',group));for(const c of guide.chapters.filter(c=>c.group===group)){const a=el('a',c.title,{href:urlFor(c.id)});a.dataset.chapter=c.id;section.append(a);}nav.append(section);}
 const params=new URLSearchParams(location.search);current=params.get('chapter')??guide.chapters[0].id;if(!guide.chapters.some(c=>c.id===current))current=guide.chapters[0].id;all=params.get('view')==='all';render();$('guide-layout').hidden=false;$('guide-loading').hidden=true;
 $('guide-search-form').onsubmit=e=>{e.preventDefault();search();};$('guide-search').addEventListener('input',search);$('guide-audience').addEventListener('change',search);
 $('guide-clear').onclick=()=>{$('guide-search').value='';$('guide-audience').value='';$('guide-search-status').textContent='';render();$('guide-search').focus();};
 $('guide-print').onclick=()=>window.print();$('guide-complete').onclick=()=>{$('guide-search').value='';$('guide-audience').value='';all=true;const u=new URL(location.href);u.searchParams.delete('chapter');u.searchParams.set('view','all');u.hash='';history.pushState(null,'',u);render();$('guide-article').focus();};
 $('guide-contents-toggle').onclick=()=>{const opened=$('guide-layout').classList.toggle('contents-open');$('guide-contents-toggle').setAttribute('aria-expanded',String(opened));};
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||!u.pathname.endsWith('/user-guide.html')||!u.searchParams.has('chapter'))return;e.preventDefault();$('guide-search').value='';$('guide-audience').value='';$('guide-search-status').textContent='';setCurrent(u.searchParams.get('chapter'),{focus:true});if(u.hash){history.replaceState(null,'',u);document.getElementById(u.hash.slice(1))?.scrollIntoView();}});
 window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);current=p.get('chapter')??guide.chapters[0].id;if(!guide.chapters.some(c=>c.id===current))current=guide.chapters[0].id;all=p.get('view')==='all';$('guide-search-status').textContent='';$('guide-search').value='';$('guide-audience').value='';render();});
 if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView();
 }catch{$('guide-loading').textContent='The help center could not load. Use the GitHub User Guide link below, or reload this page.';}}
main();
