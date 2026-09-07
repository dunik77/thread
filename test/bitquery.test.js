"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildLaunchQuery, flattenArguments, PONS_V2_FACTORY } = require("../src/bitquery.js");

const REAL_DEPLOYER = "0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669";
const REAL_TOKEN = "0x385F4f8ae47651ce5F58F5265395a669f8281e18";

test("buildLaunchQuery targets the real Pons v2 factory address", () => {
  const { query } = buildLaunchQuery("deployer", REAL_DEPLOYER);
  assert.ok(query.includes(PONS_V2_FACTORY));
});

test("buildLaunchQuery filters on the requested argument name and lowercased address", () => {
  const { query } = buildLaunchQuery("deployer", REAL_DEPLOYER);
  assert.ok(query.includes('Name: {is: "deployer"}'));
  assert.ok(query.includes(REAL_DEPLOYER.toLowerCase()));
});

test("buildLaunchQuery defaults to the realtime dataset (the only one this API key can reach)", () => {
  const { query } = buildLaunchQuery("token", REAL_TOKEN);
  assert.ok(query.includes("dataset: realtime"));
});

test("buildLaunchQuery rejects an argument name other than deployer/token", () => {
  assert.throws(() => buildLaunchQuery("curve", REAL_DEPLOYER), /must be "deployer" or "token"/);
});

test("buildLaunchQuery rejects a malformed address", () => {
  assert.throws(() => buildLaunchQuery("deployer", "not-an-address"), /not a valid address/);
});

test("flattenArguments turns Bitquery's Arguments array into a plain address map", () => {
  // shape taken directly from a real response, captured 2026-09-07
  const event = {
    Arguments: [
      { Name: "token", Value: { address: "0x320d2b577bffe5b6e5d8ceaba7231a80ccb8f82d" } },
      { Name: "curve", Value: { address: "0x8014aa8c27058251e36f8875dd07f8274b3d10ab" } },
      { Name: "deployer", Value: { address: REAL_DEPLOYER } },
      { Name: "pairToken", Value: { address: "0x0000000000000000000000000000000000000000" } },
      { Name: "launchConfigId", Value: {} },
      { Name: "graduationThreshold", Value: {} },
    ],
  };
  const flat = flattenArguments(event);
  assert.equal(flat.token, "0x320d2b577bffe5b6e5d8ceaba7231a80ccb8f82d");
  assert.equal(flat.deployer, REAL_DEPLOYER);
  assert.equal(flat.launchConfigId, null); // non-address argument: no .address field, decoded as null here
});

test("flattenArguments handles an event with no Arguments", () => {
  assert.deepEqual(flattenArguments({}), {});
});
