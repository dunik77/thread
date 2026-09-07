"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkKnownInfra } = require("../src/known-infra.js");

test("checkKnownInfra flags the confirmed Multicall3 address", () => {
  const hit = checkKnownInfra("0xca11bde05977b3631167028862be2a173976ca11");
  assert.ok(hit);
  assert.equal(hit.name, "Multicall3");
});

test("checkKnownInfra is case-insensitive", () => {
  const hit = checkKnownInfra("0xCA11BDE05977B3631167028862BE2A173976CA11");
  assert.ok(hit);
});

test("checkKnownInfra returns null for an address not on the list", () => {
  // a real EOA seen in the field data, confirmed NOT infra (EIP-7702 delegate, not shared)
  assert.equal(checkKnownInfra("0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669"), null);
});

test("checkKnownInfra returns null for non-string input", () => {
  assert.equal(checkKnownInfra(undefined), null);
  assert.equal(checkKnownInfra(null), null);
});
