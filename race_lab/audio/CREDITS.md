# Race sound credits

- **Comic power launch and impact clips** — original deterministic sound design
  for this project, CC0-1.0. Twelve local mono WAV files in `powers/`: spinning
  whistle/rubber boing, countdown/rocket sputter, ice-cream jingle/slurp,
  paper shuffle/talking-trombone nonsense, mitten squeak/chimes, pan throw/metal
  clang/dizzy whistle, and mellow bass/record-style slide. No sampled speech,
  celebrity voice imitation or third-party recording is used in these clips.
  `prepare-power-audio.mjs` renders `power-audio.js` to WAV and records hashes and
  decoded levels in `powers/manifest.json`. Launch and contact are separate cues;
  impacts play only when the move has a target. Powers volume is independent,
  saved per browser, and the existing master limiter still covers the mix.

- **Bugle — “First Call”**, U.S. Army, public domain. [Source and licensing record](https://commons.wikimedia.org/wiki/File:FirstCall.mp3), [original MP3](https://upload.wikimedia.org/wikipedia/commons/5/5d/FirstCall.mp3). Leading/trailing silence trimmed, filtered, level-adjusted and encoded for the game. This is a real bugle recording, not generated speech.
- **Quiet audience and short applause — “Slow starting applause”**, stephan, public domain. [Source and licensing record](https://commons.wikimedia.org/wiki/File:Slow_starting_applause.ogg), [original recording](https://upload.wikimedia.org/wikipedia/commons/a/a3/Slow_starting_applause.ogg). An outdoor fireworks audience recorded in Düsseldorf in 2007, repurposed as game ambience. The opening eight seconds become a quiet crossfaded audience bed; seconds 17–21 become a faded, occasional applause reaction. This is not claimed to be a recording of an actual horse race. The earlier F1 air-horn recording is no longer used.
- **Galloping — “Six Horses Galloping By”**, credited by Wikimedia Commons to Bruno Auzet / Freesound Community, CC0 as recorded on [the source and licensing page](https://commons.wikimedia.org/wiki/File:Six_Horses_Galloping_By.ogg). [Original recording](https://upload.wikimedia.org/wikipedia/commons/9/96/Six_Horses_Galloping_By.ogg). Seconds 8–16 are filtered, level-adjusted and crossfaded into a compact loop. Hoofbeats begin at gate release, follow race speed and recede after the finish.
- **Starter pistol** — original deterministic procedural effect in `race-audio.js`: a short noise crack, low body and decay. No real firearm recording or voice is used.

`manifest.json` records hashes, source URLs, adaptation notes and decoded levels.
`prepare-racetrack-audio.py` reproducibly prepares the replacement audience,
applause and gallop tracks while retaining the bugle. Crowd volume is independent
of the bugle, starter and hoofbeats. Applause uses brief timed reactions rather
than continuous stadium cheering. Foreground bursts in the audience bed are
spectrally suppressed. The gallop recording supplies a small natural texture to
original dry dirt impacts; the runtime builds one four-beat voice per actual
racer, using the same distance-driven gait clock as the rendered legs. Playback
follows each horse's speed, stereo position and finish. There is no fixed-size
herd loop. Independent Hooves and Crowd levels are saved per browser.
Source licenses apply to individual recordings;
no endorsement is implied.
Original source recordings are downloaded to temporary storage; no source files
or original rider dialogue are overwritten.
