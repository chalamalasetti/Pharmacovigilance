import {validateRequest,collectLabelRequest} from '../scripts/label-history.mjs';
export async function labelHistoryHandler(req,res,{collect=collectLabelRequest}={}){
 res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
 const send=(code,value)=>{res.statusCode=code;res.end(JSON.stringify(value));};
 if(req.method!=='GET'){res.setHeader('allow','GET');return send(405,{error:'Use GET.'});}
 try{const request=validateRequest(new URL(req.url,'https://www.pvinfo.org').searchParams),data=await collect(request);res.setHeader('cache-control','public, max-age=0, s-maxage=3600');return send(200,data);}catch(e){const code=[400,404,413,429].includes(e.status)?e.status:502;if(code===429)res.setHeader('retry-after','60');return send(code,{error:code===502?'Official label evidence could not be retrieved or verified. Retry or inspect the official source.':e.message});}
}
export default labelHistoryHandler;
