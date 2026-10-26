# Rider powers

New club races use `skills-v4-leader-powers`. Every rider, including CPUs, gets one
automatic signature move per race. There are no power purchases or activation
requests. The server chooses a seeded activation point between 28% and 66% of
the course, simulates the whole field together, and persists actual movement,
targets and event times at betting cutoff. All devices replay those same events.
Saved races keep their original model, results and ticket returns.

| Rider | Power | What happens |
| --- | --- | --- |
| Trump | Hat Trick | Spinning red hats distract up to three nearby rivals; Trump gets a small surge. |
| Elon | Totally Normal Rocket | A tiny saddle rocket gives a short solo speed boost. |
| Biden | Ice Cream Express | An ice-cream cone provides a very motivating target for a sprint. |
| McConnell | Filibuster the Front-runner | Express paperwork briefly slows the leader, at any range. |
| Bernie | Mittens for the Many | Bernie surges and shares a smaller boost with the racer running last, if that is someone else. |
| Gordon | Where’s the Gallop?! | A homing frying pan briefly slows the leader, at any range. |
| Snoop | Chill Out, Neigh-bor | A mellow musical cloud briefly slows up to three nearby rivals. |

Trump and Snoop attack up to three rivals within 16 metres at activation,
across real course positions and lanes. If the pack has escaped, their attacks
miss; the owners still get their small boost. McConnell and Gordon instead
lock onto whoever is leading at activation, regardless of distance. Targets
remain locked if the lead changes during the throw. If the attacker is already
leading, or the winner has crossed the finish, no rival is hit; the attacker
keeps only their speed boost. They never attack themselves or retarget second
place. CPU and human racers follow the same rules.

The server freezes the field's exact positions at activation into the saved
timeline so the selected leader agrees with the visible live order, including
close finishes. Targets must still be racing.
Impacts follow a short visible throw. Targets and the most recent four moves
appear in the race feed; ready/active/used and slowed states appear in live order.

Boosts last roughly 2–3 seconds on the standard playback clock; attacks roughly
1–2 seconds. Exact times scale with the race slot. Combined boosts cap at 28%;
combined slowing caps at 24%. Focus reduces each incoming slowdown by 6% per
level, up to 30% at level five. Nobody moves backwards, loses coins directly,
falls off their horse or is forced to stop. No harmful real-world claims or
celebrity voice impersonations are added. Props and quiet foley are original
procedural artwork/sound; the existing rider images are unchanged.

Training remains the main sustained advantage. Powers can swing close races;
they never choose or overwrite the winner. Finish crossings still determine
Win/Place/Show settlement, finish prizes and career points. Betting closes
before the server prepares any power times or result.

The practice demonstrations remain their original scripts. To preview powers
locally, import a definition produced by `simulateRace`, or join a club room.

In the v4 1,000-seed audit, untrained character wins ranged from 12% to 16.3%;
the 4/2/1 build won 66.7% and maximum training won 90.1% against six untrained
rivals. These describe that sample, not guaranteed odds in every room.
