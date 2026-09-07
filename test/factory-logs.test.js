"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  PONS_V2_FACTORY,
  PUBLIC_RPC,
  TOKEN_LAUNCHED_TOPIC0,
  addressToTopic,
  topicToAddress,
  buildFactoryLogFilter,
  parseLaunchLog,
  checkAddressAgainstFactory,
} = require("../src/factory-logs.js");

const REAL_TOKEN = "0x385F4f8ae47651ce5F58F5265395a669f8281e18"; // confirmed NOT a Pons v2 launch, STATUS.md M0.5
const REAL_DEPLOYER = "0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669";

// A real TokenLaunched log's shape (fields this code actually reads),
// captured against a genuine launch on 2026-09-07 and re-parameterized here.
function fakeLog(token, curve, deployer, txHash, blockNumberHex) {
  return {
    address: PONS_V2_FACTORY,
    topics: [TOKEN_LAUNCHED_TOPIC0, addressToTopic(token), addressToTopic(curve), addressToTopic(deployer)],
    data: "0x",
    blockNumber: blockNumberHex,
    transactionHash: txHash,
  };
}

test("addressToTopic left-pads a 20-byte address into a 32-byte topic", () => {
  const topic = addressToTopic(REAL_TOKEN);
  assert.equal(topic.length, 66); // "0x" + 64 hex chars
  assert.ok(topic.endsWith(REAL_TOKEN.slice(2).toLowerCase()));
  assert.ok(topic.startsWith("0x000000000000000000000000"));
});

test("addressToTopic rejects a malformed address", () => {
  assert.throws(() => addressToTopic("not-an-address"), /not a valid address/);
});

test("topicToAddress reverses addressToTopic", () => {
  assert.equal(topicToAddress(addressToTopic(REAL_TOKEN)), REAL_TOKEN.toLowerCase());
});

test("buildFactoryLogFilter always constrains topic0 to the TokenLaunched signature", () => {
  const filter = buildFactoryLogFilter(REAL_TOKEN, 1);
  assert.equal(filter.address, PONS_V2_FACTORY);
  assert.equal(filter.topics[0], TOKEN_LAUNCHED_TOPIC0);
});

test("buildFactoryLogFilter puts the topic in the token position (1)", () => {
  const filter = buildFactoryLogFilter(REAL_TOKEN, 1);
  assert.equal(filter.topics.length, 4);
  assert.equal(filter.topics[2], null);
  assert.equal(filter.topics[3], null);
  assert.ok(filter.topics[1].endsWith(REAL_TOKEN.slice(2).toLowerCase()));
});

test("buildFactoryLogFilter puts the topic in the deployer position (3)", () => {
  const filter = buildFactoryLogFilter(REAL_DEPLOYER, 3);
  assert.equal(filter.topics[1], null);
  assert.equal(filter.topics[2], null);
  assert.ok(filter.topics[3].endsWith(REAL_DEPLOYER.slice(2).toLowerCase()));
});

test("buildFactoryLogFilter rejects a position other than 1 or 3", () => {
  assert.throws(() => buildFactoryLogFilter(REAL_TOKEN, 2), /position must be 1 \(token\) or 3 \(deployer\)/);
});

test("parseLaunchLog reads token, curve, and deployer positionally out of a real-shaped log", () => {
  const log = fakeLog(REAL_TOKEN, REAL_DEPLOYER, REAL_DEPLOYER, "0xabc", "0x1");
  const parsed = parseLaunchLog(log);
  assert.equal(parsed.token, REAL_TOKEN.toLowerCase());
  assert.equal(parsed.deployer, REAL_DEPLOYER.toLowerCase());
  assert.equal(parsed.txHash, "0xabc");
  assert.equal(parsed.block.Number, "1");
  assert.equal(parsed.block.Time, null); // filled in later by attachBlockTimes, not here
});

/**
 * `checkAddressAgainstFactory` calls two different JSON-RPC methods:
 * eth_getLogs (the actual search) and eth_getBlockByNumber (to fill in a
 * real timestamp per unique block, batched). This stub answers based on
 * `body.method` so both are covered without conflating them.
 */
function stubRpc({ logs, blockTimestamp = "0x68b9a000" }) {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    assert.equal(url, PUBLIC_RPC);
    const body = JSON.parse(opts.body);
    if (body.method === "eth_getLogs") {
      return { json: async () => logs(body.params[0]) };
    }
    if (body.method === "eth_getBlockByNumber") {
      return { json: async () => ({ result: { timestamp: blockTimestamp } }) };
    }
    throw new Error(`unexpected RPC method in test: ${body.method}`);
  };
  return () => {
    global.fetch = original;
  };
}

test("checkAddressAgainstFactory reports not found when both positions come back empty", async () => {
  const restore = stubRpc({ logs: () => ({ result: [] }) });
  try {
    const result = await checkAddressAgainstFactory(REAL_TOKEN);
    assert.equal(result.found, false);
    assert.deepEqual(result.asToken, []);
    assert.deepEqual(result.asDeployer, []);
  } finally {
    restore();
  }
});

test("checkAddressAgainstFactory returns real, parsed launches when the deployer position matches", async () => {
  const restore = stubRpc({
    logs: (params) => {
      // topics[3] set (non-null) identifies the deployer-position call
      const isDeployerPosition = params.topics[3] !== null;
      return {
        result: isDeployerPosition
          ? [fakeLog("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", REAL_DEPLOYER, "0xabc", "0x1")]
          : [],
      };
    },
  });
  try {
    const result = await checkAddressAgainstFactory(REAL_DEPLOYER);
    assert.equal(result.found, true);
    assert.equal(result.asDeployer.length, 1);
    assert.equal(result.asDeployer[0].token, "0x1111111111111111111111111111111111111111");
    assert.equal(result.asDeployer[0].deployer, REAL_DEPLOYER.toLowerCase());
    assert.ok(result.asDeployer[0].block.Time, "expected a real timestamp attached, not null");
  } finally {
    restore();
  }
});

test("checkAddressAgainstFactory throws if the RPC itself errors, rather than reporting a false negative", async () => {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.method === "eth_getLogs") {
      return { json: async () => ({ error: { message: "connection reset" } }) };
    }
    return { json: async () => ({ result: { timestamp: "0x0" } }) };
  };
  try {
    await assert.rejects(() => checkAddressAgainstFactory(REAL_TOKEN), /connection reset/);
  } finally {
    global.fetch = original;
  }
});
