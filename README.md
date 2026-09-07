```
  ───────────────────────────────────────────────────────────────────

    t h r e a d          new wallets. familiar connections.

  ───────────────────────────────────────────────────────────────────

    0x385F…8281e18   →  proxy clone  →  "A Meme Coin"  (MEME)
    0x39dB…813C4571  →  full ERC-20  →  "Pons"         (PONS)
    0x020b…291018b4  →  full ERC-20  →  "Cash Cat"     (CASHCAT)

  ───────────────────────────────────────────────────────────────────

    3 addresses in, 3 live reads out, 0 invented
    read straight off ROBINHOOD CHAIN · chain 4663 · no API key, ~1s
```

<p align="center">
  <b>Every row above came out of <code>lookup/index.html</code> on 2026-09-07</b>, live, against the
  public RPC — reproduce it yourself in the time it takes the page to load.
</p>

<p align="center">
  <code>open lookup/index.html</code>
</p>

<p align="center">
  <img alt="tests" src="https://img.shields.io/badge/tests-11%20passing-B7FF00?style=flat-square&labelColor=1a1613">
  <img alt="runtime deps" src="https://img.shields.io/badge/runtime%20deps-0-B7FF00?style=flat-square&labelColor=1a1613">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-c99a44?style=flat-square&labelColor=1a1613">
  <img alt="clusters" src="https://img.shields.io/badge/deployer%2Ffee%20clusters-not%20built%20yet-9c4a42?style=flat-square&labelColor=1a1613">
  <img alt="verdicts" src="https://img.shields.io/badge/verdicts-none-9AA694?style=flat-square&labelColor=1a1613">
  <img alt="chain" src="https://img.shields.io/badge/chain-Robinhood%20Chain%204663-c99a44?style=flat-square&labelColor=1a1613">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-c99a44?style=flat-square&labelColor=1a1613">
</p>

---

A launch on Pons v2 is judged in isolation: this curve, this tax, this deployer, right now. Nothing about
it remembers the *last* launch by the same actors — even though two facts already sit inside the protocol's
own contracts, unused as history: the fee escrow's `Credited`/`Claimed` events name who actually gets paid
on a token, launch after launch, and the launch factory names who deployed it, and whether that address has
graduated anything before. Neither fact requires guessing at wallet ownership across the wider chain. Both
are native to Pons v2, and both compound: the tenth launch by an address thread has already seen is a fact,
not an inference.

That's the pitch. Here's the honest state of it: **the clustering above doesn't exist yet.** What exists is
a tested chain reader and a real finding about the three tokens this repository ships as examples — read on.

| The problem | What's actually true right now | Where |
|---|---|---|
| "what is this contract" | live `name`/`symbol`/`decimals`/`totalSupply`, proxy-clone detection, one RPC round trip | `lookup/index.html` — **works today** |
| "who else has this deployer launched" | designed, not built — needs an indexer beyond a single RPC call | `SPEC.md` M1 — **not built** |
| "who else got paid the same creator fee" | designed, not built — same reason | `SPEC.md` M3 — **not built** |
| "what would the finished thing look like" | a mockup against three made-up tokens, clearly marked fictional | `demo/index.html` — **fixture data** |
| "are the three example addresses real Pons v2 launches" | checked directly against the factory, router, hook and locker logs — **no match in any of them** | `STATUS.md` M0.5 |

That last row matters more than it looks. The three addresses baked into both pages above resolve to real,
live ERC-20 contracts on Robinhood Chain — but none of them show up in `TokenLaunched` events from the known
`PonsV2LaunchFactory`, or in the router, the meme hook, or the locker. They may predate that factory, use a
factory address not on record here, or simply not be Pons v2 launches at all. Worth flagging as a fact, not
an accusation, the way [RULES.md](RULES.md) asks for: one of the three is named "Pons"/"PONS" itself — the
same name as the launchpad — and that's a fact about its `symbol()` call, not evidence of who deployed it or
why.

## Try it

```sh
open lookup/index.html
```

No install, no server, no API key. It calls `eth_getCode` and `eth_call` directly from your browser against
`rpc.mainnet.chain.robinhood.com` — the public Robinhood Chain RPC, which answers with CORS wide open — and
shows exactly what those calls return. Paste any address, or click one of the three built in. What you'll
see is real; what it doesn't try to tell you is deliberate — see the "Not shown yet" line on every result.

## Why the clusters aren't there yet

Getting from "read one contract" to "here's this deployer's history and everyone who shares its fee
recipient" needs an index of Pons v2's launch history, not a single RPC call. Three real attempts, in order:

1. **The public RPC directly.** `eth_getLogs` against the known factory, filtered to `TokenLaunched` events
   naming each of the three addresses — this is how the negative result above was actually produced. Fine
   for one address. At Pons v2's launch volume, a full scan trips the endpoint's 10,000-log match cap and
   its own rate limit before it finishes, so this doesn't scale to "every launch, ever."
2. **Blockscout, the official explorer.** Sits behind a Cloudflare bot check that a plain HTTP client can't
   pass.
