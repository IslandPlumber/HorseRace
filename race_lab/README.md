# StreakChat Park — circuit race preview

The same seven reusable riders now race around a four-corner circuit. Choose a
prepared race or generate a new seed before the start, then watch the gates open,
follow the field around the bends, and see the finish on the home straight.

Public demo: **https://islandplumber.github.io/HorseRace/**

## What changed

- Rounded rectangular course with four continuous 90-degree bends, a back
  straight, two short side straights and a home stretch.
- Race A: seven riders, about 412 m, 64 seconds. Race B: five riders, about 481 m,
  72 seconds. Both include a seven-second call-to-post sequence before progress starts, with a three-second final countdown.
- Starting stalls have opening doors and retract outside the track once the
  field departs, leaving the start/finish line unobstructed on the return.
- An automatic camera director switches between gate, broadcast, trackside,
  chase and home-stretch views. Manual Broadcast, Trackside, Chase and Whole
  course views can be selected without pausing or restarting. Switch view cycles
  the modes; Auto director restores automatic cuts.
- Corner signs, distance-to-go boards, continuous rails, a textured dirt ribbon,
  grandstand with spectators, landscaped infield, trees, finish posts and a
  checkered line. A live map, section indicator and remaining-distance HUD help
  follow the field on a phone.
- A closer pack with multiple lead changes instead of one long single-file gap.
  The seeded outcome still comes from actual finish-crossing times.
- Camera-facing upper photo puppets remain upright through turns and camera cuts;
  the horses and tack rotate along the course. Personal animations remain intact.

The underlying definition system is unchanged in purpose: cast, lanes, track,
progress keyframes, captions and outcome are prepared before playback. The same
seed reproduces the same race. JSON can still be saved and loaded. Legacy straight
track definitions remain supported in `races/legacy-a.json` and `legacy-b.json`.

## Run locally

From the repository root, run `python serve_preview.py` and use the `/race_lab/`
path on its local port 8768. Install the pinned development dependencies first:

```sh
cd race_lab
npm ci --cache /workspace/.npm-cache
npm start
```

The self-contained `standalone.html` also embeds the models, but is large. The
hosted site is the recommended Android entry point: no HTML download is needed.

## Track and timing

`track.js` is the shared path calculation for the renderer and the race engine.
`trackPoint` returns a world position, heading and named section for a centerline
race distance and a lateral lane offset. Straight segments meet the circular arcs
with continuous positions and tangents. A circuit's length is derived from its
straight lengths and bend radius; invalid geometry is rejected. Progress remains
monotonic and fixed lanes remain separate around the corners.

`race-core.js` constructs a repeatable scenario with several closely spaced
leaders around the course and a final charge. Each selected rider crosses the
finish before playback ends; declared outcomes must match distinct crossing
 times. This is a prepared scenario generator, not emergent physics. Outside
lanes follow offset curves; progress is measured in centerline race distance.

`course-view.js` renders that same path, the stalls and scenery. `app.js` handles
model caching, animation, camera selection, map, playback and standings. Its photo
billboard adjustment restores the original sampled pose every frame, avoiding
rotation feedback while paused or seeking backward.

All actors are still the original `assets/*.glb` exports with four-second personal
animation loops. Gates hold their animation at the opening pose until release.
The source Blender scenes remain unchanged.

## Tests and builds

```sh
npm test                   # legacy race tests + new circuit geometry/gate tests
npm run test:assets         # exported mesh/skin/source integrity
npm run build               # complete embedded HTML
npm run build:site          # static public deployment under ignored site/
npm run test:circuit       # served browser: gates, cameras, both winners, mobile
npm run test:browser       # generation/import/export/replay/cache/offline checks
```

Browser tests use system Chromium (`/usr/bin/chromium`) and WebGL. The new path
checks cover all four corners, joins, lane offsets, gate delay, invalid geometry
and 100 generated full circuits. Browser evidence is under `review/circuit/`,
including start, bends, home stretch, aerial and mobile screenshots. The test
also checks that paused rider poses do not drift and heads remain above their
horses when cameras change. Legacy straight-race tests remain in the core suite.

