"use strict";

const { isAddress } = require("./chain-read.js");

const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

/** Left-pads a 20-byte address into the 32-byte topic format eth_getLogs expects. */
function addressToTopic(address) {
  if (!isAddress(address)) {
    throw new Error(`not a valid address: ${address}`);
  }
  return "0x" + "0".repeat(24) + address.slice(2).toLowerCase();
}

/**
 * Build the eth_getLogs params that ask: has this exact address ever
 * appeared in the given argument position of a TokenLaunched event from the
 * known Pons v2 factory? `position` is 1 for `token` (the first indexed
 * argument) or 3 for `deployer` (the third) -- see SPEC.md for the full
 * event signature. Pure and tested; no network involved.
 *
 * This exists as a second opinion to Bitquery specifically because it
 * behaves differently on a genuine zero-match: this call was observed
 * returning a fast, clean `[]` in exactly the cases where Bitquery's
 * realtime tier was observed timing out instead of answering (see
 * STATUS.md M0 and M0.5).
 */
function buildFactoryLogFilter(address, position) {
  if (position !== 1 && position !== 3) {
    throw new Error(`position must be 1 (token) or 3 (deployer), got ${position}`);
  }
  const topics = new Array(position + 1).fill(null);
  topics[position] = addressToTopic(address);
  return {
    address: PONS_V2_FACTORY,
    topics,
    fromBlock: "0x0",
    toBlock: "latest",
  };
}

/** Runs one eth_getLogs filter against the public RPC. Throws on an RPC-level error. */
async function runFilter(params) {
  const res = await fetch(PUBLIC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [params] }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || "RPC error");
  }
  return json.result;
}

/**
 * Checks `address` against the factory's logs in both the token position
 * and the deployer position. Returns `{ found: false }` only when BOTH
 * calls succeed and BOTH come back empty -- a real, checked negative, not
 * an assumption. Throws if either call fails, so the caller can fall back
 * to reporting "inconclusive" honestly rather than a confirmed absence it
 * can't back up.
 */
async function checkAddressAgainstFactory(address) {
  const [asToken, asDeployer] = await Promise.all([
    runFilter(buildFactoryLogFilter(address, 1)),
    runFilter(buildFactoryLogFilter(address, 3)),
  ]);
  return { found: asToken.length > 0 || asDeployer.length > 0, asToken, asDeployer };
}

module.exports = {
  PONS_V2_FACTORY,
  PUBLIC_RPC,
  addressToTopic,
  buildFactoryLogFilter,
  checkAddressAgainstFactory,
};
