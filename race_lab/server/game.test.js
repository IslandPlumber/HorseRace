import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Game, RULES } from "./game.js";
import { createServer } from "./http.js";
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "horserace-test-"));
  let now = 100000;
  const db = path.join(dir, "game.sqlite"),
    game = new Game(db, { clock: () => now, bettingMs: 1000, duration: 10 });
  t.after(() => {
    try {
      game.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return { game, db, advance: (n) => (now += n), clock: () => now };
}
const user = (g, name) => g.register(name, "good-password-123");
test("accounts use hashed passwords, case-insensitive names and expiring hashed sessions", (t) => {
  const { game: g, advance } = fixture(t),
    a = user(g, "Alice");
  assert.equal(a.user.coins, 1000);
  assert.equal(g.auth(a.token), a.user.id);
  assert.equal(g.login("ALICE", "good-password-123").user.id, a.user.id);
  assert.throws(() => user(g, "alice"), /taken/);
  assert.throws(() => g.login("Alice", "bad-password"), /Invalid/);
  const raw = g.one("SELECT * FROM users");
  assert.notEqual(raw.password_hash, "good-password-123");
  assert.notEqual(g.one("SELECT * FROM sessions").token_hash, a.token);
  advance(31 * 86400000);
  assert.throws(() => g.auth(a.token), /expired/);
});
test("horse and upgrades persist across database restarts; coins cannot be overspent", (t) => {
  const { game: g, db, clock } = fixture(t),
    a = user(g, "Alice");
  g.horse(a.user.id, "snoop");
  g.upgrade(a.user.id, "speed");
  g.upgrade(a.user.id, "speed");
  assert.equal(g.profile(a.user.id).coins, 400);
  assert.throws(() => g.upgrade(a.user.id, "speed"), /Not enough/);
  assert.equal(g.profile(a.user.id).speed, 2);
  const restored = new Game(db, { clock });
  try {
    assert.equal(restored.auth(a.token), a.user.id);
    const p = restored.login("alice", "good-password-123").user;
    assert.equal(p.horse, "snoop");
    assert.equal(p.speed, 2);
    assert.equal(p.coins, 400);
  } finally {
    restored.close();
  }
});
test("rooms enforce host, capacity, unique horses and frozen race entries", (t) => {
  const { game: g } = fixture(t),
    a = user(g, "Alice"),
    b = user(g, "Bobby"),
    room = g.create(a.user.id);
  assert.throws(() => g.join(b.user.id, room), /taken/);
  g.horse(b.user.id, "gordon");
  g.join(b.user.id, room);
  assert.throws(() => g.start(b.user.id, room), /host/);
  g.start(a.user.id, room);
  for (const action of [
    () => g.horse(a.user.id, "snoop"),
    () => g.upgrade(a.user.id, "focus"),
    () => g.leave(a.user.id),
    () => g.create(a.user.id),
  ])
    assert.throws(action, /after/);
  assert.equal(g.room(a.user.id, room).members.length, 2);
});
test("no result exists before betting closes; immutable bets and exactly-once awards", (t) => {
  const { game: g, advance } = fixture(t),
    a = user(g, "Alice"),
    b = user(g, "Bobby");
  g.horse(b.user.id, "gordon");
  const room = g.create(a.user.id);
  g.join(b.user.id, room);
  g.start(a.user.id, room);
  assert.equal(g.latest(room).definition, null);
  assert.equal(g.room(a.user.id, room).race.definition, null);
  assert.throws(() => g.bet(a.user.id, room, "elon", -10), /Bet/);
  g.bet(a.user.id, room, "elon", 100);
  assert.equal(g.profile(a.user.id).coins, 900);
  assert.throws(() => g.bet(a.user.id, room, "elon", 100), /already/);
  advance(1000);
  assert.throws(() => g.bet(b.user.id, room, "elon", 100), /closed/);
  g.tick();
  const racing = g.room(a.user.id, room).race;
  assert.equal(racing.phase, "racing");
  assert.equal(racing.definition.id, racing.id);
  advance(10000);
  g.tick();
  const result = g.room(a.user.id, room).race,
    finish = result.results.find((e) => e.userId === a.user.id);
  assert.equal(
    g.profile(a.user.id).coins,
    900 + finish.prize + (result.definition.outcome[0] === "elon" ? 400 : 0),
  );
  assert.equal(g.profile(a.user.id).points, finish.points);
  assert.equal(g.profile(a.user.id).races, 1);
  const before = JSON.stringify(g.profile(a.user.id));
  for (let i = 0; i < 5; i++) g.tick();
  assert.equal(JSON.stringify(g.profile(a.user.id)), before);
  assert.equal(result.results.length, 7);
  assert.deepEqual(
    result.results.map((e) => e.prize),
    RULES.prizes,
  );
});
test("race settlement recovers after server restart even without connected players", (t) => {
  const { game: g, db, advance, clock } = fixture(t),
    a = user(g, "Alice"),
    room = g.create(a.user.id);
  g.start(a.user.id, room);
  advance(20000);
  const restored = new Game(db, { clock });
  try {
    restored.tick();
    assert.equal(restored.profile(a.user.id).races, 1);
    assert.equal(restored.room(a.user.id, room).race.phase, "results");
    g.tick();
    assert.equal(g.profile(a.user.id).races, 1);
  } finally {
    restored.close();
  }
});
test("HTTP supports two players, consistent room state, CORS and auth boundaries", async (t) => {
  const { game: g, advance } = fixture(t),
    server = createServer(g, { origins: ["https://islandplumber.github.io"] });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, token, body, extra = {}) {
    const r = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const a = (
      await request("/api/register", null, {
        username: "Alice",
        password: "password-123",
      })
    ).data,
    b = (
      await request("/api/register", null, {
        username: "Bobby",
        password: "password-123",
      })
    ).data;
  assert.equal((await request("/api/me")).status, 401);
  assert.equal(
    (
      await request("/api/me", a.token, null, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/me", a.token, null, {
        Origin: "https://islandplumber.github.io",
      })
    ).status,
    200,
  );
  await request("/api/horse", b.token, { horse: "snoop" });
  const code = (await request("/api/rooms", a.token, {})).data.code;
  await request(`/api/rooms/${code}/join`, b.token, {});
  assert.equal(
    (await request(`/api/rooms/${code}/start`, b.token, {})).status,
    403,
  );
  await request(`/api/rooms/${code}/start`, a.token, {});
  await request(`/api/rooms/${code}/bets`, b.token, {
    horse: "snoop",
    stake: 100,
  });
  advance(1001);
  const ra = (await request(`/api/rooms/${code}`, a.token)).data,
    rb = (await request(`/api/rooms/${code}`, b.token)).data;
  assert.deepEqual(ra.room.race.definition, rb.room.race.definition);
  assert.equal(ra.room.race.bet, null);
  assert.equal(rb.room.race.bet.stake, 100);
  assert.equal(
    (await request("/api/money", a.token, { coins: 999999 })).status,
    404,
  );
  advance(10000);
  assert.equal((await request("/api/me", b.token)).data.user.races, 1);
});
test("an empty saved room gives its next player host controls", (t) => {
  const { game: g } = fixture(t),
    a = user(g, "Alice"),
    b = user(g, "Bobby"),
    code = g.create(a.user.id);
  g.leave(a.user.id);
  g.join(b.user.id, code);
  assert.equal(g.room(b.user.id, code).hostId, b.user.id);
  g.start(b.user.id, code);
  assert.equal(g.latest(code).phase, "betting");
});

test("a full room settles a guaranteed winning bet and every losing bet correctly", (t) => {
  const { game: g, advance } = fixture(t);
  const horses = [
    "trump",
    "biden",
    "mcconnell",
    "bernie",
    "elon",
    "gordon",
    "snoop",
  ];
  const people = horses.map((horse, i) => {
    const a = user(g, `Player${i}`);
    g.horse(a.user.id, horse);
    return g.profile(a.user.id);
  });
  const room = g.create(people[0].id);
  for (const p of people.slice(1)) g.join(p.id, room);
  const eighth = user(g, "Eighth");
  assert.throws(() => g.join(eighth.user.id, room), /full/);
  g.start(people[0].id, room);
  for (const p of people) g.bet(p.id, room, p.horse, 100);
  advance(12000);
  g.tick();
  const r = g.room(people[0].id, room).race;
  for (const p of people) {
    const e = r.results.find((e) => e.userId === p.id),
      bet = g.room(p.id, room).race.bet;
    const payout = e.place === 1 ? 400 : 0;
    assert.equal(bet.payout, payout);
    assert.equal(g.profile(p.id).coins, 900 + e.prize + payout);
    assert.equal(g.profile(p.id).points, e.points);
  }
  assert.equal(g.all("SELECT * FROM bets WHERE payout>0").length, 1);
});
