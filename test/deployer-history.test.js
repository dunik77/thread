"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lookupDeployerHistory } = require("../src/deployer-history.js");
const { BITQUERY_ENDPOINT } = require("../src/bitquery.js");
const { PUBLIC_RPC } = require("../src/factory-logs.js");

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const REAL_DEPLOYER = "0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669";
const REAL_TOKEN = "0xa146cc739a09d0543e7e5b525f8eca26bb518032";

// Shape captured from a real Bitquery response, 2026-09-07, trimmed to what
// the code actually reads. Stubbing fetch keeps these tests offline and
// fast while still exercising the real parallel-resolution logic in
// src/deployer-history.js against data it has actually seen in the field.
function launchedEvent(token, deployer, txHash, time) {
  return {
    Block: { Time: time, Number: "56000000" },
    Transaction: { Hash: txHash },
    Arguments: [
      { Name: "token", Value: { address: token } },
      { Name: "curve", Value: { address: "0x0000000000000000000000000000000000000001" } },
      { Name: "deployer", Value: { address: deployer } },
      { Name: "pairToken", Value: { address: "0x0000000000000000000000000000000000000000" } },
      { Name: "launchConfigId", Value: {} },
      { Name: "graduationThreshold", Value: {} },
    ],
  };
}

/**
 * `bitquery(query)` handles calls to Bitquery's endpoint (given the raw
 * GraphQL query string, as before). `rpc(body)` handles calls to the public
 * RPC (given the parsed JSON-RPC body) and defaults to a clean, empty
 * eth_getLogs result -- the "not-found" path's default, since most tests
 * here care about Bitquery's behavior, not the RPC fallback specifically.
 */
function stubFetch({ bitquery, rpc = () => ({ result: [] }) }) {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (url === BITQUERY_ENDPOINT) {
      return { json: async () => bitquery(body.query) };
    }
    if (url === PUBLIC_RPC) {
      return { json: async () => rpc(body) };
    }
    throw new Error(`unexpected fetch url in test: ${url}`);
  };
  return () => {
    global.fetch = original;
  };
}

test("lookupDeployerHistory resolves a real repeat deployer directly", async () => {
  const restore = stubFetch({
    bitquery: (query) => {
      if (query.includes('Name: {is: "deployer"}')) {
        return {
          data: {
            EVM: {
              Events: [
                launchedEvent("0xtoken1", REAL_DEPLOYER, "0xtx1", "2026-09-05T00:00:00Z"),
                launchedEvent("0xtoken2", REAL_DEPLOYER, "0xtx2", "2026-09-06T00:00:00Z"),
              ],
            },
          },
        };
      }
      return { data: { EVM: { Events: [] } } };
    },
  });
  try {
    const result = await lookupDeployerHistory(REAL_DEPLOYER, "fake-key");
    assert.equal(result.status, "resolved");
    assert.equal(result.viaToken, false);
    assert.equal(result.infra, null);
    assert.equal(result.launches.length, 2);
    assert.equal(result.hitLimit, false);
  } finally {
    restore();
  }
});

test("lookupDeployerHistory flags Multicall3 as known infrastructure", async () => {
  const restore = stubFetch({
    bitquery: (query) => {
      if (query.includes('Name: {is: "deployer"}')) {
        return { data: { EVM: { Events: [launchedEvent("0xtoken1", MULTICALL3, "0xtx1", "2026-09-05T00:00:00Z")] } } };
      }
      return { data: { EVM: { Events: [] } } };
    },
  });
  try {
    const result = await lookupDeployerHistory(MULTICALL3, "fake-key");
    assert.equal(result.status, "resolved");
    assert.ok(result.infra);
    assert.equal(result.infra.name, "Multicall3");
  } finally {
    restore();
  }
});

