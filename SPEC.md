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
| `PonsV2LaunchFactory` | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` | `TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)` — confirmed against live data via Bitquery, 2026-09-07 |
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

## Open questions — answered against real data, 2026-09-07

**Does a deployer address reused across launches recur often enough to be useful?** Yes, checked against
300 real, consecutive `TokenLaunched` events pulled live via Bitquery (2026-09-03 through 2026-09-07): 275
unique deployers out of 300 launches, 12 deployers with more than one launch in that window, one with 8.
Deployer reuse is real and worth building on.

**But the single biggest repeater almost broke the premise.** The address responsible for 8 of the 300
launches, `0xcA11bde05977b3631167028862bE2a173976CA11`, is not a person — its bytecode (3,808 bytes,
selectors `0x4d2301cc`/`0xa8b0574e` matching `getEthBalance`/`getBasefee`) confirms it's the canonical
**Multicall3** contract, deployed at the same address on nearly every EVM chain. Some launch path — likely a
bot or a UI batching calls — routes through it, and the factory records `msg.sender` as the deployer.
Presented naively, this reads as "one deployer, 8 launches" when it actually means "8 unrelated launches
happened to be batched through the same universal utility contract." That is exactly the false-positive
[RULES.md](RULES.md) rule 4 exists to prevent, just one layer removed from wallets into infrastructure.

**Design consequence:** before any deployer is presented as a repeat actor, its address must be checked
against a small, explicit list of known shared infrastructure contracts (Multicall3's address is the first
confirmed entry) and flagged separately — "routed through Multicall3, not attributable to a single deployer"
— rather than folded into the same "prior launches" list as a genuine repeat. The list starts small and
grows only when a specific address is confirmed the same way this one was: real bytecode, real matching
selectors, not a guess from an address pattern alone.

**The next four biggest repeaters turned out to be a different, legitimate case worth recording.** Each is a
distinct address holding exactly 23 bytes of code in the pattern `0xef0100` + a 20-byte address — an
[EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) delegation designator, meaning each is a real externally-owned
account that has delegated execution to a smart-wallet implementation, not a shared contract. Unlike
Multicall3, these don't need special handling: the EOA address is still the right identity to key on, and
the repeat launches behind it (5, 4, 3, and 3 in the sample) are a genuine signal.

**Fee escrow recipients: is the recipient usually the deployer itself?** Still open — `TokenLaunched` doesn't
carry fee-recipient data at all; per Bitquery's own docs that field lives in the launch transaction's
decoded call input (`creatorFeeRecipient`, `creatorTaxBps`), not in an event. Answering this needs the call
data decoded, which isn't built yet.
