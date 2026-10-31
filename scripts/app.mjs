// Runs PV Info on your own computer: serves public/, refreshes the updates on
// start and every 60 minutes, and opens the app in your browser.
//
//   npm run app              # http://localhost:4330
//   PORT=8080 npm run app    # pick another port
//   npm run app -- --no-open # don't open a browser window

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate } from "./aggregate.mjs";
import sourceTest from "../api/source-test.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const PORT = Number(process.env.PORT) || 4330;
const REFRESH_MS = 60 * 60 * 1000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/rss+xml; charset=utf-8",
};

export const server = http.createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // The Vercel function behind Admin → Data sources → Test now, served the same way here.
  if (urlPath === "/api/source-test") return sourceTest(req, res);
  const file = path.join(ROOT, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath);
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  console.log(`\n[${new Date().toLocaleTimeString()}] Fetching the latest PV updates…`);
  try {
    await aggregate();
  } catch (e) {
    console.warn(`Could not refresh updates: ${e.message}`);
  } finally {
    refreshing = false;
  }
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] :
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] :
    ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is busy. Is PV Info already running? Try PORT=4331 npm run app`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, "127.0.0.1", async () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`PV Info is running at ${url}  (Ctrl+C to stop)`);
  if (!process.argv.includes("--no-refresh")) await refresh();
  if (!process.argv.includes("--no-open")) openBrowser(url);
  if (!process.argv.includes("--no-refresh")) setInterval(refresh, REFRESH_MS);
});