test("lookupDeployerHistory resolves a token address via its deployer", async () => {
  const restore = stubFetch({
    bitquery: (query) => {
      if (query.includes(`Name: {is: "deployer"}`) && query.includes(REAL_TOKEN.toLowerCase())) {
        // deployer-argument query against the TOKEN address itself: no match
        return { data: { EVM: { Events: [] } } };
      }
      if (query.includes('Name: {is: "token"}')) {
        return { data: { EVM: { Events: [launchedEvent(REAL_TOKEN, REAL_DEPLOYER, "0xtx1", "2026-09-05T00:00:00Z")] } } };
      }
      if (query.includes('Name: {is: "deployer"}') && query.includes(REAL_DEPLOYER)) {
        return { data: { EVM: { Events: [launchedEvent(REAL_TOKEN, REAL_DEPLOYER, "0xtx1", "2026-09-05T00:00:00Z")] } } };
      }
      return { data: { EVM: { Events: [] } } };
    },
  });
  try {
    const result = await lookupDeployerHistory(REAL_TOKEN, "fake-key");
    assert.equal(result.status, "resolved");
    assert.equal(result.viaToken, true);
    assert.equal(result.deployer, REAL_DEPLOYER);
  } finally {
    restore();
  }
});

test("lookupDeployerHistory reports not-found when Bitquery is inconclusive but the RPC confirms zero matches", async () => {
  const restore = stubFetch({
    bitquery: () => ({
      errors: [{ message: "context deadline exceeded (Client.Timeout exceeded while awaiting headers)" }],
    }),
    rpc: () => ({ result: [] }), // clean, empty -- the real "snowball capital" case
  });
  try {
    const result = await lookupDeployerHistory("0x3FBf37267A7a0f54B9062a465A997e4698925910", "fake-key");
    assert.equal(result.status, "not-found");
    assert.match(result.reason, /Checked directly against the Pons v2 factory/);
  } finally {
    restore();
  }
});

test("lookupDeployerHistory stays inconclusive when both Bitquery and the direct RPC check fail", async () => {
  const restore = stubFetch({
    bitquery: () => ({
      errors: [{ message: "context deadline exceeded (Client.Timeout exceeded while awaiting headers)" }],
    }),
    rpc: () => ({ error: { message: "connection reset" } }),
  });
  try {
    const result = await lookupDeployerHistory("0x385F4f8ae47651ce5F58F5265395a669f8281e18", "fake-key");
    assert.equal(result.status, "inconclusive");
    assert.match(result.reason, /deadline exceeded/);
    assert.match(result.reason, /direct RPC check also failed/);
  } finally {
    restore();
  }
});

test("lookupDeployerHistory rejects a malformed address before any network call", async () => {
  await assert.rejects(() => lookupDeployerHistory("not-an-address", "fake-key"), /not a valid address/);
});

test("lookupDeployerHistory reports hitLimit when a deployer query returns exactly the requested limit", async () => {
  const restore = stubFetch({
    bitquery: (query) => {
      if (query.includes('Name: {is: "deployer"}')) {
        const events = Array.from({ length: 5 }, (_, i) =>
          launchedEvent(`0xtoken${i}`, REAL_DEPLOYER, `0xtx${i}`, "2026-09-05T00:00:00Z")
        );
        return { data: { EVM: { Events: events } } };
      }
      return { data: { EVM: { Events: [] } } };
    },
  });
  try {
    const result = await lookupDeployerHistory(REAL_DEPLOYER, "fake-key", { limit: 5 });
    assert.equal(result.launches.length, 5);
    assert.equal(result.hitLimit, true);
  } finally {
    restore();
  }
});

test("lookupDeployerHistory defaults to a limit of 30, lower than the query's own ceiling of 50", async () => {
  // both the deployer-argument and token-argument attempts fire in parallel;
  // capture every query issued and check the deployer one specifically.
  const capturedQueries = [];
  const restore = stubFetch({
    bitquery: (query) => {
      capturedQueries.push(query);
      return { data: { EVM: { Events: [] } } };
    },
  });
  try {
    await lookupDeployerHistory(REAL_DEPLOYER, "fake-key");
    const deployerQuery = capturedQueries.find((q) => q.includes('Name: {is: "deployer"}'));
    assert.ok(deployerQuery, "expected a deployer-argument query to have been issued");
    assert.ok(deployerQuery.includes("limit: {count: 30}"));
  } finally {
    restore();
  }
});
