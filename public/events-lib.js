export function validEvent(e){
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!e||!/^[a-z0-9-]+$/.test(e.id)||!date(e.startDate)||!date(e.endDate)||e.endDate<e.startDate||!e.title||!e.source||!/^https:\/\//.test(e.source))throw Error('Invalid event evidence');
 const u=new URL(e.source);if(u.username||u.password||/[\r\n]/.test(e.source))throw Error('Invalid source');
 if(e.startUtc||e.endUtc){if(!e.startUtc||!e.endUtc||!e.timeZone||!e.startUtc.endsWith('Z')||!e.endUtc.endsWith('Z')||!Number.isFinite(Date.parse(e.startUtc))||Date.parse(e.endUtc)<=Date.parse(e.startUtc))throw Error('Invalid event time');new Intl.DateTimeFormat('en',{timeZone:e.timeZone});}
 return e;
}
export const nextDate=s=>new Date(Date.parse(s+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=s=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function calendarFile(event){const e=validEvent(event),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PV Info//Events//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${e.id}@pvinfo.org`,`DTSTAMP:${stamp(e.verifiedAt+'T00:00:00Z')}`,`SEQUENCE:${e.sequence??0}`,`SUMMARY:${escape(e.title)}`];
 if(e.startUtc)lines.push('DTSTART:'+stamp(e.startUtc),'DTEND:'+stamp(e.endUtc));else lines.push('DTSTART;VALUE=DATE:'+e.startDate.replaceAll('-',''),'DTEND;VALUE=DATE:'+nextDate(e.endDate).replaceAll('-',''),'TRANSP:TRANSPARENT');
 lines.push('STATUS:'+(e.status==='cancelled'?'CANCELLED':'CONFIRMED'),'LOCATION:'+escape(e.location),'URL:'+e.source,'DESCRIPTION:'+escape(`${e.organizer}. ${e.timeNote||''} Registration: ${e.registration}. Verify details with organizer: ${e.source}`),'END:VEVENT','END:VCALENDAR');
 // RFC 5545 lines fold at 75 UTF-8 octets, without splitting a Unicode character.
 return lines.map(line=>{let result='',part='',size=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(size+n>75){result+=part+'\r\n';part=' ';size=1;}part+=c;size+=n;}return result+part;}).join('\r\n')+'\r\n';
}
export function eventTime(e,zone){return e.startUtc?new Intl.DateTimeFormat(undefined,{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(e.startUtc))+' – '+new Intl.DateTimeFormat(undefined,{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(e.endUtc)):`${e.startDate}${e.endDate!==e.startDate?' – '+e.endDate:''} · ${e.timeNote}`;}
export function overlaps(e,start,end){return e.startDate<=end&&e.endDate>=start;}

export function displayDates(e,zone){
 if(!e.startUtc)return e;
 const civil=s=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(s));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
 return {...e,startDate:civil(e.startUtc),endDate:civil(e.endUtc)};
}
