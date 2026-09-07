"use strict";

const { isAddress } = require("./chain-read.js");
const { buildLaunchQuery, flattenArguments, runQuery } = require("./bitquery.js");
const { checkKnownInfra } = require("./known-infra.js");
const { checkAddressAgainstFactory } = require("./factory-logs.js");

/**
 * The shared core of M1, used by both scripts/deployer-history.js (CLI) and
 * server.js (HTTP API), so the two surfaces can never quietly disagree about
 * what counts as a resolved deployer, an infra flag, an inconclusive lookup,
 * or a confirmed absence. This function does the querying and returns
 * structured data; it prints nothing and knows nothing about a terminal or
 * an HTTP response.
 *
 * Returns one of three shapes:
 *   { status: "resolved", input, deployer, viaToken, infra, launches, hitLimit }
 *   { status: "not-found", input, reason }
 *   { status: "inconclusive", input, reason }
 * `infra` is the known-infra record (see known-infra.js) or null.
 *
 * "not-found" versus "inconclusive" is the distinction that motivated
 * src/factory-logs.js: when Bitquery can't resolve an address, that alone
 * doesn't mean the address isn't a Pons v2 launch -- observed in practice,
 * Bitquery's realtime tier times out on some genuine zero-match queries
 * rather than returning `[]`. Before giving up, this function asks the
 * public RPC directly (a check observed to be fast and clean in exactly
 * this situation, see STATUS.md M0). Only if that direct check also
 * succeeds AND comes back empty in both the token and deployer positions is
 * the answer "not-found" -- an actually-checked negative. If the RPC check
 * itself fails too, the honest answer is still "inconclusive", not a
 * negative neither data source could confirm.
 *
 * `limit` defaults to 30, not the ceiling of 50 the query itself allows.
 * Found in practice (2026-09-07): Bitquery's realtime tier gets noticeably
 * more likely to time out on a heavy deployer as the requested count grows,
 * and this is read interactively (a person watching a page), where a
 * smaller, faster, slightly-more-likely-to-succeed answer beats a bigger
 * one that might not arrive. `scripts/deployer-history.js` and callers that
 * want the ceiling can still pass `{ limit: 50 }` explicitly.
 */
async function lookupDeployerHistory(input, apiKey, { limit = 30 } = {}) {
  if (!isAddress(input)) {
    throw new Error(`not a valid address: ${input}`);
  }

  // See README "Try it": Bitquery's realtime tier was observed timing out on
  // a genuine zero-match Arguments filter rather than returning `[]`
  // quickly, so "try deployer, fall back to token" is run as a race, not a
  // sequence, and a double failure is reported as inconclusive rather than
  // a confirmed negative it can't actually back up.
  const deployerAttempt = (async () => {
    const { query } = buildLaunchQuery("deployer", input, { limit });
    return runQuery(query, apiKey);
  })();

  const tokenAttempt = (async () => {
    const { query } = buildLaunchQuery("token", input, { limit: 1 });
    const events = await runQuery(query, apiKey);
    return events.length > 0 ? flattenArguments(events[0]).deployer : null;
  })();

  const [deployerResult, tokenResult] = await Promise.allSettled([deployerAttempt, tokenAttempt]);

  if (deployerResult.status === "fulfilled" && deployerResult.value.length > 0) {
    const launches = deployerResult.value;
    return {
      status: "resolved",
      input,
      deployer: input,
      viaToken: false,
      infra: checkKnownInfra(input),
      launches: launches.map(flattenArguments).map((args, i) => ({
        token: args.token,
        curve: args.curve,
        pairToken: args.pairToken,
        block: launches[i].Block,
        txHash: launches[i].Transaction.Hash,
      })),
      hitLimit: launches.length === limit,
    };
  }

  if (tokenResult.status === "fulfilled" && tokenResult.value) {
    const deployer = tokenResult.value;
    const { query } = buildLaunchQuery("deployer", deployer, { limit });
    const launches = await runQuery(query, apiKey);
    return {
      status: "resolved",
      input,
      deployer,
      viaToken: true,
      infra: checkKnownInfra(deployer),
      launches: launches.map(flattenArguments).map((args, i) => ({
        token: args.token,
        curve: args.curve,
        pairToken: args.pairToken,
        block: launches[i].Block,
        txHash: launches[i].Transaction.Hash,
      })),
      hitLimit: launches.length === limit,
    };
  }

  const reasons = [deployerResult, tokenResult]
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason.message);
  const bitqueryReason =
    reasons.length > 0 ? reasons.join(" / ") : "no match as either a deployer or a token";

  // Bitquery couldn't resolve it -- ask the public RPC directly before
  // reporting "inconclusive". See the module doc comment for why this
  // distinction is worth the extra call.
  try {
    const direct = await checkAddressAgainstFactory(input);
    if (!direct.found) {
      return {
        status: "not-found",
        input,
        reason:
          "Checked directly against the Pons v2 factory's TokenLaunched logs, in both the " +
          "token and deployer positions, via eth_getLogs -- no match either way.",
      };
    }
    // The direct check found *something* that Bitquery's queries missed --
    // don't guess at what; report the original inconclusive result honestly
    // rather than assembling a partial answer from mismatched data sources.
  } catch (directErr) {
    // Fall through to the original inconclusive result below; note both
    // reasons so it's clear this wasn't just Bitquery being slow.
    return {
      status: "inconclusive",
      input,
      reason: `${bitqueryReason} (direct RPC check also failed: ${directErr.message})`,
    };
  }

  return {
    status: "inconclusive",
    input,
    reason: bitqueryReason,
  };
}

module.exports = { lookupDeployerHistory };
