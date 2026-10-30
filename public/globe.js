// PV Globe: a spinning 3D globe of where pharmacovigilance and regulatory updates
// come from. Countries glow by how many updates they have; a red pulse marks a
// fresh safety alert or recall. Bodies that aren't one country (EMA, WHO, ICH…)
// and places too small for the outline map get a marker of their own. On its own
// the globe tours the newest updates; drag to spin it, tap a country to see its list.

import { flag } from "./lib.js";

const d3 = window.d3;
const $ = (id) => document.getElementById(id);
const canvas = $("globe");
const ctx = canvas.getContext("2d");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const TOUR_MS = 6500;
const IDLE_MS = 12000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT = new Set(["safety", "recall"]);

// Our codes whose name differs from the outline map's, or that need a marker instead.
const ATLAS_NAME = { US: "United States of America", TR: "Turkey" };
const MARKERS = {
  EU: { at: [4.9, 52.37], label: "European Union (EMA, Amsterdam)" },
  INT: { at: [6.14, 46.2], label: "International (WHO, ICH, CIOMS, UMC)" },
  SG: { at: [103.82, 1.35] },
  HK: { at: [114.17, 22.32] },
};

let world = null;
let places = new Map(); // code -> { code, name, at, updates, alert, feature }
let byAtlas = new Map(); // atlas country name -> code
let maxCount = 1;
let rotation = [-20, -25, 0];
let target = null;
let lastTouch = -Infinity;
let tour = [];
let tourAt = -1;
let selected = null;
let width = 0;
let height = 0;
let radius = 0;

const projection = d3.geoOrthographic().clipAngle(90);
const path = d3.geoPath(projection, ctx);
const graticule = d3.geoGraticule10();

