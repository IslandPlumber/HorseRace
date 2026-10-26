import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRace } from './race-simulation.js';
import { ACTOR_IDS, sampleRace, validateRace, generateRace } from '../race-core.js';
import { finishTime, distanceAt, hoofSchedule, gaitClock, gaitPhase } from '../gait.js';
import { runnerStatus } from '../training.js';
const entrants = (skills = {}) => ACTOR_IDS.map(horse => ({horse, ...(horse === 'elon' ? skills : {})}));
const run = (seed, skills) => simulateRace(seed, {entrants: entrants(skills), powers: false});
const elon = race => race.cast.find(r => r.id === 'elon');
const finish = race => finishTime(race, elon(race));

test('skill simulation is deterministic, immutable and has real timeline-derived crossings', () => {
  const options = {entrants: entrants({speed: 2, stamina: 3, focus: 4})};
  const before = structuredClone(options), a = simulateRace('same', options);
  assert.deepEqual(simulateRace('same', options), a);
  assert.deepEqual(options, before);
  assert.notDeepEqual(run('other', {}), a);
  assert.equal(a.simulation.model, 'skills-v5-heavy-hits');
  for (let seed = 0; seed < 80; seed++) {
    const race = run(seed, {speed: seed % 6, stamina: (seed + 1) % 6, focus: (seed + 2) % 6});
    assert.equal(validateRace(race), race);
    assert.deepEqual(sampleRace(race, race.duration).standings, race.outcome);
    assert.ok(sampleRace(race, race.startDelay).runners.every(r => r.distance === 0));
    assert.ok(sampleRace(race, race.duration).runners.every(r => r.finished));
    assert.ok(race.cast.every(r => r.progress.length < 100), 'compact shared timeline');
  }
});

test('speed training visibly changes acceleration and cruising distance for identical luck', () => {
  let earlyGain = 0, finishGain = 0;
  for (let i = 0; i < 60; i++) {
    const a = run(`speed-${i}`, {}), b = run(`speed-${i}`, {speed: 5});
    const otherA = a.cast.find(r => r.id === 'trump'), otherB = b.cast.find(r => r.id === 'trump');
    assert.deepEqual(otherA.progress.slice(0, -1), otherB.progress.slice(0, -1),
      'training one horse does not reroll another horse’s motion before the finish');
    earlyGain += distanceAt(elon(b).progress, 10) - distanceAt(elon(a).progress, 10);
    finishGain += finish(a) - finish(b);
  }
  assert.ok(earlyGain / 60 > 0.5, 'quicker acceleration is visible after the gates');
  assert.ok(finishGain / 60 > 0.5, 'higher cruising pace helps finish time');
});

test('stamina preserves identical opening pace and reduces fatigue only after halfway approaches', () => {
  let finishGain = 0;
  for (let i = 0; i < 60; i++) {
    const a = run(`stamina-${i}`, {}), b = run(`stamina-${i}`, {stamina: 5});
    assert.equal(distanceAt(elon(a).progress, 18), distanceAt(elon(b).progress, 18));
    finishGain += finish(a) - finish(b);
  }
  assert.ok(finishGain / 60 > 0.35, 'training retains pace in the second half');
});

test('focus improves the break and reduces actual losses of rhythm with identical luck', () => {
  let incidentsBefore = 0, incidentsAfter = 0, finishGain = 0;
  for (let i = 0; i < 100; i++) {
    const a = run(`focus-${i}`, {}), b = run(`focus-${i}`, {focus: 5});
    assert.ok(elon(b).progress[2].time < elon(a).progress[2].time, 'earlier reaction');
    assert.ok(elon(b).moments.length <= elon(a).moments.length);
    incidentsBefore += elon(a).moments.length; incidentsAfter += elon(b).moments.length;
    finishGain += finish(a) - finish(b);
  }
  assert.ok(incidentsAfter < incidentsBefore * 0.8, 'fewer rhythm interruptions');
  assert.ok(finishGain / 100 > 0.35, 'starts, turns and rhythm improve overall running');
});

