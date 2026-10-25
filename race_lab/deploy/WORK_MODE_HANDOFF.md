# Work mode handoff: preserve the existing Laravel game

The user explicitly requests that the existing Laravel app, GitHub project
`IslandPlumber/game`, on `john@162.243.172.81` remain working. They chose to switch
to work mode for SSH inspection, adding a separate user and uploading HorseRace.
Do not attempt deployment from the cloud workspace. No remote SSH connection or
server mutation was made here. An earlier suggested account-creation command was
superseded: inspect the server before creating accounts or making changes.

## Prepared application

The HorseRace source is on `feature/multiplayer-club` in
`IslandPlumber/HorseRace`, under `race_lab/`. Run `npm ci`, `npm run build:site`
and `node package-deploy.mjs` there to produce
`review/multiplayer/horserace-release.tar.gz`. The release contains only the
compiled site, pure Node backend, race engine and deployment templates. It needs
no npm dependencies at runtime and includes no credentials or player database.

The existing public practice site remains on the `race-lab-pages` branch and has
not been updated with the multiplayer UI. The new service serves its own site
and API together. Accounts use username/password; all currency is fictional,
free, non-purchasable and non-redeemable. Seven people can share a room; CPUs fill
empty places. The server controls race times, balances, bets and payouts. SQLite
persists horses, upgrades, coins, points and ledger entries across restarts.

## Inspect first using the user's existing verified SSH access

1. Establish the current Laravel application's directory, owner, deployment
   workflow, service names, PHP/Node versions, database services, web server,
   domains, certificate management, listening ports, free memory/disk and backups.
   Inspect metadata/configuration as needed without printing `.env` or credentials.
2. Record the existing site's HTTP health and relevant service status before
   changing anything. Preserve the existing GitHub `game` checkout, Laravel
   database, `.env`, storage, scheduler, workers and queues.
3. Check whether `horserace` already exists before creating it. Use a separate
   unprivileged account, owned application directory, dedicated runtime and SQLite
   data directory. Do not grant unrestricted sudo or access to Laravel data.
4. Use port 8770 only if unused; otherwise choose a free loopback port and update
   both HorseRace's environment and its proxy entry. Do not replace the global
   Node, PHP or package-manager installation. Use a dedicated supported Node 24
   LTS runtime (24.13+) for this service, with official checksum verification.
5. Deploy to `/home/horserace/app`, store data at
   `/home/horserace/data/game.sqlite`, and use an independent `horserace.service`.
   Templates are in this directory. They are examples, not evidence that the
   droplet uses Nginx/systemd or that any port/path is currently available.
6. Select a separate hostname with the user based on the existing DNS/TLS setup.
   Add a separate web-server entry, keeping the Laravel virtual host unchanged.
   Validate configuration before a reload. Have HTTPS working before password
   entry. Do not change the existing site's DNS or replace its certificate.
7. Test HorseRace registration and login from two browsers, joining the same
   room, a bet, a complete race, prizes, a returning login and saved progress
   after restarting only the HorseRace service. Verify Laravel's HTTP health and
   services again. Keep a rollback copy of any web-server configuration touched.

Read `README.md` in this directory for service, storage and backup details.
Cloud development tests use temporary databases and test-only injected clocks;
there is no clock-control or client payout endpoint in the deployed server.
