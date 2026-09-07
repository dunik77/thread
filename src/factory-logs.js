"use strict";

const { isAddress } = require("./chain-read.js");

const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

/**
 * keccak256("TokenLaunched(address,address,address,address,uint256,uint256)"),
 * confirmed against two independent real launches on 2026-09-07 (a totally
 * unrelated token from deployer 0xdf2237... and "Pushin'" from a different
 * deployer entirely) -- both show this exact value as the first topic on a
 * 4-topic log, matching the three indexed arguments (token, curve, deployer)
 * the event signature in SPEC.md declares. Constraining on it, rather than
 * leaving topic0 unfiltered, is what makes it safe to read `token`/`curve`/
 * `deployer` positionally out of a raw log: the factory emits more than one
 * event shape (a second, non-TokenLaunched event was seen right alongside
 * this one on every real launch checked), and only this signature is
 * guaranteed to mean what SPEC.md says it means.
 */
const TOKEN_LAUNCHED_TOPIC0 = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";

/** Left-pads a 20-byte address into the 32-byte topic format eth_getLogs expects. */
function addressToTopic(address) {
  if (!isAddress(address)) {
    throw new Error(`not a valid address: ${address}`);
  }
  return "0x" + "0".repeat(24) + address.slice(2).toLowerCase();
}

/** The reverse: pull a 20-byte address back out of a 32-byte topic. */
function topicToAddress(topic) {
  return "0x" + topic.slice(-40);
}

/**
 * Build the eth_getLogs params that ask: has this exact address ever
 * appeared in the given argument position of a genuine `TokenLaunched`
 * event from the known Pons v2 factory? `position` is 1 for `token` (the
 * first indexed argument) or 3 for `deployer` (the third) -- see SPEC.md
 * for the full event signature. Pure and tested; no network involved.
 *
 * This exists as a second opinion to Bitquery specifically because it
 * behaves differently on a genuine zero-match: this call was observed
 * returning a fast, clean `[]` in exactly the cases where Bitquery's
 * realtime tier was observed timing out instead of answering (see
 * STATUS.md M0 and M0.5) -- and, per M1.8, its matches are real enough to
 * read launch data out of directly when Bitquery can't be reached at all.
 */
function buildFactoryLogFilter(address, position) {
  if (position !== 1 && position !== 3) {
    throw new Error(`position must be 1 (token) or 3 (deployer), got ${position}`);
  }
  const topics = [TOKEN_LAUNCHED_TOPIC0, null, null, null];
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
 * Turns one raw eth_getLogs entry (already known, by construction, to be a
 * TokenLaunched log -- see TOKEN_LAUNCHED_TOPIC0) into the same shape
 * src/deployer-history.js already produces from Bitquery, minus the
 * timestamp: `Block.Time` is left null here because eth_getLogs doesn't
 * carry it (the `blockTimestamp` field was observed unpopulated -- "0x0" --
 * on this RPC, 2026-09-07) and getting a real one needs a second call per
 * unique block. `attachBlockTimes` does that, batched, for a whole list.
 */
function parseLaunchLog(log) {
  return {
    token: topicToAddress(log.topics[1]),
    curve: topicToAddress(log.topics[2]),
    deployer: topicToAddress(log.topics[3]),
    pairToken: null,
    block: { Number: String(parseInt(log.blockNumber, 16)), Time: null },
    txHash: log.transactionHash,
    _blockNumberHex: log.blockNumber,
  };
}

/**
 * Fills in real `Block.Time` values on a list of parsed launches by fetching
 * each *unique* block's timestamp once (eth_getBlockByNumber), not once per
 * launch -- a deployer with many launches clustered in a few blocks doesn't
 * need to pay for that block's timestamp more than once.
 */
async function attachBlockTimes(launches) {
  const uniqueBlocks = [...new Set(launches.map((l) => l._blockNumberHex))];
  const times = await Promise.all(
    uniqueBlocks.map(async (blockHex) => {
      const res = await fetch(PUBLIC_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBlockByNumber",
          params: [blockHex, false],
        }),
      });
      const json = await res.json();
      if (json.error || !json.result) return [blockHex, null];
      const iso = new Date(parseInt(json.result.timestamp, 16) * 1000).toISOString();
      return [blockHex, iso];
    })
  );
  const byBlock = Object.fromEntries(times);
  return launches.map((l) => {
    const { _blockNumberHex, ...rest } = l;
    return { ...rest, block: { ...rest.block, Time: byBlock[_blockNumberHex] || null } };
  });
}

/**
 * Checks `address` against the factory's logs in both the token position
 * and the deployer position. `found` is false only when BOTH calls succeed
 * and BOTH come back empty -- a real, checked negative, not an assumption.
 * `asToken` and `asDeployer` are the matching launches, parsed and with
 * real block timestamps attached, so a caller can use them as genuine
 * launch data (not just a yes/no) when Bitquery can't answer at all.
 * Throws if either eth_getLogs call fails, so the caller can fall back to
 * reporting "inconclusive" honestly rather than a confirmed absence -- or a
 * confirmed launch list -- it can't back up.
 */
async function checkAddressAgainstFactory(address) {
  const [asTokenRaw, asDeployerRaw] = await Promise.all([
    runFilter(buildFactoryLogFilter(address, 1)),
    runFilter(buildFactoryLogFilter(address, 3)),
  ]);
  const [asToken, asDeployer] = await Promise.all([
    attachBlockTimes(asTokenRaw.map(parseLaunchLog)),
    attachBlockTimes(asDeployerRaw.map(parseLaunchLog)),
  ]);
  return { found: asToken.length > 0 || asDeployer.length > 0, asToken, asDeployer };
}

module.exports = {
  PONS_V2_FACTORY,
  PUBLIC_RPC,
  TOKEN_LAUNCHED_TOPIC0,
  addressToTopic,
  topicToAddress,
  buildFactoryLogFilter,
  parseLaunchLog,
  checkAddressAgainstFactory,
};
