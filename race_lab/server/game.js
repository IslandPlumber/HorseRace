import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomInt,
} from "node:crypto";
import { ACTOR_IDS, generateRace, validateRace } from "../race-core.js";
export const RULES = {
  startingCoins: 1000,
  prizes: [200, 140, 100, 75, 50, 35, 25],
  points: [12, 9, 7, 5, 3, 2, 1],
  minBet: 10,
  maxBet: 500,
  betReturn: 4,
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
    { clock = Date.now, bettingMs = 20000, duration = 64 } = {},
  ) {
    this.clock = clock;
    this.bettingMs = bettingMs;
    this.duration = duration;
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, coins INTEGER NOT NULL CHECK(coins>=0), points INTEGER NOT NULL DEFAULT 0, horse TEXT NOT NULL DEFAULT 'elon', speed INTEGER NOT NULL DEFAULT 0, stamina INTEGER NOT NULL DEFAULT 0, focus INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, races INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES users(id), created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS members(user_id TEXT PRIMARY KEY REFERENCES users(id), code TEXT NOT NULL REFERENCES rooms(code));
   CREATE TABLE IF NOT EXISTS races(id TEXT PRIMARY KEY, code TEXT NOT NULL REFERENCES rooms(code), number INTEGER NOT NULL, phase TEXT NOT NULL, closes INTEGER NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, entrants TEXT NOT NULL, definition TEXT, results TEXT);
   CREATE TABLE IF NOT EXISTS bets(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), race_id TEXT NOT NULL REFERENCES races(id), horse TEXT NOT NULL, stake INTEGER NOT NULL, payout INTEGER, UNIQUE(user_id,race_id));
   CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, race_id TEXT, created INTEGER NOT NULL);`);
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
  rooms() {
    return this.all(
      "SELECT r.code, COUNT(m.user_id) AS players FROM rooms r JOIN members m ON m.code=r.code GROUP BY r.code ORDER BY r.created DESC LIMIT 30",
    );
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
  join(id, code) {
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
      requireThat(
        !this.one(
          "SELECT u.id FROM members m JOIN users u ON u.id=m.user_id WHERE m.code=? AND u.horse=?",
          code,
          u.horse,
        ),
        "That horse is taken in this room. Choose another horse first.",
      );
      this.leaveInside(id);
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
  bet(id, code, horse, stake) {
    return this.transaction(() => {
      requireThat(this.membership(id) === code, "Join this room first.", 403);
      const r = this.latest(code);
      requireThat(
        r?.phase === "betting" && this.clock() < r.closes,
        "Betting has closed.",
      );
      requireThat(ACTOR_IDS.includes(horse), "Choose a horse.");
      requireThat(
        Number.isInteger(stake) &&
          stake >= RULES.minBet &&
          stake <= RULES.maxBet,
        `Bet ${RULES.minBet}–${RULES.maxBet} whole coins.`,
      );
      requireThat(
        !this.one(
          "SELECT id FROM bets WHERE user_id=? AND race_id=?",
          id,
          r.id,
        ),
        "You already placed your bet.",
        409,
      );
      this.credit(id, -stake, "Win bet", r.id);
      this.run(
        "INSERT INTO bets VALUES(?,?,?,?,?,?)",
        randomUUID(),
        id,
        r.id,
        horse,
        stake,
        null,
      );
    });
  }
  prepare(r) {
    const entrants = JSON.parse(r.entrants),
      remaining = [...entrants],
      order = [];
    while (remaining.length) {
      const weights = remaining.map(
          (e) => 1 + 0.14 * e.speed + 0.1 * e.stamina + 0.08 * e.focus,
        ),
        total = weights.reduce((a, b) => a + b, 0);
      let roll = (randomInt(0, 2 ** 30) / 2 ** 30) * total,
        index = 0;
      while (index < weights.length - 1 && roll >= weights[index])
        roll -= weights[index++];
      order.push(remaining.splice(index, 1)[0].horse);
    }
    const def = generateRace(randomBytes(16).toString("hex"), {
      duration: this.duration,
      title: `Room ${r.code} · Race ${r.number}`,
    });
    const mapping = Object.fromEntries(
      def.outcome.map((old, i) => [old, order[i]]),
    );
    def.cast.forEach((e) => {
      e.id = mapping[e.id];
    });
    def.outcome = order;
    def.id = r.id;
    def.events = [];
    validateRace(def);
    this.run(
      "UPDATE races SET phase='racing', definition=? WHERE id=? AND phase='betting'",
      JSON.stringify(def),
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
    for (const b of this.all(
      "SELECT * FROM bets WHERE race_id=? AND payout IS NULL",
      r.id,
    )) {
      const payout = b.horse === def.outcome[0] ? b.stake * RULES.betReturn : 0;
      if (payout)
        this.credit(b.user_id, payout, "Winning bet", r.id, `bet:${b.id}`);
      this.run("UPDATE bets SET payout=? WHERE id=?", payout, b.id);
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
        if (this.clock() >= r.ends) this.settle(r, def);
      }
    });
  }
  room(id, code) {
    requireThat(this.membership(id) === code, "Join this room first.", 403);
    const room = this.one("SELECT * FROM rooms WHERE code=?", code);
    requireThat(room, "Room not found.", 404);
    const members = this.all(
        "SELECT u.id,u.username,u.horse,u.speed,u.stamina,u.focus FROM members m JOIN users u ON u.id=m.user_id WHERE m.code=?",
        code,
      ),
      r = this.latest(code);
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
            bet:
              this.one(
                "SELECT horse,stake,payout FROM bets WHERE user_id=? AND race_id=?",
                id,
                r.id,
              ) ?? null,
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
  ledger(id) {
    return this.all(
      "SELECT delta,reason,race_id AS raceId,created FROM ledger WHERE user_id=? ORDER BY created DESC,rowid DESC LIMIT 30",
      id,
    );
  }
}
