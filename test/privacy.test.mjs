import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicUpdate, publicText, publicUrl, withoutPersonalFields } from '../public/privacy.js';
import { fromEuropePmc, parsePubmed, collectResearch } from '../scripts/research.mjs';
import { loadRegistry, buildFeeds } from '../scripts/sources.mjs';
import { archiveUpdates } from '../scripts/cloud.mjs';
import * as R from '../public/research-lib.js';

const item = { id: 'a', title: 'Drug safety guidance', summary: 'Effective 1 March 2027. Contact analyst@example.org or +1 (919) 555-0100.', link: 'https://example.org/notice?email=analyst@example.org&id=12', source: 'Authority', authors: ['Example Person'], patientId: '123' };
test('public ingestion allowlist excludes personal fields and harvested contacts without destroying scientific numbers', () => {
  const clean = publicUpdate(item);
  assert.equal(clean.authors, undefined);
  assert.equal(clean.patientId, undefined);
  assert.ok(!JSON.stringify(clean).includes('analyst@example.org'));
  assert.ok(!clean.summary.includes('555-0100'));
  assert.match(clean.summary, /1 March 2027/);
  assert.equal(publicText('ROR 6.39; 95% CI 2.31–4.69; PMID 39000002'), 'ROR 6.39; 95% CI 2.31–4.69; PMID 39000002');
  assert.equal(publicUpdate({ ...item, summary: 'Patient name: Example Person; DOB: 2000-01-01' }), null);
  assert.equal(publicUpdate({ ...item, summary: 'Lives at 123 Example Street.' }), null);
  assert.equal(publicUrl('https://example.org/notice?patient_id=123'), 'https://example.org/notice');
});
test('archive applies the policy again, including legacy records', async () => {
  let rows;
  const r = await archiveUpdates([item, { ...item, id: 'b', summary: 'Patient ID: 42' }], {
    cfg: { url: 'https://db.example', serviceKey: 'key' },
    fetchImpl: async (_url, init) => { rows = JSON.parse(init.body); return { ok: true }; },
  });
  assert.equal(r.saved, 1);
  assert.ok(!JSON.stringify(rows).includes('analyst@example.org'));
});
test('research adapters do not extract author names and saved citation exports omit legacy authors', () => {
  const r = fromEuropePmc({ title: 'Drug safety', authorString: 'Example Person', authorList: { author: [{ fullName: 'Example Person' }] } });
  assert.equal(r.authors, undefined);
  assert.equal(r.authorString, undefined);
  const p = { id: 'x', title: 'Drug safety', authors: ['Example Person'], ids: { doi: '10.1234/test' }, summary: [], tags: { applications: [], methods: [] } };
  assert.ok(!R.ris([p]).includes('Example Person'));
  assert.ok(!R.citation(p).includes('Example Person'));
  assert.equal(R.followedMatch({ topics: [], authors: ['Example Person'] }, p), false);
  const storage = { value: JSON.stringify({ version: 1, authors: ['Example Person'], saved: { x: { paper: p } } }), getItem() { return this.value; }, setItem(_k, v) { this.value = v; } };
  R.loadWatch(storage);
  assert.ok(!storage.value.includes('Example Person'));
  assert.equal(withoutPersonalFields({ authorCount: 2, phone: '123', ids: { pmid: '39000002' } }).ids.pmid, '39000002');
});
test('recent cached research is scrubbed even when collection is skipped', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pv-private-'));
  const out = path.join(dir, 'research.json');
  const now = new Date('2026-10-31T12:00:00Z');
  await writeFile(out, JSON.stringify({ refreshed: now.toISOString(), papers: [{ id: 'x', authors: ['Example Person'], authorString: 'Example Person', title: 'Drug safety', summary: [], tags: { applications: [], methods: [] } }], sources: [] }));
  await collectResearch({ out, now, env: {} });
  assert.ok(!(await readFile(out, 'utf8')).includes('Example Person'));
});
test('managed registry outage never reactivates seeds; empty snapshots are valid', async () => {
  const cfg = { url: 'https://db.example', serviceKey: 'key' };
  const down = async () => { throw new Error('offline'); };
  let seeds = 0;
  const seed = async () => { seeds++; return [{ status: 'active' }]; };
  for (const previous of [async () => null, async () => ({ from: 'repository', sources: [{ status: 'active' }] }), async () => { throw new Error('offline'); }]) {
    await assert.rejects(loadRegistry({ cfg, fetchImpl: down, previous, seed }), /collection stopped/);
  }
  assert.equal(seeds, 0);
  const empty = await loadRegistry({ cfg, fetchImpl: down, previous: async () => ({ from: 'last build', sources: [] }), seed });
  assert.equal(buildFeeds(empty).feeds.length, 0);
  const missingCredentials = await loadRegistry({ cfg: { url: cfg.url }, previous: async () => ({ from: 'database', sources: [{ status: 'paused' }] }), seed });
  assert.equal(buildFeeds(missingCredentials).feeds.length, 0);
  assert.equal((await loadRegistry({ cfg: {}, seed })).from, 'repository');
});
