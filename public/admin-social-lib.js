import {impactCard} from './impact.js';
export const plain=(v,n=500)=>String(v??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
export function sourceUrl(v){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function rankUpdates(updates,now=Date.now()){
 const seen=new Set();return updates.flatMap(u=>{const url=sourceUrl(u.link),date=Date.parse(u.published);if(!url||!plain(u.title)||!Number.isFinite(date)||date>now+86400000||seen.has(url))return [];seen.add(url);const card=impactCard(u),days=Math.max(0,(now-date)/86400000),reasons=[];let score=0;
 if(u.kind==='official'){score+=40;reasons.push('Official source classification');}else reasons.push('Secondary source: find the original notice');
 if(days<=7){score+=30;reasons.push('Published within seven days');}else if(days<=30){score+=15;reasons.push('Published within 30 days');}else reasons.push('Older item: check whether it is still timely');
 if(['safety','regulation','guideline','label','policy'].includes(u.category)){score+=15;reasons.push('Safety or regulatory topic');}
 if(card.business.length||card.technical.length){score+=10;reasons.push('Evidence-triggered potential impact prompts');}
 if(plain(u.summary)){score+=5;reasons.push('Source summary available');}
 return [{update:u,card,score,reasons}];}).sort((a,b)=>b.score-a.score||Date.parse(b.update.published)-Date.parse(a.update.published)||String(a.update.id).localeCompare(String(b.update.id)));
}
export function buildSocialDraft(item){
 const {update:u,card}=item, excerpt=plain(u.summary||u.title,4000).split(/\s+/).slice(0,24).join(' '), business=plain(card.business[0]?.text||'Assess applicability to your products, markets and current procedures.',180),technical=plain(card.technical[0]?.text||'Check whether systems, data mappings or reporting controls need review.',180);
 const title=plain(u.title,240),agency=plain(u.agency||u.source||'Source',100),published=String(u.published).slice(0,10),url=sourceUrl(u.link);
 return {title,agency,published,url,excerpt,business,technical,post:[`🔎 PV update to put on your review list`,title,'',`🏛️ ${agency} · Published ${published}`,`Source excerpt: “${excerpt}${plain(u.summary||u.title,4000).split(/\s+/).length>24?'…':''}”`,'','💡 Potential impact — prompts for review',`📋 Business: ${business}`,`⚙️ Systems & data: ${technical}`,'','✅ Start with the original notice, confirm applicability, then document the assessment and any actions.','Impact prompts are generated from source keywords and require human review.',`Source link: ${url}`,'','Explore pharmacovigilance updates and evidence-linked impact cards at https://www.pvinfo.org/','', '#Pharmacovigilance #DrugSafety #RegulatoryIntelligence #PVInfo'].join('\n')};
}
// The graphic uses the same explicit potential-impact language as the post.
export function paintSocialCard(canvas,d){const c=canvas.getContext('2d');canvas.width=1200;canvas.height=1200;
 c.fillStyle='#eef5f6';c.fillRect(0,0,1200,1200);c.fillStyle='#0f4c5c';c.fillRect(0,0,1200,370);c.fillStyle='#93dfd5';c.font='bold 25px sans-serif';c.fillText('PHARMACOVIGILANCE (PV) INFO',64,72);
 const wrap=(text,x,y,width,size,max,color='#153b47')=>{c.fillStyle=color;c.font=`${size>=36?'bold ':''}${size}px sans-serif`;const words=plain(text,2000).split(' '),lines=[];let line='';for(const word of words){if(c.measureText(line+' '+word).width>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);for(let i=0;i<Math.min(max,lines.length);i++){let s=lines[i];if(i===max-1&&lines.length>max){while(c.measureText(s+'…').width>width)s=s.slice(0,-1);s+='…';}c.fillText(s,x,y+i*size*1.28);}};
 wrap(d.title,64,140,1070,44,3,'#ffffff');wrap(`${d.agency} · ${d.published}`,64,326,1070,25,1,'#cde5e8');
 const block=(y,icon,label,text)=>{c.fillStyle='#ffffff';c.fillRect(48,y,1104,220);c.fillStyle='#d8eeeb';c.beginPath();c.arc(105,y+56,27,0,Math.PI*2);c.fill();c.fillStyle='#0f4c5c';c.font='bold 28px sans-serif';c.fillText(icon,96,y+66);c.font='bold 23px sans-serif';c.fillText(label,152,y+64);wrap(text,80,y+117,1020,30,3);};
 block(404,'▤','BUSINESS · POTENTIAL IMPACT',d.business);block(650,'⚙','SYSTEMS & DATA · POTENTIAL IMPACT',d.technical);
 wrap('Review source → assess applicability → document action',64,930,1070,28,2);wrap('Keyword-based prompts. Human review required.',64,1006,1070,23,1);let host='Source';try{host=new URL(d.url).hostname;}catch{}wrap(`Source: ${host} · Original link in accompanying post`,64,1050,1070,22,1);c.fillStyle='#0f4c5c';c.fillRect(0,1100,1200,100);c.fillStyle='#ffffff';c.font='bold 34px sans-serif';c.fillText('pvinfo.org',64,1162);c.font='22px sans-serif';c.fillText('Evidence first. Practical impact.',680,1162);}
