export const TRAINING = Object.freeze({
  speed: { name: "Speed", description: "Quicker acceleration and a higher cruising pace." },
  stamina: { name: "Stamina", description: "Less fatigue after halfway; more pace left for home." },
  focus: { name: "Focus", description: "Sharper starts, cleaner turns and fewer losses of rhythm." },
});

/** Explain what is happening now; never expose a future incident or result. */
export function runnerStatus(race, runner, time) {
  if (runner.finished) return "Finished";
  const definition = race.cast.find((r) => r.id === runner.id);
  if (!definition?.skills) return `Lane ${runner.lane + 1}`;
  if (time < race.startDelay) return `Lane ${runner.lane + 1} · Ready`;
  if (definition.moments?.some((m) => time >= m.time && time < m.end))
    return "Regaining rhythm";
  if (runner.distance < race.track.length * 0.08) return "Finding stride";
  if (runner.turn) return `Turn ${runner.turn} · Focus ${definition.skills.focus}/5`;
  if (race.track.length - runner.distance < race.track.startOffset)
    return `Home stretch · Stamina ${definition.skills.stamina}/5`;
  return `Cruising · Speed ${definition.skills.speed}/5`;
}
