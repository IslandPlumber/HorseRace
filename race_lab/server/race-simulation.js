import { ACTOR_IDS, validateRace } from "../race-core.js";
import { makeCircuit, trackPoint } from "../track.js";
import { POWERS } from "../powers.js";
import {normalizeUpgrades,masteryPace} from '../progression.js';

// A versioned, server-owned simulation. All clients receive the same persisted
// distance timeline; finish order is measured from its crossings, never drawn.
export const SIMULATION_VERSION = "skills-v6-workshop";
export const LIVE_SIMULATION_VERSION = "skills-v7-live";
export const LIVE_POWER_COOLDOWN = 4;
const STEP = 0.125;
const WINDOW = 68;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function randomSource(text) {
  let state = 2166136261;
  for (const char of text) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    let n = state += 0x6d2b79f5;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function skillsOf(entrant) {
  return Object.fromEntries(["speed", "stamina", "focus"].map((kind) => {
    const level = entrant[kind] ?? 0;
    if (!Number.isInteger(level) || level < 0 || level > 5)
      throw Error(`Invalid ${kind} level: expected 0–5.`);
    return [kind, level];
  }));
}
function interpolate(values, fraction) {
  const at = clamp(fraction, 0, 1) * (values.length - 1), i = Math.floor(at);
  return values[i] + ((values[i + 1] ?? values[i]) - values[i]) * (at - i);
}

// Keep the sampled motion accurate to 4 cm without sending hundreds of tiny
// segments per horse. Gate, reaction, rhythm loss and finish boundaries survive.
function simplify(points, tolerance = 0.04) {
  const kept = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let end = anchor + 1;
    for (let candidate = end + 1; candidate < points.length; candidate++) {
      const a = points[anchor], b = points[candidate];
      if (b.time - a.time > 1.75 || points[candidate - 1].boundary) break;
      let error = 0;
      for (let i = anchor + 1; i < candidate; i++) {
        const p = points[i];
        error = Math.max(error, Math.abs(p.distance - (a.distance +
          (b.distance - a.distance) * (p.time - a.time) / (b.time - a.time))));
      }
      if (error > tolerance) break;
      end = candidate;
    }
    kept.push(points[end]);
    anchor = end;
  }
  return kept.map(({ time, distance }) => ({ time, distance }));
}

function makeHorse(seed, entrant, lane, track) {
  const skills = skillsOf(entrant);
  const upgrades=normalizeUpgrades(entrant.upgrades??{}),level=kind=>upgrades[kind]??0;
  // Separate streams by horse, not cast position or training level. Identical
  // seeds support fair before/after comparisons without rerolling good fortune.
  const random = randomSource(`${typeof seed}:${seed}:${entrant.horse}`);
  const form = 0.87 + random() * 0.26;
  const reactionRoll = random();
  const pace = Array.from({ length: 5 }, () => (random() - 0.5) * 0.14);
  const corners = Array.from({ length: 4 }, () => 0.055 + random() * 0.025);
  const incidents = [];
  for (const section of [0.23, 0.52, 0.76]) {
    const chance = random(), at = section + (random() - 0.5) * 0.06;
    const duration = 0.4 + random() * 0.4;
    if (chance < 0.34 * (1 - skills.focus * 0.14)*(1-level('balance')*.04))
      incidents.push({ fraction: at, duration: duration * (1 - skills.focus * 0.08)*(1-level('balance')*.03) });
  }
  const reaction = (0.14 + reactionRoll * 0.7 * (1 - skills.focus * 0.11))*(1-level('gatecraft')*.025);
  const cruise = track.length / 48 * form * (1 + skills.speed * 0.03)*(1+level('horseshoes')*.002+masteryPace(level('mastery')));
  const acceleration = track.length / 82 * (1 + skills.speed * 0.1)*(1+level('stride')*.04);
  const points = [{ time: 0, distance: 0, boundary: true },
    { time: reaction, distance: 0, boundary: true }];
  const powerRandom = randomSource(`${typeof seed}:${seed}:${entrant.horse}:power`);
  return { id: entrant.horse, lane, skills, upgrades, points, incidents, reaction, cruise, acceleration,
    pace, corners, distance: 0, speed: 0, powerAt: .28 + powerRandom() * .38-level('powerReach')*.003,
    reserveAt:.82+powerRandom()*.08,uses:0,charges:level('powerReserve')>=5?2:1,effects: [] };
}

