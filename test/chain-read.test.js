"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isAddress,
  shortAddr,
  decodeAbiString,
  decodeUint,
  detectMinimalProxyTarget,
} = require("../src/chain-read.js");

// Every hex value below is a real eth_call / eth_getCode response, captured
// against the live Robinhood Chain public RPC (rpc.mainnet.chain.robinhood.com,
// chain id 4663) on 2026-09-07, at block 56,784,521 or later within that
// session. Nothing here is synthesized — these are frozen copies of real
// on-chain reads, kept as fixtures so the decoder can be tested without a
// network call and without drifting if the tokens' state changes later.

const MEME_COIN_ADDR = "0x385F4f8ae47651ce5F58F5265395a669f8281e18";
const PONS_ADDR = "0x39dBED3a2bd333467115dE45665cC57F813C4571";
const CASHCAT_ADDR = "0x020bfC650A365f8BB26819deAAbF3E21291018b4";

const MEME_COIN_CODE =
  "0x3d3d3d3d363d3d37363d733be8b97fd0e713b5abe0649fa830223b6b4bc5995af43d3d93803e602a57fd5bf3";
const MEME_COIN_NAME_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b41204d656d6520436f696e000000000000000000000000000000000000000000";
const MEME_COIN_SYMBOL_HEX =
  "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000044d454d4500000000000000000000000000000000000000000000000000000000";

const PONS_NAME_HEX =
  "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004506f6e7300000000000000000000000000000000000000000000000000000000";
const PONS_SYMBOL_HEX =
  "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004504f4e5300000000000000000000000000000000000000000000000000000000";

const CASHCAT_NAME_HEX =
  "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000084361736820436174000000000000000000000000000000000000000000000000";
const CASHCAT_SYMBOL_HEX =
  "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000074341534843415400000000000000000000000000000000000000000000000000";

const TOTAL_SUPPLY_HEX =
  "0x0000000000000000000000000000000000000000033b2e3c9fd0803ce8000000"; // same on all three: 1e9 * 1e18

test("isAddress accepts well-formed 20-byte hex addresses", () => {
  assert.equal(isAddress(MEME_COIN_ADDR), true);
  assert.equal(isAddress(PONS_ADDR), true);
});

test("isAddress rejects short, long, and non-hex input", () => {
  assert.equal(isAddress("0x1234"), false);
  assert.equal(isAddress(PONS_ADDR + "00"), false);
  assert.equal(isAddress("not an address"), false);
  assert.equal(isAddress(""), false);
  assert.equal(isAddress(undefined), false);
});

test("shortAddr truncates to a readable 0x1234abcd…ef5678 form", () => {
  assert.equal(shortAddr(CASHCAT_ADDR), "0x020bfC…1018b4");
});

test("decodeAbiString reads real name() results off mainnet", () => {
  assert.equal(decodeAbiString(MEME_COIN_NAME_HEX), "A Meme Coin");
  assert.equal(decodeAbiString(PONS_NAME_HEX), "Pons");
  assert.equal(decodeAbiString(CASHCAT_NAME_HEX), "Cash Cat");
});

test("decodeAbiString reads real symbol() results off mainnet", () => {
  assert.equal(decodeAbiString(MEME_COIN_SYMBOL_HEX), "MEME");
  assert.equal(decodeAbiString(PONS_SYMBOL_HEX), "PONS");
  assert.equal(decodeAbiString(CASHCAT_SYMBOL_HEX), "CASHCAT");
});

test("decodeAbiString returns null for empty or malformed input", () => {
  assert.equal(decodeAbiString("0x"), null);
  assert.equal(decodeAbiString(""), null);
  assert.equal(decodeAbiString("not hex"), null);
});

test("decodeUint reads the real totalSupply() shared by all three tokens", () => {
  const supply = decodeUint(TOTAL_SUPPLY_HEX);
  assert.equal(supply, 1_000_000_000n * 10n ** 18n);
});

test("decodeUint returns null for an empty eth_call result", () => {
  assert.equal(decodeUint("0x"), null);
  assert.equal(decodeUint(""), null);
});

test("detectMinimalProxyTarget finds the implementation behind the MEME clone", () => {
  const target = detectMinimalProxyTarget(MEME_COIN_CODE);
  assert.equal(target, "0x3be8b97fd0e713b5abe0649fa830223b6b4bc599");
});

test("detectMinimalProxyTarget returns null for a full ERC-20 implementation", () => {
  // PONS and CASHCAT are not proxies -- both run several hundred bytes of
  // real logic. A short synthetic stand-in with no DELEGATECALL is enough
  // to prove the negative case without embedding the full contract body.
  const notAProxy = "0x6080604052348015600f57600080fd5b50";
  assert.equal(detectMinimalProxyTarget(notAProxy), null);
});

test("detectMinimalProxyTarget returns null for empty bytecode (an EOA)", () => {
  assert.equal(detectMinimalProxyTarget("0x"), null);
});
