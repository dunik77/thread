#!/usr/bin/env python3
"""Reproduce the finding SPEC.md is built on: do deployers repeat on Pons v2?

This is the check that had to pass before any of the indexing code was worth
writing. If deployer addresses almost never recur, "a running history of who
launched what" has nothing to accumulate and thread has no reason to exist.

It samples consecutive real TokenLaunched events, counts unique deployers,
and lists the ones that appear more than once. The numbers in README.md's
"Measured, not claimed" table came out of this script on 2026-09-07:

    300 launches sampled, 275 unique deployers, 12 repeats, biggest had 8

Run it again and you will get today's numbers, not those. That is the point
of shipping the script rather than only the conclusion.

Note what it does NOT do: decide whether a repeat means anything. The biggest
repeater in the original sample turned out to be Multicall3, a contract every
kind of caller routes through -- see verify_infra.py, which is the follow-up
this script's output demands.

Usage:
    python3 analysis/deployer_reuse.py            # 300 launches
    python3 analysis/deployer_reuse.py 500        # a bigger sample

Needs BITQUERY_API_TOKEN in .env (see README.md "Install"). Standard library
only, to match the zero-dependency rule the rest of the project follows.
"""

import json
import os
import sys
import urllib.request
from collections import defaultdict

BITQUERY_ENDPOINT = "https://streaming.bitquery.io/graphql"
PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"


def load_token():
    """Read the key from .env, the same file server.js reads."""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("BITQUERY_API_TOKEN="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    return os.environ.get("BITQUERY_API_TOKEN")


def fetch_launches(token, limit):
    """One query, no orderBy.

    Sorting was deliberately left off: asking Bitquery's realtime tier to
    order this set made it time out consistently, while the same query
    without an order clause returns fine. Consecutive-as-returned is enough
    for a reuse count.
    """
    query = (
        '{ EVM(network: robinhood, dataset: realtime) { Events('
        f'where: {{LogHeader: {{Address: {{is: "{PONS_V2_FACTORY}"}}}}, '
        'Log: {Signature: {Name: {is: "TokenLaunched"}}}}, '
        f'limit: {{count: {limit}}}) {{ Block {{ Time }} Transaction {{ Hash }} '
        "Arguments { Name Value { ... on EVM_ABI_Address_Value_Arg { address } } } } } }"
    )
    req = urllib.request.Request(
        BITQUERY_ENDPOINT,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Content-Type": "application/json",
            # the header is X-API-KEY, not Authorization: Bearer, whatever the
            # docs say -- Bearer returns Unauthorized against this endpoint
            "X-API-KEY": token,
            "User-Agent": "thread-analysis/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read())
    if "errors" in payload:
        raise SystemExit("Bitquery said: " + "; ".join(e["message"] for e in payload["errors"]))
    return payload["data"]["EVM"]["Events"]


def flatten(event):
    return {a["Name"]: (a["Value"] or {}).get("address") for a in event["Arguments"]}


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 300

    token = load_token()
    if not token:
        raise SystemExit('No BITQUERY_API_TOKEN found. Add it to .env -- see README.md "Install".')

    print(f"Sampling {limit} real TokenLaunched events from the Pons v2 factory...\n")
    events = fetch_launches(token, limit)

    by_deployer = defaultdict(list)
    for event in events:
        args = flatten(event)
        by_deployer[args.get("deployer")].append((args.get("token"), event["Block"]["Time"]))

    repeats = {d: ls for d, ls in by_deployer.items() if len(ls) > 1}
    times = [e["Block"]["Time"] for e in events]

    print(f"  launches sampled            {len(events)}")
    print(f"  unique deployers            {len(by_deployer)}")
    print(f"  deployers with >1 launch    {len(repeats)}")
    print(f"  window                      {min(times)}  ..  {max(times)}\n")

    if not repeats:
        print("  No repeats in this sample. If that holds across bigger samples,")
        print("  SPEC.md's premise is in trouble and STATUS.md should say so.")
        return

    print("  Repeat deployers, most launches first:\n")
    for deployer, launches in sorted(repeats.items(), key=lambda kv: -len(kv[1])):
        print(f"    {deployer}  {len(launches)} launches")
        for token_addr, when in launches[:3]:
            print(f"        {when}  {token_addr}")
        if len(launches) > 3:
            print(f"        ... and {len(launches) - 3} more")
        print()

    print("  Before treating any of these as one actor, check each against")
    print("  analysis/verify_infra.py. The biggest repeater in the original")
    print("  sample was Multicall3 -- infrastructure, not a person.")


if __name__ == "__main__":
    main()
