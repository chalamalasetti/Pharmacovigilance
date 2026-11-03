export function clinicalCoverageText(c,now=Date.now()){
 if(!c)return 'Clinical: not checked';
 const labels={complete:'query fully checked',partial:'partial',failed:'collection failed','not-checked':'not checked'};
 const stale=c.retrievedAt&&now-Date.parse(c.retrievedAt)>7*86400000;
 return `Clinical: ${labels[c.status]??'not checked'}${stale?' · older than 7 days':''}${c.studies!=null?` · ${c.studies} matched studies`:''}`;
}
