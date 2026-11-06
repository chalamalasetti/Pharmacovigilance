import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {downloadSource} from '../scripts/evidence/prepare.mjs';
test('official source retrieval identifies the client and retries transient failures with a bounded limit',async()=>{
 let calls=0;const waits=[];
 const result=await downloadSource('https://www.fda.gov/media/76860/download?attachment=',{pause:async ms=>waits.push(ms),fetcher:async(url,options)=>{calls++;assert.match(options.headers['user-agent'],/^PVInfo\//);return calls===1?new Response('unavailable',{status:404}):new Response('source bytes');}});
 assert.equal(result.toString(),'source bytes');assert.equal(calls,2);assert.deepEqual(waits,[2000]);
 calls=0;await assert.rejects(downloadSource('https://www.fda.gov/media/76860/download?attachment=',{pause:async()=>{},fetcher:async()=>{calls++;return new Response('unavailable',{status:503});}}),/HTTP 503/);assert.equal(calls,3);
});
test('repository preserves approval scope, nonapproval listings, status dates, identity and text search',()=>{
 const script=String.raw`
import sys,tempfile,pathlib,sqlite3,json,io
sys.path.insert(0,'scripts/evidence')
from build import Repository,stream_results,iso
with tempfile.TemporaryDirectory() as tmp:
 r=Repository(pathlib.Path(tmp)/'test.sqlite')
 r.source='fda-drugsfda'
 r.drugsfda({'application_number':'NDA000001','sponsor_name':'Fictional','products':[{'product_number':'001','brand_name':'Fixture','dosage_form':None,'route':None,'active_ingredients':[{'name':'Ingredient salt','strength':None}]}],'submissions':[{'submission_type':'ORIG','submission_number':'1','submission_status':'AP','submission_status_date':'20000101'},{'submission_type':'SUPPL','submission_number':'2','submission_status':'AP','submission_status_date':'20100101','submission_class_code':'LABELING'}]})
 assert r.db.execute('SELECT approval_date FROM products').fetchone()[0]=='2000-01-01'
 assert 'application level' in r.db.execute('SELECT approval_date_meaning FROM products').fetchone()[0]
 assert r.db.execute("SELECT count(*) FROM events WHERE event_type='labeling_supplement_approval'").fetchone()[0]==1
 r.source='fda-ndc';r.ndc({'product_id':'x','product_ndc':'0001-01','brand_name':'Fixture','marketing_start_date':'20200101','marketing_end_date':'20240101','active_ingredients':[{'name':'Ingredient salt'}],'application_number':'NDA000001'})
 row=r.db.execute("SELECT approval_date,withdrawal_date FROM products WHERE source_id='fda-ndc'").fetchone();assert row==(None,None)
 r.source='fda-label';r.label({'id':'doc','set_id':'set','version':'1','effective_time':'20210101','openfda':{'application_number':['NDA000001']},'warnings':['Anaphylaxis was reported.']})
 r.db.execute("INSERT INTO label_text_search(label_text_search) VALUES('rebuild')")
 assert r.db.execute("SELECT count(*) FROM label_text_search WHERE label_text_search MATCH 'anaphylaxis'").fetchone()[0]==1
 assert r.db.execute('SELECT count(*) FROM product_label_links').fetchone()[0]==2
 assert r.db.execute('SELECT count(*) FROM ingredients').fetchone()[0]==1
 assert iso('before 1982-01-01') is None
 assert iso('20200230') is None
 assert list(stream_results(io.BytesIO(b'{"meta":{},"results":[{"x":1},{"x":2}]}')))==[{'x':1},{'x':2}]
 try:list(stream_results(io.BytesIO(b'{"results":[{"x":1}')));raise AssertionError('truncation accepted')
 except ValueError:pass
 print('Evidence semantics and full-text checks passed')
 `;
 assert.match(execFileSync('python3',['-c',script],{encoding:'utf8'}),/checks passed/);
});
