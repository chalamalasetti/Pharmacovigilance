"""Produce bounded, escaped SQL seed batches for a reviewed import operation (not publication).
Usage: python scripts/e2b-seed.py public/e2b-catalog.json /tmp/e2b-seed
Apply metadata.sql first, then fields-*.sql. No credentials or network are used.
"""
import json,pathlib,sys
src=json.loads(pathlib.Path(sys.argv[1]).read_text());out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
def literal(v):return "'"+str(v).replace("'","''")+"'"
def j(v):return literal(json.dumps(v,ensure_ascii=False,separators=(',',':')))+'::jsonb'
meta='insert into public.e2b_catalogs(id,sources,references_json,coverage,content_hash) values('+','.join([literal(src['id']),j(src['sources']),j(src['references']),j(src['coverage']),literal(src['contentHash'])])+') on conflict(id) do nothing;'
(out/'metadata.sql').write_text(meta)
for k in range(0,len(src['records']),40):
 rows=src['records'][k:k+40];sql='insert into public.e2b_fields(catalog_id,field_key,field_hash,body) values '+','.join('('+','.join([literal(src['id']),literal(r['key']),literal(r['hash']),j(r)])+')' for r in rows)+' on conflict(catalog_id,field_key) do nothing;'
 (out/('fields-%03d.sql'%(k//40))).write_text(sql)
print(json.dumps({'metadata':'metadata.sql','batches':(len(src['records'])+39)//40,'records':len(src['records'])}))
