import { ACTOR_IDS, validateRace } from "../race-core.js";
import { makeCircuit, trackPoint } from "../track.js";
import { POWERS } from "../powers.js";

// A versioned, server-owned simulation. All clients receive the same persisted
// distance timeline; finish order is measured from its crossings, never drawn.
export const SIMULATION_VERSION = "skills-v3-powers";
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
    if (chance < 0.34 * (1 - skills.focus * 0.14))
      incidents.push({ fraction: at, duration: duration * (1 - skills.focus * 0.08) });
  }
  const reaction = 0.14 + reactionRoll * 0.7 * (1 - skills.focus * 0.11);
  const cruise = track.length / 48 * form * (1 + skills.speed * 0.03);
  const acceleration = track.length / 82 * (1 + skills.speed * 0.1);
  const points = [{ time: 0, distance: 0, boundary: true },
    { time: reaction, distance: 0, boundary: true }];
  const powerRandom = randomSource(`${typeof seed}:${seed}:${entrant.horse}:power`);
  return { id: entrant.horse, lane, skills, points, incidents, reaction, cruise, acceleration,
    pace, corners, distance: 0, speed: 0, powerAt: .28 + powerRandom() * .38, used: false, effects: [] };
}

function runField(seed, entrants, lanes, track, powers) {
  const horses = entrants.map((e, i) => makeHorse(seed, e, lanes[i], track));
  const events = [];
  for (let time = 0; time < 120 && horses.some(h => !h.finish); time += STEP) {
    // Choose every target from the same frame, before moving anybody. Cast array
    // order cannot grant an earlier hit or change a target's position.
    const firing = powers ? horses.filter(h => !h.used && !h.finish &&
      h.distance >= track.length * h.powerAt).sort((a,b) => a.id.localeCompare(b.id)) : [];
    for (const h of firing) {
      const p = POWERS[h.id];
      const location = runner => trackPoint(track, runner.distance,
        (runner.lane - (horses.length - 1) / 2) * track.laneWidth);
      const origin = location(h);
      let targets;
      if (p.assist) {
        const last = [...horses].filter(other => !other.finish)
          .sort((a,b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
        targets = last && last !== h ? [last] : [];
      } else {
        targets = horses.filter(other => other !== h && !other.finish).map(other => {
          const point = location(other);
          return {horse: other, distance: Math.hypot(point.x-origin.x, point.z-origin.z)};
        }).filter(other => other.distance <= (p.radius ?? 0))
          .sort((a,b) => a.distance-b.distance || a.horse.id.localeCompare(b.horse.id))
          .slice(0, p.targets ?? 0).map(other => other.horse);
      }
      const hitTime = time + .45;
      h.used = true;
      h.effects.push({start: time, end: time + p.duration, boost: p.boost});
      for (const target of targets) target.effects.push({start: hitTime, end: hitTime + p.hitDuration,
        boost: p.assist ?? 0, slow: (p.slow ?? 0) * (1 - target.skills.focus * .06)});
      events.push({id: `power-${h.id}`, type: 'caption', power: p.effect, actor: h.id,
        time, duration: p.duration, hitTime, hitDuration: p.hitDuration ?? 0,
        targets: targets.map(other => other.id), assist: Boolean(p.assist),
        text: `${p.name}! ${targets.length ? (p.assist ? 'Shared horsepower for ' : 'Caught: ') + targets.map(t=>t.id).join(', ') + '.' : p.slow ? 'The pack escapes the distraction.' : 'A burst of horsepower!'}`});
    }
    for (const horse of horses) {
      if (horse.finish) continue;
      // Preserve the original per-horse reaction clock and luck stream.
      let {skills, incidents, cruise, acceleration, pace, corners, speed, distance} = horse;
      const elapsed = time - horse.reaction;
      if (elapsed < 0) continue;
      const localTime = Math.floor(elapsed / STEP) * STEP + horse.reaction;
      const fraction = distance / track.length;
      const turn = trackPoint(track, distance).turn;
      const fatigue = Math.pow(clamp((fraction - 0.42) / 0.58, 0, 1), 1.25) *
        (0.14 - skills.stamina * 0.02);
      const turnLoss = turn ? corners[turn - 1] * (1 - skills.focus * 0.13) : 0;
      let rhythmLoss = false, boundary = false;
      for (const incident of incidents) {
        if (incident.start === undefined && fraction >= incident.fraction) {
          incident.start = localTime; incident.end = localTime + incident.duration;
          boundary = true;
        }
        if (incident.start !== undefined && localTime < incident.end) rhythmLoss = true;
      }
      const active = horse.effects.filter(e => localTime >= e.start && localTime < e.end);
      const boost = Math.min(.28, active.reduce((n,e) => n + e.boost, 0));
      const slow = Math.min(.24, active.reduce((n,e) => n + (e.slow ?? 0), 0));
      const target = cruise * (1 + interpolate(pace, fraction)) *
        (1 - fatigue) * (1 - turnLoss) * (rhythmLoss ? 0.72 : 1) * (1 + boost) * (1 - slow);
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
      id: h.id, lane: h.lane, skills: h.skills,
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
  const raceEvents = events.map(e => ({...e, time: startDelay + e.time * scale,
    duration: Math.min(e.duration * scale, end - startDelay - e.time * scale),
    hitTime: startDelay + e.hitTime * scale, hitDuration: e.hitDuration * scale}));
  return validateRace({ version: 1, id: `skills-${String(seed).slice(0, 75)}`,
    title, seed, duration: end, startDelay, track, cast, outcome, events: raceEvents,
    simulation: { model: SIMULATION_VERSION, powers, step: STEP, nominalSpeed: track.length / ((duration - startDelay) * 0.8) } });
}
