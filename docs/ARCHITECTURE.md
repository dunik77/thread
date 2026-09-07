# Architecture

[SPEC.md](../SPEC.md) is the plan, [STATUS.md](../STATUS.md) is what's actually built, and
[RULES.md](../RULES.md) is what the output is allowed to say. This file is the fourth thing: how the
running program is put together, and why it's shaped this way rather than the obvious way.

## The shape in one paragraph

One address goes in. Two independent data sources are asked about it — a third-party index and the
chain itself — and the answer that comes back is one of four kinds, never a blend. A tiny HTTP server
holds the only secret (an API key) and serves one page and one JSON route. Everything that can be
tested without a network is a pure function in `src/`, and everything that touches a network is a
thin wrapper around it.

## Two sources, and why both

| | Bitquery | the public RPC |
|---|---|---|
| answers | decoded `TokenLaunched` events, queryable by argument | raw `eth_getLogs`, filterable by topic |
| needs a key | yes | no |
| good at | "every launch by this deployer" in one query | "does this exact address appear at all" |
| bad at | genuine zero-match queries — observed timing out instead of returning `[]` | scanning broadly; the full-history range gets more expensive every day |
| fails as | a timeout that looks identical to "nothing found" | a timeout, or a rate limit |

Neither is sufficient alone, and the failure modes are the reason. Bitquery answers the question this
project is actually about — *what else has this deployer launched* — but it cannot be trusted to say
"no", because its way of saying "no" and its way of falling over look the same from the outside. The
RPC can be trusted to say "no" (a clean, fast `[]`) but answering the interesting question through it
alone means scanning history that grows every 100 milliseconds.

So: ask Bitquery first, and if it can't answer, ask the chain — not as a retry, but as a different
question with a different failure mode.

## Four answers, never three

`lookupDeployerHistory` in [`src/deployer-history.js`](../src/deployer-history.js) returns exactly one
of these, and the distinction between the last two is the whole point:

| status | means | how it's reached |
|---|---|---|
| `resolved` | here is the deployer and their launches | either source produced real data |
| `resolved` + `partial` | the deployer is confirmed, the launch list isn't complete | a confirmed fact survived a later query failing |
| `not-found` | this address is **not** a Pons v2 launch | the RPC answered cleanly and came back empty in both argument positions |
| `inconclusive` | nobody could tell us | both sources failed |

The temptation this design exists to resist: collapsing `not-found` and `inconclusive` into one
"nothing here" state. They look the same in a UI and they are opposites in meaning. One says the
chain was asked and answered; the other says the question never got through. Shipping the first when
you only earned the second is how a tool starts quietly lying — see [RULES.md](../RULES.md) rule 3.

## Why the key needs a server

`lookup/index.html` opens straight from disk and works, because the public RPC needs no key and sends
permissive CORS headers. `app/index.html` cannot work that way: it needs Bitquery, Bitquery needs a
key, and a key in a static page is a key anyone can read out of view-source.

So [`server.js`](../server.js) exists for exactly one reason — to hold the key in a process instead
of a page. It's Node's built-in `http` module, no framework: one static route for the page, one JSON
route for the lookup, and the key read once at boot from `.env`. The page still reads ERC-20 metadata
client-side, directly from the chain, because that part never needed a secret and shouldn't pay a
round trip for one.

## Pure where it can be, thin where it can't

Everything in `src/` that could be a pure function is one, and the network calls are deliberately
boring wrappers with no logic in them:

- `buildLaunchQuery` builds a GraphQL string. `runQuery` posts it. Only the first is worth testing.
- `buildFactoryLogFilter` builds an `eth_getLogs` filter. `runFilter` posts it. Same split.
- `parseLaunchLog` turns a raw log into the same shape Bitquery produces, so the rest of the program
  never knows or cares which source an answer came from.

That's why the 55 tests need no network and no key: they exercise the decisions, and the decisions
don't live in the network code. The fixtures are frozen real responses captured from live calls, not
invented shapes, so the tests fail if the real formats ever drift.

## The duplication that's still there

`app/index.html` and `lookup/index.html` each carry their own browser copy of the decoding functions
in [`src/chain-read.js`](../src/chain-read.js), because a single static HTML file with no build step
can't cleanly import a CommonJS module, and adding a build step to a zero-dependency project is a
bigger cost than the duplication. `test/chain-read.test.js` is the contract all three copies are
expected to satisfy. This is a known trade, not an oversight — recorded here so the next person
doesn't have to guess whether it was deliberate.

## What isn't here yet

No database, no background job, no queue. Every lookup is a live query, which is why a lookup takes
15–30 seconds and why the same address asked twice costs twice. That's the honest cost of not having
built M2 in [STATUS.md](../STATUS.md), and it's the single change that would most improve both the
speed and the product — an index this project owns, refreshed in the background, rather than a
question asked from scratch every time someone clicks.
