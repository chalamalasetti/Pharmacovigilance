"""Reproduce the browser-local XSD bundle from the pinned official FDA archive."""
import argparse,gzip,hashlib,json,pathlib,zipfile
PIN='b6bf2c2151ec13245b5895359af98f23057e504e4d204e4f6c6b171ef84fc233'
p=argparse.ArgumentParser();p.add_argument('archive');args=p.parse_args()
raw=pathlib.Path(args.archive).read_bytes()
if hashlib.sha256(raw).hexdigest()!=PIN:raise ValueError('Official schema archive checksum mismatch')
z=zipfile.ZipFile(args.archive);files=[]
for info in sorted(z.infolist(),key=lambda f:f.filename):
 if not info.filename.endswith('.xsd'):continue
 name=str(pathlib.PurePosixPath(info.filename).relative_to('4_ICH_ICSR_Schema_Files'))
 data=z.read(info);files.append({'fileName':name,'contents':data.decode('utf-8-sig')})
bundle={'version':'2.5','archiveSha256':PIN,'files':files}
out=pathlib.Path('public/e2b');out.mkdir(exist_ok=True)
compressed=gzip.compress(json.dumps(bundle,separators=(',',':')).encode(),mtime=0)
(out/'ich-schema-2.5.bin').write_bytes(compressed)
manifest={'version':'2.5','source':'https://www.fda.gov/media/157992/download?attachment=','archiveSha256':PIN,'bundleSha256':hashlib.sha256(compressed).hexdigest(),'entrypoint':'multicacheschemas/MCCI_IN200100UV01.xsd','files':[{'fileName':f['fileName'],'sha256':hashlib.sha256(f['contents'].encode()).hexdigest()} for f in files]}
(out/'schema-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(len(files),'XSD files,',len(compressed),'bytes, bundle SHA256',manifest['bundleSha256'])
