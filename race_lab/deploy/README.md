# Droplet deployment

This release runs as its own unprivileged `horserace` account, loopback port 8770,
and SQLite database. It does not need the Pick'em database or its application
credentials. Do not replace the droplet's global Node installation or web-server
configuration. Inspect existing services, listening ports, resources, domains,
backup arrangements and Node versions before making server changes.

## Runtime and release

Build locally with `npm ci`, `npm run build:site`, `node package-deploy.mjs`.
Upload the resulting `review/multiplayer/horserace-release.tar.gz` via SSH/SCP to
`/home/horserace/`. Do not upload the whole workspace or a database from tests.

Use a separately installed, supported Node 24 LTS runtime at
`/home/horserace/runtime/bin/node` (24.13+ with `node:sqlite`), keeping Pick'em's
runtime untouched. Download only an official Node archive matching the droplet's
architecture and verify it against the official checksums before extracting.

As `horserace`, create `app/` and `data/` in its home with `data/` mode 700.
Extract the release into `app/` and copy `deploy/game.env.example` to
`/home/horserace/game.env` (mode 600). Keep `GAME_DB` outside `app/` so deployment
updates cannot overwrite player progress. Confirm port 8770 is unused or select
another port in both the service environment and proxy configuration.

Before installing the service, run it manually using that Node runtime and test
`curl -fsS http://127.0.0.1:8770/api/health`. Stop the manual process, then have
an administrator install `horserace.service` under `/etc/systemd/system/` and run
`systemctl daemon-reload` and `systemctl enable --now horserace`. The SSH account
does not require unrestricted sudo. Check `systemctl status horserace` and
`journalctl -u horserace` for readiness.

## Public site

Use a separate domain or subdomain routed to the droplet, with a separate virtual
host based on `nginx.conf.example`. This example is HTTP bootstrap configuration;
configure valid HTTPS using the server's existing certificate workflow **before
players enter passwords**. Confirm the current web server is Nginx before using
this example; do not install it over an existing Caddy/Apache setup. Validate its
configuration before reload and verify Pick'em remains reachable afterward.

The Node server serves both the compiled game and API on one origin. GitHub Pages
continues as a practice preview; its static hosting cannot run this backend. No
CORS configuration is needed for the droplet's own game site.

### Existing HTTPS site, without DNS changes

The client also supports a subpath such as `https://streakchat.app/horserace/`.
Resolve API requests relative to that directory, and proxy only `/horserace/`,
stripping the prefix before forwarding to Node. `nginx-subpath.conf.example`
shows locations to include inside the existing HTTPS virtual host after
inspection. Preserve other locations, especially Laravel's root `/api/` routes,
and keep the existing certificate. Redirect the path without its trailing slash.

The game serves a content security policy allowing same-origin resources and
locally created `blob:` image fetches. GLTFLoader decodes embedded photographs
and horse textures through those fetches; blocking them produces white models.
`npm run test:slips` checks actual texture decoding and the saved-slip interface
in a real browser, including phone widths. `BROWSER_CHANNEL` selects an installed
Playwright browser channel (defaults to Chrome).

Saved slips are derived from race snapshots, tickets and coin ledger rows.
Win/Place/Show adds a `race_bets` table without altering or rebuilding existing
tables; old Win bets stay in `bets` and retain their 4× terms. The authenticated `/api/history` endpoint
returns only that player's latest 50 rounds, including rounds without a bet.
Bet returns include the stake; bet profit is return minus stake; round coin
change is minus stake plus bet return plus the player's finish prize. Upgrades
are separate purchases, and career points/wins describe the player's own horse.

Room discovery remains visible while already in a room. Active clients refresh
the directory every five seconds and report presence through authenticated game
requests; presence expires after 30 seconds without contact. Switching with a
chosen available horse is one transaction, so failure leaves the old room and
horse intact. An active entrant must finish before switching. If a host goes
away, an online member can inherit hosting after the presence grace period; a
service restart also gets that grace period before any hosting transfer.

`npm run test:refinements` verifies room discovery/switching in desktop and phone
browsers, per-horse sound for fields of one/four/seven, and the park rendering.
The richer scenery uses instanced geometry and generated canvas textures, with
no new external image dependency. Currency and payout rules are unchanged.

`RACE_LAB_URL=https://your-host/horserace/ npm run test:resources` checks actual
WebGL buffer allocation across repeated practice-track rebuilds without signing
in or changing server progress. By default it targets a local server on port
8770. Instanced scenery must call `InstancedMesh.dispose()` as well as disposing
geometry/materials, otherwise per-instance GPU buffers accumulate between races.

## Workshop upgrades

The Upgrades tab uses the additive `player_upgrades` table. Original user columns,
training levels/prices and ticket tables are preserved. Include `progression.js`
with every server release. Builds freeze at betting open; purchased specialist
levels and both power casts persist in the saved race. Read `../PROGRESSION.md`
for effects, economy and rollback compatibility. Do not downgrade an active
upgraded round to an engine that ignores workshop levels.

## Save data and recovery

Club races simulate the frozen entry skills through actual movement:
Speed controls acceleration/cruising pace, Stamina reduces late fatigue, and
Focus helps starts, corners and rhythm. Finish crossings determine the outcome.
New races persist a private seed and an append-only log of player power uses in
the additive `live_races` and `race_power_uses` tables. Players choose when to use
their charge after the gates open; CPUs act automatically. Accepted actions change
future movement and can change the winner. Public live definitions contain only
confirmed motion and events, with no future outcome or secret seed. Old race
definitions retain their original automatic moves, outcomes and payouts.
Round end follows the final actual crossing; a fixed, generous maximum slot
allows late attacks without retiming earlier movement. See `../POWERS.md`.
Include `powers.js` alongside the race engine in releases. Pending manual races
must finish with compatible code before any downgrade to an automatic-only engine.
See
`../TRAINING.md` for the model and balance audit. `npm run test:training` verifies
the real upgrade interface and shared motion on desktop and phone. Prices,
existing levels, balances and prizes are unchanged. Win/Place/Show tickets use
the additive store described in `../BETTING.md`; include `betting.js` and
`server/race-simulation.js` in every server release. Before rolling back to an
older release that predates typed tickets, settle active typed rounds with
compatible code first. Do not restore an older database to roll back code.

The SQLite database stores scrypt password hashes, hashed 30-day login sessions,
horses, upgrades, coins, points, rooms, bets and a coin ledger. Passwords are not
saved in the browser. A browser stores its login token so it can return later;
protect the site with HTTPS. The server, rather than browser storage, owns all
balances and race results. This first version has no password reset workflow.

Back up the database daily to storage outside the droplet using SQLite's online
backup API or stop the game service and copy the database. Do not copy a live
SQLite file alone while WAL writes are active. Protect backups like account data
and test restoration. Unfinished races are recovered and settled once on restart.
Run one Node process against this database; this release targets small rooms and
initial multiplayer testing, not multiple application replicas.

Before public testing, verify registration/sign-in from two browsers, a shared
room, betting cutoff, synchronized race playback, manual power use, finish awards,
sign-in on a new device and progress after a service restart. Confirm that used
charges and action IDs survive a mid-race restart, with no duplicate action or
payout, and that clients never receive future motion while racing. Also verify the existing Pick'em
site and its service are still healthy. Keep the previous release available for
rollback, preserving the database. Retain the additive ticket store and all
older betting records across release changes.
