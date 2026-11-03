export const RUNTIME_SCHEMA=1;
export const MAX_COMPRESSED_BYTES=64*1024*1024;
export const validRuntimePath=p=>typeof p==='string'&&(/^(?:feed\.xml|data\/(?:updates|research|site|status|coverage|resources)\.json|data\/sources\/registry\.json|data\/companies\/(?:[a-z0-9][a-z0-9-]{0,79})\.json|data\/clinical\/(?:[a-z0-9][a-z0-9-]{0,79})\.json)$/.test(p));
export function validateManifest(m){
 if(m?.schema!==RUNTIME_SCHEMA||!m.files||Array.isArray(m.files)||typeof m.files!=='object')throw Error('Invalid runtime manifest');
 const files=Object.entries(m.files);if(!files.length||files.length>600)throw Error('Invalid runtime file count');let bytes=0;
 for(const [p,f] of files){if(!validRuntimePath(p)||!f||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>16*1024*1024||!Number.isSafeInteger(f.rawBytes)||f.rawBytes<1||f.rawBytes>64*1024*1024||!Number.isInteger(f.parts)||f.parts<1||f.parts>32)throw Error('Invalid runtime file');bytes+=f.bytes;}
 if(bytes>MAX_COMPRESSED_BYTES)throw Error('Runtime snapshot exceeds the compressed cache budget');
 for(const p of ['data/updates.json','data/status.json','data/site.json','feed.xml'])if(!m.files[p])throw Error('Required runtime file missing');return m;
}
export const runtimeRestUrl=(cfg,table,query)=>`${cfg.supabaseUrl.replace(/\/$/,'')}/rest/v1/${table}?${query}`;
