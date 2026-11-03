import {randomBytes,randomUUID} from 'node:crypto';import {cloudConfig} from '../scripts/cloud.mjs';import {managedRpc,nativeAuth,serverHeaders} from '../scripts/managed-accounts.mjs';import {PROFESSIONAL_ROLES,loginAlias} from '../public/account-auth.js';
export async function accountAccess(req,res,{cfg=cloudConfig(),fetchImpl=fetch,random=()=>randomBytes(24).toString('base64url'),uuid=randomUUID}={}){
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');const send=(s,x)=>{res.statusCode=s;res.end(JSON.stringify(x));};
 if(req.method!=='POST')return send(405,{error:'Use POST'});
 const origin=req.headers.origin;if(origin&&origin!==`https://${req.headers.host}`&&!(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)&&/^localhost:|^127\.0\.0\.1:/.test(req.headers.host??'')))return send(403,{error:'Same-origin request required'});
 if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,{error:'Use JSON'});
 let b;try{let raw=req.body;if(raw===undefined){raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>4096)return send(413,{error:'Request too large'});}}if(typeof raw==='string'&&Buffer.byteLength(raw)>4096)return send(413,{error:'Request too large'});b=typeof raw==='string'?JSON.parse(raw):raw;if(!b||!['request','list','provision','decline','change'].includes(b.action))throw Error();}catch{return send(400,{error:'Invalid account operation'});}
 if(!cfg.url||!cfg.publicKey||!cfg.serviceKey)return send(503,{error:'Account service unavailable'});
 const ctx={cfg,fetchImpl};
 try{
 let actor;
 if(['list','provision','decline'].includes(b.action)){
  const token=String(req.headers.authorization??'').replace(/^Bearer /,'');if(!token)return send(403,{error:'Admin sign-in required'});
  const h={apikey:cfg.publicKey,authorization:`Bearer ${token}`,'content-type':'application/json'};
  const [u,a]=await Promise.all([fetchImpl(`${cfg.url}/auth/v1/user`,{headers:h,signal:AbortSignal.timeout(10000)}),fetchImpl(`${cfg.url}/rest/v1/rpc/is_app_admin`,{method:'POST',headers:h,body:'{}',signal:AbortSignal.timeout(10000)})]);
  if(!u.ok||!a.ok)return send(403,{error:'Admin sign-in required'});const user=await u.json();if(await a.json()!==true||!user.id)return send(403,{error:'Admin access required'});actor=user.id;
 }
 if(b.action==='request'){
  if(b.website)return send(400,{error:'Request unavailable'});const alias=loginAlias(b.alias),email=String(b.email??'').trim().toLowerCase(),role=b.role||null;
  if(email&&(email.length>254||!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)))return send(400,{error:'Use an email address only, without a name'});
  if(role&&!PROFESSIONAL_ROLES.includes(role))return send(400,{error:'Choose a professional role'});
  const r=await managedRpc('request',{alias,email,role},ctx);return send(r.limited?429:200,r.limited?{error:'Access requests are temporarily limited. Please try again later.'}:r);
 }
 if(b.action==='list')return send(200,await managedRpc('list',{actor},ctx));
 if(b.action==='decline')return send(200,await managedRpc('decline',{actor,request:b.request},ctx));
 if(b.action==='provision'){
  const alias=loginAlias(b.alias),role=b.role||null;if(role&&!PROFESSIONAL_ROLES.includes(role))return send(400,{error:'Choose a professional role'});
  // A retry may finish a failed setup, but never replaces an ordinary account.
  const p=await fetchImpl(`${cfg.url}/rest/v1/account_profiles?login_alias=eq.${encodeURIComponent(alias)}&select=user_id`,{headers:serverHeaders(cfg.serviceKey),signal:AbortSignal.timeout(10000)});if(!p.ok)throw Error('Account status unavailable');const existing=await p.json();let user;
  if(existing.length){const found=await nativeAuth(`admin/users/${existing[0].user_id}`,'GET',null,ctx);user=found.user??found;if(user.app_metadata?.pv_managed!==true)return send(409,{error:'That user ID already belongs to an existing account.'});}
  else{const created=await nativeAuth('admin/users','POST',{email:`${uuid()}@accounts.pvinfo.org`,password:random(),email_confirm:true,user_metadata:{login_alias:alias,professional_role:role},app_metadata:{pv_managed:true}},ctx);user=created.user??created;}
  if(!user?.id)throw Error('Account creation could not be confirmed');const temporary=`PV!${random()}`;
  const r=await managedRpc('register',{actor,user:user.id,alias,temporary,request:b.request||null},ctx);
  return send(200,{alias,temporary,expires:r.expires});
 }
 if(b.action==='change'){
  const alias=loginAlias(b.alias);if(typeof b.password!=='string'||!b.password||b.password.length>64||typeof b.newPassword!=='string'||b.newPassword.length<12||b.newPassword.length>72||b.password===b.newPassword)return send(400,{error:'Choose a different permanent password with 12–72 characters.'});
  const lookup=await fetchImpl(`${cfg.url}/rest/v1/rpc/resolve_login_alias`,{method:'POST',headers:serverHeaders(cfg.serviceKey),body:JSON.stringify({p_alias:alias}),signal:AbortSignal.timeout(10000)});if(!lookup.ok)throw Error('Sign-in unavailable');const found=await lookup.json();if(!found.allowed)return send(429,{error:'Too many attempts. Try again later.'});
  const claim=await managedRpc('claim',{alias,password:b.password},ctx);if(!claim.valid)return send(401,{error:'Temporary credentials are incorrect, expired or already in use. Ask the administrator to reissue pending credentials if necessary.'});
  await nativeAuth(`admin/users/${claim.user}`,'PUT',{password:b.newPassword},ctx);
  await managedRpc('finish',{user:claim.user,lease:claim.lease},ctx);
  // Do not return the internal email or a session here. Log in using the new
  // permanent password through the normal alias endpoint after activation.
  return send(200,{ok:true});
 }
 }catch(e){return send(400,{error:e.message||'Account operation unavailable'});}
}
export default accountAccess;
