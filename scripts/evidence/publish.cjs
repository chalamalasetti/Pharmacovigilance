// Invoked by actions/github-script with its scoped repository token.
module.exports=async({github,context,core})=>{
 const fs=require('node:fs'),crypto=require('node:crypto'),base='output/evidence/public',manifest=JSON.parse(fs.readFileSync(base+'/manifest.json'));
 if(manifest.developmentSubset||!manifest.completeLabelSnapshot)throw Error('Refusing to publish a development or partial FDA label snapshot');
 if(manifest.sources.some(s=>s.id.startsWith('fda-')&&s.status!=='loaded'))throw Error('Core FDA source missing');
 const branch='evidence-data-cache';let previous=null,ref=null;
 try{ref=(await github.rest.git.getRef({...context.repo,ref:'heads/'+branch})).data;const old=await github.rest.repos.getContent({...context.repo,path:'manifest.json',ref:branch});previous=JSON.parse(Buffer.from(old.data.content,'base64'));}catch(e){if(e.status!==404)throw e;}
 if(previous)for(const prior of previous.sources.filter(s=>s.status==='loaded')){const next=manifest.sources.find(s=>s.id===prior.id);if(!next||next.status!=='loaded'||next.sourceRecords<prior.sourceRecords*.8)throw Error('Source regression; preserving previous snapshot: '+prior.id);}
 // Release assets are published first. The public pointer changes only after all assets exist.
 const tag=process.env.DATA_TAG;if(!/^evidence-\d+-\d+$/.test(tag||''))throw Error('Invalid snapshot tag');
 const release=await github.rest.repos.getReleaseByTag({...context.repo,tag});const assets=await github.paginate(github.rest.repos.listReleaseAssets,{...context.repo,release_id:release.data.id,per_page:100});
 for(const a of manifest.assets){const found=assets.find(x=>x.name===a.name&&x.size===a.bytes);if(!found)throw Error('Missing release asset '+a.name);a.url=found.browser_download_url;}
 manifest.release=release.data.html_url;manifest.codeCommit=context.sha;
 const tree=[];
 for(const file of manifest.indexes){const bytes=fs.readFileSync(base+'/'+file.path);if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Index checksum mismatch');const blob=await github.rest.git.createBlob({...context.repo,content:bytes.toString('base64'),encoding:'base64'});tree.push({path:file.path,mode:'100644',type:'blob',sha:blob.data.sha});}
 const dataTree=await github.rest.git.createTree({...context.repo,tree});const commit=await github.rest.git.createCommit({...context.repo,message:'Evidence indexes '+tag,tree:dataTree.data.sha,parents:ref?[ref.object.sha]:[]});
 for(const file of manifest.indexes)file.url=`https://raw.githubusercontent.com/${context.repo.owner}/${context.repo.repo}/${commit.data.sha}/${file.path}`;
 const pointerTree=await github.rest.git.createTree({...context.repo,base_tree:dataTree.data.sha,tree:[{path:'manifest.json',mode:'100644',type:'blob',content:JSON.stringify(manifest)}]});const pointer=await github.rest.git.createCommit({...context.repo,message:'Publish verified evidence snapshot '+tag,tree:pointerTree.data.sha,parents:[commit.data.sha]});
 if(ref)await github.rest.git.updateRef({...context.repo,ref:'heads/'+branch,sha:pointer.data.sha,force:false});else await github.rest.git.createRef({...context.repo,ref:'refs/heads/'+branch,sha:pointer.data.sha});
 core.summary.addHeading('Evidence repository published').addRaw(JSON.stringify(manifest.counts)).addLink('Dataset release',manifest.release);await core.summary.write();
};
