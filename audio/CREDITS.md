# Race sound credits

- **Bugle — “First Call”**, U.S. Army, public domain. [Source and licensing record](https://commons.wikimedia.org/wiki/File:FirstCall.mp3), [original MP3](https://upload.wikimedia.org/wikipedia/commons/5/5d/FirstCall.mp3). Leading/trailing silence trimmed, filtered, level-adjusted and encoded for the game. This is a real bugle recording, not generated speech.
- **Crowd bed — “large crowd medium distance stereo”**, eguobyte, CC0. [Source and licensing record](https://commons.wikimedia.org/wiki/File:360703_eguobyte_large-crowd-medium-distance-stereo.wav), [original WAV](https://upload.wikimedia.org/wikipedia/commons/a/a9/360703_eguobyte_large-crowd-medium-distance-stereo.wav). Cropped to a compact loop, filtered, level-adjusted and crossfaded at the wrap.
- **Cheering — “F1 Race Crowd Applause Air Horns”**, WebbFilmsUK, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Source and licensing record](https://commons.wikimedia.org/wiki/File:F1-Race-Crowd-Applause-Air-Horns.wav), [original WAV](https://upload.wikimedia.org/wikipedia/commons/9/94/F1-Race-Crowd-Applause-Air-Horns.wav). Recorded at the 2012 British Grand Prix. Cropped, filtered, peak-limited, level-adjusted, loop-crossfaded and dynamically mixed for this parody game. No endorsement implied.
- **Starter pistol** — original deterministic procedural effect in `race-audio.js`: a short noise crack, low body and decay. No real firearm recording or voice is used.

`manifest.json` records hashes, source URLs, adaptation notes and decoded levels.
`prepare-audio.py` in the parent directory reproducibly prepares the three MP3s.
Original source recordings are downloaded to temporary storage; no source files
or original rider dialogue are overwritten.
