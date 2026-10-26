# Horse and power workshop

The Upgrades tab adds **20 paths**, with **185 capped workshop levels** and a
repeatable stable-mastery track. Existing Speed, Stamina and Focus purchases,
five-level caps and quadratic prices are unchanged. All training belongs to the
account and follows the selected rider; switching riders never loses a build.
The power-strength path gets a funny name for each rider, such as Bigger Rocket,
Cast-Iron Cookware or Industrial Paperwork, but the purchased level is shared.

## Paths and real effects

| Group | Path | Effect per level | Cap |
| --- | --- | --- | --- |
| Horse | Gate school | 2.5% quicker gate reaction | 10 |
| Horse | Stride strength | 4% more acceleration | 10 |
| Horse | Rail runner | 4% less corner loss | 10 |
| Horse | Long gallops | 2% less late fatigue | 10 |
| Horse | Photo-finish kick | Up to 0.6% more pace, building after 72% distance | 10 |
| Horse | Slipstream school | 0.4% extra pace behind a nearby racer | 10 |
| Horse | Sure-footed | 4% fewer rhythm breaks, 3% shorter breaks | 10 |
| Horse | Second wind | Fatigue starts 0.7% of the course later | 10 |
| Tack | Lucky horseshoes | 0.2% extra cruise pace, 1% less corner loss | 10 |
| Tack | Shock-absorbing saddle | 2.5% softer heavy jolts and heavy slowing | 10 |
| Tack | Bounce-back training | 2.5% shorter attacks, 4% more recovery acceleration | 10 |
| Tack | Distraction blinkers | 2.5% less incoming slowing | 10 |
| Power | Power punch | 2% stronger boost, slow, jolt and friendly assist | 10 |
| Power | Make it last | 2.5% longer boost and target effect | 10 |
| Power | Delivery service | 1m more area range, quicker projectile | 10 |
| Power | One more for the road | 4% longer self boost; level 5 unlocks a reserve cast | 5 |
| Power | Keep your cool | 0.4% extra pace, 8% less rhythm loss, 3% less corner loss during own boost | 10 |
| Stable | Club purse bonus | 4% more coins for your own finish | 10 |
| Stable | Training co-op | 1.5% discount on other workshop paths | 10 |
| Stable | Lifetime stable mastery | Repeatable rank with a diminishing cruise bonus | Repeatable |

Slipstream requires another unfinished racer 1-10m ahead in the same or an
adjacent lane. It does not reroll either horse's form. Finish kick builds across
the late part of the race; it is not a direct win-probability bonus. Recovery
speeds acceleration through the attack and briefly afterward. It shortens
hostile effects only, never a friendly mitten boost. Per-target end times persist
in the race so recovery visuals match each defender's actual resistance.

Players choose when to use each move in live club races. Reserve level 5 gives
a second player-controlled charge at 65% strength, after the first move's recovery
window. Each cast has a unique saved event ID and the same target rules.
A leader never attacks itself, and a finished winner is not replaced by second
place. CPU riders keep zero workshop levels and one move. A reserve cast can
fail to find a valid target, just like the original move.

Power strength still respects effect caps. The combined boost cap rises from
28% to at most 38% with power training; slowing remains capped at 60%, heavy
slowdowns take the strongest active value, and heavy jolts have a ceiling and
shared cooldown. Focus, saddle and blinkers combine multiplicatively. Fully
trained defenders still take an effect; no upgrade grants immunity. More
training gives an advantage rather than a guaranteed result.

## Prices, coins and long-term progression

Workshop price is `ceil(base * nextLevel^1.5 * discount)`. Mastery uses exponent
1.25. Base costs are 70-250 coins for capped paths and 500 for mastery. The co-op
discount reaches 15%; it never discounts itself or the original three skills.
The browser shows current benefit, exact next benefit and server-matched price.
The server checks the actual current level and balance in one transaction.
Stale purchase requests with an expected level return 409 without charging.

Mastery's total pace bonus is `3% * rank / (rank + 25)`. It keeps increasing but
approaches a 3% ceiling. There is no prestige reset or fixed gameplay level cap;
normal safe-integer limits still apply. This gives a repeatable coin sink and
visible stable rank without unlimited speed inflation.

Purse training changes only the player's finish prize, up to +40%. Awards use
integer arithmetic and round fractional coins down. Win/Place/Show terms, stakes,
bet returns and career points are unchanged. The race freezes the purchased
bonus at betting open, so later purchases never rewrite an older prize.

## Saving and compatibility

An additive `player_upgrades(user_id, kind, level)` table stores workshop levels.
The existing users, bets, typed tickets, sessions and ledger tables are not
rebuilt. Purchases, ledger debits and new levels commit together. Existing
accounts begin with zero workshop levels; their old purchases are preserved.
Entries freeze at betting open. All buying stays locked for active entrants
until settlement; selecting a different tab cannot bypass the server's lock.

The `skills-v7-live` simulation saves the private seed and accepted activation log,
upgraded movement, per-target recovery windows and both casts, with no reroll
after restart. Later casts change future movement without rewriting the past.
Older definitions keep
their original movement and outcome. Deploy with `progression.js` alongside the
engine. Roll back only to code that understands these levels, or first settle
active upgraded rounds with compatible code. Never restore an old database to
roll back application code. A catalogue entry also needs a simulator or economic
effect and meaningful tests; adding an attractive but inactive button is not an
upgrade implementation.
