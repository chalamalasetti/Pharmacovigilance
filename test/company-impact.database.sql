begin;
do $$
declare b jsonb:='{"schema":1,"engine":"config-draft-v1","title":"Synthetic assessment","profile":{"system":"argus","version":"Synthetic","environment":"Validation","company":"Synthetic Pharma","markets":"US"},"rules":[],"baselineStatus":"confirmed","area":"process","source":{"title":"Synthetic source","url":"https://www.fda.gov/synthetic","edition":"Synthetic","location":"Section 1","excerpt":"Synthetic organizational requirement","authority":"primary","verified":true},"applicability":"relevant","rationale":"Synthetic applicability","proposal":{"change":"Synthetic reviewed decision"},"implementation":"Synthetic implementation and verification","generated":{"engine":"config-draft-v1"},"companyImpact":{"schema":1,"program":"Synthetic program","stage":"Clinical","scopeConfirmed":true,"decision":"no_change","rationale":"Synthetic evidence review","controls":[{"id":"R1","expectation":"Synthetic expectation","sourceUrl":"https://www.fda.gov/synthetic","state":"unknown","reason":"Synthetic review"}]}}';
begin
 perform pv_config.validate_body(b,false);
 begin perform pv_config.validate_body(b,true);raise exception 'Unknown controls accepted';exception when others then if sqlerrm<>'Resolve unknown company controls before approval' then raise;end if;end;
 b:=jsonb_set(b,'{companyImpact,controls,0,state}','"supported"');
 begin perform pv_config.validate_body(b,true);raise exception 'Missing evidence accepted';exception when others then if sqlerrm not like 'Current control%' then raise;end if;end;
 b:=jsonb_set(b,'{companyImpact,controls,0,current}','"Synthetic control"');b:=jsonb_set(b,'{companyImpact,controls,0,evidence}','"SOP reference"');perform pv_config.validate_body(b,true);
 b:=jsonb_set(b,'{companyImpact,controls,0,state}','"potential_gap"');b:=jsonb_set(b,'{companyImpact,controls,0,action}','"Synthetic action"');
 begin perform pv_config.validate_body(b,true);raise exception 'No-change with gap accepted';exception when others then if sqlerrm<>'No-change decision retains a potential gap' then raise;end if;end;
 b:=jsonb_set(b,'{companyImpact,decision}','"change_required"');perform pv_config.validate_body(b,true);
 b:=jsonb_set(b,'{companyImpact,controls,0,state}','"not_applicable"');b:=jsonb_set(b,'{companyImpact,decision}','"not_applicable"');b:=jsonb_set(b,'{applicability}','"not_relevant"');perform pv_config.validate_body(b,true);
 b:=jsonb_set(b,'{area}','"reporting"');b:=jsonb_set(b,'{proposal,rule}','{"days":"7"}');
 begin perform pv_config.validate_body(b,true);raise exception 'Contradictory rule accepted';exception when others then if sqlerrm<>'No-change decision conflicts with a reporting-rule modification' then raise;end if;end;
 b:=jsonb_set(b,'{area}','"process"');
 -- Legacy non-relevant packages must still fail: a nullable optional field must not bypass the old gate.
 begin perform pv_config.validate_body(b-'companyImpact',true);raise exception 'Legacy applicability bypass';exception when others then if sqlerrm<>'Relevant applicability required' then raise;end if;end;
end $$;
rollback;
