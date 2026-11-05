"""Build a value-free structural index from FDA's three versioned ICH ZIPs.
No archive extraction, external entity resolution, instance values, or schema execution.
"""
import argparse, collections, hashlib, json, pathlib, re, zipfile
import xml.etree.ElementTree as E
X='{http://www.w3.org/2001/XMLSchema}'
PAGE='https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2br3-electronic-transmission-individual-case-safety-reports-implementation-guide-data-elements-and'
def sha(b): return hashlib.sha256(b).hexdigest()
def parse(b):
 if len(b)>12_000_000 or re.search(br'<!\s*(DOCTYPE|ENTITY)',b,re.I): raise ValueError('Unsafe or oversized XML')
 return E.fromstring(b)
def local(s):return s.split('}')[-1]
def build(inputs):
 out={'schema':1,'origin':PAGE,'limitations':['Structural metadata is not a complete E2B implementation or legal requirement.','Occurrence constraints are local to the shown declaration; inherited types, groups and choices are not expanded.','Names are namespace-qualified in the source. Display paths omit namespace prefixes; do not use them as executable XPath.','Examples contain no imported text, attribute values, comments or patient data.','XSD conformance does not demonstrate FDA business-rule acceptance or regulatory compliance.'],'packages':[],'declarations':[],'instances':[]};notices=set()
 for kind,path,version,media in inputs:
  raw=pathlib.Path(path).read_bytes();z=zipfile.ZipFile(path);p={'id':kind,'version':version,'url':f'https://www.fda.gov/media/{media}/download?attachment=','sha256':sha(raw),'files':[]}
  if len(z.infolist())>1000 or sum(i.file_size for i in z.infolist())>50_000_000:raise ValueError('Archive bounds exceeded')
  for info in sorted(z.infolist(),key=lambda i:i.filename):
   n=info.filename
   if not n.lower().endswith(('.xsd','.xml')):continue
   b=z.read(info);root=parse(b);p['files'].append({'path':n,'sha256':sha(b),'bytes':len(b)})
   if n.endswith('.xsd'):
    for comment in re.findall(r'<!--(.*?)-->',b.decode('utf-8-sig'),re.S):
     if 'copyright' in comment.lower():notices.add('\n'.join(line.rstrip() for line in comment.strip().splitlines()))
    def walk(node,path,owner='',context=()):
     tag=local(node.tag);name=node.get('name') or node.get('ref') or ''
     here=f'{path}/{tag}'+(f'[{name}]' if name else '')
     if tag in ('complexType','simpleType') and name:owner=name
     if tag in ('element','attribute'):
      d={'id':sha((n+'|'+here).encode())[:24],'package':kind,'file':n,'fileHash':sha(b),'location':here,'owner':owner,'kind':tag,'name':name,'namespace':root.get('targetNamespace',''),'constraints':{k:v for k,v in node.attrib.items() if k in ('name','ref','type','minOccurs','maxOccurs','use','fixed','default','nillable','form')},'context':list(context),'facets':[]}
      for sub in node.findall(X+'simpleType/'+X+'restriction/*'):
       st=local(sub.tag)
       if st in ('enumeration','pattern','minLength','maxLength','length','minInclusive','maxInclusive','totalDigits','fractionDigits'):d['facets'].append({'kind':st,'value':sub.get('value','')})
      out['declarations'].append(d)
     counts=collections.Counter()
     for child in node:
      ct=local(child.tag);cn=child.get('name') or child.get('ref') or '';counts[(ct,cn)]+=1
      ctx=context+(({'kind':tag,**{k:v for k,v in node.attrib.items() if k in ('minOccurs','maxOccurs')}},) if tag in ('choice','sequence','all','group') else ())
      walk(child,here+f'/{counts[(ct,cn)]}',owner,ctx)
    walk(root,'')
   else:
    paths=collections.Counter();attributes=collections.Counter()
    def inst(node,path=''):
     path=path+'/'+local(node.tag);paths[path]+=1
     for attr in node.attrib:attributes[path+'/@'+local(attr)]+=1
     for child in node:inst(child,path)
    inst(root)
    out['instances'].append({'package':kind,'file':n,'fileHash':sha(b),'root':local(root.tag),'namespace':root.tag[1:].split('}')[0] if root.tag.startswith('{') else '', 'paths':[{'path':k,'count':v} for k,v in sorted(paths.items())],'attributes':[{'path':k,'count':v} for k,v in sorted(attributes.items())]})
  p['fileCount']=len(p['files']);out['packages'].append(p)
 ids=[d['id'] for d in out['declarations']]
 if len(ids)!=len(set(ids)):raise ValueError('Nonunique declaration IDs')
 out['contentHash']=sha(json.dumps(out,sort_keys=True,separators=(',',':')).encode())
 return out,notices
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--schemas',required=True);a.add_argument('--reference',required=True);a.add_argument('--examples',required=True);a.add_argument('--output',required=True);a.add_argument('--notices',required=True);v=a.parse_args()
 out,notices=build([('schemas',v.schemas,'2.5','157992'),('reference',v.reference,'3.1','157991'),('examples',v.examples,'2.0','157990')]);pathlib.Path(v.output).write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n');pathlib.Path(v.notices).write_text('This product includes software developed by Health Level Seven.\n\nSource: '+PAGE+'\nMetadata derived from FDA-hosted ICH schema set v2.5. Original archives remain at FDA.\n\n'+'\n\n'.join(sorted(notices))+'\n');print(json.dumps({'declarations':len(out['declarations']),'instances':len(out['instances']),'packages':[(p['id'],p['fileCount']) for p in out['packages']],'notices':len(notices)}))
