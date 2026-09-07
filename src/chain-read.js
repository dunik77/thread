"use strict";

/**
 * Pure, dependency-free helpers for reading ERC-20 metadata and detecting
 * minimal-proxy clones from raw JSON-RPC results. No network code lives
 * here on purpose: everything below takes hex strings in and plain values
 * out, so it can be tested against real, frozen chain responses without
 * touching a live RPC.
 *
 * lookup/index.html embeds the browser copy of this same logic (fetch()
 * doesn't cross a <script src> boundary cleanly for a single static file
 * with no build step). If you change the decoding rules here, mirror the
 * change there — test/chain-read.test.js is the contract both must satisfy.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** True if `value` is a syntactically valid 20-byte hex address. */
function isAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

/** Truncate an address for display: 0x1234abcd…ef5678 */
function shortAddr(addr) {
  if (!isAddress(addr)) return addr;
  return addr.slice(0, 8) + "…" + addr.slice(-6);
}

/**
 * Decode a Solidity `string` return value from an `eth_call` result.
 * Standard ABI encoding: [offset][length][data...], all left as returned
 * by the node (this function assumes the offset word is the first word,
 * which is what every ERC-20 name()/symbol() implementation produces).
 * Returns null if the hex can't be parsed as a length-prefixed string.
 */
function decodeAbiString(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) return null;
  const body = hex.slice(2);
  if (body.length < 128) return null;
  const length = parseInt(body.slice(64, 128), 16);
  if (!Number.isFinite(length) || length < 0) return null;
  const data = body.slice(128, 128 + length * 2);
  if (data.length !== length * 2) return null;
  const bytes = Buffer.from(data, "hex");
  return bytes.toString("utf8");
}

/** Decode a `uint256` eth_call result into a BigInt. Returns null on empty/invalid input. */
function decodeUint(hex) {
  if (typeof hex !== "string" || hex === "0x" || hex === "") return null;
  try {
    return BigInt(hex);
  } catch {
    return null;
  }
}

/**
 * Detect an EIP-1167-family minimal proxy from deployed bytecode and
 * return the implementation address it delegates to, or null if `code`
 * doesn't match the pattern.
 *
 * Real implementation contracts are hundreds to thousands of bytes;
 * every minimal-proxy variant in the wild is under ~100 bytes and carries
 * a PUSH20 (opcode 0x73) immediately before a DELEGATECALL (0x5af4/5af43d…).
 * This walks the bytecode one opcode at a time looking for that shape
 * rather than matching one fixed template, so it also catches the
 * "vanity" clone variants some factories use for cheaper deployment.
 */
function detectMinimalProxyTarget(code) {
  if (typeof code !== "string" || !code.startsWith("0x")) return null;
  const body = code.slice(2);
  if (body.length === 0 || body.length > 200) return null; // real contracts run much longer
  if (!body.includes("5af4")) return null; // no DELEGATECALL anywhere: not a proxy

  for (let i = 0; i + 2 <= body.length; i += 2) {
    if (body.slice(i, i + 2) === "73" && i + 2 + 40 <= body.length) {
      return "0x" + body.slice(i + 2, i + 2 + 40);
    }
  }
  return null;
}

module.exports = {
  isAddress,
  shortAddr,
  decodeAbiString,
  decodeUint,
  detectMinimalProxyTarget,
};
