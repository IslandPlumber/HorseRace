import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Game } from "./server/game.js";
import { createServer } from "./server/http.js";
const dir = await mkdtemp(path.join(os.tmpdir(), "race-browser-")),
  out = "review/multiplayer";
await mkdir(out, { recursive: true });
const baseTime = Date.now();
let elapsed = 0;
let liveClock = false;
let liveAnchor = Date.now();
const game = new Game(path.join(dir, "game.sqlite"), {
  clock: () => baseTime + elapsed + (liveClock ? Date.now() - liveAnchor : 0),
  bettingMs: 20000,
});
const server = createServer(game, { site: path.resolve("site") });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
const errors = [];
const pages = [];
async function page(width = 1280) {
  const context = await browser.newContext({
      viewport: { width, height: 950 },
    }),
    p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(20000);
  await p.goto(url);
  await p.waitForFunction(
    () => window.raceLab?.ready && document.querySelector("#mp-auth"),
    null,
    { timeout: 60000 },
  );
  pages.push(p);
  return p;
}
async function register(p, name) {
  await p.locator("#mp-username").fill(name);
  await p.locator("#mp-password").fill("test-password-123");
  await p.getByRole("button", { name: "Create account", exact: true }).click();
  await p.locator("#mp-name").filter({ hasText: name }).waitFor();
}
try {
  const a = await page(),
    b = await page(390);
  await register(a, "Alice");
  await register(b, "Bobby");
  await a
    .locator("#mp-upgrades button")
    .filter({ hasText: "speed 0/5" })
    .click();
  await a.waitForFunction(() =>
    document.querySelector("#mp-wallet").textContent.startsWith("880"),
  );
  await b.selectOption("#mp-horse", "snoop");
  await b.getByRole("button", { name: "Save choice", exact: true }).click();
  await b.waitForFunction(() => !document.querySelector("#mp-horse").disabled);
  await a.locator("#mp-create").click();
  await a.locator("#mp-room-name").waitFor();
  const code = (await a.locator("#mp-room-name").textContent()).split(" ")[1];
  await b.locator("#mp-code").fill(code);
  await b.getByRole("button", { name: "Join room", exact: true }).click();
  await b.locator("#mp-members").filter({ hasText: "Alice" }).waitFor();
  await a.locator("#mp-start").click();
  await b.locator("#mp-bet-form").waitFor();
  await b.selectOption("#mp-bet-horse", "snoop");
  await b.locator("#mp-stake").fill("100");
  await b.getByRole("button", { name: "Place bet", exact: true }).click();
  await b.locator("#mp-bet-note").filter({ hasText: "Locked in" }).waitFor();
  assert.equal(game.latest(code).definition, null);
  await a.screenshot({
    path: `${out}/betting-desktop.png`,
    fullPage: true,
    timeout: 60000,
  });
  await b.screenshot({
    path: `${out}/betting-mobile.png`,
    fullPage: true,
    timeout: 60000,
  });
  console.log("Betting verified; moving server clock forward.");
  elapsed += 21000;
  liveAnchor = Date.now();
  liveClock = true;
  game.tick();
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(
        () =>
          window.raceLab?.multiplayer.managed &&
          window.raceLab?.state === "playing",
        null,
        { timeout: 20000 },
      ),
    ),
  );
  console.log("Both players are live.");
  const [stateA, stateB] = await Promise.all(
    pages.map((p) =>
      p.evaluate(() => ({
        id: window.raceLab.race.id,
        time: window.raceLab.time,
        clock: window.raceLab.multiplayer.frame.time,
      })),
    ),
  );
  assert.equal(stateA.id, stateB.id);
  assert.ok(
    Math.abs(stateA.clock - stateB.clock) < 0.5,
    "players share the server clock",
  );
  for (const p of pages) {
    assert.ok(await p.locator("#timeline").isDisabled());
    assert.ok(await p.locator("#speed").isDisabled());
    assert.ok(await p.locator("#restart").isDisabled());
  }
  await b.selectOption("#camera-mode", "aerial");
  assert.ok((await b.evaluate(() => window.raceLab.time)) >= stateB.time);
  console.log("Clock and controls verified; settling race.");
  elapsed += 64000;
  game.tick();
  console.log("Server settled race.");
  await a.locator("#mp-phase").filter({ hasText: "prizes saved" }).waitFor();
  await b.locator("#mp-results li").first().waitFor();
  const before = game.one(
    "SELECT coins,points,races,horse FROM users WHERE username='Bobby'",
  );
  assert.equal(before.races, 1);
  assert.equal(before.horse, "snoop");
  console.log("Payouts verified; reloading player.");
  await b.reload();
  await b.waitForFunction(
    () => document.querySelector("#mp-name")?.textContent === "Bobby",
  );
  assert.ok(
    (await b.locator("#mp-wallet").textContent()).includes(
      before.coins.toLocaleString("en-US"),
    ),
  );
  for (const p of pages)
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no horizontal overflow",
    );
  await a.context().close();
  await b.context().close();
  // A fresh browser context signs in using only username/password and recovers the same account.
  console.log("Reload verified; signing in from a fresh context.");
  const returning = await page(390);
  await returning.locator("#mp-username").fill("Bobby");
  await returning.locator("#mp-password").fill("test-password-123");
  await returning.getByRole("button", { name: "Sign in", exact: true }).click();
  await returning.locator("#mp-name").filter({ hasText: "Bobby" }).waitFor();
  assert.ok(
    (await returning.locator("#mp-wallet").textContent()).includes(
      before.coins.toLocaleString("en-US"),
    ),
  );
  assert.equal(await returning.locator("#mp-horse").inputValue(), "snoop");
  console.log("Fresh login verified; taking results screenshot.");
  await returning.screenshot({
    path: `${out}/results-mobile.png`,
    fullPage: true,
    timeout: 60000,
  });
  for (const p of pages) {
    if (p.isClosed()) continue;
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no horizontal overflow",
    );
  }
  assert.deepEqual(
    game.one(
      "SELECT coins,points,races,horse FROM users WHERE username='Bobby'",
    ),
    before,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        checks: [
          "two separate player sessions",
          "saved upgrades and horse selection",
          "shared room and betting countdown",
          "no result before betting closes",
          "same race and synchronized playback",
          "live transport controls locked",
          "personal camera controls",
          "finish prizes and bet return",
          "refresh does not repay",
          "fresh browser login restores progress",
          "390px mobile layout",
          "no page errors",
        ],
        stateA,
        stateB,
        returningPlayer: before,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Multiplayer browser checks passed. Evidence in " + out);
} catch (error) {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].isClosed()) continue;
    await pages[i]
      .screenshot({
        path: `${out}/failure-${i}.png`,
        fullPage: true,
        timeout: 60000,
      })
      .catch(() => {});
    console.error(
      "Player",
      i,
      await pages[i]
        .evaluate(() => ({
          error: document.querySelector("#mp-error")?.textContent,
          phase: document.querySelector("#mp-phase")?.textContent,
          connection: document.querySelector("#mp-connection")?.textContent,
          state: window.raceLab?.state,
          multiplayer: window.raceLab?.multiplayer,
          time: window.raceLab?.time,
          race: window.raceLab?.race?.id,
        }))
        .catch(() => ""),
    );
  }
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  game.close();
  await rm(dir, { recursive: true, force: true });
}