function runField(seed, entrants, lanes, track, powers, manual = null) {
  const horses = entrants.map((e, i) => makeHorse(seed, e, lanes[i], track));
  const events = [];
  for (let time = 0; time < 120 && horses.some(h => !h.finish); time += STEP) {
    const frameDistances=new Map(horses.map(h=>[h.id,h.distance]));
    for (const horse of horses) {
      if (horse.finish) continue;
      // Preserve the original per-horse reaction clock and luck stream.
      let {skills, incidents, cruise, acceleration, pace, corners, speed, distance} = horse;
      const level=kind=>horse.upgrades[kind]??0;
      const elapsed = time - horse.reaction;
      if (elapsed < 0) continue;
      const localTime = Math.floor(elapsed / STEP) * STEP + horse.reaction;
      const fraction = distance / track.length;
      const turn = trackPoint(track, distance).turn;
      const fatigueStart=.42+level('secondWind')*.007;
      const fatigue = Math.pow(clamp((fraction - fatigueStart) / (.58-level('secondWind')*.007), 0, 1), 1.25) *
        (0.14 - skills.stamina * 0.02)*(1-level('conditioning')*.02);
      let turnLoss = turn ? corners[turn - 1] * (1 - skills.focus * 0.13)*(1-level('cornering')*.04)*(1-level('horseshoes')*.01) : 0;
      let rhythmLoss = false, boundary = false;
      for (const incident of incidents) {
        if (incident.start === undefined && fraction >= incident.fraction) {
          incident.start = localTime; incident.end = localTime + incident.duration;
          boundary = true;
        }
        if (incident.start !== undefined && localTime < incident.end) rhythmLoss = true;
      }
      const active = horse.effects.filter(e => localTime >= e.start && localTime < e.end);
      const boost = Math.min(.28+level('powerPotency')*.01, active.reduce((n,e) => n + e.boost, 0));
      const ownBoost=active.some(e=>e.own);
      if(ownBoost)turnLoss*=1-level('powerDiscipline')*.03;
      if(horse.effects.some(e=>e.slow&&localTime>=e.start&&localTime<e.end+1.5))acceleration*=1+level('recovery')*.04;
      // A comic hit is a real loss of velocity, not only a lower future target.
      // Nearby heavy hits share a jolt cooldown and their slowdowns never add.
      for(const effect of active.filter(e=>e.shock&&!e.applied)){
        effect.applied=true;
        if(localTime >= (horse.nextJolt ?? 0)){
          speed *= 1-effect.shock;
          horse.nextJolt=localTime+2.4+level('recovery')*.12;
          boundary=true;
        }
      }
      const light = Math.min(.24, active.filter(e=>!e.shock).reduce((n,e) => n+(e.slow??0),0));
      const heavy = Math.max(0,...active.filter(e=>e.shock).map(e=>e.slow));
      const slow = Math.min(.60,Math.max(light,heavy));
      const drafting=level('drafting')&&horses.some(other=>other!==horse&&!other.finish&&Math.abs(other.lane-horse.lane)<=1&&frameDistances.get(other.id)-frameDistances.get(horse.id)>1&&frameDistances.get(other.id)-frameDistances.get(horse.id)<10);
      const rhythm= rhythmLoss?1-.28*(ownBoost?1-level('powerDiscipline')*.08:1):1;
      const kick=1+level('finishing')*.006*clamp((fraction-.72)/.20,0,1);
      const target = cruise * (1 + interpolate(pace, fraction)) *
        (1 - fatigue) * (1 - turnLoss) * rhythm * (1 + boost) * (1 - slow)*kick*(drafting?1+level('drafting')*.004:1)*(ownBoost?1+level('powerDiscipline')*.004:1);
      const nextSpeed = speed < target ? Math.min(target, speed + acceleration * STEP)
        : Math.max(target, speed - acceleration * 1.4 * STEP);
      const nextDistance = distance + (speed + nextSpeed) / 2 * STEP;
      if (nextDistance >= track.length) {
        horse.finish = localTime + STEP * (track.length - distance) / (nextDistance - distance);
        horse.distance = track.length;
        horse.points.push({ time: horse.finish, distance: track.length, boundary: true });
        continue;
      }
      horse.distance = nextDistance; horse.speed = nextSpeed;
      // Preserve power starts/ends while compressing the distance timeline.
      boundary ||= horse.effects.some(e => Math.abs(localTime-e.start)<STEP || Math.abs(localTime-e.end)<STEP);
      horse.points.push({ time: localTime + STEP, distance: nextDistance, boundary });
    }
    // Every horse's sampled segment now covers this exact shared time. Freeze
    // activation positions into the replay so even a nose-ahead leader agrees
    // with the live standings after timeline compression.
    const sharedDistance = horse => {
      const b=horse.points.at(-1),a=horse.points.at(-2);
      return b.time<=time ? b.distance : a.distance+(b.distance-a.distance)*(time-a.time)/(b.time-a.time);
    };
    const finished = horse => horse.finish !== undefined && horse.finish<=time;
    const firing = powers ? horses.filter(h => h.uses<h.charges && !finished(h) &&
      (manual?.has(h.id) ? (manual.get(h.id)[h.uses] ?? Infinity) <= time + 1e-8 :
        sharedDistance(h) >= track.length * h.powerAt)).sort((a,b) => a.id.localeCompare(b.id)) : [];
    for (const h of firing) {
      const base=POWERS[h.id],level=kind=>h.upgrades[kind]??0;
      const strength=(1+level('powerPotency')*.02)*(h.uses ? .65 : 1),duration=1+level('powerDuration')*.025;
      const p={...base,boost:base.boost*strength,slow:(base.slow??0)*strength,
        shock:Math.min(.68,(base.shock??0)*strength),assist:(base.assist??0)*strength,
        duration:base.duration*duration*(1+level('powerReserve')*.04),hitDuration:(base.hitDuration??0)*duration,
        radius:(base.radius??0)+level('powerReach')};
      const location = runner => trackPoint(track, sharedDistance(runner),
        (runner.lane - (horses.length - 1) / 2) * track.laneWidth);
      const origin = location(h);
      let targets;
      if (p.targeting === 'leader') {
        // Include finishers when identifying the overall leader: once someone
        // has won, never quietly retarget the next unfinished horse.
        const leader = [...horses].sort((a,b) => {
          if (finished(a) || finished(b)) return finished(a) && finished(b) ? a.finish-b.finish : finished(a) ? -1 : 1;
          return sharedDistance(b)-sharedDistance(a) || a.lane-b.lane;
        })[0];
        targets = leader !== h && !finished(leader) ? [leader] : [];
      } else if (p.assist) {
        const last = [...horses].filter(other => !finished(other))
          .sort((a,b) => sharedDistance(a)-sharedDistance(b) || a.lane-b.lane)[0];
        targets = last && last !== h ? [last] : [];
      } else {
        targets = horses.filter(other => other !== h && !finished(other)).map(other => {
          const point = location(other);
          return {horse: other, distance: Math.hypot(point.x-origin.x, point.z-origin.z)};
        }).filter(other => other.distance <= (p.radius ?? 0))
          .sort((a,b) => a.distance-b.distance || a.horse.id.localeCompare(b.horse.id))
          .slice(0, p.targets ?? 0).map(other => other.horse);
      }
      const hitTime = time + .45*(1-level('powerReach')*.03);
      h.uses++;h.powerAt=h.reserveAt;
      h.effects.push({start: time, end: time + p.duration, boost: p.boost,own:true});
      const targetEnds={};
      for (const target of targets){
        const end=hitTime+p.hitDuration*(p.assist?1:1-(target.upgrades.recovery??0)*.025);targetEnds[target.id]=end;
        target.effects.push({start: hitTime, end,
          boost: p.assist ?? 0, slow: (p.slow ?? 0) * (1 - target.skills.focus * .06)*(1-(target.upgrades.blinkers??0)*.025)*(p.shock?1-(target.upgrades.saddle??0)*.025:1),
          shock: (p.shock ?? 0) * (1 - target.skills.focus * .06)*(1-(target.upgrades.saddle??0)*.025)});
      }
      const detail = targets.length ? (p.targeting === 'leader' ? 'Leader targeted: ' : p.assist ? 'Shared horsepower for ' : 'Caught: ') +
        targets.map(t=>t.id).join(', ') + '.' : p.targeting === 'leader' ?
        'No rival leader to hit. Keeping the speed boost!' : p.slow ? 'The pack escapes the distraction.' : 'A burst of horsepower!';
      events.push({id: `power-${h.id}${h.uses>1?'-'+h.uses:''}`, type: 'caption', power: p.effect, actor: h.id,charge:h.uses,charges:h.charges,
        time, duration: p.duration, hitTime, hitDuration: p.hitDuration ?? 0,
        targets: targets.map(other => other.id), assist: Boolean(p.assist),
        targeting: p.targeting ?? (p.assist ? 'last' : p.slow ? 'nearby' : 'self'), impact: p.shock ?? 0, targetEnds, detail,
        text: `${p.name}${/[!?]$/.test(p.name) ? '' : '!'} ${detail}`});
    }
    if (firing.length && !manual) for(const horse of horses) {
      const b=horse.points.at(-1);
      if(b.time<time)continue;
      if(b.time===time){b.boundary=true;continue;}
      const distance=sharedDistance(horse);
      horse.points.splice(-1,0,{time,distance,boundary:true});
    }
  }
  if (horses.some(h => !h.finish)) throw Error("Race simulation failed to finish.");
  return {horses, events};
}

