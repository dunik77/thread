# Status

Honest by design: nothing is marked done until it runs against live Robinhood Chain data and someone other than the author has checked the output.

## Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` working, checked against live data

## Milestones

- [ ] **M0 — Open questions answered.** The two open questions in [SPEC.md](SPEC.md) (deployer reuse rate, fee-recipient vs deployer overlap) are checked against real Pons v2 launch data before any code is written. If the answer kills the premise, this file says so instead of quietly moving on.
- [ ] **M1 — Deployer history, read-only.** Given a deployer address, list every launch it created via `PonsV2LaunchFactory` and each one's phase. No storage yet — a live query each time.
- [ ] **M2 — Persistent store.** `launches` and `fee_credits` tables exist; a backfill job populates them from Bitquery/Blockscout; a scheduled job keeps them current.
- [ ] **M3 — Fee-recipient history.** Given a launch, list every other launch that paid the same fee-escrow recipient, each with its transaction hash.
- [ ] **M4 — Case file assembly.** Given one launch address, produce the joined view: deployer history + fee-recipient history + evidence links, matching the field list in [docs/case-file-format.md](docs/case-file-format.md).
- [ ] **M5 — Page view.** A public page that renders one case file, evidence and hedges included, from a launch address.
- [ ] **M6 — Share card.** The compressed, shareable version of the same case file, held to the same evidence standard per RULES.md rule 7.
- [ ] **M7 — First real case file published.** Not a demo, not fixture data — one actual Pons v2 launch, with real transaction hashes, posted publicly.

## What this means right now

If you're reading this before M1 is checked off: there is no software here yet. The README's "Does" section describes intent, not a running tool. That's the point of shipping the spec first — anyone can argue with the plan before a line of code makes it expensive to change.
