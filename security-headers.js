"use strict";

// The security headers every response carries, in one place, so server.js and
// bank/ cannot drift apart on them.
//
// Why these exist: the OWASP ZAP baseline scan (security-scan.yml) reported
// eight findings on 2026-10-05, every one of them a header the site did not
// send. This module answers all of them. Nothing here changes what a page does;
// it tells the browser what the page is allowed to do.
//
// The Content Security Policy (CSP) is the one that bites, because it blocks
// anything it does not list. The site has three kinds of HTML and they get
// three policies:
//
//   app      /app, the Vite build. Its index.html has no inline code of its
//            own, but a Radix dialog injects a <style> element at runtime, so
//            the page gets a nonce: a one-time value the server puts in the
//            header and into the tags Vite marked for it, and the app hands to
//            the style injector (see web/src/main.tsx). Anything without the
//            nonce is refused.
//   classic  The original demo pages in public/. Three of them carry an inline
//            <script>, so the exact text of each is hashed at startup and the
//            hashes go in the policy: an edit to one of those scripts changes
//            its hash on the next start and nothing else. Their inline styles
//            keep 'unsafe-inline', the one concession on the whole site, kept
//            because those pages are the older demo and are left as they are.
//   docs     /api/docs, Swagger UI: its one inline script is hashed the same
//            way, and Swagger sets inline styles, so it is treated like a
//            classic page.
//
// Everything that is not a page (JSON, CSV, assets) gets a policy that allows
// nothing at all, which is right for a response no browser renders.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DIR = path.join(__dirname, "public");

// Headers every response carries, whatever it is.
//
//   X-Content-Type-Options       the browser trusts the Content-Type we send
//   X-Frame-Options              no page of ours inside another site's frame
//   Referrer-Policy              other sites learn our origin, not our URLs
//   Permissions-Policy           the site never asks for camera, mic, location
//                                or payment, so it says so up front
//   Cross-Origin-Opener-Policy   a page we open cannot reach back into ours
//   Cross-Origin-Embedder-Policy only resources that opt in may be embedded;
//                                everything here is same-origin, so it costs
//                                nothing
//   Cross-Origin-Resource-Policy our files are for our pages only
const ALWAYS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
});

// Strict-Transport-Security tells the browser to use https for the next year.
// Sent only when the request came over https (Render terminates TLS and says
// so in X-Forwarded-Proto): over plain http on a laptop or in CI it would be
// ignored anyway, and a wrong one is hard to undo.
const HSTS = "max-age=31536000; includeSubDomains";

const NONCE_PLACEHOLDER = "__CSP_NONCE__";

function isHttps(request) {
  const proto = String(request?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  return proto === "https";
}

function newNonce() {
  return crypto.randomBytes(16).toString("base64");
}

function hash(text) {
  return `'sha256-${crypto.createHash("sha256").update(text).digest("base64")}'`;
}

// The hash of every inline <script> (one without src) in a piece of HTML. CSP
// hashes the exact text between the tags, whitespace included, so the text is
// taken as is.
function inlineScriptHashes(html) {
  const hashes = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (match[1].trim()) {
      hashes.push(hash(match[1]));
    }
  }
  return hashes;
}

// Every classic page's inline scripts, hashed once at startup.
function classicScriptHashes() {
  const hashes = new Set();
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    if (!file.endsWith(".html")) continue;
    const html = fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8");
    for (const h of inlineScriptHashes(html)) {
      hashes.add(h);
    }
  }
  return [...hashes];
}

const CLASSIC_SCRIPT_HASHES = classicScriptHashes();

// The parts every page policy shares: nothing from other origins, no plugins,
// no <base> tricks, forms only to us, never inside a frame. Fonts allow data:
// because Vite inlines the smallest font file as a data URL; the browser-walk
// in react-bank-devices.spec.ts is what found that out.
const PAGE_TAIL =
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function policyFor(kind, { nonce, scriptHashes } = {}) {
  switch (kind) {
    case "app":
      return (
        `default-src 'self'; script-src 'self' 'nonce-${nonce}'; ` +
        `style-src 'self' 'nonce-${nonce}'; ${PAGE_TAIL}`
      );
    case "classic":
      return (
        `default-src 'self'; script-src 'self' ${CLASSIC_SCRIPT_HASHES.join(" ")}; ` +
        `style-src 'self' 'unsafe-inline'; ${PAGE_TAIL}`
      );
    case "docs":
      return (
        `default-src 'self'; script-src 'self' ${(scriptHashes || []).join(" ")}; ` +
        `style-src 'self' 'unsafe-inline'; ${PAGE_TAIL}`
      );
    default:
      // JSON, CSV, text and files: no browser renders these as a page, so the
      // policy allows nothing.
      return "default-src 'none'; frame-ancestors 'none'";
  }
}

// The full header set for one response. `extra` is the caller's own headers
// (Content-Type, Cache-Control, Set-Cookie...) and wins on a clash.
//
//   kind   "app" | "classic" | "docs" | "api" | "asset"
//   nonce  required for "app"
function headersFor(kind, { request, nonce, scriptHashes, extra } = {}) {
  const headers = {
    ...ALWAYS,
    "Content-Security-Policy": policyFor(kind, { nonce, scriptHashes }),
  };
  if (isHttps(request)) {
    headers["Strict-Transport-Security"] = HSTS;
  }
  return { ...headers, ...(extra || {}) };
}

module.exports = {
  NONCE_PLACEHOLDER,
  headersFor,
  inlineScriptHashes,
  isHttps,
  newNonce,
};
