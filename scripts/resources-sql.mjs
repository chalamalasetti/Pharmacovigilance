// Writes the directory's first entries into supabase/schema.sql (between "BEGIN RESOURCE
// IMPORT" and "END RESOURCE IMPORT") from resources.json, so running the schema file once
// brings them into the database, where admins maintain them.
//
//   npm run resources:sql

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanResource } from "../public/resources-lib.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "supabase/schema.sql");
const BEGIN = "-- BEGIN RESOURCE IMPORT\n";
const END = "-- END RESOURCE IMPORT";

export function importSql(seed) {
  const rows = seed.map((raw) => {
    const { resource, problems } = cleanResource(raw);
    if (problems.length) throw new Error(`${raw.id}: ${problems.join(" ")}`);
    return JSON.stringify({ ...resource, verifiedOn: raw.verified?.on ?? null, verifiedMethod: raw.verified?.method ?? null });
  });
  if (rows.some((r) => r.includes("$seed$"))) throw new Error("a resource contains $seed$");
  return `do $import$ begin
  perform set_config('pv.resource_action', 'imported', true);
  insert into public.safety_resources (id, name, organization, categories, specialties, countries, products, purpose, coverage, access, reuse, limitations, url, links, source_id, keywords, status, verified_on, verified_method, verified_by)
  select r.id, r.name, r.organization,
    array(select jsonb_array_elements_text(r.categories)), array(select jsonb_array_elements_text(r.specialties)),
    array(select jsonb_array_elements_text(r.countries)), array(select jsonb_array_elements_text(r.products)),
    r.purpose, r.coverage, r.access, r.reuse, r.limitations, r.url, r.links,
    -- Only a link to a source that exists; a resource never creates one.
    (select s.id from public.data_sources s where s.id = r."sourceId"),
    array(select jsonb_array_elements_text(r.keywords)), r.status, r."verifiedOn", r."verifiedMethod",
    case when r."verifiedOn" is not null then 'automated page check' end
  from jsonb_to_recordset($seed$[
${rows.join(",\n")}
]$seed$::jsonb) as r(id text, name text, organization text, categories jsonb, specialties jsonb, countries jsonb, products jsonb, purpose text,
    coverage jsonb, access jsonb, reuse jsonb, limitations text, url text, links jsonb, "sourceId" text, keywords jsonb, status text, "verifiedOn" date, "verifiedMethod" text)
  on conflict (id) do nothing;
  perform set_config('pv.resource_action', '', true);
end $import$;
`;
}

export function withImport(schema, sql) {
  const a = schema.indexOf(BEGIN);
  const b = schema.indexOf(END);
  if (a < 0 || b < a) throw new Error("schema.sql has no RESOURCE IMPORT markers");
  return schema.slice(0, a + BEGIN.length) + sql + schema.slice(b);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = JSON.parse(await readFile(path.join(ROOT, "resources.json"), "utf8")).resources;
  await writeFile(SCHEMA, withImport(await readFile(SCHEMA, "utf8"), importSql(seed)));
  console.log(`wrote the import of ${seed.length} resources into supabase/schema.sql`);
}
