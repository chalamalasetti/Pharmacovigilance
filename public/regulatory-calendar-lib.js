import {calendarFile} from './events-lib.js';
export const DATE_KINDS={effective:'Effective date',compliance:'Compliance deadline',data_lock:'Data lock point',submission:'Submission deadline',consultation:'Consultation closes'};
export function regulatoryReminder(e){
 if(e.state!=='verified'||!e.reviewed_at||!e.source_hash||!e.anchor?.trim())throw Error('Only a verified, source-linked date can be downloaded');
 return calendarFile({id:'regulatory-'+e.id,title:DATE_KINDS[e.kind]+': '+e.title,startDate:e.event_date,endDate:e.event_date,source:e.source_url,verifiedAt:e.reviewed_at.slice(0,10),sequence:e.revision,organizer:e.agency,location:e.country,registration:'Not an event registration',timeNote:`${e.scope}. Source location: ${e.anchor}. ${e.timing_note||''} Company applicability requires assessment.`});
}
export function filterDates(rows,{q='',agency='',country='',kind='',state='verified',from='',to=''}={}){
 return rows.filter(e=>(!agency||e.agency===agency)&&(!country||e.country===country)&&(!kind||e.kind===kind)&&(!state||e.state===state)&&(!from||e.event_date>=from)&&(!to||e.event_date<=to)&&(!q||[e.title,e.scope,e.anchor,e.timing_note].join(' ').toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>(a.event_date||'9999').localeCompare(b.event_date||'9999')||a.id.localeCompare(b.id));
}
