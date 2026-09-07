#!/usr/bin/env python3
"""Decide whether an address that looks like a busy deployer is actually a person.

This is the check that saved thread from shipping its first false finding.
Sampling 300 real launches turned up one address credited with 8 of them --
0xcA11bde05977b3631167028862bE2a173976CA11 -- which reads as a serial
launcher until you look at what is deployed there. It is Multicall3, a
generic batching contract that exists at that same address on nearly every
EVM chain. Launches routed through it record the batcher as msg.sender, so
eight unrelated people collapse into one apparent deployer.

Presented without this check, that is exactly the kind of claim RULES.md
rule 4 exists to prevent, one layer removed from wallets into infrastructure.

What this script reports, and deliberately nothing more:

    is there code at this address at all      (an EOA cannot be shared infra)
    how much code                             (size alone separates a wallet
                                               from a real contract)
    which known function selectors are present (the actual evidence)
    EIP-7702 delegation, if that is what it is (a real account, not a contract)

It prints findings, not a verdict. Adding an address to src/known-infra.js is
a human decision made on this evidence, which is why that file records the
reasoning for each entry rather than just a list.

Usage:
    python3 analysis/verify_infra.py 0xca11bde05977b3631167028862be2a173976ca11
    python3 analysis/verify_infra.py 0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669

Needs no key: the public RPC answers all of this. Standard library only.
"""

import json
import re
import sys
import urllib.request

PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com"

# Selectors worth naming when they show up. The first two are what confirmed
# Multicall3 on Robinhood Chain; the rest are here because they are the
# fingerprints of other things that could plausibly sit in a deployer slot.
KNOWN_SELECTORS = {
    "4d2301cc": "getEthBalance(address)        — Multicall3",
    "a8b0574e": "getBasefee()                  — Multicall3",
    "252dba42": "aggregate((address,bytes)[])  — Multicall",
    "82ad56cb": "aggregate3((...)[])           — Multicall3",
    "1cff79cd": "execute(address,bytes)        — a router or proxy wallet",
    "b61d27f6": "execute(address,uint256,bytes) — smart-account style",
    "06fdde03": "name()                        — token-like",
    "a9059cbb": "transfer(address,uint256)     — ERC-20",
}


def rpc(method, params):
    req = urllib.request.Request(
        PUBLIC_RPC,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        headers={
            "Content-Type": "application/json",
            # without a browser-ish UA this endpoint answers 403
            "User-Agent": "thread-analysis/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read())
    if "error" in payload:
        raise SystemExit("RPC said: " + payload["error"].get("message", "unknown error"))
    return payload["result"]


def main():
    if len(sys.argv) < 2 or not re.fullmatch(r"0x[0-9a-fA-F]{40}", sys.argv[1]):
        raise SystemExit("Usage: python3 analysis/verify_infra.py 0x<40 hex chars>")
    address = sys.argv[1]

    print(f"Reading {address} off Robinhood Chain...\n")
    code = rpc("eth_getCode", [address, "latest"])
    body = code[2:]
    size = len(body) // 2

    if size == 0:
        balance = int(rpc("eth_getBalance", [address, "latest"]), 16)
        nonce = int(rpc("eth_getTransactionCount", [address, "latest"]), 16)
        print("  no code at this address — a plain wallet, not shared infrastructure")
        print(f"  balance   {balance / 1e18:.6f} ETH")
        print(f"  nonce     {nonce} transactions sent\n")
        print("  Repeat launches from here are one account repeating, which is a real signal.")
        return

    # 0xef0100 + 20 bytes is an EIP-7702 delegation designator: an ordinary
    # account that has pointed itself at a smart-wallet implementation. Still
    # a person's account, not a contract everyone shares.
    if size == 23 and body.startswith("ef0100"):
        print(f"  {size} bytes, starting ef0100 — an EIP-7702 delegation designator")
        print(f"  delegates to  0x{body[6:]}\n")
        print("  This is a real externally-owned account using account abstraction,")
        print("  not shared infrastructure. Repeat launches from here count as one actor.")
        return

    print(f"  {size} bytes of deployed code — a genuine contract\n")

    found = [(sel, name) for sel, name in KNOWN_SELECTORS.items() if sel in body]
    if found:
        print("  known selectors present:")
        for sel, name in found:
            print(f"    0x{sel}  {name}")
    else:
        print("  none of the selectors this script knows about are present")

    print()
    multicall_hits = [s for s, n in found if "Multicall" in n]
    if len(multicall_hits) >= 2:
        print("  Two or more Multicall selectors: this is a batching contract.")
        print("  Launches crediting it as deployer are unrelated callers sharing a router.")
        print("  It belongs in src/known-infra.js, with this output as the reason.")
    else:
        print("  Not conclusive either way from selectors alone. A contract in a deployer")
        print("  slot might be a launchpad helper, a bot's own contract, or a smart wallet.")
        print("  RULES.md rule 1: report what was read, let a human decide what it means.")


if __name__ == "__main__":
    main()
