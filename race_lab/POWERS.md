# Rider powers

New club races use `skills-v8-specials`: **one player-controlled special per rider
per race**, costing **75 free game coins** on an accepted launch. The button shows
the exact cost before a click or F. A missed attack still costs coins; rejected,
early, late, unaffordable or duplicate requests never charge. A stale browser
must reload the priced controls before it can activate a paid power.

Power budget (the existing reserve path) keeps every purchased level: each rank
extends the self boost by 4% and reduces activation cost by 5 coins, reaching
50 coins at level 5. It no longer adds a second use in new races. Prices, purchased
levels and the rest of the workshop remain saved. Cost and one-use policy freeze
when betting opens; old v7 rounds retain their original free reserve behavior.

The much stronger single moves use faster acceleration, longer boosts, heavier
hits and wider area reach. Untrained rocket boost is 65% for 6.5 simulation
seconds; the pan jolts speed by 80% then slows target pace by 72% for 5.5 seconds.
Focus and tack still soften hits. Combined boosts cap at 85%, slowing at 75%,
heavy jolts at 88%; strongest-heavy-hit and jolt-cooldown protections remain.
The common simulation clock converts durations to playback time.

The server owns activation time, targets, funds and the frozen fee. Debit ledger,
accepted action and changed future movement commit together. Safe retries keep
the same request ID, including after restart, and never spend again. Fees appear
in current and saved slips and in round totals. CPU fillers use one automatic
move each; they have no player wallet.

Only future movement can change. Past progress, the private seed, snapshots,
accepted inputs and actual crossings retain the causal/restart guarantees of the
live engine. Public clients never receive a future result. Existing v6/v7 race
physics, uses, prices and outcomes are preserved.

Each special launches a 2.4× prop, colored instanced trails and expanding
shockwaves, with a large announcement. Hits have larger stars and stronger rider
reactions; the camera stays under the player's control. Effects use fixed pools
and absolute race time, clear on rewind, and add no per-frame geometry.

## Signature moves

| Rider | Power | What happens |
| --- | --- | --- |
| Trump | Hat Trick | Spinning red hats distract up to three nearby rivals; Trump gets a small surge. |
| Elon | Totally Normal Rocket | A roaring saddle rocket gives a substantial sustained speed boost. |
| Biden | Ice Cream Express | An ice-cream cone provides a very motivating target for a sprint. |
| McConnell | Filibuster the Front-runner | Express paperwork jolts the leader, then slows their pace for several seconds. |
| Bernie | Mittens for the Many | Bernie surges and shares a smaller boost with the racer running last, if that is someone else. |
| Gordon | Where’s the Gallop?! | A homing pan sharply knocks the leader out of stride and leaves them seeing stars. |
| Snoop | Chill Out, Neigh-bor | A mellow musical cloud briefly slows up to three nearby rivals. |

Trump and Snoop attack up to three rivals within 26 metres in new races at activation,
across real course positions and lanes. If the pack has escaped, their attacks
miss; the owners still get their small boost. McConnell and Gordon instead
lock onto whoever is leading at activation, regardless of distance. Targets
remain locked if the lead changes during the throw. If the attacker is already
leading, or the winner has crossed the finish, no rival is hit; the attacker
keeps only their speed boost. They never attack themselves or retarget second
place. CPU and human racers follow the same rules.

The server uses the field's positions at activation to choose targets. A short
playback buffer means a very close lead can change between what the screen shows
and the server accepting a click. Targets must still be racing.
Impacts follow a short visible throw. Targets and the most recent four moves
appear in the race feed; ready/active/used and slowed states appear in live order.

## Earlier tuning for saved v6/v7 rounds

Older v6/v7 boosts last roughly 2-3 seconds on the standard playback clock; area attacks
roughly 1-2 seconds. Heavy leader hits are deliberately stronger: Gordon knocks
current velocity down 60% and reduces target pace 55% for 3.4 simulation seconds;
McConnell knocks velocity down 40% and reduces target pace 45% for 4.2 simulation
seconds. These are about 2.8 and 3.5 seconds on the normal race clock. Each Focus
level softens both penalties by 6%, up to 30%. Horses recover through their actual
acceleration rather than teleporting. Nobody moves backwards or loses coins
from an attack.

Heavy slowdowns take the strongest active penalty, never their sum. Area slows
still cap at 24%; overall slowing caps at 60%. A 2.4-simulation-second jolt cooldown
protects a victim from repeated immediate velocity drops. Older combined boosts still
cap at 28%. Existing races retain their saved motion and original lighter effects.

## Replay and sound

A hit displays a wobble, orbiting stars, a BONK/BLAH BLAH label and a prominent
impact notice. The reactions use absolute race time and reset when seeking.
Twelve original local WAV clips provide distinct comic launch/contact cues.
Pans clang at impact, paperwork talks in trombone nonsense, and the other riders
get whistles, rocket sputters, an ice-cream jingle, mitten chimes and mellow bass.
The Powers slider is independent of Hooves/Crowd and is saved per browser.
Late sound activation never replays past launches or impacts. These are original
cartoon sounds, with no celebrity voice samples or imitations; rider images are
unchanged.

Training remains the main sustained advantage. Powers can swing close races;
they never choose or overwrite the winner. Finish crossings still determine
Win/Place/Show settlement, finish prizes and career points. Betting closes
before the server prepares any power times or result.

The practice demonstrations remain their original scripts. `simulateRace` retains
the older automatic simulation for fixtures and imported previews; live club
races use `simulateLiveRace` with the server's saved activation log.

In the v5 1,000-seed audit, untrained character wins ranged from 13.7% to 15.2%;
the 4/2/1 build won 60.3% and maximum training won 89.6% against six untrained
rivals. The heavier hits make close races more vulnerable while retaining the
training advantage. These describe the sample, not guaranteed room odds.
