"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  PONS_V2_FACTORY,
  PUBLIC_RPC,
  addressToTopic,
  buildFactoryLogFilter,
  checkAddressAgainstFactory,
} = require("../src/factory-logs.js");

const REAL_TOKEN = "0x385F4f8ae47651ce5F58F5265395a669f8281e18"; // confirmed NOT a Pons v2 launch, STATUS.md M0.5
const REAL_DEPLOYER = "0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669";

test("addressToTopic left-pads a 20-byte address into a 32-byte topic", () => {
  const topic = addressToTopic(REAL_TOKEN);
  assert.equal(topic.length, 66); // "0x" + 64 hex chars
  assert.ok(topic.endsWith(REAL_TOKEN.slice(2).toLowerCase()));
  assert.ok(topic.startsWith("0x000000000000000000000000"));
});

test("addressToTopic rejects a malformed address", () => {
  assert.throws(() => addressToTopic("not-an-address"), /not a valid address/);
});

test("buildFactoryLogFilter puts the topic in the token position (1)", () => {
  const filter = buildFactoryLogFilter(REAL_TOKEN, 1);
  assert.equal(filter.address, PONS_V2_FACTORY);
  assert.equal(filter.topics.length, 2);
  assert.equal(filter.topics[0], null);
  assert.ok(filter.topics[1].endsWith(REAL_TOKEN.slice(2).toLowerCase()));
});

test("buildFactoryLogFilter puts the topic in the deployer position (3)", () => {
  const filter = buildFactoryLogFilter(REAL_DEPLOYER, 3);
  assert.equal(filter.topics.length, 4);
  assert.equal(filter.topics[0], null);
  assert.equal(filter.topics[1], null);
  assert.equal(filter.topics[2], null);
  assert.ok(filter.topics[3].endsWith(REAL_DEPLOYER.slice(2).toLowerCase()));
});

test("buildFactoryLogFilter rejects a position other than 1 or 3", () => {
  assert.throws(() => buildFactoryLogFilter(REAL_TOKEN, 2), /position must be 1 \(token\) or 3 \(deployer\)/);
});

function stubRpc(handler) {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    assert.equal(url, PUBLIC_RPC);
    const body = JSON.parse(opts.body);
    return { json: async () => handler(body) };
  };
  return () => {
    global.fetch = original;
  };
}

test("checkAddressAgainstFactory reports not found when both positions come back empty", async () => {
  const restore = stubRpc(() => ({ result: [] }));
  try {
    const result = await checkAddressAgainstFactory(REAL_TOKEN);
    assert.equal(result.found, false);
  } finally {
    restore();
  }
});

test("checkAddressAgainstFactory reports found when either position has a match", async () => {
  const restore = stubRpc((body) => {
    // the deployer-position call (topics length 4) gets a match; token-position (length 2) doesn't
    const isDeployerPosition = body.params[0].topics.length === 4;
    return { result: isDeployerPosition ? [{ transactionHash: "0xabc" }] : [] };
  });
  try {
    const result = await checkAddressAgainstFactory(REAL_DEPLOYER);
    assert.equal(result.found, true);
  } finally {
    restore();
  }
});

test("checkAddressAgainstFactory throws if the RPC itself errors, rather than reporting a false negative", async () => {
  const restore = stubRpc(() => ({ error: { message: "connection reset" } }));
  try {
    await assert.rejects(() => checkAddressAgainstFactory(REAL_TOKEN), /connection reset/);
  } finally {
    restore();
  }
});
