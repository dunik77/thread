#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceHtml = path.join(root, "site", "index.html");
const sourceAssets = path.join(root, "assets");
const output = path.join(root, "dist");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const html = fs
  .readFileSync(sourceHtml, "utf8")
  .replaceAll("../assets/", "./assets/");

fs.writeFileSync(path.join(output, "index.html"), html);
fs.cpSync(sourceAssets, path.join(output, "assets"), { recursive: true });

console.log("Built Cloudflare site in dist/");
