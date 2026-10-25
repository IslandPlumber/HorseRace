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

## Save data and recovery

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
room, betting cutoff, synchronized race playback, finish awards, sign-in on a new
device and progress after a service restart. Also verify the existing Pick'em
site and its service are still healthy. Keep the previous release available for
rollback, preserving the database. No database migration is needed for version 1.
