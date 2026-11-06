"""Build a source-linked SQLite repository from complete published bulk partitions.
No company-manifest filtering, patient data, guessed withdrawal dates or bundled MedDRA.
"""
import argparse,csv,datetime,gzip,hashlib,io,json,os,pathlib,re,shutil,sqlite3,subprocess,sys,tempfile,time,urllib.request,urllib.parse,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
SAFETY=['boxed_warning','warnings','warnings_and_cautions','adverse_reactions','contraindications','precautions','drug_interactions','general_precautions','use_in_specific_populations','pregnancy','nursing_mothers','pediatric_use','geriatric_use','overdosage']
def js(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def digest(v):return hashlib.sha256(v if isinstance(v,bytes) else js(v).encode()).hexdigest()
def iso(v):
 s=str(v or '').strip()
 for fmt in ['%Y%m%d','%Y-%m-%d','%Y-%m-%d %H:%M:%S','%d-%b-%Y','%d-%b-%y','%B %d, %Y','%b %d, %Y','%d/%m/%Y']:
  try:return datetime.datetime.strptime(s,fmt).date().isoformat()
  except ValueError:pass
 return None
def stream_results(handle):
 """Incremental top-level results array; one source record in memory at a time."""
 text=io.TextIOWrapper(handle,encoding='utf-8-sig');buf='';dec=json.JSONDecoder()
 while True:
  part=text.read(65536)
  if not part:raise ValueError('Missing results array')
  buf+=part;m=re.search(r'"results"\s*:\s*\[',buf)
  if m:buf=buf[m.end():];break
  if len(buf)>2_000_000:raise ValueError('Unexpected bulk header')
 while True:
  buf=buf.lstrip()
  if buf.startswith(']'):return
  if buf.startswith(','):buf=buf[1:].lstrip()
  try:value,end=dec.raw_decode(buf)
  except json.JSONDecodeError:
   part=text.read(65536)
   if not part:raise ValueError('Truncated bulk JSON')
   buf+=part
   if len(buf)>50_000_000:raise ValueError('Oversized source record')
   continue
  yield value;buf=buf[end:]
def download(url,path,limit=400_000_000):
 host=urllib.parse.urlsplit(url).hostname
 if host not in {'api.fda.gov','download.open.fda.gov','www.canada.ca','raw.githubusercontent.com'}:raise ValueError('Unapproved download host')
 if path.exists():return path
 tmp=path.with_suffix('.part')
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'PVInfo-EvidenceRepository/1.0 (+https://www.pvinfo.org)'})
   with urllib.request.urlopen(req,timeout=120) as response,open(tmp,'wb') as out:
    n=0
    while chunk:=response.read(1024*1024):
     n+=len(chunk)
     if n>limit:raise ValueError('Source exceeds size limit')
     out.write(chunk)
   tmp.replace(path);return path
  except Exception:
   tmp.unlink(missing_ok=True)
   if attempt==2:raise
   time.sleep(2*(attempt+1))
