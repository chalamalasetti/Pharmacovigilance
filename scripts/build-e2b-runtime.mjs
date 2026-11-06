import {mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('public/vendor/xmllint',{recursive:true});
for(const file of ['index-browser.mjs','xmllint-browser.mjs','xmllint.wasm','COPYING'])await copyFile('node_modules/xmllint-wasm/'+file,'public/vendor/xmllint/'+file);
await build({entryPoints:['scripts/e2b-export-entry.js'],bundle:true,platform:'browser',format:'esm',minify:true,outfile:'public/vendor/e2b-export.js',legalComments:'eof'});
console.log('Local XSD validator and training ZIP exporter prepared');
