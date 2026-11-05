"""Offline, deterministic E2B reference extraction. No model/API, case ingestion or schema execution.
Run: python scripts/e2b-extract.py --core-pdf path --fda-xlsx path --regional-pdf path --schemas path --output public/e2b-catalog.json
PDF text is extracted with pdftotext -layout. Review is required before publication.
"""
import argparse,datetime,hashlib,json,pathlib,re,subprocess,zipfile,xml.etree.ElementTree as X
VERSION='e2b-extractor-v1'
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ELEMENT=re.compile(r'^((?:ACK|[NCDEFGH])(?:\.\s*[A-Za-z0-9]+)+)\s+(.+)$')
LABEL=re.compile(r'^\s{1,18}(User Guidance|Conformance|Data Type|OID|Value Allowed|Business Rule\(s\))\s*(.*)$')
def digest(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def safe(s):
 s=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}','[contact omitted]',str(s))
 return s.replace('\x00','').strip()
def pdfpages(path):return subprocess.check_output(['pdftotext','-layout',str(path),'-'],text=True).split('\f')
def page_lines(path):
 lines=[]
 for i,p in enumerate(pdfpages(path)):
  labels=re.findall(r'^\s*-\s*(\d+)\s*-\s*$',p,re.M);label=labels[-1] if labels else str(i+1)
  for line in p.splitlines():
   if 'Contains Nonbinding Recommendations' in line or re.fullmatch(r'\s*-?\s*\d+\s*-?\s*',line):continue
   lines.append((line,i+1,label))
 return lines

def core_records(path):
 lines=page_lines(path);heads=[]
 for i,(line,page,label) in enumerate(lines):
  m=ELEMENT.match(line)
  if not m or '...' in line or page<44 or page>157:continue
  # Definitions have an actual User Guidance row. Diagrams/TOC references do not.
  following=lines[i+1:i+9];valid=False
  for nxt,_,_ in following:
   if ELEMENT.match(nxt):break
   if re.match(r'^\s+User Guidance\b',nxt):valid=True;break
  if valid:heads.append((i,m,page,label))
 records=[]
 for j,(start,m,page,label) in enumerate(heads):
  end=heads[j+1][0] if j+1<len(heads) else next((i for i in range(start+1,len(lines)) if lines[i][1]>157),len(lines))
  vals={};active=None;title=[m[2]];raw=[];preamble=[]
  for offset,(line,_,_) in enumerate(lines[start:end]):
   group=ELEMENT.match(line)
   if offset and active and group and group[2].upper()==group[2] and len(group[2].split())>2:end=start+offset;break
   raw.append(line.rstrip());lm=LABEL.match(line)
   if lm:active={'User Guidance':'guidance','Conformance':'conformance','Data Type':'dataType','OID':'oid','Value Allowed':'allowed','Business Rule(s)':'businessRules'}[lm[1]];vals.setdefault(active,[]).extend((preamble if active=='guidance' else [])+[lm[2].strip()]);preamble=[]
   elif active:vals[active].append(line.strip())
   elif line.strip() and line!=lines[start][0]:
    if len(line)-len(line.lstrip())>=12:preamble.append(line.strip())
    else:title.append(line.strip())
  values={k:safe('\n'.join(v)) for k,v in vals.items()};fid=re.sub(r'\s+','',m[1]);suffix=re.match(r'^([a-z]) ([A-Z].*)$',m[2]);
  if suffix:fid+=suffix[1];title[0]=suffix[2]
  flags=['PDF table extraction requires source review.','Code lists may be maintained separately from this guide.']
  if not values.get('conformance') or not values.get('dataType'):flags.append('Incomplete definition attributes; manual review required.')
  records.append({'key':'ICH:'+fid,'fieldId':fid,'title':safe(' '.join(title)),'layer':'ICH','source':'ich-core','location':{'page':page,'printedPage':label,'endPage':lines[end-1][1]},'attributes':values,'text':safe('\n'.join(raw)),'flags':flags})
 return records

