import { betSlip, roundFromRoom, historyList } from "./bet-slips.js";
import { RoomBrowser } from "./room-browser.js";
import { TRAINING } from "./training.js";
const $ = (id) => document.getElementById(id);
const HORSES = {
  trump: "Donald Trump",
  biden: "Joe Biden",
  mcconnell: "Mitch McConnell",
  bernie: "Bernie Sanders",
  elon: "Elon Musk",
  gordon: "Gordon Ramsay",
  snoop: "Snoop Dogg",
};
const TOKEN = "horserace-session-v1";
function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN, token);
    else localStorage.removeItem(TOKEN);
  } catch {}
}
function storedToken() {
  try {
    return localStorage.getItem(TOKEN) || "";
  } catch {
    return "";
  }
}
function options(select) {
  for (const [id, name] of Object.entries(HORSES)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = name;
    select.append(o);
  }
}
export class MultiplayerUI {
  constructor({ load, onChange }) {
    this.load = load;
    this.onChange = onChange;
    this.token = storedToken();
    this.user = null;
    this.room = null;
    this.rules = null;
    this.online = false;
    this.offset = 0;
    this.lastContact = 0;
    this.loaded = null;
    this.loadingId = null;
    this.busy = false;
    this.polling = false;
    this.history = [];
    this.historyVisible = 6;
    this.roomsData = { rooms: [], online: 0 };
    this.lastRoomPoll = 0;
    $("multiplayer").innerHTML =
      `<div class="club-heading"><div><p class="eyebrow">STREAKCHAT RACING CLUB</p><h2>Your stable. Your race.</h2></div><span id="mp-connection" role="status">Connecting…</span></div>
  <p class="club-note">Free game coins only. Start with 1,000 coins, race with friends and save your stable for another day.</p>
  <p id="mp-error" role="alert" hidden></p>
  <form id="mp-auth" class="club-row"><label class="field">Username<input id="mp-username" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required></label><label class="field">Password<input id="mp-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><button class="button primary" type="submit" name="action" value="login">Sign in</button><button class="button" type="submit" name="action" value="register">Create account</button></form>
  <div id="mp-account" hidden><div class="club-row account-row"><strong id="mp-name"></strong><span id="mp-wallet"></span><button id="mp-logout" class="button quiet">Sign out</button></div>
  <div class="club-tabs" role="tablist" aria-label="Racing club"><button id="mp-tab-live" class="club-tab" role="tab" aria-controls="mp-live-panel" aria-selected="true">Live room & stable</button><button id="mp-tab-history" class="club-tab" role="tab" aria-controls="mp-history-panel" aria-selected="false" tabindex="-1">Bet slips & results <span id="mp-history-count">0</span></button></div>
  <div id="mp-live-panel" class="club-grid" role="tabpanel" aria-labelledby="mp-tab-live"><div class="club-sidebar"><section class="club-box"><h3>Your stable</h3><form id="mp-horse-form" class="club-row"><label class="field">Horse & rider<select id="mp-horse"></select></label><button class="button" type="submit">Save choice</button></form><p class="club-note">Train how your horse runs. Race-day form and luck still matter.</p><div id="mp-upgrades" class="training-grid" aria-label="Train your racer"></div><details class="training-help"><summary>How training works</summary><p class="club-note">Training changes your horse’s movement throughout the race. Your levels follow you when you change riders. Each skill has five permanent levels; higher levels cost more. Training locks when betting opens and applies to your own racer, regardless of your bet. No upgrade guarantees a win.</p></details><p id="mp-career" class="club-note"></p><p class="club-note scoring-note"><strong>Two ways to earn coins</strong>Your horse earns a finish prize, even if your bet loses. A winning bet returns 4× the stake, including the stake. Career points and wins track your own horse.</p></section><section id="mp-room-directory" class="club-box room-directory" aria-label="Other race rooms"></section></div>
  <section class="club-box"><h3>Race with friends</h3><div id="mp-lobby"><button id="mp-create" class="button primary">Create room</button><form id="mp-join-form" class="club-row"><label class="field">Room code<input id="mp-code" maxlength="6" minlength="6" pattern="[A-Fa-f0-9]{6}" placeholder="ABC123" required></label><button class="button" type="submit">Join room</button></form></div>
  <div id="mp-room" hidden><div class="club-row"><strong id="mp-room-name"></strong><button id="mp-leave" class="button quiet">Leave room</button></div><p id="mp-members" class="club-note"></p><strong id="mp-phase"></strong><p class="club-note">Seven starters; CPU racers fill empty places. The host opens each round.</p><button id="mp-start" class="button primary">Open betting · start next race</button>
  <section class="current-slip"><h4>This round · your bet slip</h4><form id="mp-bet-form" class="club-row" hidden><label class="field">Win pick<select id="mp-bet-horse"></select></label><label class="field">Stake<input id="mp-stake" type="number" min="10" max="500" step="1" value="50" required></label><button class="button primary" type="submit">Place bet</button><p id="mp-bet-preview" class="club-note"></p></form><div id="mp-bet-note" aria-live="polite"></div></section><div id="mp-finish-order" hidden><h4>Finishing order</h4><ol id="mp-results"></ol></div></div></section></div>
  <section id="mp-history-panel" class="club-history" role="tabpanel" aria-labelledby="mp-tab-history" hidden><div class="history-heading"><div><p class="eyebrow">SAVED WITH YOUR ACCOUNT</p><h3 id="mp-history-title">Bet slips & race results</h3><p class="club-note">Your bet result and your horse’s finish prize are separate. Round totals include both; upgrades are separate purchases.</p></div><div class="history-actions"><label class="field">Show<select id="mp-history-filter"><option value="all">All rounds</option><option value="won">Won bets</option><option value="lost">Lost bets</option><option value="pending">Pending bets</option><option value="none">No bet placed</option></select></label><button id="mp-refresh-slips" class="button quiet">Refresh slips</button></div></div><p id="mp-history-summary" class="club-note" role="status"></p><div id="mp-slips" class="slip-grid"></div><button id="mp-more-slips" class="button quiet" hidden>Show more rounds</button></section>
  <details class="club-ledger"><summary>Recent coin activity & race rules</summary><p class="club-note">One win bet per race, 10–500 coins. A winning bet returns 4× your stake including the stake. All bets are final. Finish prizes: 200 / 140 / 100 / 75 / 50 / 35 / 25 coins. Points: 12 / 9 / 7 / 5 / 3 / 2 / 1. Prizes are awarded when the round ends, even if you disconnect. Accounts stay on this server; use the same site to return.</p><button id="mp-history" class="button quiet">Refresh activity</button><ul id="mp-ledger"></ul></details></div>`;
    this.roomBrowser = new RoomBrowser($("mp-room-directory"), {
      refresh: () => void this.action(() => this.refreshRooms()),
      join: (code, horse) => void this.action(async () => {
        await this.api(`/api/rooms/${code}/join`, { horse });
        await this.refreshRooms();
      }),
    });
    options($("mp-horse"));
    options($("mp-bet-horse"));
    const selectTab = (history) => {
      $("mp-live-panel").hidden = history;
      $("mp-history-panel").hidden = !history;
      for (const [id, selected] of [["mp-tab-live", !history], ["mp-tab-history", history]]) {
        $(id).setAttribute("aria-selected", String(selected));
        $(id).tabIndex = selected ? 0 : -1;
      }
    };
    for (const id of ["mp-tab-live", "mp-tab-history"]) {
      $(id).onclick = () => selectTab(id === "mp-tab-history");
      $(id).onkeydown = (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const history = event.key === "End" || (event.key !== "Home" && id === "mp-tab-live");
        selectTab(history);
        $(history ? "mp-tab-history" : "mp-tab-live").focus();
      };
    }
    const preview = () => {
      const stake = Number($("mp-stake").value);
      $("mp-bet-preview").textContent = Number.isInteger(stake) && stake >= 10 && stake <= 500
        ? `If your pick wins: ${stake * 4} coins returned (${stake * 3} coins bet profit). Your horse’s finish prize is separate.`
        : "Choose a stake from 10 to 500 whole coins.";
    };
    $("mp-stake").oninput = preview;
    preview();
    $("mp-refresh-slips").onclick = () => void this.action(() => this.refreshHistory());
    $("mp-history-filter").onchange = () => { this.historyVisible = 6; this.renderHistory(); };
    $("mp-more-slips").onclick = () => { this.historyVisible += 6; this.renderHistory(); };
    $("mp-auth").addEventListener("submit", (e) => {
      e.preventDefault();
      const action = e.submitter?.value ?? "login";
      void this.action(async () => {
        const r = await this.api(`/api/${action}`, {
          username: $("mp-username").value.trim(),
          password: $("mp-password").value,
        });
        this.token = r.token;
        saveToken(r.token);
        $("mp-password").value = "";
        await this.refresh();
      });
    });
    $("mp-logout").onclick = () =>
      void this.action(async () => {
        await this.api("/api/logout", {});
        this.resetSession();
      });
    $("mp-horse-form").onsubmit = (e) => {
      e.preventDefault();
      void this.action(() =>
        this.api("/api/horse", { horse: $("mp-horse").value }),
      );
    };
    $("mp-create").onclick = () =>
      void this.action(() => this.api("/api/rooms", {}));
    $("mp-join-form").onsubmit = (e) => {
      e.preventDefault();
      void this.action(() =>
        this.api(`/api/rooms/${$("mp-code").value.toUpperCase()}/join`, {}),
      );
    };
    $("mp-leave").onclick = () =>
      void this.action(() =>
        this.api(`/api/rooms/${this.room.code}/leave`, {}),
      );
    $("mp-start").onclick = () =>
      void this.action(() =>
        this.api(`/api/rooms/${this.room.code}/start`, {}),
      );
    $("mp-bet-form").onsubmit = (e) => {
      e.preventDefault();
      void this.action(() =>
        this.api(`/api/rooms/${this.room.code}/bets`, {
          horse: $("mp-bet-horse").value,
          stake: Number($("mp-stake").value),
        }),
      );
    };
    $("mp-history").onclick = () =>
      void this.action(async () => {
        const { entries } = await this.api("/api/ledger");
        $("mp-ledger").replaceChildren(
          ...entries.map((e) => {
            const li = document.createElement("li");
            li.textContent = `${e.delta >= 0 ? "+" : ""}${e.delta} · ${e.reason} · ${new Date(e.created).toLocaleString()}`;
            return li;
          }),
        );
      });
    this.timer = setInterval(() => void this.refresh(), 1000);
    void this.refresh();
  }
  get managed() {
    return Boolean(this.token && this.room);
  }
  label(horse) {
    const e = this.room?.race?.entrants.find((e) => e.horse === horse);
    return e?.userId ? `${e.username} · ${HORSES[horse]}` : HORSES[horse];
  }
  frame() {
    const r = this.room?.race,
      now = Date.now() + this.offset;
    return {
      time: r?.definition
        ? Math.max(0, Math.min(r.definition.duration, (now - r.starts) / 1000))
        : 0,
      playing:
        this.online &&
        Date.now() - this.lastContact < 6000 &&
        r?.phase === "racing" &&
        now < r.ends,
      ready: Boolean(r?.definition && this.loaded === r.id),
      id: r?.id,
    };
  }
  async api(route, body) {
    const start = Date.now();
    const response = await fetch(new URL(`.${route}`, document.baseURI), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "Multiplayer server is unavailable. Practice races still work.",
      );
    }
    if (!response.ok) {
      const error = new Error(result.error ?? "Request failed.");
      error.status = response.status;
      throw error;
    }
    if (result.serverTime) {
      this.offset = result.serverTime - (start + Date.now()) / 2;
      this.lastContact = Date.now();
    }
    return result;
  }
  resetSession() {
    this.token = "";
    saveToken("");
    this.user = null;
    this.room = null;
    this.loaded = null;
    this.history = [];
    this.historyKey = null;
    this.roomsData = { rooms: [], online: 0 };
    this.lastRoomPoll = 0;
    this.slipSignature = null;
    this.historyVisible = 6;
    $("mp-history-filter").value = "all";
    $("mp-tab-live").click();
    this.renderHistory();
    this.render();
    this.onChange();
  }
  async action(fn) {
    if (this.busy) return;
    this.busy = true;
    $("mp-error").hidden = true;
    this.render();
    try {
      await fn();
      await this.refresh(true);
    } catch (e) {
      $("mp-error").textContent = e.message;
      $("mp-error").hidden = false;
    } finally {
      this.busy = false;
      this.render();
    }
  }
  async refresh(force = false) {
    if (this.polling) return;
    this.polling = true;
    try {
      if (this.token) {
        const me = await this.api("/api/me");
        this.user = me.user;
        this.rules = me.rules;
        this.room = me.roomCode
          ? (await this.api(`/api/rooms/${me.roomCode}`)).room
          : null;
        const key = JSON.stringify([this.user.id, this.user.coins, this.user.races, this.room?.race?.id, this.room?.race?.phase]);
        if (key !== this.historyKey) {
          await this.refreshHistory();
          this.historyKey = key;
        }
        if (Date.now() - this.lastRoomPoll > 5000) await this.refreshRooms();
      } else await this.api("/api/health");
      this.online = true;
      const r = this.room?.race;
      if (r?.definition && this.loaded !== r.id && this.loadingId !== r.id) {
        this.loadingId = r.id;
        try {
          await this.load(r.definition);
          this.loaded = r.id;
        } finally {
          this.loadingId = null;
        }
      }
      this.render();
      this.onChange();
    } catch (e) {
      this.online = false;
      if (e.status === 401) this.resetSession();
      if (force) {
        throw e;
      }
      this.render();
    } finally {
      this.polling = false;
    }
  }
  async refreshRooms() {
    if (!this.token || this.roomsPolling) return;
    this.roomsPolling = true;
    const token = this.token;
    try {
      const data = await this.api("/api/rooms");
      if (this.token !== token) return;
      this.roomsData = { rooms: data.rooms, online: data.online };
      this.lastRoomPoll = Date.now();
    } finally { this.roomsPolling = false; }
  }
  async refreshHistory() {
    if (!this.token) return;
    const token = this.token;
    const { history } = await this.api("/api/history");
    if (this.token !== token) return;
    this.history = history;
    this.renderHistory();
  }
  renderHistory() {
    $("mp-history-count").textContent = this.history.length;
    const count = historyList($("mp-slips"), this.history, {
      filter: $("mp-history-filter").value, visible: this.historyVisible,
    });
    $("mp-more-slips").hidden = count <= this.historyVisible;
    const won = this.history.filter((r) => r.bet?.status === "won").length;
    const lost = this.history.filter((r) => r.bet?.status === "lost").length;
    $("mp-history-summary").textContent = this.history.length
      ? `${this.history.length === 50 ? "Latest " : ""}${this.history.length} saved ${this.history.length === 1 ? "round" : "rounds"} · ${won} won ${won === 1 ? "bet" : "bets"} · ${lost} lost ${lost === 1 ? "bet" : "bets"}`
      : "No rounds yet. Your history stays with your account, including after you leave a room.";
  }
  render() {
    $("mp-auth").hidden = Boolean(this.user);
    $("mp-account").hidden = !this.user;
    $("mp-connection").textContent = this.online
      ? this.user
        ? "Connected · progress saved on server"
        : "Connected · sign in to save"
      : "Server unavailable · reconnecting";
    if (!this.user) return;
    const u = this.user,
      r = this.room?.race,
      locked = Boolean(
        r && r.phase !== "results" && r.entrants.some((e) => e.userId === u.id),
      );
    this.roomBrowser.render(this.roomsData, {
      currentCode: this.room?.code, horse: u.horse, locked,
      busy: this.busy, online: this.online,
    });
    $("mp-name").textContent = u.username;
    $("mp-wallet").textContent =
      `${u.coins.toLocaleString()} coins · ${u.points} points`;
    $("mp-career").textContent =
      `${u.races} races · ${u.wins} wins · Upgrades stay with your account.`;
    const horseSignature = u.id + ":" + u.horse;
    if (horseSignature !== this.horseSignature) {
      this.horseSignature = horseSignature;
      $("mp-horse").value = u.horse;
    }
    const sig = JSON.stringify([
      u.speed,
      u.stamina,
      u.focus,
      u.coins,
      locked,
      this.busy,
      this.online,
    ]);
    if (sig !== this.upgradeSignature) {
      this.upgradeSignature = sig;
      $("mp-upgrades").replaceChildren(
        ...Object.entries(this.rules.upgrades).map(([kind, base]) => {
          const level = u[kind],
            cost = base * (level + 1) ** 2,
            b = document.createElement("button");
          const info = TRAINING[kind], card = document.createElement("div");
          card.className = "training-card";
          const heading = document.createElement("strong");
          heading.textContent = `${info.name} · ${level}/5`;
          const meter = document.createElement("meter");
          meter.min = 0; meter.max = 5; meter.value = level;
          meter.setAttribute("aria-label", `${info.name} level`);
          const description = document.createElement("p");
          description.textContent = info.description;
          b.className = "button quiet";
          b.textContent = `${kind} ${level}/5 · ${level >= 5 ? "Max" : cost + " coins"}`;
          b.disabled =
            locked || this.busy || !this.online || level >= 5 || u.coins < cost;
          b.onclick = () =>
            void this.action(() => this.api("/api/upgrades", { kind }));
          b.setAttribute("aria-label", level >= 5 ? `${info.name} at maximum level` :
            `Train ${info.name} to level ${level + 1} for ${cost} coins`);
          card.append(heading, meter, description, b);
          return card;
        }),
      );
    }
    $("mp-lobby").hidden = Boolean(this.room);
    $("mp-room").hidden = !this.room;
    for (const el of $("mp-horse-form").elements)
      el.disabled = locked || this.busy || !this.online;
    if (!this.room) return;
    $("mp-room-name").textContent = `ROOM ${this.room.code}`;
    $("mp-members").textContent = this.room.members
      .map(
        (m) =>
          `${m.username}${m.id === this.room.hostId ? " (host)" : ""} — ${HORSES[m.horse]}`,
      )
      .join(" · ");
    const seconds = Math.max(
      0,
      Math.ceil(((r?.closes ?? 0) - Date.now() - this.offset) / 1000),
    );
    $("mp-phase").textContent = !r
      ? "Waiting for the host"
      : r.phase === "betting"
        ? `Betting closes in ${seconds}s`
        : r.phase === "racing"
          ? "Race live · everyone shares the same clock"
          : "Race finished · prizes saved";
    $("mp-start").hidden =
      this.room.hostId !== u.id || Boolean(r && r.phase !== "results");
    $("mp-bet-form").hidden = r?.phase !== "betting" || Boolean(r.bet);
    for (const el of $("mp-bet-form").elements)
      el.disabled = this.busy || !this.online || seconds === 0;
    $("mp-start").disabled = this.busy || !this.online;
    $("mp-leave").disabled = this.busy || !this.online || locked;
    const slipSignature = JSON.stringify([this.room.code, r?.id, r?.phase, r?.bet, r?.results, u.id]);
    if (slipSignature !== this.slipSignature) {
      this.slipSignature = slipSignature;
      $("mp-bet-note").replaceChildren(...(r ? [betSlip(roundFromRoom(this.room, u))] : []));
    }
    $("mp-finish-order").hidden = !r?.results;
    const resultsSignature = JSON.stringify(r?.results ?? []);
    if (resultsSignature !== this.resultSignature) {
      this.resultSignature = resultsSignature;
      $("mp-results").replaceChildren(
        ...(r?.results ?? []).map((e) => {
          const li = document.createElement("li");
          li.textContent = `${e.username} · ${HORSES[e.horse]}${e.userId ? ` · +${e.prize} coins · +${e.points} pts` : " · CPU"}`;
          return li;
        }),
      );
    }
  }
  dispose() {
    clearInterval(this.timer);
  }
}