test('trained horses retain an advantage without guaranteed wins; novice and CPU horses can win', () => {
  let wins = 0, currentWins = 0, baselineWins = 0, place = 0, baselinePlace = 0;
  for (let i = 0; i < 1000; i++) {
    const a = run(`balance-${i}`, {}), b = run(`balance-${i}`, {speed: 5, stamina: 5, focus: 5});
    const current = run(`balance-${i}`, {speed: 4, stamina: 2, focus: 1});
    currentWins += current.outcome[0] === 'elon';
    baselineWins += a.outcome[0] === 'elon'; wins += b.outcome[0] === 'elon';
    baselinePlace += a.outcome.indexOf('elon'); place += b.outcome.indexOf('elon');
  }
  assert.ok(wins > baselineWins && place < baselinePlace);
  assert.ok(currentWins / 1000 >= 0.64 && currentWins / 1000 <= 0.78, 'the existing 4/2/1 build should usually beat untrained rivals');
  assert.ok(wins / 1000 >= 0.83 && wins / 1000 <= 0.93, 'maximum training dominates untrained rivals while leaving room for upsets');
});

test('equally trained racers remain competitive regardless of their character', () => {
  const wins = Object.fromEntries(ACTOR_IDS.map(id => [id, 0]));
  for (let i=0;i<700;i++) {
    const race=simulateRace(`equal-${i}`,{entrants:ACTOR_IDS.map(horse=>({horse,speed:5,stamina:5,focus:5}))});
    wins[race.outcome[0]]++;
  }
  for(const count of Object.values(wins))assert.ok(count/700 > .08 && count/700 < .21);
});

test('dense simulation gait and hoof rates integrate to the same distance and finish', () => {
  const race = run('hoof-simulation', {speed: 4, stamina: 3, focus: 2});
  for (const runner of race.cast) {
    const time = 25;
    assert.ok(Math.abs((gaitClock(race, runner, time) - gaitPhase(runner.id)) *
      race.simulation.nominalSpeed - distanceAt(runner.progress, time)) < 1e-8,
      'all horses use the same stride distance, so faster running produces faster hoofbeats');
  }
  assert.ok(race.duration - Math.max(...race.cast.map(r => finishTime(race, r))) <= 1.25 + 1e-8);
  for (const time of [0, 15, 38]) for (const h of hoofSchedule(race, time)) {
    assert.ok(h.segments.length > 1);
    const runner = race.cast.find(r => r.id === h.id);
    let elapsed = 0;
    for (const s of h.segments) elapsed += s.duration;
    const first = h.segments[0];
    assert.ok(Math.abs(gaitClock(race, runner, h.finish) - gaitClock(race, runner, first.begin) - elapsed) < 1e-7);
    assert.equal(h.segments.at(-1).end, h.finish);
  }
});

test('live status describes present skills and moments while old definitions still play', () => {
  const race = run('status', {speed: 3, stamina: 2, focus: 1});
  const sample = time => sampleRace(race, time).runners.find(r => r.id === 'elon');
  assert.match(runnerStatus(race, sample(0), 0), /Ready/);
  assert.match(runnerStatus(race, sample(8), 8), /Finding stride/);
  assert.equal(runnerStatus(race, sample(64), 64), 'Finished');
  for (const m of elon(race).moments)
    assert.equal(runnerStatus(race, sample((m.time + m.end) / 2), (m.time + m.end) / 2), 'Regaining rhythm');
  const old = generateRace('old');
  assert.match(runnerStatus(old, sampleRace(old, 15).runners[0], 15), /Lane/);
});

test('invalid entrants, levels and durations cannot silently change the simulation', () => {
  for (const bad of [{speed: -1}, {focus: 6}, {stamina: 1.5}, {speed: '3'}])
    assert.throws(() => run(1, bad), /level/);
  for (const options of [{entrants: []}, {entrants: [{horse: 'unknown'}]},
    {entrants: [{horse: 'elon'}, {horse: 'elon'}]}, {entrants: entrants(), duration: 0}])
    assert.throws(() => simulateRace(1, options));
  for (const duration of [2, 10, 64, 120]) {
    const race = simulateRace(duration, {duration, entrants: [{horse: 'elon', stamina: 5}]});
    assert.equal(validateRace(race), race);
  }
});
