# Case file format (draft)

The unit thread produces, in every surface (page or share card). Field list is stable now so the page and the share card can never drift into saying different things about the same launch.

## Fields

| Field | Description | Required |
|---|---|---|
| `launch_address` | The token/launch this case file is about | yes |
| `deployer_address` | Who created it, per `PonsV2LaunchFactory` | yes |
| `deployer_prior_launches` | List of `{ launch_address, phase, tx_hash }` for every earlier launch by this deployer | yes, empty list if none |
| `fee_recipients` | List of `{ address, amount, tx_hash }` from this launch's fee escrow | yes, empty list if none |
| `fee_recipients_elsewhere` | For each recipient above, other launches that paid the same address, with `tx_hash` | yes, empty list if none |
| `evidence_gaps` | Plain-language list of what could not be checked (e.g. "fee escrow not yet deployed at query time") | yes, empty list if none — never omitted |
| `generated_at` | Timestamp and the indexed block height the query ran against | yes |

## Rules this format enforces

- No field for a score, a verdict, or a risk level. There isn't one to fill in — see [RULES.md](../RULES.md) rule 2.
- `evidence_gaps` is mandatory and defaults to an explicit empty list, not an absent field, so "nothing missing" and "we didn't check" are never visually identical.
- Every list item that names another launch or address carries its own `tx_hash`. A fact without one does not belong in this format.

## Share card constraints

The share card is a rendering of this same object, not a different one. It may show fewer rows (e.g. top 3 of `fee_recipients_elsewhere` instead of all of them), but:

- a truncated list says "+N more, full list at the link" — it never silently drops rows
- `evidence_gaps` is never dropped for space; if it's non-empty, the card says so
- no field is reworded into a stronger claim than the page carries (see RULES.md rule 7)