def workbook(path):
 with zipfile.ZipFile(path) as z:
  shared=[''.join(n.itertext()) for n in X.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
  relns='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
  rels={r.attrib['Id']:r.attrib['Target'].lstrip('/') for r in X.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
  for sheet in X.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
   target=rels[sheet.attrib[relns+'id']];target=target if target.startswith('xl/') else 'xl/'+target
   rows=[]
   for row in X.fromstring(z.read(target)).findall('.//s:sheetData/s:row',NS):
    cells={}
    for c in row:
     v=c.find('s:v',NS);value=v.text if v is not None else ''
     if c.attrib.get('t')=='s':value=shared[int(value)]
     elif c.attrib.get('t')=='inlineStr':value=''.join(c.itertext())
     cells[re.sub(r'\d','',c.attrib['r'])]=safe(value or '')
    rows.append({'row':int(row.attrib['r']),'hidden':row.attrib.get('hidden')=='1','cells':cells})
   yield sheet.attrib['name'],rows

def fda_records(path):
 sheets=dict(workbook(path));rows=sheets['ICSR Data Elements'];header=rows[1]['cells']
 if header.get('C')!='DATA ELEMENT NUMBER' or header.get('K')!='Post-Market Business Rule' or header.get('AG')!='Value':raise ValueError('Workbook columns changed: review parser before ingestion')
 out=[];hidden=0
 for row in rows[2:]:
  if row['hidden']:hidden+=1;continue
  c=row['cells'];fid=c.get('C','').strip()
  if not re.fullmatch(r'(?:FDA\.)?(?:ACK|[NCDEFGH])(?:\.[A-Za-z0-9]+)+',fid):continue
  attrs={'maxLength':c.get('E',''),'dataType':c.get('F',''),'allowed':c.get('G',''),'conformance':c.get('J',''),'businessRules':c.get('K',''),'workbookIchConformance':c.get('H',''),'workbookIchRules':c.get('I',''),'oid':c.get('AD',''),'xpath':c.get('AG',''),'nullXpath':c.get('AH',''),'changeType':c.get('S',''),'questions':c.get('T',''),'nullFlavors':'; '.join(k+': '+c.get(col,'Not captured') for col,k in zip(['U','V','W','X','Y','Z','AA','AB','AC'],['NI','MSK','UNK','NA','ASKU','NASK','NINF','PINF','OTH']))}
  raw='\n'.join(k+': '+v for k,v in attrs.items())
  out.append({'key':'FDA-PM:'+fid,'fieldId':fid,'title':c.get('D',fid),'layer':'FDA-PM','source':'fda-rules','location':{'sheet':'ICSR Data Elements','row':row['row'],'columns':'C:M and S:AH (excludes VAERS and premarket columns)'},'attributes':attrs,'text':raw,'flags':['FDA workbook capture is older than the October 2026 core guide; reconcile versions.','Postmarket columns only. A dash is preserved as a source value, not interpreted as optional.','Hidden rows and VAERS-specific columns are excluded.']})
 # Rejection/warning references retain source text but are not executable rules.
 for row in sheets.get('Rejection and Warning Rules',[]):
  if row['hidden']:continue
  c=row['cells'];rid=next((v for v in c.values() if re.fullmatch(r'[RW]\d{4}',v)),None)
  if not rid:continue
  # Column mapping is checked below by explicit headers when reviewed; keep unparsed row labelled.
  attrs={k:v for k,v in c.items() if v};out.append({'key':'FDA-CHECK:'+rid,'fieldId':rid,'title':'Workbook rejection / warning '+rid,'layer':'FDA-CHECK','source':'fda-rules','location':{'sheet':'Rejection and Warning Rules','row':row['row']},'attributes':{'sourceColumns':canonical(attrs)},'text':'\n'.join(k+': '+v for k,v in attrs.items()),'flags':['Uninterpreted workbook row. Scope and column meanings require source review.','Not an executable validation rule.']})
 history=sheets.get('Revison History',[]);latest=next((r['cells'] for r in reversed(history) if r['cells'].get('A') and r['cells'].get('B')),{});date=latest.get('B','')
 if date.isdigit():date=(datetime.date(1899,12,30)+datetime.timedelta(days=int(date))).isoformat()
 return out,{'hiddenRowsExcluded':hidden,'version':latest.get('A','Unknown'),'versionDate':date}

def regional_records(path):
 lines=page_lines(path);heads=[]
 for i,(line,p,label) in enumerate(lines):
  m=re.match(r'^\s*(\d+\.\d+(?:\.\d+)*)\s+([A-Z].+)$',line)
  if m and p>=7 and '...' not in line:heads.append((i,m,p,label))
 out=[]
 for j,(start,m,page,label) in enumerate(heads):
  end=heads[j+1][0] if j+1<len(heads) else len(lines);txt=safe('\n'.join(l for l,_,_ in lines[start:end]));
  if len(txt)>16000:txt=txt[:16000];flags=['Long section truncated; inspect the original source.']
  else:flags=[]
  out.append({'key':'FDA-GUIDE:'+m[1],'fieldId':'§'+m[1],'title':m[2].strip(),'layer':'FDA-GUIDE','source':'fda-regional','location':{'page':page,'printedPage':label,'endPage':lines[end-1][1]},'attributes':{'guidance':txt},'text':txt,'flags':flags+['August 2024 source may contain statements superseded by later FDA policy.','Section capture, not an approved current legal obligation.']})
 return out


def alignment_records(path):
 # Capture a small structured summary of technical facts; not a verbatim replacement for the paper.
 pages=pdfpages(path)
 if '16 December 2025' not in '\n'.join(pages) or not any('6 = Organised Data Collection' in p for p in pages):raise ValueError('Alignment paper changed; review the importer')
 defs=[('C.1.3','Type of Report',5,{'guidance':'Structured summary: report classification requires considering study-related and other solicited sources in accordance with the alignment paper.','conformance':'Required','dataType':'1N','allowed':'1: spontaneous report; 2: study-related report; 3: other; 4: unavailable to sender.'}),('C.5.4','Study Type Where Reactions / Events Were Observed',6,{'guidance':'Structured summary: first check whether a specific study or programme category applies. Digital-platform collection has its own conditional category. Review prospective use and regional implementation.','conformance':'Conditional: required when C.1.3 indicates a study-related report','dataType':'1N','allowed':'1: clinical trial; 2: individual patient use; 3: other study; 4: patient-support programme; 5: market-research programme; 6: digital-platform organised collection (conditional).'})]
 return [{'key':'ICH-ALIGN:'+fid,'fieldId':fid,'title':title,'layer':'ICH-ALIGN','source':'ich-alignment','captureType':'structured_summary','location':{'page':page,'printedPage':str(page-3),'endPage':page},'attributes':attrs,'text':'\n'.join(k+': '+v for k,v in attrs.items()),'flags':['Structured technical summary, not an exact source quotation.','Reconcile this alignment paper with the guide, current code lists and regional implementation.']} for fid,title,page,attrs in defs]

def build(args):
 core=pathlib.Path(args.core_pdf);xlsx=pathlib.Path(args.fda_xlsx);regional=pathlib.Path(args.regional_pdf)
 sources=[{'id':'ich-core','title':'ICH E2B(R3) Implementation Guide — FDA edition','edition':'October 2026, Revision 2','url':'https://www.fda.gov/media/81904/download','origin':'User-supplied PDF; official reference URL identified','sha256':digest(core.read_bytes())},{'id':'fda-rules','title':'FDA E2B(R3) Core and Regional Data Elements and Business Rules','edition':'Workbook version captured below','url':'https://www.fda.gov/media/175373/download?attachment=','origin':'Official FDA download','sha256':digest(xlsx.read_bytes())},{'id':'fda-regional','title':'FDA Regional Implementation Guide for E2B(R3)','edition':'August 2024, version 3.1','url':'https://www.fda.gov/media/180748/download','origin':'Official FDA download','sha256':digest(regional.read_bytes())}]
 if args.alignment:
  alignment=pathlib.Path(args.alignment);sources.append({'id':'ich-alignment','title':'ICH E2B(R3) alignment with E2D(R1) information paper','edition':'Adopted 16 December 2025','url':'https://www.fda.gov/media/195119/download?attachment=','origin':'Official FDA-hosted ICH paper; structured summary','sha256':digest(alignment.read_bytes())})
 for source in sources:source['documentId']='e2b-'+source['id']
 fda,meta=fda_records(xlsx);sources[1]['edition']='Version '+meta['version']+' · '+meta['versionDate'];records=core_records(core)+fda+regional_records(regional)+(alignment_records(alignment) if args.alignment else [])
 keys=[r['key'] for r in records]
 if len(set(keys))!=len(keys):raise ValueError('Duplicate extraction identifiers; review parser')
 for r in records:r['sourceHash']=next(s['sha256'] for s in sources if s['id']==r['source']);r['hash']=digest(canonical(r).encode());r['status']='draft'
 references=[{'title':'FDA current E2B(R3) standards and implementation resources','url':'https://www.fda.gov/drugs/fda-adverse-event-monitoring-system-aems/fda-adverse-event-monitoring-system-aems-e2br3-data-standards','status':'Official index; check for newer implementation policies'},{'title':'ICH E2D(R1) alignment information paper','url':'https://www.fda.gov/media/195119/download?attachment=','status':'Separate structured-summary overlay for C.1.3 and C.5.4 when imported.'},{'title':'FDA XML example instances','url':'https://www.fda.gov/media/157983/download?attachment=','status':'Reference link only; no case instances ingested.'}]
 if args.schemas:
  zpath=pathlib.Path(args.schemas)
  with zipfile.ZipFile(zpath) as z:count=len([n for n in z.namelist() if n.lower().endswith('.xsd')])
  references.append({'title':'ICH ICSR XML Schema Set v2.5','url':'https://www.fda.gov/media/157992/download?attachment=','sha256':digest(zpath.read_bytes()),'schemaFiles':count,'status':'Inventory captured; schema validation and field-to-schema resolution are not implemented.'})
 data={'schema':1,'extractor':VERSION,'sources':sources,'records':records,'references':references,'coverage':{**meta,'counts':{layer:sum(r['layer']==layer for r in records) for layer in ['ICH','ICH-ALIGN','FDA-PM','FDA-CHECK','FDA-GUIDE']},'limitations':['Extracted reference records are drafts until individually reviewed.','Core PDF and FDA workbook editions differ; no automatic precedence or complete compliance claim.','PDF tables, multi-element headings, diagrams and appendices may require manual correction.','Cardinality and unparsed attributes are unknown unless explicitly captured.','No MedDRA/WHODrug dictionary content, private case data or executable rule engine is included.']}}
 data['id']='e2b-'+digest(canonical(data).encode())[:20];data['contentHash']=digest(canonical(data).encode());pathlib.Path(args.output).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'id':data['id'],'records':len(records),'counts':data['coverage']['counts'],'workbook':sources[1]['edition']}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--core-pdf',required=True);p.add_argument('--fda-xlsx',required=True);p.add_argument('--regional-pdf',required=True);p.add_argument('--schemas');p.add_argument('--alignment');p.add_argument('--output',required=True);build(p.parse_args())
