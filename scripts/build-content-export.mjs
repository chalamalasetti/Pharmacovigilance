import {build} from 'esbuild';import {mkdir} from 'node:fs/promises';
await mkdir('public/vendor',{recursive:true});await build({entryPoints:['scripts/content-studio/export-entry.js'],bundle:true,platform:'browser',format:'esm',minify:true,outfile:'public/vendor/content-export.js',legalComments:'eof'});console.log('Content exporters bundled locally');
