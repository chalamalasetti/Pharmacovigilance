import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
const decision=createRequire(import.meta.url)('../scripts/refresh-gate.cjs'),now=Date.parse('2026-11-01T20:07:00Z');
const recent={id:1,head_sha:'main-sha',conclusion:'success',refreshed:true,created_at:'2026-11-01T20:00:00Z'};
test('overlapping cron and hourly dispatcher produce one refresh; later refreshes, failures, new code and explicit overrides run',()=>{
 const options={runs:[recent],now,headSha:'main-sha',eventName:'schedule'};assert.equal(decision(options).run,false);assert.equal(decision({...options,eventName:'workflow_dispatch'}).run,false);
 assert.equal(decision({...options,now:now+60*60*1000}).run,true);assert.equal(decision({...options,runs:[{...recent,conclusion:'failure'}]}).run,true);assert.equal(decision({...options,headSha:'new-main'}).run,true);assert.equal(decision({...options,force:true}).run,true);assert.equal(decision({...options,runs:[{...recent,refreshed:false}]}).run,true);assert.equal(decision({...options,eventName:'push'}).run,true);assert.equal(decision({...options,runs:[{...recent,created_at:'invalid'}]}).run,true);
});
test('build fallback skips both cache branches and work previews while preserving main and hook builds',()=>{
 for(const [ref,expected] of [['main',1],['',1],['fda-feed-cache',0],['regulatory-document-cache',0],['codex/test',0],['claude/test',0]])assert.equal(spawnSync(process.execPath,['scripts/ignore-build.mjs'],{env:{...process.env,VERCEL_GIT_COMMIT_REF:ref}}).status,expected,ref);
});
