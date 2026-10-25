# Training and shared race simulation

Club races use the server-owned `skills-v1` model in `server/race-simulation.js`.
The server simulates distance, acceleration, pace, cornering and fatigue, then
derives the finishing order from actual finish crossings. It saves that complete
timeline once when betting closes. Every browser plays the same saved motion.
Practice examples retain their scripted scenarios.

## Three different skills

- **Speed:** each level raises the cruising target by 0.3% of the untrained
  target and acceleration by 3.5% of untrained acceleration.
- **Stamina:** fatigue starts beyond 42% of the distance and builds gradually.
  Without training its target-pace penalty reaches 14% at the finish. Each level
  removes 0.8 percentage points from that maximum penalty, reaching 10% at level 5.
- **Focus:** each level reduces the variable part of gate reaction and the
  corner pace penalty by 6%, the probability of a brief rhythm interruption by
  8%, and its duration by 3.5%, all relative to the untrained value. The fixed
  minimum reaction remains. Rhythm losses slow the target temporarily; horses
  decelerate and recover rather than teleporting or stopping abruptly.

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

There is no database migration. Existing purchased levels, prices, five-level
caps, balances, finish prizes, points and 4× winning-bet returns are preserved.
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

`npm run test:training-balance` runs 1,500 reproducible seven-horse races per
scenario and writes an audit under `review/deployment/training/balance.json`.
The initial audit measured about 14.1% wins for an untrained entrant and 31.0%
for the same entrant with all skills at level five against six untrained rivals.
These are sample results for that field, not a promised probability for every
room. Re-run the matched-seed audit when tuning the model, including individual
skills, and retain the version string when describing recorded evidence.
