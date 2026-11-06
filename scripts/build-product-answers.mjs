import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {safeURL} from '../public/product-answers-lib.js';
let registry;try{registry=JSON.parse(await readFile('companies/registry.json','utf8'));}catch{throw Error('Product answer registry unavailable; no empty replacement published.');}
const manifest=JSON.parse(await readFile('companies/manifest.json','utf8'));const names=new Map(manifest.companies.map(c=>[c.id,c.name]));
const products=(registry.products??[]).filter(p=>p.brand&&p.authId&&safeURL(p.url)).map(p=>Object.fromEntries(Object.entries({brand:p.brand,ingredients:p.ingredients??[],market:p.market,authId:p.authId,date:p.date??null,company:p.company,companyName:names.get(p.company)??p.company,holder:p.holder,src:p.src,url:p.url,locator:p.locator,status:p.status??null,generic:p.generic??null,role:p.role??null,forms:p.forms??[],strengths:p.strengths??[]}).filter(([,v])=>v!==undefined)));
await mkdir('public/data',{recursive:true});await writeFile('public/data/product-answers.json',JSON.stringify({schema:1,registryBuilt:registry.built,sources:registry.sources,products}));console.log('Product answers: '+products.length+' public product/application records');
