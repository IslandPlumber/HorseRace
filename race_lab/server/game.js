import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { ACTOR_IDS } from "../race-core.js";
import { simulateRace } from "./race-simulation.js";
import { BET_TYPES, ticketReturn } from "../betting.js";
export const RULES = {
  startingCoins: 1000,
  prizes: [200, 140, 100, 75, 50, 35, 25],
  points: [12, 9, 7, 5, 3, 2, 1],
  minBet: 10,
  maxBet: 500,
  betReturn: 4,
  betTypes: BET_TYPES,
  upgrades: { speed: 120, stamina: 100, focus: 90 },
  maxLevel: 5,
};
export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function requireThat(ok, message, status = 400) {
  if (!ok) throw new GameError(message, status);
}
const hashToken = (t) => createHash("sha256").update(t).digest("hex");
export class Game {
  constructor(
    file,
    { clock = Date.now, bettingMs = 30000, duration = 64 } = {},
  ) {
    this.clock = clock;
    this.bettingMs = bettingMs;
    this.duration = duration;
    this.presence = new Map();
    this.startedAt = this.clock();
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, coins INTEGER NOT NULL CHECK(coins>=0), points INTEGER NOT NULL DEFAULT 0, horse TEXT NOT NULL DEFAULT 'elon', speed INTEGER NOT NULL DEFAULT 0, stamina INTEGER NOT NULL DEFAULT 0, focus INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, races INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES users(id), created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS members(user_id TEXT PRIMARY KEY REFERENCES users(id), code TEXT NOT NULL REFERENCES rooms(code));
   CREATE TABLE IF NOT EXISTS races(id TEXT PRIMARY KEY, code TEXT NOT NULL REFERENCES rooms(code), number INTEGER NOT NULL, phase TEXT NOT NULL, closes INTEGER NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, entrants TEXT NOT NULL, definition TEXT, results TEXT);
   CREATE TABLE IF NOT EXISTS bets(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), race_id TEXT NOT NULL REFERENCES races(id), horse TEXT NOT NULL, stake INTEGER NOT NULL, payout INTEGER, UNIQUE(user_id,race_id));
   CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, race_id TEXT, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS race_bets(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), race_id TEXT NOT NULL REFERENCES races(id), horse TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('win','place','show')), stake INTEGER NOT NULL CHECK(typeof(stake)='integer' AND stake BETWEEN 10 AND 500), return_units INTEGER NOT NULL CHECK(return_units>=100), payout INTEGER CHECK(payout IS NULL OR (typeof(payout)='integer' AND payout>=0)), UNIQUE(user_id,race_id,kind));`);
  }
  one(sql, ...p) {
    return this.db.prepare(sql).get(...p);
  }
  all(sql, ...p) {
    return this.db.prepare(sql).all(...p);
  }
  run(sql, ...p) {
    return this.db.prepare(sql).run(...p);
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
  profile(id) {
    const u = this.one(
      "SELECT id,username,coins,points,horse,speed,stamina,focus,wins,races FROM users WHERE id=?",
      id,
    );
    requireThat(u, "Sign in again.", 401);
    return u;
  }
  session(id) {
    this.touch(id);
    const token = randomBytes(32).toString("base64url");
    this.run("DELETE FROM sessions WHERE expires<?", this.clock());
    this.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hashToken(token),
      id,
      this.clock() + 30 * 86400000,
    );
    return { token, user: this.profile(id) };
  }
  register(username, password) {
    requireThat(
      typeof username === "string" && /^[a-zA-Z0-9_]{3,20}$/.test(username),
      "Use 3–20 letters, numbers or underscores for your username.",
    );
    requireThat(
      typeof password === "string" &&
        password.length >= 8 &&
        password.length <= 128,
      "Use a password of 8–128 characters.",
    );
    const salt = randomBytes(16).toString("hex"),
      digest = scryptSync(password, salt, 64).toString("hex");
    return this.transaction(() => {
      requireThat(
        !this.one(
          "SELECT id FROM users WHERE name_key=?",
          username.toLowerCase(),
        ),
        "That username is taken.",
        409,
      );
      const id = randomUUID();
      this.run(
        "INSERT INTO users(id,username,name_key,salt,password_hash,coins) VALUES(?,?,?,?,?,?)",
        id,
        username,
        username.toLowerCase(),
        salt,
        digest,
        RULES.startingCoins,
      );
      this.run(
        "INSERT INTO ledger VALUES(?,?,?,?,?,?)",
        randomUUID(),
        id,
        RULES.startingCoins,
        "Starting bankroll",
        null,
        this.clock(),
      );
      return this.session(id);
    });
  }
  login(username, password) {
    requireThat(
      typeof username === "string" &&
        typeof password === "string" &&
        password.length <= 128,
      "Invalid username or password.",
      401,
    );
    const u = this.one(
      "SELECT * FROM users WHERE name_key=?",
      username.toLowerCase(),
    );
    const actual = scryptSync(
      password,
      u?.salt ?? "missing-user-dummy-salt",
      64,
    );
    requireThat(
      u && timingSafeEqual(actual, Buffer.from(u.password_hash, "hex")),
      "Invalid username or password.",
      401,
    );
    return this.session(u.id);
  }
  auth(token) {
    requireThat(
      typeof token === "string" && token.length < 200,
      "Sign in to continue.",
      401,
    );
    const s = this.one(
      "SELECT user_id FROM sessions WHERE token_hash=? AND expires>?",
      hashToken(token),
      this.clock(),
    );
    requireThat(s, "Your session expired. Sign in again.", 401);
    this.touch(s.user_id);
    return s.user_id;
  }
  logout(token) {
    this.run("DELETE FROM sessions WHERE token_hash=?", hashToken(token));
  }
  membership(id) {
    return (
      this.one("SELECT code FROM members WHERE user_id=?", id)?.code ?? null
    );
  }
  latest(code) {
    return this.one(
      "SELECT * FROM races WHERE code=? ORDER BY number DESC LIMIT 1",
      code,
    );
  }
  active(id) {
    const code = this.membership(id),
      r = code && this.latest(code);
    return (
      r &&
      r.phase !== "results" &&
      JSON.parse(r.entrants).some((e) => e.userId === id)
    );
  }
  credit(id, delta, reason, raceId, key = randomUUID()) {
    const inserted = this.run(
      "INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?,?)",
      key,
      id,
      delta,
      reason,
      raceId,
      this.clock(),
    );
    if (inserted.changes) {
      const result = this.run(
        "UPDATE users SET coins=coins+? WHERE id=? AND coins+?>=0",
        delta,
        id,
        delta,
      );
      requireThat(result.changes, "Not enough coins.");
    }
    return Boolean(inserted.changes);
  }
  horse(id, horse) {
    requireThat(ACTOR_IDS.includes(horse), "Choose an available horse.");
    return this.transaction(() => {
      requireThat(!this.active(id), "Change your horse after this race.");
      const code = this.membership(id);
      requireThat(
        !code ||
          !this.one(
            "SELECT u.id FROM members m JOIN users u ON m.user_id=u.id WHERE m.code=? AND u.horse=? AND u.id<>?",
            code,
            horse,
            id,
          ),
        "That horse is already selected in this room.",
      );
      this.run("UPDATE users SET horse=? WHERE id=?", horse, id);
      return this.profile(id);
    });
  }
  upgrade(id, kind) {
    requireThat(Object.hasOwn(RULES.upgrades, kind), "Unknown upgrade.");
    return this.transaction(() => {
      requireThat(!this.active(id), "Buy upgrades after this race.");
      const u = this.profile(id),
        level = u[kind];
      requireThat(
        level < RULES.maxLevel,
        "This upgrade is at its maximum level.",
      );
      const cost = RULES.upgrades[kind] * (level + 1) ** 2;
      this.credit(id, -cost, `${kind} upgrade`, null);
      this.run(`UPDATE users SET ${kind}=${kind}+1 WHERE id=?`, id);
      return this.profile(id);
    });
  }
  touch(id) {
    const now = this.clock();
    this.presence.set(id, now);
    if (this.presence.size > 10000)
      for (const [key, last] of this.presence) if (last < now - 30000) this.presence.delete(key);
  }
  onlineCount() {
    return [...this.presence.values()].filter((last) => last >= this.clock() - 30000).length;
  }
  rooms() {
    return this.all(
      "SELECT r.code, COUNT(m.user_id) AS players FROM rooms r JOIN members m ON m.code=r.code GROUP BY r.code ORDER BY r.created DESC",
    ).map((room) => {
      const people = this.all("SELECT u.id,u.username,u.horse FROM members m JOIN users u ON u.id=m.user_id WHERE m.code=?", room.code);
      const members = people.map((p) => ({ username: p.username, horse: p.horse, online: (this.presence.get(p.id) ?? -Infinity) >= this.clock() - 30000 }));
      return { ...room, online: members.filter((p) => p.online).length, members,
        phase: this.latest(room.code)?.phase ?? "waiting", capacity: 7 };
    }).sort((a,b) => b.online-a.online || b.players-a.players).slice(0,30);
  }
  transferAwayHost(code) {
    // A restart gets a grace period so the first reconnect cannot steal hosting.
    if (this.clock() - this.startedAt < 30000) return;
    const room = this.one("SELECT host_id FROM rooms WHERE code=?", code);
    if (!room || (this.presence.get(room.host_id) ?? -Infinity) >= this.clock()-30000) return;
    const next = this.all("SELECT user_id FROM members WHERE code=? ORDER BY rowid", code)
      .find((m) => (this.presence.get(m.user_id) ?? -Infinity) >= this.clock()-30000);
    if (next) this.run("UPDATE rooms SET host_id=? WHERE code=? AND host_id=?", next.user_id, code, room.host_id);
  }
  leaveInside(id) {
    requireThat(!this.active(id), "You can leave after the current race.");
    const code = this.membership(id);
    if (!code) return;
    this.run("DELETE FROM members WHERE user_id=?", id);
    const next = this.one(
      "SELECT user_id FROM members WHERE code=? ORDER BY user_id LIMIT 1",
      code,
    );
    if (next)
      this.run(
        "UPDATE rooms SET host_id=? WHERE code=? AND host_id=?",
        next.user_id,
        code,
        id,
      );
  }
  leave(id) {
    return this.transaction(() => this.leaveInside(id));
  }
  create(id) {
    return this.transaction(() => {
      this.leaveInside(id);
      let code;
      do {
        code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
      } while (this.one("SELECT code FROM rooms WHERE code=?", code));
      this.run("INSERT INTO rooms VALUES(?,?,?)", code, id, this.clock());
      this.run("INSERT INTO members VALUES(?,?)", id, code);
      return code;
    });
  }
  join(id, code, horse) {
    requireThat(typeof code === "string", "Enter a room code.");
    code = code.toUpperCase();
    return this.transaction(() => {
      requireThat(
        this.one("SELECT code FROM rooms WHERE code=?", code),
        "Room not found.",
        404,
      );
      if (this.membership(id) === code) return code;
      requireThat(
        this.one("SELECT COUNT(*) AS n FROM members WHERE code=?", code).n < 7,
        "This room is full.",
      );
      const u = this.profile(id);
      const selected = horse ?? u.horse;
      requireThat(ACTOR_IDS.includes(selected), "Choose an available horse.");
      requireThat(
        !this.one(
          "SELECT u.id FROM members m JOIN users u ON u.id=m.user_id WHERE m.code=? AND u.horse=?",
          code,
          selected,
        ),
        "That horse is taken in this room. Choose another horse first.",
      );
      this.leaveInside(id);
      if (selected !== u.horse) this.run("UPDATE users SET horse=? WHERE id=?", selected, id);
      this.run("INSERT INTO members VALUES(?,?)", id, code);
      if (
        this.one("SELECT COUNT(*) AS n FROM members WHERE code=?", code).n === 1
      )
        this.run("UPDATE rooms SET host_id=? WHERE code=?", id, code);
      return code;
    });
  }
  start(id, code) {
    return this.transaction(() => {
      const room = this.one("SELECT * FROM rooms WHERE code=?", code);
      requireThat(
        room && room.host_id === id && this.membership(id) === code,
        "Only the room host can open betting.",
        403,
      );
      const last = this.latest(code);
      requireThat(
        !last || last.phase === "results",
        "A race is already underway.",
      );
      const people = this.all(
        "SELECT u.id,u.username,u.horse,u.speed,u.stamina,u.focus FROM members m JOIN users u ON u.id=m.user_id WHERE m.code=?",
        code,
      );
      const entrants = ACTOR_IDS.map((horse) => {
        const u = people.find((p) => p.horse === horse);
        return {
          horse,
          userId: u?.id ?? null,
          username: u?.username ?? `${horse} (CPU)`,
          speed: u?.speed ?? 0,
          stamina: u?.stamina ?? 0,
          focus: u?.focus ?? 0,
        };
      });
      const raceId = randomUUID(),
        closes = this.clock() + this.bettingMs;
      this.run(
        "INSERT INTO races VALUES(?,?,?,?,?,?,?,?,?,?)",
        raceId,
        code,
        (last?.number ?? 0) + 1,
        "betting",
        closes,
        closes,
        closes + this.duration * 1000,
        JSON.stringify(entrants),
        null,
        null,
      );
      return raceId;
    });
  }
  raceBets(raceId, userId) {
    const clause = userId === undefined ? "" : " AND user_id=?";
    const args = userId === undefined ? [raceId] : [raceId, userId];
    return this.all(`SELECT id,user_id,horse,kind,stake,return_units,payout,0 AS legacy FROM race_bets WHERE race_id=?${clause}
      UNION ALL SELECT id,user_id,horse,'win' AS kind,stake,400 AS return_units,payout,1 AS legacy FROM bets WHERE race_id=?${clause}`,
      ...args, ...args).sort((a,b) => Object.keys(BET_TYPES).indexOf(a.kind)-Object.keys(BET_TYPES).indexOf(b.kind));
  }
  ticketViews(raceId, userId, results) {
    return this.raceBets(raceId, userId).map((b) => ({
      kind: b.kind, horse: b.horse, stake: b.stake, returnUnits: b.return_units,
      payout: b.payout, net: b.payout === null ? null : b.payout - b.stake,
      status: b.payout === null ? "pending" : b.payout > 0 ? "won" : "lost",
      place: results?.find((r) => r.horse === b.horse)?.place ?? null,
    }));
  }
  bet(id, code, horse, stake, kind = "win") {
    return this.transaction(() => {
      requireThat(this.membership(id) === code, "Join this room first.", 403);
      const r = this.latest(code);
      requireThat(
        r?.phase === "betting" && this.clock() < r.closes,
        "Betting has closed.",
      );
      requireThat(ACTOR_IDS.includes(horse), "Choose a horse.");
      requireThat(typeof kind === "string" && Object.hasOwn(BET_TYPES, kind), "Choose Win, Place or Show.");
      requireThat(
        Number.isInteger(stake) &&
          stake >= RULES.minBet &&
          stake <= RULES.maxBet,
        `Bet ${RULES.minBet}–${RULES.maxBet} whole coins.`,
      );
      requireThat(
        !this.raceBets(r.id, id).some((b) => b.kind === kind),
        `You already placed your ${kind} bet.`,
        409,
      );
      this.credit(id, -stake, `${BET_TYPES[kind].label} bet`, r.id);
      this.run(
        "INSERT INTO race_bets(id,user_id,race_id,horse,kind,stake,return_units,payout) VALUES(?,?,?,?,?,?,?,NULL)",
        randomUUID(),
        id,
        r.id,
        horse,
        kind,
        stake,
        BET_TYPES[kind].units,
      );
    });
  }
  prepare(r) {
    const def = simulateRace(randomBytes(16).toString("hex"), {
      entrants: JSON.parse(r.entrants),
      duration: (r.ends - r.starts) / 1000,
      title: `Room ${r.code} · Race ${r.number}`,
    });
    def.id = r.id;
    this.run(
      "UPDATE races SET phase='racing', definition=?,ends=? WHERE id=? AND phase='betting'",
      JSON.stringify(def),
      r.starts + def.duration * 1000,
      r.id,
    );
    return def;
  }
  settle(r, def) {
    const entrants = JSON.parse(r.entrants),
      results = def.outcome.map((horse, i) => ({
        ...entrants.find((e) => e.horse === horse),
        place: i + 1,
        prize: RULES.prizes[i],
        points: RULES.points[i],
      }));
    for (const e of results) {
      if (!e.userId) continue;
      if (
        this.credit(
          e.userId,
          e.prize,
          `Finished #${e.place}`,
          r.id,
          `prize:${r.id}:${e.userId}`,
        )
      )
        this.run(
          "UPDATE users SET points=points+?,races=races+1,wins=wins+? WHERE id=?",
          e.points,
          e.place === 1 ? 1 : 0,
          e.userId,
        );
    }
    for (const b of this.raceBets(r.id).filter((b) => b.payout === null)) {
      const place = def.outcome.indexOf(b.horse) + 1;
      const payout = place > 0 && place <= BET_TYPES[b.kind].places ? ticketReturn(b.stake, b.return_units) : 0;
      if (payout)
        this.credit(b.user_id, payout, b.legacy ? "Winning bet" : `${BET_TYPES[b.kind].label} bet return`, r.id, `bet:${b.id}`);
      this.run(b.legacy ? "UPDATE bets SET payout=? WHERE id=?" : "UPDATE race_bets SET payout=? WHERE id=?", payout, b.id);
    }
    this.run(
      "UPDATE races SET phase='results',results=? WHERE id=?",
      JSON.stringify(results),
      r.id,
    );
  }
  tick() {
    this.transaction(() => {
      for (const r of this.all(
        "SELECT * FROM races WHERE phase<>'results' AND closes<=?",
        this.clock(),
      )) {
        const def = r.definition ? JSON.parse(r.definition) : this.prepare(r);
        if (this.clock() >= r.starts + def.duration * 1000) this.settle(r, def);
      }
    });
  }
  room(id, code) {
    requireThat(this.membership(id) === code, "Join this room first.", 403);
    this.transferAwayHost(code);
    const room = this.one("SELECT * FROM rooms WHERE code=?", code);
    requireThat(room, "Room not found.", 404);
    const members = this.all(
        "SELECT u.id,u.username,u.horse,u.speed,u.stamina,u.focus FROM members m JOIN users u ON u.id=m.user_id WHERE m.code=?",
        code,
      ),
      r = this.latest(code),
      tickets = r ? this.ticketViews(r.id, id, r.results ? JSON.parse(r.results) : null) : [];
    return {
      code,
      hostId: room.host_id,
      members,
      race: r
        ? {
            id: r.id,
            number: r.number,
            phase: r.phase,
            closes: r.closes,
            starts: r.starts,
            ends: r.ends,
            entrants: JSON.parse(r.entrants),
            definition: r.phase === "betting" ? null : JSON.parse(r.definition),
            results: r.results ? JSON.parse(r.results) : null,
            bets: tickets,
            bet: tickets[0] ? { horse: tickets[0].horse, stake: tickets[0].stake, payout: tickets[0].payout } : null,
          }
        : null,
    };
  }
  me(id) {
    return {
      user: this.profile(id),
      roomCode: this.membership(id),
      rules: RULES,
    };
  }
  history(id) {
    // Existing race snapshots and ledger entries are the durable source of truth.
    // Include the current round even before an optional bet has been placed.
    return this.all(
      `SELECT r.id,r.code,r.number,r.phase,r.starts,r.ends,r.entrants,r.results,
        (SELECT COALESCE(SUM(l.delta),0) FROM ledger l WHERE l.user_id=? AND l.race_id=r.id) AS net_coins
       FROM races r
       WHERE r.id IN (SELECT race_id FROM ledger WHERE user_id=? AND race_id IS NOT NULL)
          OR r.id=(SELECT id FROM races WHERE code=(SELECT code FROM members WHERE user_id=?) ORDER BY closes DESC LIMIT 1)
       ORDER BY r.closes DESC,r.rowid DESC LIMIT 50`,
      id, id, id,
    ).flatMap((r) => {
      const entrant = JSON.parse(r.entrants).find((e) => e.userId === id);
      const results = r.results ? JSON.parse(r.results) : [];
      const bets = this.ticketViews(r.id, id, results);
      if (!entrant && !bets.length) return [];
      const first = bets[0];
      const finish = results.find((e) => e.userId === id);
      return [{
        id: r.id,
        roomCode: r.code,
        number: r.number,
        phase: r.phase,
        starts: r.starts,
        ends: r.ends,
        ownHorse: entrant?.horse ?? null,
        place: finish?.place ?? null,
        prize: finish?.prize ?? 0,
        points: finish?.points ?? 0,
        winner: results[0]?.horse ?? null,
        bets,
        bet: first ? {
          horse: first.horse,
          stake: first.stake,
          payout: first.payout,
          net: first.net,
          status: first.status,
        } : null,
        netCoins: r.net_coins,
      }];
    });
  }
  ledger(id) {
    return this.all(
      "SELECT delta,reason,race_id AS raceId,created FROM ledger WHERE user_id=? ORDER BY created DESC,rowid DESC LIMIT 30",
      id,
    );
  }
}
