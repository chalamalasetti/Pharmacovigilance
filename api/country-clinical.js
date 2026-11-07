import {lookupCountry,collectCountryTrials} from '../scripts/country-clinical.mjs';
export async function countryClinicalHandler(req,res,{lookup=lookupCountry,collect=collectCountryTrials}={}){
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method!=='GET'){res.setHeader('allow','GET');return send(405,{error:'Use GET'});}
 const p=new URL(req.url,'https://www.pvinfo.org').searchParams,country=(p.get('country')||'').toUpperCase(),cursor=p.get('cursor')||'';
 if(p.getAll('country').length!==1||p.getAll('cursor').length>1||[...p.keys()].some(k=>!['country','cursor'].includes(k))||!/^[A-Z]{2}$/.test(country)||cursor&&!/^[A-Za-z0-9_=.-]{1,3000}$/.test(cursor))return send(400,{error:'Choose a supported country and valid continuation token.'});
 try{const record=await lookup(country);if(!record)return send(404,{error:'Choose a country; regional and international groupings are not trial locations.'});const data=await collect(record,cursor);res.setHeader('cache-control','public, max-age=0, s-maxage=3600');return send(200,data);}catch(e){if(e.status===429)res.setHeader('retry-after','60');return send(e.status===429?429:502,{error:'ClinicalTrials.gov unavailable. Retry later or inspect the official registry.'});}
}
export default countryClinicalHandler;
