import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {trimDeploy} from '../scripts/trim-deploy.mjs';
import {validRuntimePath} from '../public/runtime-data-lib.js';

test('trimDeploy drops only runtime-served bulk files and keeps the indexes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'trim-'));
 await mkdir(path.join(root,'data/clinical'),{recursive:true});await mkdir(path.join(root,'data/substances'),{recursive:true});await mkdir(path.join(root,'data/companies'),{recursive:true});
 for(const f of ['data/clinical/index.json','data/clinical/pfizer.json','data/substances/index.json','data/substances/shard-0a.json','data/companies/pfizer.json'])await writeFile(path.join(root,f),'{}');
 const r=await trimDeploy({root});
 assert.equal(r.removed,2);
 assert.deepEqual(await readdir(path.join(root,'data/clinical')),['index.json']);
 assert.deepEqual(await readdir(path.join(root,'data/substances')),['index.json']);
 assert.deepEqual(await readdir(path.join(root,'data/companies')),['pfizer.json']);
});

test('every trimmed file type is still served by the runtime snapshot',()=>{
 assert.ok(validRuntimePath('data/clinical/pfizer.json'));
 assert.ok(validRuntimePath('data/substances/shard-0a.json'));
});
