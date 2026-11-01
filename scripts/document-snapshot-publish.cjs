// Executed only by the trusted workflow through actions/github-script.
const fs=require('node:fs/promises');
const path=require('node:path');
module.exports=async({github,context,directory})=>{
 const repo=context.repo,branch='regulatory-document-cache';
 let head;try{head=(await github.rest.git.getRef({...repo,ref:`heads/${branch}`})).data.object.sha;}catch(e){if(e.status!==404)throw e;}
 const parent=head??context.sha;
 const base=(await github.rest.git.getCommit({...repo,commit_sha:parent})).data.tree.sha;
 const tree=[];
 async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory()){await walk(full);continue;}
  const name=path.relative(directory,full).split(path.sep).join('/');if(name!=='index.json'&&!/^documents\/[a-z0-9-]+\/[a-f0-9]{64}\.json$/.test(name))throw Error('Unexpected public snapshot file');
  const content=await fs.readFile(full,'utf8');let existing;
  if(head){try{existing=(await github.rest.repos.getContent({...repo,path:name,ref:branch})).data;}catch(e){if(e.status!==404)throw e;}}
  if(existing){if(name!=='index.json')continue;if(Buffer.from(existing.content,'base64').toString('utf8')===content)continue;}
  const blob=(await github.rest.git.createBlob({...repo,content,encoding:'utf-8'})).data;
  tree.push({path:name,mode:'100644',type:'blob',sha:blob.sha});
 }}
 await walk(directory);if(!tree.length)return;
 const nextTree=(await github.rest.git.createTree({...repo,base_tree:base,tree})).data.sha;
 const commit=(await github.rest.git.createCommit({...repo,message:'Refresh public regulatory document key information',tree:nextTree,parents:[parent]})).data;
 // No force: concurrent branch movement fails safely instead of overwriting data.
 if(head)await github.rest.git.updateRef({...repo,ref:`heads/${branch}`,sha:commit.sha,force:false});
 else await github.rest.git.createRef({...repo,ref:`refs/heads/${branch}`,sha:commit.sha});
};
