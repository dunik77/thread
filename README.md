# thread

![status](https://img.shields.io/badge/status-pre--alpha%20spec-6e7681?style=flat-square)
![chain](https://img.shields.io/badge/chain-Robinhood%20Chain%204663-FFD93B?style=flat-square)
![custody](https://img.shields.io/badge/custody-none-9AA694?style=flat-square)
![code](https://img.shields.io/badge/code-not%20written%20yet-FF6B5E?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

**New wallets. Familiar connections.**

thread is a proposed public history of Pons v2 launches on Robinhood Chain. It will connect launches that share a deployer or a recorded fee recipient, and show the evidence behind each connection.

> This repository has no working software yet. It is the specification, the ground rules, and the roadmap — written first, on purpose. See [Status](#status).

---

## Why

A launch on Pons v2 is judged in isolation: this curve, this tax, this deployer, right now. Nothing about it remembers the *last* launch by the same actors.

Two facts already sit inside the protocol's own contracts, unused as history:

- the fee escrow's `Credited` / `Claimed` events name who actually gets paid on a token, launch after launch
- the launch factory names who deployed it, and whether that address has graduated anything before

Neither fact requires guessing at wallet ownership across the wider chain. Both are native to Pons v2, and both compound: the tenth launch by an address thread has already seen is a fact, not an inference.

## What thread will do

**Planned capabilities:**
- builds a running history of fee-escrow recipients across every Pons v2 launch, so a repeat recipient under a new token name is visible on day one
- builds a running history of a deployer address's launches and their graduation outcomes, read directly from `PonsV2LaunchFactory`
- links a launch to its recorded evidence — transaction hashes, block numbers, event logs — so every claim is checkable, not asserted
- outputs a small, shareable "case file": one launch, its known prior history, the evidence, nothing implied beyond it

**Doesn't:**
- claim to map wallet ownership across the wider chain — that's a harder, noisier problem, already served by general-purpose tools like Bubblemaps (which added Robinhood Chain support directly)
- assert that two addresses belong to the same person from funding-source or timing correlation alone
- touch a private key, hold funds, or place a trade
- score or rank — see [RULES.md](RULES.md) for why

## Why not just use Bubblemaps

Bubblemaps already does general wallet-cluster visualization on Robinhood Chain, including funding-pattern and timing-correlation detection across the whole chain. thread doesn't compete with that and won't try to rebuild it.

thread is narrower on purpose: it only knows what Pons v2's own contracts already record about repeat actors — fee recipients, deployers, graduation history — and turns that into compounding, protocol-native memory. It answers "has this specific fact happened before, on this specific protocol" with a transaction hash, not "are these wallets probably connected."

## Evidence, not verdicts

thread never outputs a single trust score or a plain-language accusation. See [RULES.md](RULES.md) for the exact language rules this project holds itself to, and why.

## Data model (draft)

See [SPEC.md](SPEC.md) for the full draft: which Pons v2 contracts and events feed the graph, how a "case file" is assembled, and what counts as evidence versus what doesn't.

Known Pons v2 contracts this spec is written against (Robinhood Chain, chain id 4663):

| Contract | Address |
|---|---|
| `PonsV2LaunchFactory` | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` |
| `PonsV2LaunchAndBuy` (router) | `0xe33e9e479df8802cb0866d5d05258bec4cf62948` |
| `PonsV2MemeHook` | `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044` |
| locker | `0x267444d099b10fb5ed7c3cc7b7c767adca574952` |

## Case file format

See an [illustrative case file](docs/example-case.md) for the intended output in text, or open the interactive [UI mockup](demo/index.html) to click through three fictional example launches the way a real case-file page would work. Both use invented labels and contain no live findings — see [STATUS.md](STATUS.md) milestone M-1 for what "working" means here versus what still requires a real indexer.

The unit thread produces — one launch, its prior history, its evidence — is specified in [docs/case-file-format.md](docs/case-file-format.md). That format is stable even before any code reads it; it's the contract between this spec and whatever renders it later, on a page or as a shareable card.

## Try it

[lookup/index.html](lookup/index.html) is real and live: paste any Robinhood Chain address and it reads name, symbol, supply, and contract type straight from the public RPC — no deployer history or fee graph yet, just what a single chain read can tell you today. [STATUS.md](STATUS.md) tracks the gap between this and the full case file.

## Status

Most of this doesn't run yet. [STATUS.md](STATUS.md) tracks what's specified versus built, milestone by milestone, and is updated as pieces move from "designed" to "working" — not before.

## Contributing

Right now the most useful contribution is on the documents, not the code: poke holes in [SPEC.md](SPEC.md), argue with [RULES.md](RULES.md), or propose a milestone order in [STATUS.md](STATUS.md). Open an issue or a PR against the docs.

## License

MIT — see [LICENSE](LICENSE).