3. **Bitquery's Pons Launchpad API.** Purpose-built for exactly this — decoded `TokenLaunched`,
   `LaunchSwept`, `PoolGraduated` events over GraphQL — but it requires an account and a bearer token
   ([docs](https://docs.bitquery.io/docs/authorization/how-to-generate/)), which this repository doesn't
   ship with and won't fabricate a substitute for.

So M1 through M4 in [STATUS.md](STATUS.md) wait on a real key, not on more guessing. When one's wired in,
the plan for what gets built with it is already written in [SPEC.md](SPEC.md).

## What thread won't do, even once the clusters exist

- claim to map wallet ownership across the wider chain — that's a harder, noisier problem, already served by
  general-purpose tools like Bubblemaps (which added Robinhood Chain support directly, including
  funding-pattern and timing-correlation detection across the whole chain)
- assert that two addresses belong to the same person from a shared funding source or timing correlation
  alone
- touch a private key, hold funds, or place a trade
- score or rank anything — see [RULES.md](RULES.md) for the seven rules this project holds itself to, and
  why rule 4 ("same funding source is not same owner") is the one most likely to be tempting to bend later

thread is narrower than a general wallet-cluster tool on purpose: it only knows what Pons v2's own contracts
already record about repeat actors, and turns that into compounding, protocol-native memory. It answers "has
this specific fact happened before, on this specific protocol" with a transaction hash, not "are these
wallets probably connected."

## Case file format

The unit thread is meant to eventually produce — one launch, its prior history, its evidence — is specified
in [docs/case-file-format.md](docs/case-file-format.md). See an [illustrative example](docs/example-case.md)
in text, or click through the interactive [mockup](demo/index.html) against three invented launches. Both
are clearly fictional and contain no live findings — [STATUS.md](STATUS.md) milestone M-1 covers what
"working" means for a mockup versus a live read.

## Protocol contracts

Known Pons v2 contracts this spec and reader are written against (Robinhood Chain, chain id 4663):

| Contract | Address |
|---|---|
| `PonsV2LaunchFactory` | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` |
| `PonsV2LaunchAndBuy` (router) | `0xe33e9e479df8802cb0866d5d05258bec4cf62948` |
| `PonsV2MemeHook` | `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044` |
| locker | `0x267444d099b10fb5ed7c3cc7b7c767adca574952` |
| public RPC | `https://rpc.mainnet.chain.robinhood.com` |

## Install

```sh
git clone https://github.com/<you>/thread && cd thread
npm test          # 11 checks, 0 dependencies, no network — see below
open lookup/index.html
```

Node 18 or newer for the tests. The lookup page itself needs nothing but a browser.

## Tests

```sh
npm test
```

Eleven checks, all offline, none touching a network. They run the decoder in
[src/chain-read.js](src/chain-read.js) — string decoding, uint decoding, address validation, minimal-proxy
detection — against **frozen, real responses** captured from the live RPC on 2026-09-07: the exact
`eth_getCode` and `eth_call` bytes for all three addresses in the banner above, not synthetic fixtures. If
Robinhood Chain disappeared tomorrow, these tests would still pass and still mean the same thing, because
they're checking the decoder, not the network. `lookup/index.html` embeds the browser copy of the same
functions; if you change the decoding rules in one, mirror it in the other — the test file is the contract
both are expected to satisfy.

## FAQ

**Does thread analyze wallet clusters yet?** No. `lookup/index.html` reads one contract at a time — name,
symbol, supply, proxy detection. The deployer-history and fee-recipient graph described in [SPEC.md](SPEC.md)
needs an indexer this repository doesn't have running yet.

**Are the three example tokens real Pons v2 launches?** Checked directly against the factory, router, hook,
and locker logs, and none of them appear. See the table above and [STATUS.md](STATUS.md) M0.5. If you have a
token address you know launched through Pons v2, that's a better example than these three — open an issue
with it.

**Why not just fake the cluster view with plausible-looking data to show the idea?** Because the moment a
number or a transaction hash in a case file isn't real, [RULES.md](RULES.md) rule 6 ("every claim links to
its receipt") is broken by the tool that exists specifically to hold other people to that standard.

**What does it cost to run?** Nothing. The lookup page hits a free public RPC with no key. The tests run
offline. The clustering, once built, will need a Bitquery token — also free at the tier this needs.

## Built on

| Source | What was taken |
|---|---|
| [Pons docs](https://docs.ponsfamily.com/) | the protocol this reads: bonding curve, fee escrow, graduation into a locked Uniswap v4 pool |
| [Bitquery's Robinhood Chain / Pons docs](https://docs.bitquery.io/docs/blockchain/robinhood/pons-api/) | the `TokenLaunched` event schema used to check the three example addresses |
| [Bubblemaps](https://blog.bubblemaps.io/) | the general wallet-cluster approach thread deliberately doesn't rebuild — see "What thread won't do" |
| Node 18+ `node:test` / `node:assert` | the entire test suite; zero added dependencies |

## Contributing

The most useful contribution right now is a real Pons v2 launch address to replace the three examples with,
or a Bitquery key to wire up M1. Short of that: poke holes in [SPEC.md](SPEC.md), argue with
[RULES.md](RULES.md), or propose a different milestone order in [STATUS.md](STATUS.md).

## License

MIT — see [LICENSE](LICENSE).
