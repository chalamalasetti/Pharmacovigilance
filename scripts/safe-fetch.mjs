// Fetches a source's address with the checks an admin-entered URL needs. Used by the
// hourly build and by Test now (api/source-test.js), so neither can be pointed at the
// machine it runs on, a private network or a cloud metadata service:
//
// - only http and https on the standard ports, and no user name or password in the address
// - every address the host name resolves to is checked when the connection is made (so a
//   name that later resolves somewhere private is still refused), and literal IPs too
// - redirects are followed by hand, at most 5, each one checked the same way, and never
//   from https down to http
// - responses are capped in size and time
//
// Temporary failures (timeouts, dropped connections, HTTP 429 and 5xx) are retried with a
// short back-off; other errors fail straight away.

import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

const UA = "PVInfo/0.1 (+https://github.com/chalamalasetti/Pharmacovigilance)";
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8, */*;q=0.5";
const MAX_REDIRECTS = 5;
export const MAX_BYTES = 8 * 1024 * 1024;

const BLOCKED_HOSTS = /^(localhost|localhost\.localdomain|metadata|metadata\.google\.internal|metadata\.goog|instance-data|instance-data\.ec2\.internal)$|\.(localhost|local|internal|intranet|lan|home\.arpa)$/i;

const v4 = (s) => s.split(".").map(Number);

// Whether an IP address is somewhere a public feed can't be: loopback, private ranges,
// link-local (which holds the cloud metadata services), carrier-grade NAT, multicast and
// the reserved ranges, in IPv4 and IPv6 (including IPv4 written inside IPv6).
export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = v4(ip);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (!net.isIPv6(ip)) return true;
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = s.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? s.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);
  const hex = s.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) return isBlockedIp([parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join("."));
  if (s === "::" || s === "::1") return true;
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local, including fd00:ec2::254
    (first & 0xffc0) === 0xfe80 || // link-local
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && parseInt(s.split(":")[1] || "0", 16) === 0x0db8 || // documentation
    first === 0x0064 // NAT64 well-known prefix
  );
}

export class BlockedError extends Error {}

// The address problems that need no lookup. `ports` is only widened by the tests.
export function checkUrl(raw, { ports = ["80", "443"] } = {}) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedError("That is not a valid web address.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new BlockedError("Only http and https addresses can be collected.");
  if (u.username || u.password) throw new BlockedError("Addresses with a user name or password are not allowed.");
  if (u.port && !ports.includes(u.port)) throw new BlockedError("Only the standard web ports (80 and 443) are allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.test(host)) throw new BlockedError(`${host} is an internal address and cannot be collected.`);
  if (net.isIP(host) && isBlockedIp(host)) throw new BlockedError(`${host} is a private or reserved network address and cannot be collected.`);
  return u;
}

// dns.lookup, refusing the connection if any address the name resolves to is blocked.
export function guardedLookup(lookup = dns.lookup) {
  return (hostname, options, cb) => {
    lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options.family || 4 }];
      const bad = list.find((a) => isBlockedIp(a.address));
      if (bad) return cb(new BlockedError(`${hostname} points to a private or reserved network address (${bad.address}), so it cannot be collected.`));
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

function once(u, { headers, timeoutMs, maxBytes, lookup, binary }) {
  const mod = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: "GET", headers: { "user-agent": UA, accept: ACCEPT, "accept-encoding": "gzip, deflate, br", ...headers }, lookup, timeout: timeoutMs }, (res) => {
      const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
      const stream = enc === "gzip" || enc === "x-gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      let size = 0;
      stream.on("data", (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          reject(new Error(`The response is larger than ${Math.round(maxBytes / 1048576)} MB.`));
        } else chunks.push(c);
      });
      stream.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString("utf8") }));
      stream.on("error", reject);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error(`No answer within ${Math.round(timeoutMs / 1000)} seconds.`), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

const TEMPORARY = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_SOCKET"]);
export const isTemporary = (e) => !(e instanceof BlockedError) && (TEMPORARY.has(e.code) || e.status === 429 || e.status >= 500);

// One GET with redirects. Returns { status, url, redirects, contentType, body }; throws
// on a blocked address, a non-2xx status (err.status) or a network failure (err.code).
export async function fetchOnce(raw, { headers = {}, timeoutMs = 20000, maxBytes = MAX_BYTES, lookup = guardedLookup(), ports, binary = false, validateUrl = () => {} } = {}) {
  let u = checkUrl(raw, { ports });
  validateUrl(u.href);
  const redirects = [];
  for (;;) {
    const res = await once(u, { headers, timeoutMs, maxBytes, lookup, binary });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (redirects.length >= MAX_REDIRECTS) throw new BlockedError(`More than ${MAX_REDIRECTS} redirects.`);
      let next;
      try {
        next = new URL(res.headers.location, u);
      } catch {
        throw new BlockedError("The server redirected to an invalid address.");
      }
      if (u.protocol === "https:" && next.protocol === "http:") throw new BlockedError(`The server redirected from https to an insecure http address (${next.host}).`);
      redirects.push({ status: res.status, to: next.href });
      u = checkUrl(next.href, { ports });
      validateUrl(u.href);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, url: u.href, redirects });
    return { status: res.status, url: u.href, redirects, contentType: String(res.headers["content-type"] ?? ""), body: res.body };
  }
}

// fetchOnce with retries for temporary failures. `attempts` on the result (and on the
// error) says how many tries it took.
export async function safeFetch(raw, { tries = 3, backoffMs = [1500, 4000], ...opts } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return { ...(await fetchOnce(raw, opts)), attempts: attempt };
    } catch (e) {
      e.attempts = attempt;
      if (attempt >= tries || !isTemporary(e)) throw e;
      await new Promise((r) => setTimeout(r, backoffMs[attempt - 1] ?? backoffMs.at(-1)));
    }
  }
}

// An error in words an admin can act on.
export function explainError(e) {
  if (e instanceof BlockedError) return e.message;
  const s = e.status;
  if (s === 401 || s === 403) return `The server refused access (HTTP ${s}). The address may need a credential, or the site blocks automated readers.`;
  if (s === 404 || s === 410) return `This server received HTTP ${s}. The URL may have moved or may return a different response from another network.`;
  if (s === 429) return "The server says too many requests (HTTP 429). It was retried; try again later.";
  if (s >= 500) return `The server had an error (HTTP ${s}). This is usually temporary.`;
  if (s) return `The server answered HTTP ${s}.`;
  const code = e.code ?? e.cause?.code;
  if (code === "ENOTFOUND") return "The domain name could not be found. Check the address for typos.";
  if (code === "ETIMEDOUT") return e.message.startsWith("No answer") ? e.message : "The server did not answer in time.";
  if (code === "ECONNREFUSED") return "The server refused the connection.";
  if (code === "ECONNRESET") return "The connection was dropped by the server.";
  if (/CERT|SSL|TLS/i.test(code ?? "") || /certificate/i.test(e.message)) return `The site's security certificate could not be verified (${code ?? e.message}).`;
  return e.message || String(e);
}
