// Alias resolution stays on the server. The browser never receives another user's
// email. Native Supabase Auth validates passwords and owns sessions/rate limits.
import {cloudConfig} from '../scripts/cloud.mjs';
const invalid={error:'Sign-in failed. Check your user ID and password, or contact the site administrator.'};
export async function passwordLogin(req,res,{cfg=cloudConfig(),fetchImpl=fetch}={}){
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
 const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 if(req.method!=='POST')return send(405,{error:'Use POST'});
 // Same-origin requests only; no credential-bearing cross-origin form requests.
 const origin=req.headers.origin;
 if(origin&&origin!==`https://${req.headers.host}`&&!(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)&&/^localhost:|^127\.0\.0\.1:/.test(req.headers.host??'')))return send(403,invalid);
 if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,invalid);
 let body;try{let raw=req.body;if(raw===undefined){raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return send(413,invalid);}}if(typeof raw==='string'&&Buffer.byteLength(raw)>4096)return send(413,invalid);body=typeof raw==='string'?JSON.parse(raw):raw;}catch{return send(400,invalid);}
 const alias=String(body?.identifier??'').trim().toLowerCase(),password=body?.password;
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(alias)||typeof password!=='string'||!password||password.length>1024)return send(400,invalid);
 if(!cfg.url||!cfg.serviceKey||!cfg.publicKey)return send(503,{error:'User ID sign-in is temporarily unavailable. Try your email and password.'});
 const serviceHeaders={apikey:cfg.serviceKey,'content-type':'application/json',...(cfg.serviceKey.startsWith('eyJ')?{authorization:`Bearer ${cfg.serviceKey}`}:{})};
 try{
  const lookup=await fetchImpl(`${cfg.url}/rest/v1/rpc/resolve_login_alias`,{method:'POST',headers:serviceHeaders,body:JSON.stringify({p_alias:alias}),signal:AbortSignal.timeout(10000)});
  if(!lookup.ok)return send(503,{error:'User ID sign-in is temporarily unavailable. Try your email and password.'});
  const found=await lookup.json();
  if(!found.allowed)return send(429,{error:'Too many attempts. Try again later or sign in using your email.'});
  // A fixed nonexistent address follows the same Auth path for unknown aliases.
  const auth=await fetchImpl(`${cfg.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:cfg.publicKey,'content-type':'application/json'},body:JSON.stringify({email:found.email??'unavailable@invalid.example',password}),signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return send(401,invalid);
  const session=await auth.json();
  if(!found.email||!session.access_token||!session.refresh_token)return send(401,invalid);
  return send(200,{access_token:session.access_token,refresh_token:session.refresh_token});
 }catch{return send(502,{error:'Sign-in is temporarily unavailable. Please try again.'});}
}
export default passwordLogin;
