"use strict";

/**
 * Addresses that can show up as a Pons v2 launch's "deployer" without being
 * a single accountable actor -- shared infrastructure that many unrelated
 * launches route through. Presenting one of these as "one deployer, N
 * launches" would be the exact false positive RULES.md rule 4 exists to
 * catch, just one layer removed from wallet ownership into infrastructure.
 *
 * Every entry here was confirmed the same way, not guessed from an address
 * pattern: real deployed bytecode, checked against known selectors for that
 * contract, on Robinhood Chain itself. See SPEC.md "Open questions" for the
 * evidence behind the first entry.
 */
const KNOWN_INFRA = {
  "0xca11bde05977b3631167028862be2a173976ca11": {
    name: "Multicall3",
    reason:
      "Canonical Multicall3 deployment, same address on nearly every EVM chain. " +
      "Confirmed on Robinhood Chain 2026-09-07: 3,808 bytes of bytecode, selectors " +
      "0x4d2301cc (getEthBalance) and 0xa8b0574e (getBasefee) both present. A launch " +
      "routed through a batched multicall records this address as msg.sender instead " +
      "of the real originator -- it is infrastructure, not a deployer.",
  },
};

/** Case-insensitive lookup. Returns the infra record, or null if `address` isn't on the list. */
function checkKnownInfra(address) {
  if (typeof address !== "string") return null;
  return KNOWN_INFRA[address.toLowerCase()] || null;
}

module.exports = { KNOWN_INFRA, checkKnownInfra };
