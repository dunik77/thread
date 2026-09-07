"use strict";

const { isAddress } = require("./chain-read.js");
const { buildLaunchQuery, flattenArguments, runQuery } = require("./bitquery.js");
const { checkKnownInfra } = require("./known-infra.js");
const { checkAddressAgainstFactory, readDeployerLaunches } = require("./factory-logs.js");

function fromEvent(event) {
  const args = flattenArguments(event);
  return { token: args.token, curve: args.curve, deployer: args.deployer,
    pairToken: args.pairToken, block: event.Block, txHash: event.Transaction.Hash };
}

// Once a token is confirmed, never discard that evidence if history fails.
async function resolveTokenHistory(input, seed, apiKey, limit, viaDirectRpc = false) {
  const deployer = seed.deployer;
  const base = { status: "resolved", input, deployer, viaToken: true,
    infra: checkKnownInfra(deployer), hitLimit: false };
  let indexedError = "indexer unavailable";
  if (!viaDirectRpc) {
    try {
      const { query } = buildLaunchQuery("deployer", deployer, { limit });
      const events = await runQuery(query, apiKey);
      // An empty list contradicts the launch we just resolved: try RPC.
      if (events.length) {
        const launches = mergeLaunches(events.map(fromEvent), [seed]);
        return { ...base, launches, hitLimit: events.length === limit };
      }
      indexedError = "indexer returned no history for a confirmed deployer";
    } catch (err) { indexedError = err.message; }
  }
  try {
    const launches = await readDeployerLaunches(deployer);
    if (!launches.length) throw new Error("no history returned for a confirmed deployer");
    return { ...base, launches: mergeLaunches(launches, [seed]), viaDirectRpc: true };
  } catch (err) {
    return { ...base, launches: [seed], ...(viaDirectRpc ? { viaDirectRpc: true } : {}),
      partial: true, partialReason: `Showing the confirmed launch. Loading the deployer's other launches failed: ${indexedError}; RPC: ${err.message}. Retry to load the remaining history.` };
  }
}

function mergeLaunches(...lists) {
  const seen = new Map();
  for (const launch of lists.flat()) {
    const key = launch.token.toLowerCase();
    if (!seen.has(key)) seen.set(key, launch);
  }
  return [...seen.values()].sort((a, b) => Number(b.block?.Number || 0) - Number(a.block?.Number || 0));
}

/**
 * The shared core of M1, used by both scripts/deployer-history.js (CLI) and
 * server.js (HTTP API), so the two surfaces can never quietly disagree about
 * what counts as a resolved deployer, an infra flag, an inconclusive lookup,
 * or a confirmed absence. This function does the querying and returns
 * structured data; it prints nothing and knows nothing about a terminal or
 * an HTTP response.
 *
 * Returns one of three shapes:
 *   { status: "resolved", input, deployer, viaToken, infra, launches, hitLimit, viaDirectRpc?, partial?, partialReason? }
 *   { status: "not-found", input, reason }
 *   { status: "inconclusive", input, reason }
 *
 * `infra` is the known-infra record (see known-infra.js) or null.
 * `viaDirectRpc` (true) marks a "resolved" result assembled from
 * src/factory-logs.js's direct eth_getLogs check rather than from Bitquery
 * -- used whenever Bitquery couldn't answer but the chain itself could.
 * `partial` (true) + `partialReason` mark a "resolved" result missing
 * something it would normally have (typically: confirmed the deployer, but
 * couldn't get their *other* launches from any source this time) --
 * `launches` may then be incomplete, not a true "this deployer has exactly
 * N launches" count.
 *
 * "not-found" versus "inconclusive" is the distinction that motivated
 * src/factory-logs.js: when Bitquery can't resolve an address, that alone
 * doesn't mean the address isn't a Pons v2 launch -- observed in practice,
 * Bitquery's realtime tier times out on some genuine zero-match queries
 * rather than returning `[]`. Before giving up, this function asks the
 * public RPC directly (a check observed to be fast and clean in exactly
 * this situation, see STATUS.md M0). Per M1.8, that direct check doesn't
 * just settle found-vs-not -- its matches are read as real launch data
 * (see src/factory-logs.js's TOKEN_LAUNCHED_TOPIC0 constraint, which is
 * what makes that safe), so a Bitquery failure with a confirmed chain match
 * still produces a genuine "resolved" answer, not a shrug.
 *
 * `limit` defaults to 30, not the ceiling of 50 the query itself allows.
 * Found in practice (2026-09-07): Bitquery's realtime tier gets noticeably
 * more likely to time out on a heavy deployer as the requested count grows,
 * and this is read interactively (a person watching a page), where a
 * smaller, faster, slightly-more-likely-to-succeed answer beats a bigger
 * one that might not arrive. `scripts/deployer-history.js` and callers that
 * want the ceiling can still pass `{ limit: 50 }` explicitly. The direct
 * RPC fallback isn't capped this way -- eth_getLogs returns everything that
 * matches, since Pons v2's launch volume per deployer doesn't get anywhere
 * near eth_getLogs' own much higher match ceiling.
 */
async function lookupDeployerHistory(input, apiKey, { limit = 30 } = {}) {
  if (!isAddress(input)) {
    throw new Error(`not a valid address: ${input}`);
  }

  // See README "Try it": Bitquery's realtime tier was observed timing out on
  // a genuine zero-match Arguments filter rather than returning `[]`
  // quickly, so "try deployer, fall back to token" is run as a race, not a
  // sequence, and a double failure falls through to the direct-RPC check
  // below rather than assuming a confirmed negative.
  const deployerAttempt = (async () => {
    const { query } = buildLaunchQuery("deployer", input, { limit });
    return runQuery(query, apiKey);
  })();

  const tokenAttempt = (async () => {
    const { query } = buildLaunchQuery("token", input, { limit: 1 });
    const events = await runQuery(query, apiKey);
    return events.length > 0 ? fromEvent(events[0]) : null;
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
      launches: mergeLaunches(launches.map(fromEvent)),
      hitLimit: launches.length === limit,
    };
  }

  if (tokenResult.status === "fulfilled" && tokenResult.value) {
    return resolveTokenHistory(input, tokenResult.value, apiKey, limit);
  }

  // Neither Bitquery attempt resolved directly. Ask the public RPC before
  // reporting anything -- and if it succeeds, use its data as the real
  // answer (see src/factory-logs.js), not just a yes/no signal.
  const reasons = [deployerResult, tokenResult]
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason.message);
  const bitqueryReason =
    reasons.length > 0 ? reasons.join(" / ") : "no match as either a deployer or a token";

  try {
    const direct = await checkAddressAgainstFactory(input);

    if (direct.asDeployer.length > 0) {
      // input is a confirmed deployer, and eth_getLogs already handed back
      // every one of its launches -- no separate follow-up query needed.
      return {
        status: "resolved",
        input,
        deployer: input,
        viaToken: false,
        infra: checkKnownInfra(input),
        launches: direct.asDeployer,
        hitLimit: false,
        viaDirectRpc: true,
      };
    }

    if (direct.asToken.length > 0) {
      return resolveTokenHistory(input, direct.asToken[0], apiKey, limit, true);
    }

    return {
      status: "not-found",
      input,
      reason:
        "Checked directly against the Pons v2 factory's TokenLaunched logs, in both the " +
        "token and deployer positions, via eth_getLogs -- no match either way.",
    };
  } catch (directErr) {
    return {
      status: "inconclusive",
      input,
      reason: `${bitqueryReason} (direct RPC check also failed: ${directErr.message})`,
    };
  }
}

module.exports = { lookupDeployerHistory };