function ago(iso) {
  const hours = Math.round((Date.now() - Date.parse(iso)) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const narrow = width < 700;
  radius = Math.min(width * (narrow ? 0.46 : 0.34), height * (narrow ? 0.32 : 0.4));
  projection.scale(radius).translate([narrow ? width / 2 : width * 0.42, height * (narrow ? 0.4 : 0.52)]);
}

// Is a [lon, lat] on the side of the globe facing us?
const facing = (at) => d3.geoDistance(at, [-rotation[0], -rotation[1]]) < Math.PI / 2 - 0.05;

function draw(now) {
  projection.rotate(rotation);
  const [cx, cy] = projection.translate();
  ctx.clearRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.25);
  glow.addColorStop(0, "rgba(80, 200, 220, 0.3)");
  glow.addColorStop(1, "rgba(80, 200, 220, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.25, 0, 2 * Math.PI);
  ctx.fill();

  const ocean = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
  ocean.addColorStop(0, "#1f6f86");
  ocean.addColorStop(0.55, "#0e3f52");
  ocean.addColorStop(1, "#04161f");
  ctx.fillStyle = ocean;
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.fill();

  ctx.strokeStyle = "rgba(200, 240, 255, 0.08)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  path(graticule);
  ctx.stroke();

  for (const f of world.features) {
    const p = places.get(byAtlas.get(f.properties.name));
    ctx.beginPath();
    path(f);
    if (p?.updates.length) {
      const heat = 0.3 + 0.7 * Math.sqrt(p.updates.length / maxCount);
      // More updates, brighter: muted teal through to bright aqua.
      ctx.fillStyle = `rgb(${Math.round(60 + 90 * heat)}, ${Math.round(140 + 95 * heat)}, ${Math.round(150 + 85 * heat)})`;
    } else {
      ctx.fillStyle = "#2b4a52";
    }
    if (p && p.code === selected) ctx.fillStyle = "#ffd166";
    ctx.fill();
    ctx.strokeStyle = "rgba(4, 22, 31, 0.8)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Pulses: rings out of each place with updates. Fresh safety alerts and recalls pulse red and faster.
  for (const p of places.values()) {
    if (!p.updates.length || !facing(p.at)) continue;
    const [x, y] = projection(p.at);
    const fresh = Math.max(0, 1 - (Date.now() - Date.parse(p.updates[0].published ?? 0)) / (7 * DAY_MS));
    const size = 0.5 + Math.sqrt(p.updates.length / maxCount);
    const period = p.alert ? 1600 : 3200 - 1200 * fresh;
    const colour = p.alert ? "255, 90, 90" : "160, 240, 255";
    for (let k = 0; k < 2; k++) {
      const t = reduceMotion ? 0.35 : ((now + k * period * 0.5 + p.code.charCodeAt(0) * 97) % period) / period;
      ctx.beginPath();
      ctx.arc(x, y, 2 + t * radius * 0.09 * size, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(${colour}, ${(1 - t) * (0.4 + 0.6 * Math.max(fresh, p.alert ? 1 : 0))})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, 2 + 2 * size, 0, 2 * Math.PI);
    ctx.fillStyle = p.feature ? "#fff" : "#ffd166";
    ctx.fill();
    if (!p.feature) {
      ctx.strokeStyle = "#04161f";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const rim = ctx.createRadialGradient(cx, cy, radius * 0.75, cx, cy, radius);
  rim.addColorStop(0, "rgba(0, 0, 0, 0)");
  rim.addColorStop(1, "rgba(0, 5, 15, 0.5)");
  ctx.fillStyle = rim;
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.fill();
}

function turnTo(at) {
  target = [-at[0], -at[1] * 0.7, 0];
}

function step(now, dt) {
  if (target) {
    let dl = target[0] - rotation[0];
    dl = ((dl + 540) % 360) - 180;
    const dp = target[1] - rotation[1];
    const k = reduceMotion ? 1 : Math.min(1, dt * 0.004);
    rotation = [rotation[0] + dl * k, rotation[1] + dp * k, 0];
    if (Math.abs(dl) < 0.1 && Math.abs(dp) < 0.1) target = null;
  } else if (!dragging && !reduceMotion && now - lastTouch > IDLE_MS / 3) {
    rotation = [rotation[0] + dt * 0.006, rotation[1], 0];
  }
}

let last = performance.now();
function frame(now) {
  step(now, Math.min(now - last, 64));
  last = now;
  draw(now);
  requestAnimationFrame(frame);
}

function showCard(p, { pinned = false } = {}) {
  $("card").hidden = false;
  $("cardPlace").textContent = `${flag(p.code)} ${p.name}`;
  const alerts = p.updates.filter((u) => ALERT.has(u.category)).length;
  $("cardMeta").textContent = `${p.updates.length} update${p.updates.length === 1 ? "" : "s"}${alerts ? ` · ${alerts} safety alert${alerts === 1 ? "" : "s"} or recall${alerts === 1 ? "" : "s"}` : ""}`;
  $("cardList").replaceChildren(
    ...p.updates.slice(0, 4).map((u) => {
      const li = document.createElement("li");
      li.className = `c-${u.category}`;
      const a = Object.assign(document.createElement("a"), { href: u.link, target: "_blank", rel: "noopener", textContent: u.title });
      const meta = Object.assign(document.createElement("span"), { textContent: `${labels.get(u.category) ?? u.category} · ${u.source}${u.published ? ` · ${ago(u.published)}` : ""}` });
      li.append(a, meta);
      return li;
    }),
  );
  $("cardMore").href = `./?country=${p.code}&days=60`;
  $("cardMore").textContent = p.updates.length === 1 ? `Open ${p.name} on the updates page →` : `See all ${p.updates.length} updates for ${p.name} →`;
  $("cardClose").hidden = !pinned;
}

// The tour: newest updates first, one place at a time.
function nextStop() {
  if (performance.now() - lastTouch < IDLE_MS || !tour.length) return;
  tourAt = (tourAt + 1) % tour.length;
  const p = tour[tourAt];
  selected = null;
  turnTo(p.at);
  showCard(p);
}

function pick(p) {
  selected = p.code;
  turnTo(p.at);
  showCard(p, { pinned: true });
  $("hint").hidden = true;
}

// Dragging spins the globe; a tap picks the marker or country under the finger.
let dragging = false;
let start = null;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  target = null;
  lastTouch = performance.now();
  start = { x: e.clientX, y: e.clientY, rot: rotation.slice(), moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
  const k = 90 / radius;
  rotation = [start.rot[0] + dx * k, Math.max(-80, Math.min(80, start.rot[1] - dy * k)), 0];
  lastTouch = performance.now();
});
canvas.addEventListener("pointerup", (e) => {
  dragging = false;
  lastTouch = performance.now();
  if (start?.moved) return;
  // Markers first: they sit on top of countries (the EU marker is over the Netherlands).
  const marker = [...places.values()].find((p) => {
    if (p.feature || !p.updates.length || !facing(p.at)) return false;
    const [x, y] = projection(p.at);
    return Math.hypot(x - e.clientX, y - e.clientY) < 14;
  });
  if (marker) return pick(marker);
  const at = projection.invert([e.clientX, e.clientY]);
  if (!at || d3.geoDistance(at, [-rotation[0], -rotation[1]]) > Math.PI / 2) return;
  const hit = world.features.find((f) => d3.geoContains(f, at));
  const p = hit && places.get(byAtlas.get(hit.properties.name));
  if (p?.updates.length) pick(p);
  else {
    selected = null;
    $("card").hidden = true;
  }
});
$("cardClose").onclick = () => {
  selected = null;
  $("card").hidden = true;
  lastTouch = -Infinity;
};

let labels = new Map();

async function load() {
  const [geo, data, agencies] = await Promise.all([
    world ? Promise.resolve(world) : fetch("map/globe.json").then((r) => r.json()),
    fetch("data/updates.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("data/agencies.json").then((r) => r.json()),
  ]);
  world = geo;
  labels = new Map(data.categories.map((c) => [c.id, c.label]));
  const features = new Map(geo.features.map((f) => [f.properties.name, f]));
  places = new Map();
  byAtlas = new Map();
  for (const c of agencies) {
    const atlas = ATLAS_NAME[c.code] ?? c.country;
    const feature = MARKERS[c.code] ? null : features.get(atlas);
    const at = MARKERS[c.code]?.at ?? feature?.properties.at;
    if (!at) continue;
    if (feature) byAtlas.set(atlas, c.code);
    places.set(c.code, { code: c.code, name: MARKERS[c.code]?.label ?? c.country, at, feature, updates: [], alert: false });
  }
  const now = Date.now();
  const sorted = [...data.updates].sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  for (const u of sorted) {
    const p = places.get(u.country);
    if (!p) continue;
    p.updates.push(u);
    if (ALERT.has(u.category) && u.published && now - Date.parse(u.published) < 7 * DAY_MS) p.alert = true;
  }
  const active = [...places.values()].filter((p) => p.updates.length);
  maxCount = Math.max(1, ...active.map((p) => p.updates.length));
  tour = active.sort((a, b) => (b.updates[0].published ?? "").localeCompare(a.updates[0].published ?? "")).slice(0, 24);
  const alerts = active.filter((p) => p.alert).length;
  $("stats").textContent = `${data.updates.length} updates · ${active.length} places · ${alerts} with fresh alerts`;
}

resize();
addEventListener("resize", resize);
load()
  .then(() => {
    requestAnimationFrame(frame);
    nextStop();
    setInterval(nextStop, TOUR_MS);
    setInterval(() => load().catch(() => {}), 10 * 60 * 1000);
  })
  .catch((e) => {
    console.error("Could not draw the globe", e);
    $("empty").hidden = false;
  });
