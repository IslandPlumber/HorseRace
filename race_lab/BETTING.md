# Win, Place and Show

This is free, fictional game currency. Each player can place one ticket of each
type per round, on the same horse or different horses. Every ticket costs its
own stake of 10–500 whole coins. All stakes come from the same saved bankroll.

| Type | Successful finish | Total returned, including stake |
| --- | --- | --- |
| Win | 1st | 4× stake |
| Place | 1st or 2nd | 2× stake |
| Show | 1st, 2nd or 3rd | 1.5× stake, rounded down to whole coins |

These finish conditions follow [NYRA's wagering definitions](https://prodv2.nyra.com/saratoga/racing/nyra-wagering-info/).
Returns are simplified fixed game returns, not pari-mutuel pool dividends.
The slip previews the exact amount before purchase. A 51-coin Show ticket pays
76 coins when successful, including the 51-coin stake. A Place or Show ticket
also succeeds if the selected horse wins; it does not additionally pay a Win
ticket unless the player bought that separate ticket.

Three 50-coin tickets on a horse finishing second return 0 + 100 + 75 = 175,
against total stakes of 150, for 25 coins betting profit. The player's own
finish prize is added separately. History shows each ticket's type, condition,
stake, return and finish, plus combined betting profit and overall round total.
A mixed round can appear in both the won-bet and lost-bet filters.

## Deadline and saved data

The default betting window is 30 seconds, allowing time to choose three tickets.
The prominent race-screen banner counts down to the server's absolute betting
deadline. Reload cannot reset it. The shortcut reveals the live betting form.
All three locked tickets leave the countdown visible. At zero it says Bets
closed, even if preparation or network polling is delayed. The following gate
countdown does not reopen betting. Disconnected/stale clients cannot advertise
open betting or submit through the form; the server independently enforces the
exact cutoff on every request.

New tickets live in the additive `race_bets` table, with a unique key on player,
race and type. Their return terms are saved on purchase. Existing `bets` rows
stay in place and are read as legacy Win tickets at 4×, including pending tickets.
Both stores settle through the same exactly-once coin ledger. Clients cannot
set returns, payout amounts or finishing positions. Invalid/duplicate tickets,
insufficient funds and late submissions roll back without charging coins.
The old single `bet` API field remains as a compatibility view; modern clients
use the complete private `bets` array. History remains limited to that player.

Before deployment, back up SQLite through its online backup API and retain the
previous application release. No existing table is rebuilt or altered. Once
typed tickets exist, rollback to code predating this table requires settling
active typed rounds with compatible code first; old code cannot settle them.
Never replace the live player database with a pre-deployment snapshot merely to
roll back application code. See deploy/README.md for isolation and backup rules.

`npm test` covers every eligible finish, all ticket types, exact cutoff,
duplicate/invalid/overspending rejection, integer rounding, privacy, old Win
compatibility and restart recovery. `npm run test:betting` checks the live UI,
reload-safe countdown, purchase previews, mixed slips and desktop/390px layout
using temporary local accounts and a test-only injected clock.