def checksum(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  while chunk:=f.read(1024*1024):h.update(chunk)
 return h.hexdigest()
class Repository:
 def __init__(self,path):
  self.path=path;self.db=sqlite3.connect(path);self.db.execute('PRAGMA journal_mode=DELETE');self.db.execute('PRAGMA synchronous=NORMAL');self.db.execute('PRAGMA foreign_keys=ON');self.source=None;self.part=None
  self.db.executescript('''
CREATE TABLE products(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,market TEXT NOT NULL,source_key TEXT NOT NULL,brand TEXT,company TEXT,company_role TEXT,status TEXT,product_class TEXT,ingredients_json TEXT,form TEXT,strength TEXT,approval_date TEXT,approval_date_meaning TEXT,withdrawal_date TEXT,source_url TEXT,source_hash TEXT,locator TEXT);
CREATE TABLE identifiers(entity_type TEXT,entity_id TEXT,market TEXT,kind TEXT,value TEXT,PRIMARY KEY(entity_type,entity_id,kind,value));
CREATE INDEX identifier_lookup ON identifiers(market,kind,value);
CREATE TABLE ingredients(id TEXT PRIMARY KEY,name TEXT NOT NULL,normalization TEXT NOT NULL);
CREATE TABLE product_ingredients(product_id TEXT REFERENCES products(id),ingredient_id TEXT REFERENCES ingredients(id),strength TEXT,PRIMARY KEY(product_id,ingredient_id,strength));
CREATE TABLE events(id TEXT PRIMARY KEY,source_id TEXT,market TEXT,entity_id TEXT,event_type TEXT,date TEXT,date_raw TEXT,status TEXT,detail TEXT,source_url TEXT,source_hash TEXT,locator TEXT);
CREATE TABLE labels(id TEXT PRIMARY KEY,source_id TEXT,set_id TEXT,version TEXT,effective_date TEXT,effective_time_raw TEXT,brands_json TEXT,ingredients_json TEXT,companies_json TEXT,source_url TEXT,source_hash TEXT,locator TEXT);
CREATE TABLE label_sections(id INTEGER PRIMARY KEY,label_id TEXT REFERENCES labels(id),section TEXT,text TEXT);
CREATE VIRTUAL TABLE label_text_search USING fts5(text,content='label_sections',content_rowid='id');
CREATE TABLE source_files(source_id TEXT,url TEXT,retrieved_at TEXT,sha256 TEXT,source_export_date TEXT,expected_records INTEGER,loaded_records INTEGER);
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
CREATE VIEW product_label_links AS SELECT DISTINCT p.entity_id product_id,l.entity_id label_id,p.kind match_level,p.value matched_identifier FROM identifiers p JOIN identifiers l ON p.market=l.market AND p.kind=l.kind AND p.value=l.value WHERE p.entity_type='product' AND l.entity_type='label';
''')
 def ident(self,typ,eid,market,kind,values):
  for v in values:
   if v:self.db.execute('INSERT OR IGNORE INTO identifiers VALUES(?,?,?,?,?)',(typ,eid,market,kind,str(v).replace(' ','') if kind=='application' else str(v)))
 def product(self,key,market,brand='',company='',role='',status='',cls='',ingredients=None,form='',strength='',approval=None,meaning='',url='',locator='',raw=None):
  pid=self.source+':'+str(key);ingredients=[x for x in (ingredients or []) if x]
  self.db.execute('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,self.source,market,str(key),brand,company,role,status,cls,js(ingredients),form,strength,approval,meaning,None,url,digest(raw or [key,brand,ingredients,status]),locator))
  for name in ingredients:
   iid=digest(str(name).casefold().strip());self.db.execute('INSERT OR IGNORE INTO ingredients VALUES(?,?,?)',(iid,name,'Exact casefolded source name; salts and synonyms not merged'));self.db.execute('INSERT OR IGNORE INTO product_ingredients VALUES(?,?,?)',(pid,iid,strength))
  return pid
 def event(self,key,market,eid,kind,date,rawdate,status,detail,url,raw,locator=''):
  self.db.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(self.source+':'+str(key),self.source,market,eid,kind,date,str(rawdate or ''),status,detail,url,digest(raw),locator))
 def sourcefile(self,url,path,expected,loaded,export=None):self.db.execute('INSERT INTO source_files VALUES(?,?,?,?,?,?,?)',(self.source,url,datetime.datetime.now(datetime.timezone.utc).isoformat(),checksum(path),export,expected,loaded))
 def drugsfda(self,r):
  app=r['application_number'];url='https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo='+re.sub(r'\D','',app)
  approvals=[iso(s.get('submission_status_date')) for s in r.get('submissions',[]) if s.get('submission_type')=='ORIG' and s.get('submission_status')=='AP'];approval=min([d for d in approvals if d],default=None)
  for p in r.get('products',[]):
   pid=self.product(app+':'+p['product_number'],'US',p.get('brand_name',''),r.get('sponsor_name',''),'Application sponsor',p.get('marketing_status',''),'Drug application product',[a.get('name') for a in p.get('active_ingredients',[])],(p.get('dosage_form') or '')+' / '+(p.get('route') or ''),'; '.join((a.get('strength') or '') for a in p.get('active_ingredients',[])),approval,'Earliest captured approved ORIG submission at application level',url,'Application '+app+' / product '+p['product_number'],p)
   self.ident('product',pid,'US','application',[app])
  for s in r.get('submissions',[]):
   key=app+':'+':'.join(str(s.get(k,'')) for k in ['submission_type','submission_number','submission_status','submission_status_date'])
   kind='original_application_approval' if s.get('submission_type')=='ORIG' and s.get('submission_status')=='AP' else 'labeling_supplement_approval' if s.get('submission_status')=='AP' and 'LABEL' in s.get('submission_class_code','') else 'submission_status'
   self.event(key,'US',app,kind,iso(s.get('submission_status_date')),s.get('submission_status_date'),s.get('submission_status',''),js(s),url,s,'Application submission; not a term-specific change')
 def ndc(self,r):
  key=r.get('product_id') or r['product_ndc'];url='https://dailymed.nlm.nih.gov/dailymed/search.cfm?query='+urllib.parse.quote(r['product_ndc']);pid=self.product(key,'US',r.get('brand_name') or r.get('generic_name',''),r.get('labeler_name',''),'NDC labeler',r.get('marketing_category',''),r.get('product_type',''),[a.get('name') for a in r.get('active_ingredients',[])],r.get('dosage_form',''),'; '.join((a.get('strength') or '') for a in r.get('active_ingredients',[])),url=url,locator='NDC '+r['product_ndc'],raw=r)
  self.ident('product',pid,'US','ndc',[r['product_ndc']]);app=r.get('application_number','');self.ident('product',pid,'US','application',[app] if re.fullmatch(r'(NDA|ANDA|BLA)\d+',app) else []);self.ident('product',pid,'US','spl_set_id',r.get('openfda',{}).get('spl_set_id',[]))
  for field,kind in [('marketing_start_date','marketing_start'),('marketing_end_date','marketing_end'),('listing_expiration_date','listing_expiration')]:
   if r.get(field):self.event(key+':'+field,'US',pid,kind,iso(r[field]),r[field],'Source listing date','Not an approval or safety withdrawal date',url,r,field)
 def label(self,r):
  sid=r.get('set_id');lid='fda-label:'+r['id'];o=r.get('openfda',{});url='https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid='+str(sid)
  self.db.execute('INSERT INTO labels VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(lid,self.source,sid,str(r.get('version','')),iso(r.get('effective_time')),r.get('effective_time'),js(o.get('brand_name',[])),js(o.get('substance_name',[])),js(o.get('manufacturer_name',[])),url,digest(r),'openFDA document '+r['id']))
  for field in SAFETY:
   values=r.get(field,[])
   if isinstance(values,list):
    for text in values:
     if isinstance(text,str) and text.strip():self.db.execute('INSERT INTO label_sections(label_id,section,text) VALUES(?,?,?)',(lid,field,text))
  for kind,key in [('application','application_number'),('ndc','product_ndc')]:self.ident('label',lid,'US',kind,o.get(key,[]))
  self.ident('label',lid,'US','spl_set_id',[sid])
 def supplemental(self,source,path):
  data=json.load(open(path));rows=data['rows'];self.source=source
  if source=='fda-orange-book':
   for r in rows:
    rawdate=r.get('date');pid=self.product(r['recordKey'],'US',r['brand'],r['holder'],r['role'],r['status'],'Orange Book presentation',r['ingredients'],'; '.join(r['forms']),'; '.join(r['strengths']),iso(rawdate),'Source product approval; raw qualifier retained in events',r['url'],r['locator'],r);self.ident('product',pid,'US','application',[r['authId']]);self.event(r['recordKey']+':approval','US',pid,'product_approval',iso(rawdate),rawdate,r['status'],'Exact date unknown when source says before',r['url'],r)
  else:
   hi=next(i for i,row in enumerate(rows) if any(re.fullmatch('name of medicine|medicine name',str(x),re.I) for x in row));head=rows[hi]
   def field(row,pattern):
    at=next((i for i,x in enumerate(head) if re.search(pattern,str(x),re.I)),None);return row[at] if at is not None and at<len(row) else ''
   for n,row in enumerate(rows[hi+1:]):
    brand=field(row,'^(name of medicine|medicine name)$');category=field(row,'^category$')
    if not brand or category and 'human' not in category.lower():continue
    key=field(row,'product number') or str(n);status=field(row,'^(medicine status|authorisation status)$');date=field(row,'^marketing authorisation date$');approval=iso(date)
    if re.fullmatch(r'\d+(\.\d+)?',str(date or '')):approval=(datetime.datetime(1899,12,30)+datetime.timedelta(days=float(date))).date().isoformat()
    url=field(row,'url$');ingredients=re.split(r'\s*;\s*|\s+/\s+',field(row,'^active substance$') or field(row,'international non-proprietary name'));pid=self.product(key,'EU',brand,field(row,'marketing authorisation (holder|developer)|applicant / holder|company name'),'Source holder/applicant',status,category,ingredients,approval=approval,meaning='EMA report marketing authorisation date',url=url,locator='EMA product '+key,raw=row);self.ident('product',pid,'EU','ema_product',[key])
    if approval:self.event(key+':approval','EU',pid,'marketing_authorisation',approval,date,status,'EMA source authorisation date',url,row)
    for pattern,kind in [('^Withdrawal of application date$','application_withdrawal'),('^Withdrawal / expiry / revocation / lapse of marketing authorisation date$','authorisation_end'),('^Suspension of marketing authorisation date$','authorisation_suspension'),('^Refusal of marketing authorisation date$','authorisation_refusal'),('^European Commission decision date$','ec_decision')]:
     rawdate=field(row,pattern);dated=iso(rawdate)
     if re.fullmatch(r'\d+(\.\d+)?',str(rawdate or '')):dated=(datetime.datetime(1899,12,30)+datetime.timedelta(days=float(rawdate))).date().isoformat()
     if rawdate:
      self.event(key+':'+kind,'EU',pid,kind,dated,rawdate,status,'EMA field: '+pattern.strip('^$'),url,row)
      if kind=='authorisation_end' and 'withdrawn' in status.lower() and 'application' not in status.lower():self.db.execute('UPDATE products SET withdrawal_date=? WHERE id=?',(dated,pid))

  self.sourcefile(data['url'],path.with_suffix('.source'),len(rows),len(rows))
 def canada(self,archive,suffix):
  def rows(prefix):
   name=next(n for n in archive.namelist() if n.lower()==prefix+suffix+'.txt');return list(csv.reader(io.TextIOWrapper(archive.open(name),encoding='utf-8-sig')))
  products=rows('drug');ing={};comp={};statuses={};forms={}
  for r in rows('ingred'):ing.setdefault(r[0],[]).append(r[2])
  for r in rows('comp'):
   if len(r)>4 and r[4].upper().replace('_',' ')=='DIN OWNER':comp.setdefault(r[0],[]).append(r[3])
  for r in rows('status'):statuses.setdefault(r[0],[]).append(r)
  for r in rows('form'):forms.setdefault(r[0],[]).append(r[2])
  for r in products:
   key=r[0];current=[s[2] for s in statuses.get(key,[]) if s[1].upper()=='Y'];url='https://health-products.canada.ca/dpd-bdpp/info?lang=eng&code='+key
   pid=self.product(key,'CA',r[4],'; '.join(sorted(set(comp.get(key,[])))),'DIN owner', '; '.join(current),r[2],ing.get(key,[]),'; '.join(forms.get(key,[])),url=url,locator='DPD drug code '+key+' / DIN '+r[3],raw=r);self.ident('product',pid,'CA','din',[r[3]])
   approved=[iso(s[3]) for s in statuses.get(key,[]) if s[2]=='APPROVED'];approved=[d for d in approved if d]
   if approved:self.db.execute('UPDATE products SET approval_date=?,approval_date_meaning=? WHERE id=?',(min(approved),'Earliest captured DPD approved-status date; original authorisation not established',pid))
   for i,s in enumerate(statuses.get(key,[])):
    status=s[2];kind='cancellation_status' if 'CANCELLED' in status else 'approval_status' if status=='APPROVED' else 'marketing_status'
    self.event(key+':'+str(i)+':'+status+':'+s[3],'CA',pid,kind,iso(s[3]),s[3],status,'Current flag '+s[1]+'; status history, not inferred safety withdrawal',url,s)
  return len(products)
 def captured(self):
  data=json.load(open(ROOT/'labels/bootstrap.json'));self.source='captured-label-changes'
  for r in data['records']:
   self.event(r['id'],r.get('market',''),r.get('authId') or r['id'],'approved_label_change' if r.get('kind')=='approved_change' else 'recommendation',iso(r.get('published')),r.get('published'),r.get('kind',''),js({k:r.get(k) for k in ['title','topic','sections','incomplete','approvedLabel','priorApprovedLabel']}),r.get('url',''),r,r.get('locator',''))
  self.sourcefile('https://github.com/chalamalasetti/Pharmacovigilance/blob/main/labels/bootstrap.json',ROOT/'labels/bootstrap.json',len(data['records']),len(data['records']),data.get('checked'))
def export_repository(repo,out,report):
 db=repo.db;db.execute('CREATE INDEX event_entity ON events(entity_id)');db.execute('CREATE INDEX product_source ON products(source_id)');db.execute('CREATE INDEX label_source ON labels(source_id)');db.execute("INSERT INTO label_text_search(label_text_search) VALUES('rebuild')");db.commit()
 counts={table:db.execute('SELECT count(*) FROM '+table).fetchone()[0] for table in ['products','ingredients','events','labels','label_sections','identifiers']};report['counts']=counts;report['built']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['schema']='pv-evidence-repository/1';report['safetySections']=SAFETY
 report['limits']=['Source product records overlap across registries; counts are not unique worldwide medicines.','Approval, marketing, cancellation, withdrawal, SPL effective and regulatory change dates retain separate meanings.','withdrawal_date uses a reported authorisation-end date only when EMA explicitly identifies withdrawn authorisation status; reasons are not inferred. Cancellation history remains in events.','Label term search is literal full text, not a licensed MedDRA dictionary or SMQ algorithm.','openFDA label bulk snapshots are not complete version histories. No first term-addition date is inferred.','Identifier links are source-reported associations; application matches are broader than exact presentations.','This is informational evidence requiring qualified human review; not a validated regulatory submission dataset.']
 db.execute('INSERT INTO metadata VALUES(?,?)',('manifest',js(report)));db.commit()
 if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity check failed')
 if db.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Foreign key check failed')
 indexes=[];public=out/'public';public.mkdir(exist_ok=True)
 for source in [s['id'] for s in report['sources']]:
  query=db.execute('SELECT id,market,brand,company,status,ingredients_json,approval_date,approval_date_meaning,withdrawal_date,source_url,source_hash FROM products WHERE source_id=? ORDER BY id',(source,));num=0
  while rows:=query.fetchmany(5000):
   num+=1;records=[dict(zip(['id','market','brand','company','status','ingredients','approvalDate','dateMeaning','withdrawalDate','url','hash'],r)) for r in rows]
   for r in records:
    r['ingredients']=json.loads(r['ingredients']);r['dates']=[{'type':e[0],'date':e[1],'raw':e[2],'status':e[3]} for e in db.execute('SELECT event_type,date,date_raw,status FROM events WHERE entity_id=?',(r['id'],))]
   name=f'{source}-{num:04}.json.gz';path=public/name
   with gzip.open(path,'wt',encoding='utf-8',compresslevel=6) as f:json.dump(records,f,ensure_ascii=False,separators=(',',':'))
   indexes.append({'source':source,'path':name,'records':len(records),'bytes':path.stat().st_size,'sha256':checksum(path),'type':'products'})
  for start in range(0,db.execute('SELECT count(*) FROM labels WHERE source_id=?',(source,)).fetchone()[0],5000):
   rows=db.execute('SELECT id,set_id,version,effective_date,brands_json,ingredients_json,companies_json,source_url,source_hash FROM labels WHERE source_id=? ORDER BY id LIMIT 5000 OFFSET ?',(source,start)).fetchall();records=[]
   for r in rows:records.append({'id':r[0],'setid':r[1],'version':r[2],'effectiveDate':r[3],'brand':' / '.join(json.loads(r[4])),'ingredients':json.loads(r[5]),'company':'; '.join(json.loads(r[6])),'url':r[7],'hash':r[8],'market':'US','dateMeaning':'SPL effective date; not first addition'})
   name=f'{source}-{start//5000+1:04}.json.gz';path=public/name
   with gzip.open(path,'wt',encoding='utf-8',compresslevel=6) as f:json.dump(records,f,ensure_ascii=False,separators=(',',':'))
   indexes.append({'source':source,'path':name,'records':len(records),'bytes':path.stat().st_size,'sha256':checksum(path),'type':'labels'})
 report['indexes']=indexes
 # Portable exports retain all evidence fields. CSV is safe to open in spreadsheet software.
 assets=out/'assets';assets.mkdir(exist_ok=True)
 for table in ['products','ingredients','product_ingredients','events','labels','identifiers','source_files']:
  cur=db.execute('SELECT * FROM '+table);cols=[d[0] for d in cur.description]
  with gzip.open(assets/(table+'.csv.gz'),'wt',encoding='utf-8',newline='') as f:
   writer=csv.writer(f,quoting=csv.QUOTE_ALL);writer.writerow(cols)
   for row in cur:writer.writerow(["'"+v if isinstance(v,str) and re.match(r'^\s*[=+@-]',v) else v for v in row])
 with gzip.open(assets/'label-sections.jsonl.gz','wt',encoding='utf-8',compresslevel=6) as f:
  for row in db.execute('SELECT id,label_id,section,text FROM label_sections'):f.write(js(dict(zip(['id','label_id','section','text'],row)))+'\n')
 db.close();print('Compressing SQLite repository',flush=True)
 with open(repo.path,'rb') as src,gzip.open(assets/'repository.sqlite.gz','wb',compresslevel=6) as dst:shutil.copyfileobj(src,dst,1024*1024)
 pathlib.Path(repo.path).unlink(missing_ok=True)
 report['assets']=[{'name':p.name,'bytes':p.stat().st_size,'sha256':checksum(p)} for p in sorted(assets.iterdir())]
 (public/'manifest.json').write_text(json.dumps(report,indent=2));shutil.copy(ROOT/'evidence/README.md',assets/'README.md');shutil.copy(ROOT/'evidence/sources.json',assets/'source-catalog.json');print(js({'counts':counts,'sources':report['sources']}),flush=True)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--out',default='output/evidence');parser.add_argument('--label-parts',type=int,default=0);parser.add_argument('--no-labels',action='store_true');args=parser.parse_args();out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True);cache=out/'downloads';cache.mkdir(exist_ok=True);handle=tempfile.NamedTemporaryFile(prefix='pv-evidence-',suffix='.sqlite',delete=False);dbpath=pathlib.Path(handle.name);handle.close();repo=Repository(dbpath);repo.db.execute('PRAGMA journal_mode=DELETE');repo.db.execute('PRAGMA synchronous=NORMAL')
 catalog=json.load(open(ROOT/'evidence/sources.json'));report={'sources':[],'completeLabelSnapshot':False,'sourceCatalog':catalog,'developmentSubset':bool(args.label_parts or args.no_labels)}
 subprocess.run(['node','scripts/evidence/prepare.mjs',str(cache)],cwd=ROOT,check=True)
 catalogfile=download('https://api.fda.gov/download.json',cache/'download-catalog.json',10_000_000);bulk=json.load(open(catalogfile))['results']['drug']
 def run_source(source,fn,required=False):
  repo.source=source;repo.db.execute('SAVEPOINT source_import');before=repo.db.total_changes
  try:
   n=fn();repo.db.execute('RELEASE source_import');repo.db.commit();products=repo.db.execute('SELECT count(*) FROM products WHERE source_id=?',(source,)).fetchone()[0];events=repo.db.execute('SELECT count(*) FROM events WHERE source_id=?',(source,)).fetchone()[0];labels=repo.db.execute('SELECT count(*) FROM labels WHERE source_id=?',(source,)).fetchone()[0];report['sources'].append({'id':source,'status':'loaded','sourceRecords':n,'productRecords':products,'events':events,'labels':labels});print(source,'loaded',n,'records',flush=True)
  except Exception as exc:
   repo.db.execute('ROLLBACK TO source_import');repo.db.execute('RELEASE source_import');report['sources'].append({'id':source,'status':'failed','error':str(exc)[:300]});print(source,'FAILED',str(exc),flush=True)
   if required:raise
 for endpoint,source in [('drugsfda','fda-drugsfda'),('ndc','fda-ndc'),('label','fda-label')]:
  if endpoint=='label' and args.no_labels:continue
  def collect(endpoint=endpoint,source=source):
   spec=bulk[endpoint];parts=spec['partitions'];parts=parts[:args.label_parts] if endpoint=='label' and args.label_parts else parts;total=0
   for i,part in enumerate(parts):
    url=part['file'];parsed=urllib.parse.urlsplit(url)
    if parsed.scheme!='https' or parsed.netloc!='download.open.fda.gov' or not parsed.path.startswith('/drug/'+endpoint+'/'):raise ValueError('Unexpected bulk partition URL')
    print(source,f'partition {i+1}/{len(parts)} download',flush=True);file=download(url,cache/(endpoint+'-'+str(i)+'.zip'))
    n=0
    with zipfile.ZipFile(file) as z:
     names=[x for x in z.namelist() if x.endswith('.json')]
     if len(names)!=1:raise ValueError('Expected one bulk JSON file')
     with z.open(names[0]) as handle:
      for r in stream_results(handle):
       if endpoint=='drugsfda':repo.drugsfda(r)
       elif endpoint=='ndc':repo.ndc(r)
       else:repo.label(r)
       n+=1
    if n!=int(part['records']):raise ValueError(f'Partition count mismatch: {n} vs {part["records"]}')
    repo.sourcefile(url,file,int(part['records']),n,spec['export_date']);total+=n;print(source,f'partition {i+1}: {n} records verified',flush=True)
    if endpoint=='label' and not args.label_parts:file.unlink()
   if len(parts)==len(spec['partitions']) and total!=spec['total_records']:raise ValueError('Source total mismatch')
   if endpoint=='label':report['completeLabelSnapshot']=len(parts)==len(spec['partitions'])
   return total
  run_source(source,collect,required=True)
 for source in ['fda-orange-book','ema-medicines']:
  run_source(source,lambda source=source: (repo.supplemental(source,cache/(source+'.json')) or repo.db.execute('SELECT count(*) FROM products WHERE source_id=?',(source,)).fetchone()[0]))
 def canada():
  total=0
  for suffix in ['','_ap','_dr','_ia']:
   url='https://www.canada.ca/content/dam/hc-sc/documents/services/drug-product-database/allfiles'+suffix+'.zip';file=download(url,cache/('ca'+suffix+'.zip'));n=repo.canada(zipfile.ZipFile(file),suffix);repo.sourcefile(url,file,None,n);total+=n;print('Health Canada',suffix or 'marketed',n,flush=True)
  return total
 run_source('hc-dpd',canada);run_source('captured-label-changes',lambda:(repo.captured() or repo.db.execute("SELECT count(*) FROM events WHERE source_id='captured-label-changes'").fetchone()[0]));export_repository(repo,out,report)
if __name__=='__main__':main()
