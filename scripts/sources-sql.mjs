// Writes the initial import of the data source registry into supabase/schema.sql (between
// "BEGIN SOURCE IMPORT" and "END SOURCE IMPORT") from sources.json, so running the schema
// file once brings every source the build collected before the registry into the database.
//
//   npm run sources:sql

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanSource } from "../public/sources-lib.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "supabase/schema.sql");
const BEGIN = "-- BEGIN SOURCE IMPORT\n";
const END = "-- END SOURCE IMPORT";

export function importSql(seed) {
  const rows = seed.map((raw) => {
    const { source, problems } = cleanSource(raw);
    if (problems.length) throw new Error(`${raw.id}: ${problems.join(" ")}`);
    const { id, name, organization, type, classification, regions, topics, status, url, settings } = source;
    return JSON.stringify({ id, name, organization, type, classification, regions, topics, status, url, settings });
  });
  if (rows.some((r) => r.includes("$seed$"))) throw new Error("a source contains $seed$");
  return `do $import$ begin
  perform set_config('pv.source_action', 'imported', true);
  insert into public.data_sources (id, name, organization, url, source_type, classification, regions, topics, status, settings)
  select s.id, s.name, s.organization, s.url, s.type, s.classification,
    array(select jsonb_array_elements_text(s.regions)), array(select jsonb_array_elements_text(s.topics)), s.status, s.settings
  from jsonb_to_recordset($seed$[
${rows.join(",\n")}
]$seed$::jsonb) as s(id text, name text, organization text, type text, classification text, regions jsonb, topics jsonb, status text, url text, settings jsonb)
  on conflict (id) do nothing;
  perform set_config('pv.source_action', '', true);
end $import$;
`;
}

export function withImport(schema, sql) {
  const a = schema.indexOf(BEGIN);
  const b = schema.indexOf(END);
  if (a < 0 || b < a) throw new Error("schema.sql has no SOURCE IMPORT markers");
  return schema.slice(0, a + BEGIN.length) + sql + schema.slice(b);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = JSON.parse(await readFile(path.join(ROOT, "sources.json"), "utf8")).sources;
  await writeFile(SCHEMA, withImport(await readFile(SCHEMA, "utf8"), importSql(seed)));
  console.log(`wrote the import of ${seed.length} sources into supabase/schema.sql`);
}
