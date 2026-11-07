import {filterTrials} from './clinical-lib.js';
export const filterCountryTrials=(rows,filters={})=>filterTrials(rows,filters);
// A country change invalidates in-flight pages and every continuation token.
export function createCountryTrials({fetcher=fetch,onChange=()=>{}}={}){
 let serial=0,state;function reset(country){serial++;state={country,studies:[],status:'not-loaded',nextCursor:null,pages:0,sourceQueryTotal:null,error:null};onChange(state);return state;}
 async function load(){if(!state||state.status==='loading'||state.pages&&!state.nextCursor)return;const token=serial,code=state.country,cursor=state.nextCursor;state={...state,status:'loading',error:null};onChange(state);
 try{const r=await fetcher('/api/country-clinical?'+new URLSearchParams({country:code,...(cursor?{cursor}:{})}));const data=await r.json();if(serial!==token)return;if(!r.ok)throw Error(data.error||'Clinical registry unavailable');if(data.schema!=='pv-country-clinical/1'||data.country!==code||!Array.isArray(data.studies))throw Error('Clinical country evidence mismatch');state={...state,...data,studies:[...new Map([...state.studies,...data.studies].map(s=>[s.id,s])).values()],pages:state.pages+1,status:data.nextCursor?'partial':'loaded',error:null};}
 catch(e){if(serial!==token)return;state={...state,status:'unavailable',error:e.message};}onChange(state);}
 return {reset,load,current:()=>state};
}