export function simulateRace(seed, { entrants, duration = 64, title = "Club race", powers = true } = {}) {
  if (!(typeof seed === "string" || typeof seed === "number" && Number.isFinite(seed)))
    throw Error("Race seed must be a string or finite number.");
  if (!Array.isArray(entrants) || !entrants.length || entrants.length > ACTOR_IDS.length ||
      entrants.some((e) => !ACTOR_IDS.includes(e.horse)) ||
      new Set(entrants.map((e) => e.horse)).size !== entrants.length)
    throw Error("Race entrants must have unique, known horses.");
  if (!Number.isFinite(duration) || duration < 2 || duration > 120)
    throw Error("Race duration must be between 2 and 120 seconds.");
  const track = makeCircuit();
  const startDelay = Math.min(7, duration * 0.14);
  const random = randomSource(`${typeof seed}:${seed}:lanes`);
  const lanes = entrants.map((_, i) => i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const {horses, events} = runField(seed, entrants, lanes, track, powers);
  // One shared conversion preserves every horse's relative speed and crossings.
  // Extreme slow fields still fit the round's existing scheduled end time.
  const scale = (duration - startDelay) / Math.max(WINDOW, ...horses.map((h) => h.finish + 1));
  // Settle promptly after the last actual crossing instead of waiting out the
  // whole maximum round slot. Existing stored definitions keep their old end.
  const end = Math.min(duration, startDelay + Math.max(...horses.map((h) => h.finish)) * scale +
    Math.min(1.25, duration * 0.02));
  const cast = horses.map((h) => {
    const finish = startDelay + h.finish * scale;
    return {
      id: h.id, lane: h.lane, skills: h.skills,upgrades:h.upgrades,
      moments: h.incidents.filter((e) => e.start !== undefined).map((e) => ({
        kind: "rhythm", time: startDelay + e.start * scale,
        end: Math.min(finish, startDelay + e.end * scale),
      })),
      progress: [{ time: 0, distance: 0 }, { time: startDelay, distance: 0 },
        ...simplify(h.points).slice(1).map((p) => ({
          time: startDelay + p.time * scale, distance: p.distance,
        })),
        { time: end, distance: track.length + (end - finish) * track.length / 100 }],
    };
  });
  const outcome = [...horses].sort((a, b) => a.finish - b.finish).map((h) => h.id);
  const raceEvents = events.map(e => {
    const time=startDelay+e.time*scale,hitTime=startDelay+e.hitTime*scale;
    return {...e,time,duration:Math.min(e.duration*scale,end-time),hitTime,hitDuration:Math.min(e.hitDuration*scale,end-hitTime),
      targetEnds:Object.fromEntries(Object.entries(e.targetEnds).map(([id,t])=>[id,Math.min(end,startDelay+t*scale)]))};
  });
  return validateRace({ version: 1, id: `skills-${String(seed).slice(0, 75)}`,
    title, seed, duration: end, startDelay, track, cast, outcome, events: raceEvents,
    simulation: { model: SIMULATION_VERSION, powers, step: STEP, nominalSpeed: track.length / ((duration - startDelay) * 0.8) } });
}


/**
 * A live field uses the same physical model, but the clock scale is fixed before
 * the gates open. Human casts are inputs on that clock, not preselected moments.
 * The complete projection is private server state. Only publicLiveRace may be
 * sent to players while a race is underway.
 */
export function simulateLiveRace(seed, { entrants, duration = 64, title = "Club race", activations = [] } = {}) {
  if (!(typeof seed === "string" || typeof seed === "number" && Number.isFinite(seed)))
    throw Error("Race seed must be a string or finite number.");
  if (!Array.isArray(entrants) || !entrants.length || entrants.length > ACTOR_IDS.length ||
      entrants.some(e => !ACTOR_IDS.includes(e.horse)) ||
      new Set(entrants.map(e => e.horse)).size !== entrants.length)
    throw Error("Race entrants must have unique, known horses.");
  if (!Number.isFinite(duration) || duration < 2 || duration > 120)
    throw Error("Race duration must be between 2 and 120 seconds.");
  if (!Array.isArray(activations)) throw Error("Live activations must be an array.");
  const track = makeCircuit(), startDelay = Math.min(7, duration * .14);
  const scale = (duration - startDelay) / WINDOW;
  const tail = Math.min(1.25, duration * .02);
  // The generous fixed horizon accommodates even repeated heavy hits without
  // changing the speed of any already displayed motion. Settlement uses actual
  // crossings, rather than waiting for this upper bound.
  const end = startDelay + 120 * scale + tail;
  const random = randomSource(`${typeof seed}:${seed}:lanes`);
  const lanes = entrants.map((_, i) => i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const manual = new Map(entrants.filter(e => e.userId).map(e => [e.horse, []]));
  for (const input of activations) {
    if (!input || !manual.has(input.actor) || !Number.isFinite(input.time) ||
        input.time < startDelay || input.time >= end)
      throw Error("Invalid live activation.");
    const times = manual.get(input.actor);
    const entrant = entrants.find(e => e.horse === input.actor);
    const charges = (normalizeUpgrades(entrant.upgrades).powerReserve ?? 0) >= 5 ? 2 : 1;
    if (times.length >= charges || times.length && input.time - (startDelay + times.at(-1) * scale) < LIVE_POWER_COOLDOWN - 1e-8)
      throw Error("Live activation exceeds charges or cooldown.");
    // API inputs normally come from nextLiveActivationTime. Quantize defensively
    // so replaying persisted input cannot depend on substep arrival timing.
    const raw = Math.ceil(((input.time - startDelay) / scale) / STEP - 1e-8) * STEP;
    times.push(raw);
  }
  const {horses, events} = runField(seed, entrants, lanes, track, true, manual);
  const cast = horses.map(h => {
    const finish = startDelay + h.finish * scale;
    if (finish >= end) throw Error("Live race exceeded its fixed horizon.");
    return {
      id: h.id, lane: h.lane, skills: h.skills, upgrades: h.upgrades,
      moments: h.incidents.filter(e => e.start !== undefined).map(e => ({
        kind: "rhythm", time: startDelay + e.start * scale,
        end: Math.min(finish, startDelay + e.end * scale),
      })),
      // Do not compress against future endpoints. Every canonical historical
      // segment stays byte-for-byte identical after a newly submitted action.
      progress: [{time: 0, distance: 0}, {time: startDelay, distance: 0},
        ...h.points.slice(1).map(p => ({time: startDelay + p.time * scale, distance: p.distance})),
        {time: end, distance: track.length + (end - finish) * track.length / 100}],
    };
  });
  const outcome = [...horses].sort((a,b) => a.finish - b.finish).map(h => h.id);
  const raceEvents = events.map(e => ({...e,
    time: startDelay + e.time * scale,
    duration: Math.min(e.duration * scale, end - startDelay - e.time * scale),
    hitTime: startDelay + e.hitTime * scale,
    hitDuration: Math.min(e.hitDuration * scale, end - startDelay - e.hitTime * scale),
    targetEnds: Object.fromEntries(Object.entries(e.targetEnds).map(([id,t]) => [id, Math.min(end, startDelay + t * scale)])),
  }));
  return validateRace({version: 1, id: `live-${String(seed).slice(0,75)}`, title, seed,
    duration: end, startDelay, track, cast, outcome, events: raceEvents,
    simulation: {model: LIVE_SIMULATION_VERSION, powers: true, manualPowers: true,
      step: STEP, stepSeconds: STEP * scale, scale, settleTail: tail,
      cooldown: LIVE_POWER_COOLDOWN, nominalSpeed: track.length / ((duration - startDelay) * .8)},
  });
}

export function nextLiveActivationTime(definition, elapsed) {
  const step = definition.simulation?.stepSeconds;
  if (!(Number.isFinite(step) && step > 0 && Number.isFinite(elapsed)))
    throw Error("Expected a live definition and elapsed time.");
  const start = definition.startDelay ?? 0;
  return start + (Math.floor(Math.max(0, elapsed - start) / step + 1e-8) + 1) * step;
}

function finishCrossing(runner, length) {
  for (let i=1; i<runner.progress.length; i++) {
    const a=runner.progress[i-1], b=runner.progress[i];
    if (a.distance < length && b.distance >= length)
      return a.time + (length-a.distance) * (b.time-a.time) / (b.distance-a.distance);
  }
  return Infinity;
}

export function raceFinishedAt(definition) {
  return Math.min(definition.duration, Math.max(...definition.cast.map(r => finishCrossing(r, definition.track.length))) +
    (definition.simulation?.settleTail ?? Math.min(1.25, definition.duration * .02)));
}

/** Publish only history that has already happened on the server clock. */
export function publicLiveRace(definition, elapsed, {id = "live-race", revision = 0} = {}) {
  const finishedAt = raceFinishedAt(definition), completed = elapsed >= finishedAt;
  const start = definition.startDelay ?? 0, step = definition.simulation.stepSeconds;
  const requested = clamp(elapsed, 0, completed ? finishedAt : definition.duration);
  const cutoff = completed ? finishedAt : requested < start ? requested :
    Math.min(requested, start + Math.floor((requested - start) / step + 1e-8) * step);
  const cast = definition.cast.map(runner => {
    const progress = runner.progress.filter(p => p.time <= cutoff).map(p => ({...p}));
    if (progress.at(-1).time < cutoff) {
      const next = runner.progress.find(p => p.time > cutoff), previous = progress.at(-1);
      progress.push({time: cutoff, distance: previous.distance +
        (next.distance - previous.distance) * (cutoff - previous.time) / (next.time - previous.time)});
    }
    return {...runner, progress, moments: (runner.moments ?? []).filter(m => m.time <= cutoff)
      .map(m => ({...m, end: Math.min(m.end, cutoff)}))};
  });
  return validateRace({version: 1, id, title: definition.title, seed: "live",
    live: true, completed, availableTime: cutoff, revision,
    duration: completed ? finishedAt : definition.duration, startDelay: start,
    track: definition.track, cast, outcome: completed ? [...definition.outcome] : [],
    events: definition.events.filter(e => e.time <= cutoff).map(e => ({...e,
      duration: Math.min(e.duration, (completed ? finishedAt : definition.duration) - e.time),
      hitDuration: Math.min(e.hitDuration, (completed ? finishedAt : definition.duration) - e.hitTime),
      targets: [...e.targets], targetEnds: Object.fromEntries(Object.entries(e.targetEnds).map(([actor,end]) =>
        [actor, Math.min(end, completed ? finishedAt : definition.duration)])),
    })),
    // Explicit allowlist: never spread private seed, activation schedule, or
    // any future result metadata into a room response.
    simulation: {model: definition.simulation.model, powers: true, manualPowers: true,
      step: definition.simulation.step, stepSeconds: step,
      cooldown: definition.simulation.cooldown, nominalSpeed: definition.simulation.nominalSpeed},
  });
}
