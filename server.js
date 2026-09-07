#!/usr/bin/env node
"use strict";

/**
 * The real thread service: serves app/index.html and one JSON API the page
 * calls for deployer history. This is the piece lookup/index.html and
 * demo/index.html can't be on their own -- a Bitquery key has to live
 * server-side, so anything backed by Bitquery needs an actual server, not
 * just a static file opened from disk.
 *
 * No framework, no dependencies: Node's built-in http module is enough for
 * one static page and one API route.
 *
 * Usage:
 *   node server.js
 *   PORT=8080 node server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { parseEnv } = require("./src/env.js");
const { isAddress } = require("./src/chain-read.js");
const { lookupDeployerHistory } = require("./src/deployer-history.js");

const PORT = process.env.PORT ? Number(process.env.PORT) : 4663;

function loadApiKey() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
    if (parsed.BITQUERY_API_TOKEN) return parsed.BITQUERY_API_TOKEN;
  }
  return process.env.BITQUERY_API_TOKEN || null;
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error('No BITQUERY_API_TOKEN found. Add it to .env -- see README.md "Install".');
  process.exit(1);
}

const APP_DIR = path.join(__dirname, "app");
const APP_HTML_PATH = path.join(APP_DIR, "index.html");

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const assets = {
    "/app.js": ["app/app.js", "text/javascript"],
    "/terminal": ["app/terminal.html", "text/html"],
    "/terminal.css": ["app/terminal.css", "text/css"],
    "/terminal.js": ["app/terminal.js", "text/javascript"],
  };
  if (req.method === "GET" && assets[url.pathname]) {
    const [file, type] = assets[url.pathname];
    fs.readFile(path.join(__dirname, file), (err, data) => {
      res.writeHead(err ? 404 : 200, { "Content-Type": `${type}; charset=utf-8` });
      res.end(err ? "not found" : data);
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    fs.readFile(APP_HTML_PATH, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("app/index.html not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  // The page's own script, now that it lives in a file rather than inline.
  // Only files that actually sit inside app/ are served: the path is resolved
  // and checked against that directory, so a request for ../../.env can't
  // walk out of it.
  if (req.method === "GET" && /^\/[\w.-]+\.(js|css|html)$/.test(url.pathname)) {
    const wanted = path.resolve(APP_DIR, "." + url.pathname);
    if (!wanted.startsWith(APP_DIR + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("forbidden");
      return;
    }
    fs.readFile(wanted, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return;
      }
      const type = wanted.endsWith(".css") ? "text/css"
        : wanted.endsWith(".html") ? "text/html"
        : "text/javascript";
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/deployer-history") {
    const address = url.searchParams.get("address") || "";
    if (!isAddress(address)) {
      sendJson(res, 400, { error: `not a valid address: ${address}` });
      return;
    }
    try {
      // One attempt per request, on purpose. Bitquery's realtime tier was
      // observed timing out intermittently on heavier queries and sometimes
      // needing more than one retry to come back -- retrying silently
      // server-side just turns that into a longer silent wait instead of a
      // shorter one. app/index.html retries this endpoint itself, with a
      // status line that updates between attempts, so a slow deployer looks
      // like progress instead of a frozen button.
      const result = await lookupDeployerHistory(address, API_KEY);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 502, { error: err.message });
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`thread is running at http://localhost:${PORT}`);
  console.log("Deployer history is live (Bitquery, server-side key). ERC-20 metadata reads happen");
  console.log("client-side against the public RPC, same as lookup/index.html.");
  console.log("Fee-recipient history is not built -- see STATUS.md M3.");
});
