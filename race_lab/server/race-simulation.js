import { ACTOR_IDS, validateRace } from "../race-core.js";
import { makeCircuit, trackPoint } from "../track.js";

// A versioned, server-owned simulation. All clients receive the same persisted
// distance timeline; finish order is measured from its crossings, never drawn.
export const SIMULATION_VERSION = "skills-v2";
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

function runHorse(seed, entrant, lane, track) {
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
  let time = reaction, distance = 0, speed = 0, finish;
  while (distance < track.length && time < 120) {
    const fraction = distance / track.length;
    const turn = trackPoint(track, distance).turn;
    const fatigue = Math.pow(clamp((fraction - 0.42) / 0.58, 0, 1), 1.25) *
      (0.14 - skills.stamina * 0.02);
    const turnLoss = turn ? corners[turn - 1] * (1 - skills.focus * 0.13) : 0;
    let rhythmLoss = false, boundary = false;
    for (const incident of incidents) {
      if (incident.start === undefined && fraction >= incident.fraction) {
        incident.start = time; incident.end = time + incident.duration;
        boundary = true;
      }
      if (incident.start !== undefined && time < incident.end) rhythmLoss = true;
    }
    const target = cruise * (1 + interpolate(pace, fraction)) *
      (1 - fatigue) * (1 - turnLoss) * (rhythmLoss ? 0.72 : 1);
    const nextSpeed = speed < target ? Math.min(target, speed + acceleration * STEP)
      : Math.max(target, speed - acceleration * 1.4 * STEP);
    const nextDistance = distance + (speed + nextSpeed) / 2 * STEP;
    if (nextDistance >= track.length) {
      finish = time + STEP * (track.length - distance) / (nextDistance - distance);
      points.push({ time: finish, distance: track.length, boundary: true });
      break;
    }
    time += STEP; distance = nextDistance; speed = nextSpeed;
    points.push({ time, distance, boundary });
  }
  if (!finish) throw Error("Race simulation failed to finish.");
  return { id: entrant.horse, lane, skills, points, finish, incidents };
}

export function simulateRace(seed, { entrants, duration = 64, title = "Club race" } = {}) {
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
  const horses = entrants.map((e, i) => runHorse(seed, e, lanes[i], track));
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
  return validateRace({ version: 1, id: `skills-${String(seed).slice(0, 75)}`,
    title, seed, duration: end, startDelay, track, cast, outcome, events: [],
    simulation: { model: SIMULATION_VERSION, step: STEP, nominalSpeed: track.length / ((duration - startDelay) * 0.8) } });
}
