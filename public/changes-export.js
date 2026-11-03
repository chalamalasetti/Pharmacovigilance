// One authorized database transaction freezes the case version and evidence package.
export async function regulatoryCasePackage(row,sb){
 if(!row.snapshot?.companyContext?.sourceItem?.match(/^regchange:[a-f0-9-]{36}$/)||!sb)throw Error('Pinned regulatory review is unavailable.');
 const {data,error}=await sb.rpc('export_regulatory_change_case',{p_case:row.id,p_expected:row.version});
 if(error)throw Error(error.message);if(data?.format!=='pvinfo-regulatory-assessment-v1'||data.assessment?.id!==row.id)throw Error('Evidence package could not be verified. No partial export was produced.');return data;
}
