import {LivePlaybackClock} from './live-playback.js';
import {WorkshopUI} from "./workshop.js";
import {UPGRADES} from "./progression.js";
import { betSlip, roundFromRoom, historyList } from "./bet-slips.js";
import { RoomBrowser } from "./room-browser.js";
import { TRAINING } from "./training.js";
import { SPECIAL_POWERS as POWERS } from "./powers.js";
import { BET_TYPES, roundBets, ticketReturn, returnLabel } from "./betting.js";
import { RaceBettingBanner } from "./race-betting.js";
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
const TIMING = Symbol('requestTiming');
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
  constructor({ load, update, onChange }) {
    this.update = update ?? load;
    this.load = load;
    this.onChange = onChange;
    this.token = storedToken();
    this.user = null;
    this.arrivedToken = null;
    this.room = null;
    this.rules = null;
    this.online = false;
    this.offset = 0;
    this.lastContact = 0;
    this.loaded = null;
    this.loadingId = null;
    this.busy = false;
    this.powerBusy = false;
    this.pendingPower = null;
    this.lastMePoll = 0;
    this.nextPoll = 0;
    this.nextRoomPoll = 0;
    this.liveClock = new LivePlaybackClock();
    this.roomPollStats = {count:0,requestMs:0,gaps:[],lastStart:0};
    this.polling = false;
    this.history = [];
    this.historyVisible = 6;
    this.roomsData = { rooms: [], online: 0 };
    this.lastRoomPoll = 0;
    $("multiplayer").innerHTML =
      `<div id="mp-account" hidden><div class="club-tabs" role="tablist" aria-label="Your stable and progress"><button id="mp-tab-live" class="club-tab" role="tab" aria-controls="mp-live-panel" aria-selected="true">Your stable & training</button><button id="mp-tab-upgrades" class="club-tab" role="tab" aria-controls="mp-upgrades-panel" aria-selected="false" tabindex="-1">Horse & power upgrades · 20 paths</button><button id="mp-tab-history" class="club-tab" role="tab" aria-controls="mp-history-panel" aria-selected="false" tabindex="-1">Past bets <span id="mp-history-count">0</span></button></div>
  <div id="mp-live-panel" role="tabpanel" aria-labelledby="mp-tab-live"><section class="club-box"><h3>Your stable</h3><form id="mp-horse-form" class="club-row"><label class="field">Horse & rider<select id="mp-horse"></select></label><button class="button" type="submit">Save choice</button></form><p class="club-note">Train Speed, Stamina and Focus, or open the workshop for more upgrades.</p><div id="mp-upgrades" class="training-grid" aria-label="Train your racer"></div><button id="mp-open-workshop" type="button" class="button quiet workshop-link">Explore horse & power upgrades →</button><details class="training-help"><summary>How training works</summary><p class="club-note">Training changes your horse’s movement throughout the race. Your levels follow you when you change riders. The original three skills have five permanent levels; the workshop adds longer specialist paths and repeatable mastery. Higher levels cost more. Training locks when betting opens and applies to your own racer, regardless of your bet. No upgrade guarantees a win.</p></details><section class="signature-card" aria-label="Your rider power"><span class="eyebrow">SIGNATURE POWER</span><h4 id="mp-power-name"></h4><p id="mp-power-description" class="club-note"></p><p class="club-note">You choose when to use it during a live race. CPU riders choose automatically. One use per race, starting at 75 game coins. Power budget training lowers the cost.</p><details><summary>Meet all seven powers</summary>${Object.entries(POWERS).map(([id,p]) => `<p><strong>${HORSES[id]} · ${p.name}</strong><br>${p.description}</p>`).join("")}</details></section><p id="mp-career" class="club-note"></p><p class="club-note scoring-note"><strong>Two ways to earn coins</strong>Your horse earns a finish prize, even if your bets lose. Win, Place and Show offer different returns, including the stake. Career points and wins track your own horse.</p></section></div>
  <section id="mp-history-panel" class="club-history" role="tabpanel" aria-labelledby="mp-tab-history" hidden><div class="history-heading"><div><p class="eyebrow">SAVED WITH YOUR ACCOUNT</p><h3 id="mp-history-title">Past bets</h3><p class="club-note">Your bet result and your horse’s finish prize are separate. Round totals include both; upgrades are separate purchases.</p></div><div class="history-actions"><label class="field">Show<select id="mp-history-filter"><option value="all">All bets</option><option value="won">Won bets</option><option value="lost">Lost bets</option><option value="pending">Pending bets</option></select></label><button id="mp-refresh-slips" class="button quiet">Refresh slips</button></div></div><p id="mp-history-summary" class="club-note" role="status"></p><div id="mp-slips" class="slip-grid"></div><button id="mp-more-slips" class="button quiet" hidden>Show more races</button></section>
  <section id="mp-upgrades-panel" class="club-history" role="tabpanel" aria-labelledby="mp-tab-upgrades" hidden><div id="mp-workshop"></div></section><details class="club-ledger"><summary>Recent coin activity & race rules</summary><p class="club-note">Up to one Win, one Place and one Show bet per race, 10–500 coins each. Win needs 1st and returns 4×; Place needs top 2 and returns 2×; Show needs top 3 and returns 1.5×. These are fixed game returns including the stake; fractional coins round down. Each ticket settles independently, including if your pick wins a Place or Show bet. All bets are final. Base finish prizes: 200 / 140 / 100 / 75 / 50 / 35 / 25 coins. Club purse training increases your own finish prize; bonuses round down to whole coins. Points: 12 / 9 / 7 / 5 / 3 / 2 / 1. Prizes are awarded when the round ends, even if you disconnect. Accounts stay on this server; use the same site to return.</p><button id="mp-history" class="button quiet">Refresh activity</button><ul id="mp-ledger"></ul></details></div>`;
    $("multiplayer").hidden = true;
    $("club-access").innerHTML = `<p id="mp-error" role="alert" hidden></p><form id="mp-auth" class="club-row"><label class="field">Username<input id="mp-username" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required></label><label class="field">Password<input id="mp-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><button class="button primary" type="submit" name="action" value="login">Sign in</button><button class="button" type="submit" name="action" value="register">Create account</button></form><div id="mp-player" class="club-row account-row" hidden><strong id="mp-room-summary">Joining main room…</strong><span id="mp-name"></span><span id="mp-wallet"></span><span id="mp-connection" role="status">Connecting…</span><button id="mp-logout" class="button quiet">Sign out</button></div>`;
    $("race-room-slot").innerHTML = `<section id="mp-racing-card" class="club-box racing-card" aria-labelledby="mp-racing-title" hidden><h3 id="mp-racing-title">Race rooms</h3><div id="mp-lobby"><div class="room-options"><button id="mp-main" class="button">Join main room</button><button id="mp-create" class="button quiet">Create your own room</button></div><form id="mp-join-form" class="club-row"><label class="field">Room code<input id="mp-code" maxlength="6" minlength="6" pattern="[A-Fa-f0-9]{6}" placeholder="ABC123" required></label><button class="button" type="submit">Join room</button></form></div>
  <div id="mp-room" hidden><div class="club-row"><strong id="mp-room-name"></strong><button id="mp-leave" class="button quiet">Leave room</button></div><p id="mp-members" class="club-note"></p><details class="racer-builds"><summary>Racer training & powers</summary><div id="mp-racer-builds"></div></details><strong id="mp-phase"></strong><p class="club-note">7 riders per race · CPUs fill open seats.</p><div id="mp-finish-order" hidden><details><summary>Last race prizes</summary><ol id="mp-results"></ol></details></div></div><div id="mp-room-directory" class="room-directory" aria-label="Other race rooms"></div></section>`;
    $("race-actions").innerHTML = `<div id="race-start-control" class="race-start-control"><span class="eyebrow">NEXT RACE</span><button id="mp-start" class="button primary" hidden>Open betting · start next race</button><p id="race-start-status" class="club-note" role="status"></p></div>`;
    $("race-bets").innerHTML = `<section class="current-slip" id="mp-betting-card" aria-labelledby="mp-betting-title"><div class="betting-card-heading"><h3 id="mp-betting-title">Place bets</h3><button id="mp-view-slips" type="button" class="button quiet">Past bets →</button></div><p id="mp-betting-state" class="club-note" role="status"></p><p class="club-note bet-types-note">Win: 1st · 4× return. Place: top 2 · 2×. Show: top 3 · 1.5×. Returns include your stake; fractional coins round down. Up to one of each type per round.</p><form id="mp-bet-form" class="club-row" hidden><label class="field">Bet type<select id="mp-bet-kind"><option value="win">Win · finish 1st</option><option value="place">Place · finish top 2</option><option value="show">Show · finish top 3</option></select></label><label class="field">Your pick<select id="mp-bet-horse"></select></label><label class="field">Stake<input id="mp-stake" type="number" min="10" max="500" step="1" value="50" required></label><button class="button primary" type="submit">Place bet</button><p id="mp-bet-preview" class="club-note"></p></form><div id="mp-bet-note" aria-live="polite"></div></section>`;
    $("mp-room").after($("mp-lobby"));
    this.roomBrowser = new RoomBrowser($("mp-room-directory"), {
      refresh: () => void this.action(() => this.refreshRooms()),
      join: (code, horse) => void this.action(async () => {
        await this.api(`/api/rooms/${code}/join`, { horse });
        await this.refreshRooms();
      }),
    });
    options($("mp-horse"));
    options($("mp-bet-horse"));
    const selectTab = (tab) => {
      const name=typeof tab==='string'?tab:tab?'history':'live';
      for(const id of ['live','upgrades','history']){
        $("mp-"+id+"-panel").hidden=id!==name;
        $("mp-tab-"+id).setAttribute('aria-selected',String(id===name));
        $("mp-tab-"+id).tabIndex=id===name?0:-1;
      }
    };
    this.workshop=new WorkshopUI($("mp-workshop"),{buy:(kind,level)=>void this.action(()=>this.api('/api/upgrades',{kind,level}))});
    $("mp-open-workshop").onclick=()=>{selectTab('upgrades');$("multiplayer").scrollIntoView({behavior:'smooth',block:'start'});};
    $("mp-view-slips").onclick=()=>{selectTab('history');$("multiplayer").scrollIntoView({behavior:'smooth',block:'start'});};
    document.querySelectorAll('[data-club-tab]').forEach(link=>link.addEventListener('click',()=>selectTab(link.dataset.clubTab)));
    this.raceBanner = new RaceBettingBanner($("race-betting-banner"), () => {
      $("mp-bet-form").scrollIntoView({behavior:'smooth',block:'center'});$("mp-bet-kind").focus({preventScroll:true});
    });
    const tabs=['live','upgrades','history'];
    for(const id of tabs){
      $("mp-tab-"+id).onclick=()=>selectTab(id);
      $("mp-tab-"+id).onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
        const at=tabs.indexOf(id),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        selectTab(tabs[next]);$("mp-tab-"+tabs[next]).focus();
      };
    }
    const preview = () => {
      const stake = Number($("mp-stake").value), type = BET_TYPES[$("mp-bet-kind").value];
      const payout = type ? ticketReturn(stake, type.units) : 0;
      const text = Number.isInteger(stake) && stake >= 10 && stake <= 500 && type
        ? `${type.label}: ${type.condition}. If successful: ${payout} coins returned (${payout - stake} profit · ${returnLabel(type.units)} including stake). Your horse’s finish prize is separate.`
        : "Choose a stake from 10 to 500 whole coins.";
      if ($("mp-bet-preview").textContent !== text) $("mp-bet-preview").textContent = text;
    };
    this.previewBet = preview;
    $("mp-stake").oninput = preview;
    $("mp-bet-kind").onchange = preview;
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
    $("mp-main").onclick=()=>void this.action(()=>this.api("/api/rooms/main",{}));
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
          kind: $("mp-bet-kind").value,
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
    const ability = document.createElement('section');
    ability.id = 'race-ability'; ability.className = 'race-ability'; ability.hidden = true;
    ability.setAttribute('aria-label', 'Your race ability');
    ability.innerHTML = `<div class="ability-copy"><span class="eyebrow">YOUR MOVE</span><strong id="race-ability-name"></strong><span id="race-ability-status" role="status" aria-live="polite"></span></div><div class="ability-action"><button id="race-use-power" class="button primary" type="button" aria-describedby="race-ability-status race-ability-help" aria-keyshortcuts="F" disabled>Use ability</button><span id="race-ability-help">Tap or press <kbd>F</kbd> · timing matters</span></div><p id="race-ability-terms" class="ability-terms" hidden>One use per race. Coins are spent on launch, even if an attack misses.</p><p id="race-ability-error" role="alert" hidden></p>`;
    $('race-actions').append(ability);
    $('race-use-power').onclick = () => void this.usePower();
    this.powerShortcut = event => {
      if (event.code !== 'KeyF' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          event.target?.closest('input,select,textarea,[contenteditable="true"]') || !$('race-use-power').checkVisibility() ||
          $('race-use-power').disabled) return;
      event.preventDefault(); void this.usePower();
    };
    document.addEventListener('keydown', this.powerShortcut);
    this.timer = setInterval(() => {
      if(this.room?.race?.phase==='racing' && this.roomCode){
        if(performance.now()>=this.nextRoomPoll)void this.refreshLiveRoom();
        if(Date.now()>=(this.auxRetryAt??0))void this.refreshAuxiliary();
      }else if(Date.now()>=this.nextPoll)void this.refresh();
    }, 50);
    this.bannerTimer = setInterval(() => { this.renderRaceBanner(); this.updateBettingControls(); this.renderAbility(); }, 100);
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
    const r = this.room?.race, now = Date.now() + this.offset, definition = r?.definition;
    let next = definition ? Math.max(0, Math.min(definition.duration, (now - r.starts) / 1000)) : 0;
    if (definition?.live) next=this.liveClock.frame();
    this.frameId = r?.id; this.frameTime = next;
    return {
      time: next,
      playing: this.online && Date.now() - this.lastContact < 6000 &&
        (r?.phase === 'racing' || r?.phase === 'results' && next < Math.min(definition?.availableTime ?? 0, (r.ends-r.starts)/1000)),
      ready: Boolean(definition && this.loaded === r.id), id: r?.id,
    };
  }
  async api(route, body) {
    const start = Date.now(), startedAt=performance.now();
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
    Object.defineProperty(result,TIMING,{value:{receivedAt:performance.now(),requestMs:performance.now()-startedAt}});
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
    this.lastMePoll = 0;
    this.pendingPower = null;
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
    const began=Date.now();
    try {
      if (this.token) {
        if(force||!this.user||Date.now()-this.lastMePoll>=5000){
          const arriving=this.arrivedToken!==this.token;
          const me=await this.api(arriving?'/api/arrival':'/api/me',arriving?{}:undefined);this.user=me.user;this.rules=me.rules;
          if(arriving)this.arrivedToken=this.token;
          this.roomCode=me.roomCode;this.lastMePoll=Date.now();
        }
        if(this.roomCode){const response=await this.api(`/api/rooms/${this.roomCode}`);this.acceptRoom(response.room,response);}
        else this.acceptRoom(null);
      }else await this.api('/api/health');
      this.online=true;
      // Publish the race immediately. Saved slips, wallet and directory fetching
      // have their own lane and cannot hold a motion snapshot in a queue.
      await this.acceptDefinition();this.render();this.onChange();
      void this.refreshAuxiliary();
    } catch(error){
      this.online=Date.now()-this.lastContact<6000;
      if(error.status===401)this.resetSession();
      if(force)throw error;
      this.render();
    } finally {
      this.polling=false;this.nextPoll=began+1000;
      if(this.room?.race?.phase==='racing')this.nextRoomPoll=Math.min(this.nextRoomPoll,performance.now());
    }
  }
  async refreshLiveRoom(){
    if(this.roomPolling||this.polling||!this.token||!this.roomCode)return;
    this.roomPolling=true;
    const began=performance.now(),token=this.token,code=this.roomCode;
    const stats=this.roomPollStats;
    if(stats.lastStart){stats.gaps.push(began-stats.lastStart);if(stats.gaps.length>120)stats.gaps.shift();}
    stats.lastStart=began;stats.count++;
    // A 300 ms deadline is measured from request start, not from the end of
    // unrelated work. Slow networks keep at most one room fetch in flight.
    this.nextRoomPoll=began+300;
    try{
      const response=await this.api(`/api/rooms/${code}`);
      if(this.token!==token||this.roomCode!==code)return;
      this.acceptRoom(response.room,response);this.online=true;
      await this.acceptDefinition();this.render();this.onChange();
      void this.refreshAuxiliary();
    }catch(error){
      if(error.status===401)this.resetSession();
      this.online=Date.now()-this.lastContact<6000;this.render();
    }finally{stats.requestMs=performance.now()-began;this.roomPolling=false;}
  }
  async refreshAuxiliary(){
    if(this.auxPolling||!this.token||Date.now()<(this.auxRetryAt??0))return;
    const token=this.token,key=JSON.stringify([this.user?.id,this.user?.coins,this.user?.races,this.room?.race?.id,this.room?.race?.phase]);
    const jobs=[];
    if(Date.now()-this.lastMePoll>=5000)jobs.push(this.api('/api/me').then(me=>{
      if(this.token!==token)return;
      if(this.room&&this.room.code!==me.roomCode){this.acceptRoom(null);this.loaded=null;this.liveClock=new LivePlaybackClock();this.nextPoll=0;}
      this.user=me.user;this.rules=me.rules;this.roomCode=me.roomCode;this.lastMePoll=Date.now();
    }));
    if(Date.now()-this.lastRoomPoll>=5000)jobs.push(this.refreshRooms());
    if(this.historyKey!==key)jobs.push(this.refreshHistory().then(()=>{this.historyKey=key;}));
    if(!jobs.length)return;
    this.auxPolling=true;
    try{
      const results=await Promise.allSettled(jobs);
      if(this.token!==token)return;
      if(results.some(r=>r.status==='rejected'&&r.reason.status===401)){this.resetSession();return;}
      this.render();this.onChange();
    }finally{this.auxPolling=false;this.auxRetryAt=Date.now()+500;}
  }
  acceptRoom(room,response) {
    const old=this.room?.race, next=room?.race;
    if (old?.id === next?.id && old?.definition?.live && next?.definition?.live &&
        ((old.revision??0) > (next.revision??0) || (old.revision??0) === (next.revision??0) && old.definition.availableTime > next.definition.availableTime)) room.race=old;
    if(next?.phase==='results'&&old?.phase!=='results')this.lastMePoll=0;
    this.room=room;
    if(room?.race?.definition?.live)this.liveClock.observe(room.race,{serverTime:response?.serverTime,...response?.[TIMING]});
  }
  get playbackDiagnostics(){return {...this.liveClock.diagnostics,poll:{...this.roomPollStats,gaps:[...this.roomPollStats.gaps]},auxiliaryBusy:Boolean(this.auxPolling)};}
  async acceptDefinition(r = this.room?.race) {
    if (!r?.definition || this.loadingId === r.id) return;
    if (this.loaded === r.id) {
      // A later request can finish first when an ability and room poll overlap.
      // Keep the more recent confirmed prefix and revision in that case.
      const current = this.loadedDefinition;
      if (current?.live && r.definition.live &&
          (r.revision < this.loadedRevision || r.revision === this.loadedRevision && r.definition.availableTime < current.availableTime)) {
        r.definition = current; return;
      }
      this.update(r.definition);
    } else {
      this.loadingId = r.id;
      try { await this.load(r.definition); this.loaded = r.id; }
      finally { this.loadingId = null; }
    }
    this.loadedDefinition = r.definition; this.loadedRevision = r.revision ?? 0;
  }
  async usePower() {
    const race = this.room?.race;
    if (this.powerBusy || !this.token || !this.online || !race || (!race.power?.available && !this.pendingPower)) return;
    if (this.pendingPower?.raceId !== race.id) this.pendingPower = null;
    const request = this.pendingPower ?? {raceId:race.id,requestId:crypto.randomUUID(),...(race.power?.paidSpecial?{policyVersion:1}:{})};
    this.pendingPower = request; this.powerBusy = true; this.powerError = '';
    this.renderAbility();
    try {
      const response = await this.api(`/api/rooms/${this.room.code}/power`, request);
      this.pendingPower = null;
      if(response.user)this.user=response.user;
      this.historyKey=null;this.lastMePoll=0;
      this.acceptRoom(response.room,response);
      await this.acceptDefinition(); this.render(); this.onChange();
      // A room poll already in flight may predate this successful activation.
      this.nextRoomPoll = 0;
    } catch(error) {
      // An uncertain network response keeps its request id, so tapping Retry
      // cannot consume a second charge if the first use reached the server.
      if (error.status && error.status < 500) this.pendingPower = null;
      this.powerError = error.status && error.status < 500 ? error.message : 'Connection interrupted. Retry confirms this same move safely.';
    } finally { this.powerBusy = false; this.renderAbility(); }
  }
  renderAbility() {
    const race=this.room?.race, power=race?.power, box=$('race-ability');
    if (!box) return;
    box.hidden = !this.user || !race || !power || power.reason === 'spectator' || power.reason === 'legacy';
    if (box.hidden) return;
    if (this.pendingPower?.raceId !== race.id) this.pendingPower = null;
    if (this.abilityRaceId !== race.id) {this.abilityRaceId=race.id;this.powerError='';}
    const name=POWERS[power.actor]?.name ?? 'Ability', now=Date.now()+this.offset;
    const waiting=power.readyAt ? Math.max(0,(power.readyAt-now)/1000) : 0;
    const states={betting:'Ready after the gates open',gates:`Gates open in ${Math.ceil(waiting)}s`,ready:'Ready — choose your moment',cooldown:`Recharging · ${waiting.toFixed(1)}s`,spent:power.paidSpecial?'Special used this race':'All charges used',finished:'Your horse has finished',coins:`Need ${power.cost} coins — save up before using this move`};
    $('race-ability-name').textContent=name;
    $('race-ability-terms').hidden=!power.paidSpecial;
    $('race-ability-status').textContent=this.powerBusy?'Sending your move…':this.pendingPower?'Move sent · retry to confirm':`${states[power.reason] ?? 'Waiting for the race'} · ${power.remaining}/${power.charges} ${power.paidSpecial?'uses':'charges'}${power.paidSpecial?' · '+(power.used?power.paid+' coins paid':power.cost+' coins to activate'):''}`;
    const button=$('race-use-power');
    button.textContent=this.pendingPower&&!this.powerBusy?'Retry ability':power.paidSpecial&&power.used?`${name} used`:`Use ${name}${power.cost?` · ${power.cost} coins`:""}`;
    button.disabled=this.powerBusy || !this.online || Date.now()-this.lastContact>=6000 || (!power.available && !this.pendingPower);
    box.dataset.state=this.powerBusy?'sending':power.reason;
    $('race-ability-error').hidden=!this.powerError;
    $('race-ability-error').textContent=this.powerError ?? '';
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
    const { history } = await this.api("/api/history?betsOnly=1");
    if (this.token !== token) return;
    this.history = history.filter(r=>roundBets(r).length>0);
    this.renderHistory();
  }
  renderHistory() {
    $("mp-history-count").textContent = this.history.length;
    const count = historyList($("mp-slips"), this.history, {
      filter: $("mp-history-filter").value, visible: this.historyVisible,
    });
    $("mp-more-slips").hidden = count <= this.historyVisible;
    const won = this.history.flatMap(roundBets).filter((b) => b.status === "won").length;
    const lost = this.history.flatMap(roundBets).filter((b) => b.status === "lost").length;
    $("mp-history-summary").textContent = this.history.length
      ? `${this.history.length === 50 ? "Latest " : ""}${this.history.length} ${this.history.length === 1 ? "race" : "races"} with bets · ${won} won ${won === 1 ? "bet" : "bets"} · ${lost} lost ${lost === 1 ? "bet" : "bets"}`
      : "No bets yet. Place a bet to save your first slip.";
  }
  render() {
    this.renderRaceBanner();
    this.renderAbility();
    $("mp-auth").hidden = Boolean(this.user);
    $("mp-account").hidden = !this.user;
    $("mp-player").hidden = !this.user;
    $("multiplayer").hidden = !this.user;
    $("mp-racing-card").hidden = !this.user;
    $("race-actions").hidden = !this.user || !this.room;
    $("race-bets").hidden = !this.user;
    $("mp-start").hidden = !this.user || !this.room;
    $("mp-betting-state").textContent = !this.room ? "Join the main room or choose another room to bet." :
      !this.room.race ? "Betting opens when the host starts the next race." :
      this.room.race.phase === 'betting' ? "Place your bets before the countdown ends." :
      this.room.race.phase === 'racing' ? "Betting is closed. Your tickets settle when the race finishes." : "Race settled. Your bets and finish prize are below.";
    if(!this.room){$("mp-bet-note").replaceChildren();this.slipSignature=null;}
    $("mp-connection").textContent = this.online
      ? this.user
        ? "Saved"
        : "Sign in"
      : "Reconnecting…";
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
    this.workshop.render({user:u,locked,busy:this.busy,online:this.online});
    $("mp-name").textContent = u.username;
    $("mp-wallet").textContent =
      `${u.coins.toLocaleString()} coins · ${u.points} pts`;
    $("mp-career").textContent =
      `${u.races} races · ${u.wins} wins · Upgrades stay with your account.`;
    $("mp-power-name").textContent = POWERS[u.horse].name;
    $("mp-power-description").textContent = POWERS[u.horse].description;
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
    $("mp-lobby").hidden = false;
    $("mp-main").disabled=this.busy||!this.online||locked||Boolean(this.room?.main);
    $("mp-create").disabled=this.busy||!this.online||locked;
    for(const el of $("mp-join-form").elements)el.disabled=this.busy||!this.online||locked;
    $("mp-room-summary").textContent=this.room?(this.room.main?"Main room":`Room ${this.room.code}`):"Choose a room";
    $("mp-room").hidden = !this.room;
    for (const el of $("mp-horse-form").elements)
      el.disabled = locked || this.busy || !this.online;
    if (!this.room) return;
    $("mp-room-name").textContent = `ROOM ${this.room.code}`;
    $("mp-members").textContent = this.room.members
      .map(
        (m) =>
          `${m.username}${m.id === this.room.hostId ? " (host)" : ""}${m.online === false ? (m.active ? " (offline · finishing this race)" : " (offline)") : ""} — ${HORSES[m.horse]}`,
      )
      .join(" · ");
    const buildRows=this.room.race?.entrants??this.room.members;
    const buildSignature=JSON.stringify(buildRows);
    if(buildSignature!==this.buildSignature){
      this.buildSignature=buildSignature;
      $("mp-racer-builds").replaceChildren(...buildRows.map(e=>{
        const row=document.createElement('p'),levels=e.upgrades??{},paths=Object.entries(levels).filter(([,n])=>n>0);
        row.textContent=`${e.username} · ${HORSES[e.horse]} · Speed ${e.speed}/5 / Stamina ${e.stamina}/5 / Focus ${e.focus}/5 · ${paths.length?paths.map(([kind,n])=>`${UPGRADES[kind]?.name??kind} ${n}`).join(', '):'No workshop training'}${levels.powerReserve?' · power budget '+levels.powerReserve:''}`;
        return row;
      }));
    }
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
    this.updateBettingControls();
    $("mp-start").disabled = this.busy || !this.online;
    $("race-start-status").textContent = r?.phase === 'betting' ? 'Bets are open · the race starts automatically.' :
      r?.phase === 'racing' ? 'Race in progress.' :
      this.room.hostId === u.id ? 'Start a 30-second betting countdown.' : 'Waiting for the host to open betting.';
    $("mp-leave").disabled = this.busy || !this.online || locked;
    const slipSignature = JSON.stringify([this.room.code, r?.id, r?.phase, r?.bet, r?.bets, r?.results, r?.powerSpent, u.id]);
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
  renderRaceBanner() {
    this.raceBanner?.render(this.user ? this.room : null, {
      now: Date.now() + this.offset,
      connected: this.online && Date.now() - this.lastContact < 6000,
      hasChoices: roundBets(this.room?.race).length < 3,
    });
    if (this.raceBanner) this.raceBanner.button.disabled ||= this.busy;
  }
  updateBettingControls() {
    const race = this.room?.race, taken = new Set(roundBets(race).map((b) => b.kind ?? "win"));
    const available = Object.keys(BET_TYPES).filter((kind) => !taken.has(kind));
    const select = $("mp-bet-kind");
    for (const option of select.options) option.disabled = taken.has(option.value);
    if (taken.has(select.value) && available.length) select.value = available[0];
    $("mp-bet-form").hidden = !this.user || race?.phase !== "betting" || !available.length;
    const closed = !race || Date.now() + this.offset >= race.closes || !this.online || Date.now()-this.lastContact>=6000;
    for (const el of $("mp-bet-form").elements) el.disabled = this.busy || closed;
    this.previewBet?.();
  }
  dispose() {
    clearInterval(this.timer);
    clearInterval(this.bannerTimer);
    document.removeEventListener('keydown',this.powerShortcut);
  }
}
