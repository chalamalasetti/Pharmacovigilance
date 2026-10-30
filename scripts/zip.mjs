// Just enough of the zip format to read the FDA Orange Book download (a zip of text
// files) and EMA's medicines report (an .xlsx, which is a zip of XML), so neither
// needs another dependency. Stored and deflated entries only; no zip64 or encryption.

import { inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

// Returns a Map of entry name -> Buffer.
export function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`zip entry ${name} uses unsupported method ${method}`);
  }
  return out;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", isArray: (n) => ["si", "r", "row", "c", "sheet", "Relationship"].includes(n) });
const asText = (v) => (v == null ? "" : typeof v === "object" ? String(v["#text"] ?? "") : String(v));

// Column letters to a 0-based index: "A" -> 0, "AB" -> 27.
const colIndex = (ref) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Rows of the first worksheet of an .xlsx as arrays of strings (numbers stay as their text).
export function readXlsx(buf) {
  const files = unzip(buf);
  const shared = [];
  const sst = files.get("xl/sharedStrings.xml");
  if (sst) {
    for (const si of xml.parse(sst.toString("utf8")).sst?.si ?? []) {
      shared.push(si.t != null ? asText(si.t) : (si.r ?? []).map((r) => asText(r.t)).join(""));
    }
  }
  // The first sheet in workbook order, found through the workbook's relationships.
  let sheetPath = "xl/worksheets/sheet1.xml";
  try {
    const wb = xml.parse(files.get("xl/workbook.xml").toString("utf8"));
    const rid = wb.workbook.sheets.sheet[0]["@r:id"];
    const rels = xml.parse(files.get("xl/_rels/workbook.xml.rels").toString("utf8"));
    const target = rels.Relationships.Relationship.find((r) => r["@Id"] === rid)?.["@Target"];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  } catch {}
  const sheet = files.get(sheetPath);
  if (!sheet) throw new Error("worksheet not found in xlsx");
  const rows = [];
  for (const row of xml.parse(sheet.toString("utf8")).worksheet?.sheetData?.row ?? []) {
    const cells = [];
    (row.c ?? []).forEach((c, i) => {
      const at = c["@r"] ? colIndex(c["@r"]) : i;
      let v;
      if (c["@t"] === "s") v = shared[Number(asText(c.v))] ?? "";
      else if (c["@t"] === "inlineStr") v = c.is?.t != null ? asText(c.is.t) : (c.is?.r ?? []).map((r) => asText(r.t)).join("");
      else v = asText(c.v);
      cells[at] = v.trim();
    });
    rows.push(Array.from(cells, (v) => v ?? ""));
  }
  return rows;
}
