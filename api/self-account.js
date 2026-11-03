import {randomBytes,randomUUID,createHash} from 'node:crypto';import {cloudConfig} from '../scripts/cloud.mjs';import {selfRpc,nativeAuth,statusRpc,ensureRestrictedLogin} from '../scripts/managed-accounts.mjs';import {text} from '../public/action-center-lib.js';
import {loginAlias,PROFESSIONAL_ROLES} from '../public/account-auth.js';
export function recoveryHash(code){const value=String(code??'').replace(/[\s-]/g,'').toLowerCase();if(!/^[a-f0-9]{32}$/.test(value))throw Error('Enter one complete recovery code.');return createHash('sha256').update(value).digest('hex');}
const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=72;
export async function selfAccount(req,res,{cfg=cloudConfig(),fetchImpl=fetch,uuid=randomUUID,codeFactory=()=>randomBytes(16).toString('hex')}={}){
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');const send=(s,b)=>{res.statusCode=s;res.end(JSON.stringify(b));};
 if(req.method!=='POST')return send(405,{error:'Use POST'});const origin=req.headers.origin;
 if(origin&&origin!==`https://${req.headers.host}`&&!(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)&&/^localhost:|^127\.0\.0\.1:/.test(req.headers.host??'')))return send(403,{error:'Same-origin request required'});
 if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,{error:'Use JSON'});
 let b;try{let raw=req.body;if(raw===undefined){raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>4096)return send(413,{error:'Request too large'});}}if(typeof raw==='string'&&Buffer.byteLength(raw)>4096)return send(413,{error:'Request too large'});b=typeof raw==='string'?JSON.parse(raw):raw;if(!b||!['signup','list','approve','decline','codes','recover','support','support-review','status','message','reconsider'].includes(b.action))throw Error();}catch{return send(400,{error:'Invalid account operation'});}
 if(!cfg.url||!cfg.publicKey||!cfg.serviceKey)return send(503,{error:'Account service unavailable'});const ctx={cfg,fetchImpl};let consumed=false,replacement=null;
 try{
 let actor;
 if(['list','approve','decline','codes','support-review','status','message','reconsider'].includes(b.action)){
  const token=String(req.headers.authorization??'').replace(/^Bearer /,'');if(!token)return send(403,{error:'Sign in required'});const h={apikey:cfg.publicKey,authorization:`Bearer ${token}`,'content-type':'application/json'};
  const r=await fetchImpl(`${cfg.url}/auth/v1/user`,{headers:h,signal:AbortSignal.timeout(10000)});if(!r.ok)return send(403,{error:'Sign in again'});const u=await r.json();if(!u.id)return send(403,{error:'Sign in again'});actor=u.id;
  if(!['codes','status','reconsider'].includes(b.action)){const a=await fetchImpl(`${cfg.url}/rest/v1/rpc/is_app_admin`,{method:'POST',headers:h,body:'{}',signal:AbortSignal.timeout(10000)});if(!a.ok||await a.json()!==true)return send(403,{error:'Admin access required'});}
 }
 if(['signup','recover','support'].includes(b.action)){
  if(b.website)return send(400,{error:'Request unavailable'});const identifier=b.action==='signup'?loginAlias(b.alias):String(b.identifier??'').trim().toLowerCase();if(identifier.length<3||identifier.length>254)return send(400,{error:'Enter your user ID or existing account email.'});
  const budget=await selfRpc('budget',{identifier,mode:b.action==='recover'?'recovery':b.action},ctx);if(!budget.allowed)return send(429,{error:'Too many requests. Please try again later.'});
  if(b.action==='support')return send(200,await selfRpc('support',{identifier},ctx));
  if(!validPassword(b.password))return send(400,{error:'Use a password with 12–72 characters.'});
  if(b.action==='recover'){
   await ensureRestrictedLogin(identifier,ctx);
   const claim=await selfRpc('recovery-claim',{identifier,hash:recoveryHash(b.code)},ctx);if(!claim.valid)return send(401,{error:'Recovery code is invalid, already used, or the account is not approved.'});consumed=true;
   const key=codeFactory();await statusRpc('recovery-key',{user:claim.user,token:claim.token,hash:recoveryHash(key)},ctx);replacement=key.match(/.{8}/g).join('-');
   await nativeAuth(`admin/users/${claim.user}`,'PUT',{password:b.password},ctx);return send(200,{ok:true,codes:[replacement]});
  }
  const role=b.role||null;if(role&&!PROFESSIONAL_ROLES.includes(role))return send(400,{error:'Choose a professional role'});
  const made=await nativeAuth('admin/users','POST',{email:`${uuid()}@accounts.pvinfo.org`,password:b.password,email_confirm:true,role:'pv_pending',ban_duration:'none',user_metadata:{login_alias:identifier,professional_role:role},app_metadata:{pv_self_signup:true}},ctx),u=made.user??made;if(!u.id)throw Error('Signup could not be confirmed.');
  const codes=Array.from({length:1},()=>codeFactory()),registered=await selfRpc('register',{user:u.id,hashes:codes.map(recoveryHash)},ctx);
  return send(200,{reference:registered.reference,codes:codes.map(c=>c.match(/.{8}/g).join('-'))});
 }
 if(b.action==='status')return send(200,await statusRpc('status',{user:actor},ctx));
 if(b.action==='reconsider')return send(200,await statusRpc('reconsider',{user:actor},ctx));
 if(b.action==='message')return send(200,await statusRpc('message',{actor,user:b.user,body:text(b.message,'Administrator message',2000)},ctx));
 if(b.action==='list')return send(200,await selfRpc('list',{actor},ctx));
 if(b.action==='approve'){const claim=await selfRpc('approval-claim',{actor,user:b.user},ctx);await nativeAuth(`admin/users/${claim.user}`,'PUT',{role:'authenticated',ban_duration:'none'},ctx);await selfRpc('approval-finish',{actor,user:claim.user,lease:claim.lease},ctx);return send(200,{ok:true});}
 if(b.action==='decline'){const body=text(b.message,'Reason for declining',2000);await ensureRestrictedLogin('',ctx,b.user);await selfRpc('decline',{actor,user:b.user},ctx);await statusRpc('message',{actor,user:b.user,body},ctx);return send(200,{ok:true});}
 if(b.action==='support-review'){if(!['Identity verification needed','User recovered with a code','Duplicate / no action'].includes(b.outcome))return send(400,{error:'Choose a review outcome'});return send(200,await selfRpc('support-review',{actor,reference:b.reference,outcome:b.outcome},ctx));}
 if(b.action==='codes'){const codes=Array.from({length:1},()=>codeFactory());await selfRpc('codes',{user:actor,hashes:codes.map(recoveryHash)},ctx);return send(200,{codes:codes.map(c=>c.match(/.{8}/g).join('-'))});}
 }catch(e){return send(400,{error:consumed?'Reset could not be confirmed. The old recovery key has been used. Try signing in with the new password. Save the replacement key below if one is provided.':b.action==='signup'?'Signup could not be completed. That user ID may already be registered. Existing users should sign in; new registrations need admin approval.':e.message||'Account operation unavailable',...(replacement?{codes:[replacement]}:{})});}
}
export default selfAccount;
