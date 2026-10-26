# Training and shared race simulation

Club races use the server-owned `skills-v5-heavy-hits` model in `server/race-simulation.js`.
The server simulates distance, acceleration, pace, cornering and fatigue, then
derives the finishing order from actual finish crossings. It saves that complete
timeline once when betting closes. Every browser plays the same saved motion.
Practice examples retain their scripted scenarios.

## Three different skills

- **Speed:** each level raises the cruising target by 3% of the untrained
  target and acceleration by 10% of untrained acceleration.
- **Stamina:** fatigue starts beyond 42% of the distance and builds gradually.
  Without training its target-pace penalty reaches 14% at the finish. Each level
  removes 2 percentage points from that maximum penalty, reaching 4% at level 5.
- **Focus:** each level reduces the variable part of gate reaction and the
  corner pace penalty by 11% and 13% respectively, the probability of a brief rhythm interruption by
  14%, and its duration by 8%, all relative to the untrained value. The fixed
  minimum reaction remains. Each Focus level also softens incoming power slowdowns
  by 6%, up to 30% at maximum. Rhythm losses slow the target temporarily; horses
  decelerate and recover rather than teleporting or stopping abruptly.

Every rider also has one automatic signature power per race; see [POWERS.md](POWERS.md).
Training mechanics and prices are unchanged.

These effects combine through movement; they are not flat additions to win odds.
Independent race-day form, changing effort and small rhythm interruptions keep
outcomes uncertain. All characters have the same base rules. Empty slots receive
CPU entrants at level zero. The current course is one lap with four turns; outer
lanes do not receive a hidden training or distance advantage.

The model integrates in 0.125-second steps before converting to the shared round
clock. One clock scale applies to the whole field. Timelines are simplified to
within 4 cm while preserving gate/reaction and finish boundaries. All horses
finish within the scheduled maximum slot, and the round closes up to 1.25 seconds
after the last crossing. No finishing order is selected in advance of simulation.
Leg animation and individual continuous hoof voices integrate the same distances
using one stride distance across the field, so faster pace produces faster steps.

## Existing progress and race integrity

Existing purchased levels, prices, five-level caps, balances, finish prizes,
points and old 4× Win tickets are preserved. The new Win/Place/Show ticket store
is an additive SQLite table; old betting rows are retained unchanged.
Skills belong to the account and follow its chosen rider. Entry levels freeze
when the host opens betting; purchases and horse changes remain locked until the
round ends. Betting on another entrant does not transfer training to it.

Randomness is independently seeded per horse. Changing one skill in a repeatable
comparison does not reroll another horse's form. The production seed is generated
on the server after betting closes. Clients cannot submit seeds or skills.
Saved race definitions from previous engines still play and settle unchanged.
Pending rounds recover their persisted timing slot after restart; prepared rounds
reuse their saved timeline, with no reroll and no duplicate settlement.

## Validation and balancing

`npm test` checks all three effects with matched seeds, timeline-derived finishes,
bounded training advantage, frozen entries, restart compatibility and gait rates.
`npm run test:training` checks real purchases, desktop/phone explanations, shared
motion, sound, awards and reload in independent browser sessions. Local fixtures
alone use an injected clock; the deployed service has no clock control endpoint.

`npm run test:training-balance` runs 2,000 reproducible seven-horse races per
scenario and writes an audit under `review/deployment/training/balance.json`.
The v2 audit measured 13.85% wins for an untrained entrant, 66.7% for the 4/2/1
Speed/Stamina/Focus build, and 88.75% with all skills at level five against six
untrained rivals. The user requested this stronger progression after finding
the previous v1 maximum-training rate of approximately 31% too subtle.
These are sample results for that field, not a promised probability for every
room. Re-run the matched-seed audit when tuning the model, including individual
skills, and retain the version string when describing recorded evidence.

With the v5 heavy leader hits enabled, a separate 1,000-seed audit measured
60.3% wins for the 4/2/1 build and 89.6% for maximum training against untrained
rivals. Untrained character wins ranged from 13.7% to 15.2%.
