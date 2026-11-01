// Keep the hourly hook, but coalesce scheduled and externally dispatched duplicates.
const WINDOW_MS=50*60*1000;
module.exports=function refreshDecision({runs=[],now=Date.now(),headSha,eventName,force=false}){
 if(force===true||eventName==='push')return {run:true,reason:'Explicit refresh or collector-code update'};
 const recent=runs.find(r=>r.head_sha===headSha&&r.conclusion==='success'&&r.refreshed===true&&Number.isFinite(Date.parse(r.created_at))&&now-Date.parse(r.created_at)>=0&&now-Date.parse(r.created_at)<WINDOW_MS);
 return recent?{run:false,reason:'A successful refresh of this main revision already ran within 50 minutes',previousRun:recent.id}:{run:true,reason:'No recent successful refresh of this main revision'};
};
