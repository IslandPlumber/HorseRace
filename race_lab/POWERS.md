# Rider powers

New club races use `skills-v6-workshop`. Every rider, including CPUs, starts with one
automatic signature move per race. Reserve training can unlock a second late move
at 65% strength. The workshop also trains power strength, duration, reach and
control; tack can soften hits and shorten recovery. See [PROGRESSION.md](PROGRESSION.md). There are no power purchases or activation
requests. The server chooses a seeded activation point between 28% and 66% of
the course, simulates the whole field together, and persists actual movement,
targets and event times at betting cutoff. All devices replay those same events.
Saved races keep their original model, results and ticket returns.

| Rider | Power | What happens |
| --- | --- | --- |
| Trump | Hat Trick | Spinning red hats distract up to three nearby rivals; Trump gets a small surge. |
| Elon | Totally Normal Rocket | A tiny saddle rocket gives a short solo speed boost. |
| Biden | Ice Cream Express | An ice-cream cone provides a very motivating target for a sprint. |
| McConnell | Filibuster the Front-runner | Express paperwork jolts the leader, then slows their pace for several seconds. |
| Bernie | Mittens for the Many | Bernie surges and shares a smaller boost with the racer running last, if that is someone else. |
| Gordon | Where’s the Gallop?! | A homing pan sharply knocks the leader out of stride and leaves them seeing stars. |
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

Boosts last roughly 2-3 seconds on the standard playback clock; area attacks
roughly 1-2 seconds. Heavy leader hits are deliberately stronger: Gordon knocks
current velocity down 60% and reduces target pace 55% for 3.4 simulation seconds;
McConnell knocks velocity down 40% and reduces target pace 45% for 4.2 simulation
seconds. These are about 2.8 and 3.5 seconds on the normal race clock. Each Focus
level softens both penalties by 6%, up to 30%. Horses recover through their actual
acceleration rather than teleporting. Nobody moves backwards or loses coins
from an attack.

Heavy slowdowns take the strongest active penalty, never their sum. Area slows
still cap at 24%; overall slowing caps at 60%. A 2.4-simulation-second jolt cooldown
protects a victim from repeated immediate velocity drops. Combined boosts still
cap at 28%. Existing races retain their saved motion and original lighter effects.

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

The practice demonstrations remain their original scripts. To preview powers
locally, import a definition produced by `simulateRace`, or join a club room.

In the v5 1,000-seed audit, untrained character wins ranged from 13.7% to 15.2%;
the 4/2/1 build won 60.3% and maximum training won 89.6% against six untrained
rivals. The heavier hits make close races more vulnerable while retaining the
training advantage. These describe the sample, not guaranteed room odds.
