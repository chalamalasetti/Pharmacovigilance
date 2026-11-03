import {productKey} from './company-briefing-lib.js';
export {productKey};
export function recordStage(p){const s=(p.status??'').trim();if(!s)return 'unknown';if(/discontinued|withdrawn|refused|suspended|expired|revoked|lapsed/i.test(s))return 'past';if(/\b(?:approved|authorised|authorized|active|prescription|over.the.counter)\b/i.test(s))return 'authorization';return 'unknown';}
export const STAGES={authorization:'Authorization records',past:'Non-current / discontinued records',unknown:'Status needs review'};
export function portfolioRows(products,{q='',market='',stage=''}={}){const term=q.normalize('NFKD').toLowerCase().trim();return products.filter(p=>(!market||p.market===market)&&(!stage||recordStage(p)===stage)&&(!term||[p.brand,p.authId,p.holder,...p.ingredients??[]].join(' ').normalize('NFKD').toLowerCase().includes(term)));}
export function evidenceUrl(p){try{const u=new URL(p.url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
