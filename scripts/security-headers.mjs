import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function securityHeaders(base=root){
 const hashes=new Set();for(const name of await readdir(path.join(base,'public'))){if(!name.endsWith('.html'))continue;const html=await readFile(path.join(base,'public',name),'utf8');for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=/i.test(match[1])||/type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(match[1]))continue;if(match[2].trim())hashes.add("'sha256-"+createHash('sha256').update(match[2]).digest('base64')+"'");}}
 const csp=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'","script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval' "+[...hashes].sort().join(' '),"style-src 'self' 'unsafe-inline'","img-src 'self' https: data: blob:","font-src 'self' data:","connect-src 'self' https: wss://*.supabase.co","worker-src 'self' blob:","frame-src 'self' blob:","manifest-src 'self'"].join('; ');
 return [{key:'Content-Security-Policy',value:csp},{key:'X-Frame-Options',value:'DENY'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}];
}
export async function writeSecurityHeaders(){const file=path.join(root,'vercel.json'),cfg=JSON.parse(await readFile(file,'utf8'));cfg.headers=cfg.headers.filter(h=>h.source!=='/(.*)');cfg.headers.unshift({source:'/(.*)',headers:await securityHeaders()});await writeFile(file,JSON.stringify(cfg,null,2)+'\n');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await writeSecurityHeaders();
