# Status

Honest by design: nothing is marked done until it runs against live Robinhood Chain data and someone other than the author has checked the output.

## Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` working as scoped on its own line — read the line before trusting the checkmark, since "working" means different things for a mockup and a live read

## Milestones

- [x] **M-1 — UI mockup, fixture data only.** [demo/index.html](demo/index.html) renders the case-file layout from [docs/case-file-format.md](docs/case-file-format.md) against three made-up example launches, hardcoded in the page's own script — not real tokens, not real deployers, not a live chain read. Built to argue about the interface before a line of indexing code exists. Every fake transaction reference is inert by design: clicking one shows a "demo data" notice instead of pretending to link anywhere real.
- [x] **M0.5 — Live token reader, ERC-20 metadata only.** [lookup/index.html](lookup/index.html) takes any address, reads it directly from the public Robinhood Chain RPC (`eth_getCode`, `eth_call`), and shows real name/symbol/decimals/supply, plus whether it's a minimal-proxy clone and what implementation it points to. No deployer, no fee history, no graduation phase — those all need indexing this page doesn't do. Checked against three real addresses on 2026-09-07: two full ERC-20 implementations ("Pons"/PONS and "Cash Cat"/CASHCAT, both 1B supply, 18 decimals) and one minimal-proxy clone ("A Meme Coin"/MEME) pointing to implementation `0x3be8b97fd0e713b5abe0649fa830223b6b4bc599`. Worth flagging as a fact, not an accusation, per RULES.md rule 1: one of the three is named "Pons"/"PONS" itself — the same name as the launchpad.
- [x] **M0.6 — Tested decoder, zero dependencies.** [src/chain-read.js](src/chain-read.js) extracts the pure decode/detect logic out of `lookup/index.html` into a module tested by [test/chain-read.test.js](test/chain-read.test.js): 11 checks via `node:test`, no runtime dependencies, no network — the fixtures are frozen real `eth_getCode`/`eth_call` responses from 2026-09-07, not synthetic data. `npm test` reproduces it. The browser page still carries its own copy of the same functions rather than importing this module, since a single static HTML file with no build step can't cleanly pull in a CommonJS module — keeping the two in sync is a manual discipline, not an enforced one, until there's a build step to remove the duplication.
- [~] **M0 — Open questions answered, partially.** Resolved with a Bitquery access token (2026-09-07): deployer reuse is real (275 unique deployers across 300 real, consecutive launches, 12 repeats, one with 8) but the biggest repeater turned out to be the canonical Multicall3 contract, not a person — see [SPEC.md](SPEC.md) "Open questions" for the full finding and why it changed M1's design. Separately, and before the key existed: the three example addresses shipped in `lookup/index.html` and `demo/index.html` were checked against `TokenLaunched` logs on the known factory, plus the router, hook, and locker — zero matches anywhere, confirmed via the public RPC's `eth_getLogs` (a clean, fast negative — unlike Bitquery's realtime tier, which was observed timing out on zero-match `Arguments` filters rather than returning empty quickly, see M1's note below). Still open: whether fee-recipient overlaps with deployer identity — `TokenLaunched` doesn't carry that data at all, it's in decoded call input, which isn't built yet (M3).
- [x] **M1 — Deployer history, read-only, live.** `node scripts/deployer-history.js <address>` takes a token or a deployer address, queries Bitquery's real `TokenLaunched` log with no local storage, and prints every launch sharing that deployer — checking it first against [src/known-infra.js](src/known-infra.js) so a shared contract like Multicall3 gets flagged instead of presented as one person's launch history. Verified live, 2026-09-07, against: a real repeat deployer (`0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669`, 50+ launches, hit the query cap), the Multicall3 case (correctly flagged), a token-address input (correctly resolves its deployer first), and a known non-Pons address (correctly reports the lookup as inconclusive rather than claiming a confirmed negative it can't back up — Bitquery's realtime tier times out on true zero-match filters instead of returning `[]`, which is documented in the script's own comments so the next person doesn't mistake a timeout for an answer).
- [ ] **M2 — Persistent store.** `launches` and `fee_credits` tables exist; a backfill job populates them from Bitquery/Blockscout; a scheduled job keeps them current.
- [ ] **M3 — Fee-recipient history.** Given a launch, list every other launch that paid the same fee-escrow recipient, each with its transaction hash.
- [ ] **M4 — Case file assembly.** Given one launch address, produce the joined view: deployer history + fee-recipient history + evidence links, matching the field list in [docs/case-file-format.md](docs/case-file-format.md).
- [ ] **M5 — Page view.** A public page that renders one case file, evidence and hedges included, from a launch address.
- [ ] **M6 — Share card.** The compressed, shareable version of the same case file, held to the same evidence standard per RULES.md rule 7.
- [ ] **M7 — First real case file published.** Not a demo, not fixture data — one actual Pons v2 launch, with real transaction hashes, posted publicly.

## What this means right now

Deployer history is real and live (M1), gated behind a Bitquery API key that isn't shipped with this
repository — see README.md "Install". Everything past it is not: no persistent store (M2), no fee-recipient
history (M3), no assembled case file (M4), no page or share card (M5/M6). The demo mockup still shows the
intended shape of the *finished* case file with invented data — M1 shows one real slice of it with real
data, and the gap between the two is the rest of this list.
