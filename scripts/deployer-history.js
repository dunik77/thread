#!/usr/bin/env node
"use strict";

/**
 * CLI for M1: given a token or deployer address, print every Pons v2 launch
 * known to share that deployer. All the actual logic lives in
 * src/deployer-history.js, shared with server.js's HTTP API -- this file
 * only formats it for a terminal.
 *
 * Requires BITQUERY_API_TOKEN in .env (see README.md "Install"). The key is
 * read here, server-side, and never touches a browser.
 *
 * Usage:
 *   node scripts/deployer-history.js <address>
 */

const fs = require("fs");
const path = require("path");
const { parseEnv } = require("../src/env.js");
const { isAddress, shortAddr } = require("../src/chain-read.js");
const { lookupDeployerHistory } = require("../src/deployer-history.js");

function loadApiKey() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    return process.env.BITQUERY_API_TOKEN || null;
  }
  const parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
  return parsed.BITQUERY_API_TOKEN || process.env.BITQUERY_API_TOKEN || null;
}

async function main() {
  const input = process.argv[2];
  if (!input || !isAddress(input)) {
    console.error("Usage: node scripts/deployer-history.js <0x address>");
    console.error("The address can be a Pons v2 token OR its deployer -- both are tried.");
    process.exit(1);
  }

  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error('No BITQUERY_API_TOKEN found. Add it to .env -- see README.md "Install".');
    process.exit(1);
  }

  console.log(`Looking up ${input} against Pons v2's TokenLaunched log (live, via Bitquery)...\n`);

  const result = await lookupDeployerHistory(input, apiKey);

  if (result.status === "not-found") {
    console.log(`${input} is not a Pons v2 launch.`);
    console.log(result.reason);
    return;
  }

  if (result.status === "inconclusive") {
    console.log(`Couldn't resolve ${input} as either a deployer or a token: ${result.reason}`);
    console.log('This is genuinely inconclusive -- both Bitquery and a direct eth_getLogs check against the');
    console.log("public RPC failed to give a clean answer. Try again, or check STATUS.md M0 for the method.");
    return;
  }

  if (result.viaToken) {
    console.log(`${input} is a token launched by ${result.deployer}. Its history:\n`);
  }

  if (result.infra) {
    console.log(`⚠  ${result.deployer} is known shared infrastructure: ${result.infra.name}`);
    console.log(`   ${result.infra.reason}`);
    console.log(`   The ${result.launches.length} launch(es) below are NOT evidence of one deployer -- they only`);
    console.log(`   share a batching contract. See SPEC.md "Open questions" for how this was confirmed.\n`);
  }

  console.log(`Deployer:  ${result.deployer}`);
  console.log(`Launches found: ${result.launches.length}${result.hitLimit ? " (hit the query limit -- there may be more)" : ""}\n`);

  for (const l of result.launches) {
    console.log(`  ${l.block.Time}  token=${shortAddr(l.token)}  tx=${shortAddr(l.txHash)}`);
  }
  if (result.launches.length === 0) {
    console.log("  (none)");
  }

  console.log("\nEvidence gaps: fee-escrow recipient data is not in this event and isn't decoded yet (SPEC.md M3).");
  console.log("This is deployer history only -- see docs/case-file-format.md for the full case file this feeds into.");
}

main().catch((err) => {
  console.error("Query failed:", err.message);
  process.exit(1);
});