To record actual playback of both long races at 2× for review:

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node record-demo.mjs
../.venv/bin/python encode-demo.py
```

This produces `review/race-system-demo.mp4` and a decoded-media validation report. Playwright’s video capture is silent; actual mixed audio is recorded separately by `verify-audio.mjs`.
Encoding FPS is not a runtime performance benchmark. The managed test browser
blocks file:// navigation; the embedded build is tested over local HTTP then with
networking disabled.

## Publication and scope

The GitHub Pages source is the separate `race-lab-pages` branch, root directory.
`build-site.mjs` copies only the public app, models, race definitions and credits;
no workspace files, credentials, Git metadata or development dependencies are
included. Application/style/definition URLs are versioned for this release so
Android browsers request the new circuit code while reusing the unchanged models.

This remains a cutout-parody prototype. Individual animation loops, timed captions and race audio work; actor-relative
hat throws, rider dialogue retiming, lane-changing
and collision simulation remain future work. Source credits and individual media
terms are in [CREDITS.md](CREDITS.md).

For hosted verification inside this managed workspace, Chromium does not inherit
the proxy CA store. `VERIFIED_HTTPS_PROXY=1` in `verify-circuit.mjs` fetches actual
public HTTPS resources through curl with the configured CA/proxy and renders those
verified bytes in Chromium; TLS checks are not disabled. The browser report records
this transport and the tested public URL.

## Race audio

Press Play to unlock sound on mobile browsers. Sound on/off and volume controls
are below the timeline; preferences persist. A real U.S. Army call-to-post bugle
plays while the field waits, and a procedural starting-pistol crack is scheduled
on the AudioContext clock at the gate release. The default gate sequence is seven
seconds so the complete 6.34-second call fits. Legacy shorter countdowns use the
ending of the call. Pausing cancels pending cues and fades/stops the crowd; resume
continues the remaining bugle rather than replaying it. Seeking past the start
does not fire a retrospective shot. Restart re-arms the sequence.

The crowd uses a real CC0 murmur and a credited CC BY 4.0 applause/airhorn recording.
The mix reacts to timeline lead changes, departure, approach to the home stretch
and the first finish crossing; aerial views sound slightly more distant. There
is no random wall-clock trigger, so seeking gives the same crowd state. Instrument
and starter cues follow playback speed; crowd loops retain their natural pitch.
The mix includes short fades, headroom and a compressor to avoid stacked peaks.

`audio-plan.js` is the deterministic cue/profile layer; `race-audio.js` owns the
Web Audio graph, looping sources, playback cancellation, mute and volume. Audio
loading failure leaves the visual race usable and shows a retry message. There
is no audio context before the user's first Play/Sound gesture. The runtime MP3s
add about 550 KB, and are included in both public and embedded builds.

```sh
# From the repository root, to reproduce the credited audio assets:
.venv/bin/python race_lab/prepare-audio.py
cd race_lab
npm run test:audio
```

The mobile browser check records the actual mixed Web Audio output and checks
activation, pause/resume, skipped cues, replay, speed changes, mute, volume,
persisted settings and race changes. Evidence is under `review/audio/`. Unit
tests also cover cue windows, lead-change reactions and finish intensity. See
[audio credits](audio/CREDITS.md) and the source/level manifest.

## Multiplayer club (local prototype)

The existing circuit now has a server-backed game mode: username/password
accounts, a saved horse/rider, 1,000 starting coins, persistent upgrades and
points, seven-runner rooms, host-started rounds, optional win bets and descending
finish prizes. All currency is free fictional game currency, with no purchases
or cash-out. CPU racers fill empty places. Upgrade levels influence the random
finish order without guaranteeing a win.

Requires Node 24.13+ with `node:sqlite`. From `race_lab`:

```bash
npm ci
npm run build:site
npm test
npm run start:multiplayer
```

The server listens on loopback port 8770 for internal development. It serves
`site/` and the game API; accounts are saved in `server/data/game.sqlite` by
default. `GAME_DB`, `HOST`, `PORT`, `TRUST_PROXY` and `GAME_ORIGINS` configure
hosting. The server clock controls live races. Cameras and audio are personal;
seeking/replaying cannot change an official result or award extra coins.

`npm run test:multiplayer` checks two independent browser sessions and a returning
player. See [deploy/README.md](deploy/README.md) for the separate-account droplet
setup. Run `node package-deploy.mjs` after a site build to create a release archive
containing application files only. Keep player data outside the deployed app.
GitHub Pages still serves the previously published practice demo; a live backend
must be deployed before this multiplayer version is publicly playable.
