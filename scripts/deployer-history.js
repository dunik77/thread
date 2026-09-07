#!/usr/bin/env node
"use strict";

/**
 * Real M1: given a token or deployer address, print every Pons v2 launch
 * known to share that deployer, sourced live from Bitquery's index of
 * `TokenLaunched` events -- no local storage, a live query every run,
 * exactly as M1 in STATUS.md describes it.
 *
 * Requires BITQUERY_API_TOKEN in .env (see README.md "Install"). The key
 * is read here, server-side, and never touches a browser -- lookup/index.html
 * intentionally does NOT grow this feature, because a Bitquery key embedded
 * in a static page would be exposed to anyone who views source.
 *
 * Usage:
 *   node scripts/deployer-history.js <address>
 */

const fs = require("fs");
const path = require("path");
const { parseEnv } = require("../src/env.js");
const { isAddress, shortAddr } = require("../src/chain-read.js");
const { buildLaunchQuery, flattenArguments, runQuery } = require("../src/bitquery.js");
const { checkKnownInfra } = require("../src/known-infra.js");

function loadApiKey() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    return process.env.BITQUERY_API_TOKEN || null;
  }
  const parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
  return parsed.BITQUERY_API_TOKEN || process.env.BITQUERY_API_TOKEN || null;
}

async function findDeployerFor(tokenAddress, apiKey) {
  const { query } = buildLaunchQuery("token", tokenAddress, { limit: 1 });
  const events = await runQuery(query, apiKey);
  if (events.length === 0) return null;
  return flattenArguments(events[0]).deployer;
}

async function buildAndRun(argumentName, address, apiKey) {
  const { query } = buildLaunchQuery(argumentName, address, { limit: 50 });
  return runQuery(query, apiKey);
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
    console.error("No BITQUERY_API_TOKEN found. Add it to .env -- see README.md \"Install\".");
    process.exit(1);
  }

  console.log(`Looking up ${input} against Pons v2's TokenLaunched log (live, via Bitquery)...\n`);

  // Bitquery's realtime tier answers a MATCHING Arguments filter fast, but a
  // filter with zero matches appears to time out server-side instead of
  // returning an empty list quickly (observed repeatedly against this API,
  // 2026-09-07 -- not documented behavior, just what happened every time).
  // So rather than trying "deployer" and waiting to see if it comes back
  // empty before trying "token", both are fired in parallel and whichever
  // one actually resolves wins. If both time out, that's reported as
  // inconclusive -- NOT as a confirmed absence, which would overclaim what
  // a timeout actually tells you.
  const deployerAttempt = buildAndRun("deployer", input, apiKey);
  const tokenAttempt = findDeployerFor(input, apiKey);
  const [deployerResult, tokenResult] = await Promise.allSettled([deployerAttempt, tokenAttempt]);

  let deployer = null;
  let events = null;

  if (deployerResult.status === "fulfilled" && deployerResult.value.length > 0) {
    deployer = input;
    events = deployerResult.value;
  } else if (tokenResult.status === "fulfilled" && tokenResult.value) {
    deployer = tokenResult.value;
    console.log(`${input} is a token launched by ${deployer}. Its history:\n`);
    const { query } = buildLaunchQuery("deployer", deployer, { limit: 50 });
    events = await runQuery(query, apiKey);
  } else {
    const reasons = [deployerResult, tokenResult]
      .filter((r) => r.status === "rejected")
      .map((r) => r.reason.message)
      .join(" / ");
    console.log(`Couldn't resolve ${input} as either a deployer or a token: ${reasons || "no match either way"}`);
    console.log("This is inconclusive, not a confirmed \"not on Pons v2\" -- Bitquery's realtime tier appears to");
    console.log("time out on a zero-match Arguments filter rather than returning an empty list quickly.");
    console.log("For a definitive negative, check eth_getLogs against the public RPC directly (see STATUS.md M0).");
    return;
  }

  const infra = checkKnownInfra(deployer);
  if (infra) {
    console.log(`⚠  ${deployer} is known shared infrastructure: ${infra.name}`);
    console.log(`   ${infra.reason}`);
    console.log(`   The ${events.length} launch(es) below are NOT evidence of one deployer -- they only`);
    console.log(`   share a batching contract. See SPEC.md "Open questions" for how this was confirmed.\n`);
  }

  console.log(`Deployer:  ${deployer}`);
  console.log(`Launches found: ${events.length}${events.length === 50 ? " (hit the query limit -- there may be more)" : ""}\n`);

  for (const e of events) {
    const args = flattenArguments(e);
    console.log(`  ${e.Block.Time}  token=${shortAddr(args.token)}  tx=${shortAddr(e.Transaction.Hash)}`);
  }

  if (events.length === 0) {
    console.log("  (none)");
  }

  console.log("\nEvidence gaps: fee-escrow recipient data is not in this event and isn't decoded yet (SPEC.md M3).");
  console.log("This is deployer history only -- see docs/case-file-format.md for the full case file this feeds into.");
}

main().catch((err) => {
  console.error("Query failed:", err.message);
  process.exit(1);
});
