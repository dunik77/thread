# Status

Honest by design: nothing is marked done until it runs against live Robinhood Chain data and someone other than the author has checked the output.

## Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` working as scoped on its own line — read the line before trusting the checkmark, since "working" means different things for a mockup and a live read

## Milestones

- [x] **M-1 — UI mockup, fixture data only.** [demo/index.html](demo/index.html) renders the case-file layout from [docs/case-file-format.md](docs/case-file-format.md) against three made-up example launches, hardcoded in the page's own script — not real tokens, not real deployers, not a live chain read. Built to argue about the interface before a line of indexing code exists. Every fake transaction reference is inert by design: clicking one shows a "demo data" notice instead of pretending to link anywhere real.
- [x] **M0.5 — Live token reader, ERC-20 metadata only.** [lookup/index.html](lookup/index.html) takes any address, reads it directly from the public Robinhood Chain RPC (`eth_getCode`, `eth_call`), and shows real name/symbol/decimals/supply, plus whether it's a minimal-proxy clone and what implementation it points to. No deployer, no fee history, no graduation phase — those all need indexing this page doesn't do. Checked against three real addresses on 2026-09-07: two full ERC-20 implementations ("Pons"/PONS and "Cash Cat"/CASHCAT, both 1B supply, 18 decimals) and one minimal-proxy clone ("A Meme Coin"/MEME) pointing to implementation `0x3be8b97fd0e713b5abe0649fa830223b6b4bc599`. Worth flagging as a fact, not an accusation, per RULES.md rule 1: one of the three is named "Pons"/"PONS" itself — the same name as the launchpad.
- [ ] **M0 — Open questions answered.** The two open questions in [SPEC.md](SPEC.md) (deployer reuse rate, fee-recipient vs deployer overlap) are checked against real Pons v2 launch data before any code is written. If the answer kills the premise, this file says so instead of quietly moving on.
- [ ] **M1 — Deployer history, read-only.** Given a deployer address, list every launch it created via `PonsV2LaunchFactory` and each one's phase. No storage yet — a live query each time.
- [ ] **M2 — Persistent store.** `launches` and `fee_credits` tables exist; a backfill job populates them from Bitquery/Blockscout; a scheduled job keeps them current.
- [ ] **M3 — Fee-recipient history.** Given a launch, list every other launch that paid the same fee-escrow recipient, each with its transaction hash.
- [ ] **M4 — Case file assembly.** Given one launch address, produce the joined view: deployer history + fee-recipient history + evidence links, matching the field list in [docs/case-file-format.md](docs/case-file-format.md).
- [ ] **M5 — Page view.** A public page that renders one case file, evidence and hedges included, from a launch address.
- [ ] **M6 — Share card.** The compressed, shareable version of the same case file, held to the same evidence standard per RULES.md rule 7.
- [ ] **M7 — First real case file published.** Not a demo, not fixture data — one actual Pons v2 launch, with real transaction hashes, posted publicly.

## What this means right now

If you're reading this before M1 is checked off: there is no data pipeline here yet. The demo mockup shows the intended shape of a case file — layout, fields, tone of language — but every number and address in it is invented. The README's "Does" section still describes intent, not a running tool. That's the point of shipping the spec and a mockup before a line of indexing code makes the interface expensive to change.
