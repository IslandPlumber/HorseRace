/** Reproducible balance audit, not a promise of odds for any particular room. */
import { simulateRace } from './server/race-simulation.js';
import { ACTOR_IDS } from './race-core.js';
import { finishTime } from './gait.js';
import { mkdir, writeFile } from 'node:fs/promises';
const count = Number(process.env.BALANCE_RACES ?? 1500);
if (!Number.isInteger(count) || count < 100) throw Error('Use at least 100 races.');
const scenarios = {
  untrained: {}, speed1: {speed: 1}, stamina1: {stamina: 1}, focus1: {focus: 1},
  speed5: {speed: 5}, stamina5: {stamina: 5}, focus5: {focus: 5},
  all5: {speed: 5, stamina: 5, focus: 5},
};
const report = {model: 'skills-v1', racesPerScenario: count, results: {}};
for (const [name, skills] of Object.entries(scenarios)) {
  let wins = 0, places = 0, finish = 0, keys = 0;
  for (let i = 0; i < count; i++) {
    const race = simulateRace(`balance-${i}`, {
      entrants: ACTOR_IDS.map(horse => ({horse, ...(horse === 'elon' ? skills : {})})),
    });
    const place = race.outcome.indexOf('elon') + 1;
    wins += place === 1; places += place;
    const horse = race.cast.find(r => r.id === 'elon');
    finish += finishTime(race, horse); keys += horse.progress.length;
  }
  report.results[name] = {winPercent: +(wins / count * 100).toFixed(2),
    meanPlace: +(places / count).toFixed(3), meanFinishSeconds: +(finish / count).toFixed(3),
    meanKeyframes: +(keys / count).toFixed(1)};
}
await mkdir('review/deployment/training', {recursive: true});
await writeFile('review/deployment/training/balance.json', JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
