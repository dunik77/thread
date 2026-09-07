# Spec (draft)

This is a design document, not documentation for working software. Everything below is intent. [STATUS.md](STATUS.md) says what's actually built.

## Scope

thread indexes exactly two protocol-native relationships on Pons v2, Robinhood Chain (chain id 4663), plus the evidence trail behind each:

1. **Fee-recipient history** — every address the fee escrow has ever credited or paid out to, across every launch, via that contract's own `Credited` and `Claimed` events.
2. **Deployer history** — every launch a given address has created through `PonsV2LaunchFactory`, and what phase each one reached (curve, graduated, dead).

Nothing else. No general wallet-to-wallet transfer graph, no cross-chain identity resolution, no funding-source clustering across the wider chain. That's deliberately out of scope — see the README section "Why not just use Bubblemaps."

## Contracts this spec reads

| Contract | Address | What it gives us |
|---|---|---|
| `PonsV2LaunchFactory` | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` | launch creation events, deployer address, launch parameters |
| `PonsV2LaunchAndBuy` | `0xe33e9e479df8802cb0866d5d05258bec4cf62948` | launches that included a first buy, and by whom |
| `PonsV2MemeHook` | `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044` | graduation into the locked Uniswap v4 pool, phase transition |
| locker | `0x267444d099b10fb5ed7c3cc7b7c767adca574952` | confirmation that graduated liquidity is actually locked |
| fee escrow (per-launch) | read from factory logs | `Credited` / `Claimed` events, recipient addresses |

## Planned data flow

1. **Ingest.** Poll `PonsV2LaunchFactory` and per-launch fee escrow logs. A third-party indexer (Bitquery's Pons Launchpad API, or the Blockscout / Hoodexplorer explorer APIs for Robinhood Chain) does the raw log decoding; this project's own job starts at "decoded event," not "raw block."
2. **Store.** Two tables are enough for v0: `launches` (deployer, launch address, phase, timestamps) and `fee_credits` (launch, recipient, amount, tx hash). No graph database needed at this scale — adjacency queries against Postgres are enough for the launch count Pons v2 sees today.
3. **Assemble a case file.** Given one launch address, join against both tables: every other launch by the same deployer, every other launch where a fee recipient repeats. Attach the tx hash for each row.
4. **Render.** A page view (full evidence, full hedges) and a compressed share-card image (same evidence, same hedges, smaller) — see [docs/case-file-format.md](docs/case-file-format.md) for the exact fields both must carry.

## Explicitly not planned for v0

- Statistical timing-correlation clustering (the "funded from unrelated wallets within N minutes, no direct transfer" pattern). This is where [RULES.md](RULES.md) rule 4 gets hardest to honor cheaply, and it's exactly the feature Bubblemaps' Magic Nodes already covers at chain scale. Revisit only if the protocol-native signal turns out to be too thin on its own — not before.
- Any address's transfer history outside of Pons v2's own contracts.
- Automated alerts, trading hooks, or an API tier. Those are monetization questions for after the free, public version has actual users — premature to spec now.

## Open questions

- Does a deployer address reused across launches actually recur often enough on Pons v2 today to make deployer-history useful, or is one-launch-and-gone still the dominant pattern this early in the chain's life? Worth a manual check against Bitquery's launch data before writing any code.
- Fee escrow recipients: is the recipient usually the deployer itself, or a separate treasury address? If it's almost always the deployer, fee-recipient history and deployer history collapse into the same signal, and the spec should say so plainly instead of presenting two features that are one fact.
