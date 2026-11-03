export const authHeaders=key=>({apikey:key,...(key.startsWith('eyJ')?{authorization:`Bearer ${key}`}:{})});
export async function dbRequest(cfg,route,{method='GET',body,fetchImpl=fetch}={}){
 const res=await fetchImpl(`${cfg.url}/rest/v1/${route}`,{method,headers:{...authHeaders(cfg.serviceKey),'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Object.assign(Error('Document database operation failed'),{status:res.status});return res.status===204?null:res.json();
}
