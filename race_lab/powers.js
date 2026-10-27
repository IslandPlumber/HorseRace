/** Shared descriptions and replay queries. Only the server applies race effects. */
export const POWERS = Object.freeze({
  trump: { name: 'Hat Trick', icon: 'CAP', color: '#f05448', effect: 'hat',
    description: 'A spinning red hat distracts up to three nearby rivals. A little victory surge for the thrower.',
    boost: .08, duration: 2.8, slow: .18, hitDuration: 1.6, radius: 16, targets: 3 },
  elon: { name: 'Totally Normal Rocket', icon: 'BOOST', color: '#78d7ff', effect: 'rocket',
    description: 'A tiny saddle rocket delivers a short burst of speed. You choose the launch window.',
    boost: .24, duration: 2.8 },
  biden: { name: 'Ice Cream Express', icon: 'SCOOP', color: '#ffcfdb', effect: 'icecream',
    description: 'An ice-cream cone appears just ahead. Suddenly there is somewhere very important to be.',
    boost: .20, duration: 3 },
  mcconnell: { name: 'Filibuster the Front-runner', icon: 'HOLD', color: '#b6b4ff', effect: 'filibuster',
    description: 'Express paperwork knocks the leader out of stride, then drags their pace for several seconds. Already leading? Keep the boost and spare yourself the speech.',
    boost: .10, duration: 2.8, slow: .45, hitDuration: 4.2, shock: .40, targeting: 'leader' },
  bernie: { name: 'Mittens for the Many', icon: 'MITTENS', color: '#ffb16e', effect: 'mittens',
    description: 'A warm mitten-powered surge for Bernie, plus a smaller boost for the racer running last. Shared horsepower!',
    boost: .14, duration: 3.5, assist: .10, hitDuration: 2.2 },
  gordon: { name: 'Where’s the Gallop?!', icon: 'CHEF', color: '#ffe278', effect: 'kitchen',
    description: 'BONK! A homing pan sharply knocks the leader’s speed down, followed by a few seconds of seeing stars. Gordon never throws it at himself.',
    boost: .12, duration: 2.8, slow: .55, hitDuration: 3.4, shock: .60, targeting: 'leader' },
  snoop: { name: 'Chill Out, Neigh-bor', icon: 'CHILL', color: '#a7edb9', effect: 'chill',
    description: 'A mellow musical cloud briefly slows up to three nearby rivals while Snoop cruises through.',
    boost: .12, duration: 3.5, slow: .10, hitDuration: 2, radius: 16, targets: 3 },
});

// Versioned separately: saved automatic/v7 races keep their original physics.
export const SPECIAL_POWERS = Object.freeze(Object.fromEntries(Object.entries(POWERS).map(([id,p])=>[id,{...p,...({
  trump:{boost:.28,duration:5.5,slow:.45,hitDuration:4,radius:26,shock:.25,description:'A huge spinning hat barrage staggers up to three nearby rivals while Trump surges away.'},
  elon:{boost:.65,duration:6.5,description:'A roaring saddle rocket delivers a major sustained burst of speed. Save it for the perfect launch window.'},
  biden:{boost:.55,duration:7,description:'A giant triple scoop triggers an all-out ice-cream sprint with a long burst of speed.'},
  mcconnell:{boost:.28,duration:5,slow:.68,hitDuration:6.5,shock:.70,description:'A blizzard of paperwork slams the leader, sharply cutting speed and dragging their pace for several seconds.'},
  bernie:{boost:.42,duration:7,assist:.30,hitDuration:5.5,description:'A powerful mitten surge for Bernie, with a substantial shared boost for the racer running last.'},
  gordon:{boost:.30,duration:5,slow:.72,hitDuration:5.5,shock:.80,description:'A giant flying pan clobbers the leader, knocks most of their speed away and leaves a long recovery. No self-bonks.'},
  snoop:{boost:.30,duration:6,slow:.45,hitDuration:5,radius:26,description:'A huge musical cloud slows up to three nearby rivals while Snoop powers through the groove.'},
}[id])}])));
export const SPECIAL_POWER_POLICY = Object.freeze({version:1,uses:1,baseCost:75,minCost:50,discountPerLevel:5});
export const specialPowerCost = levels => Math.max(50,75-5*Math.min(5,Math.max(0,levels?.powerReserve??0)));
export const powerForRace = (race,id) => (race?.simulation?.specials?SPECIAL_POWERS:POWERS)[id];

export function powerEvents(race) { return race?.events?.filter(e => e.power) ?? []; }
export function activePowerEffects(race, id, time) {
  return powerEvents(race).flatMap(event => {
    const effects = [];
    if (event.actor === id && time >= event.time && time < event.time + event.duration)
      effects.push({event, kind: 'boost'});
    if (event.targets.includes(id) && time >= event.hitTime && time < (event.targetEnds?.[id]??event.hitTime + event.hitDuration))
      effects.push({event, kind: event.assist ? 'assist' : 'slow'});
    return effects;
  });
}

export function powerStatus(race, id, time, finished=false) {
  if (!race?.simulation?.powers) return '';
  if(finished)return `${POWERS[id].name} · finished`;
  const active = activePowerEffects(race, id, time);
  const impact = active.find(e => e.kind === 'slow' && e.event.impact);
  if (impact) return `${impact.event.actor === 'gordon' ? 'BONK!' : 'Filibustered!'} · Regaining stride`;
  const own = active.find(e => e.kind === 'boost');
  if (own) return `${POWERS[id].name} · active`;
  const hit = active.find(e => e.kind !== 'boost');
  if (hit) return hit.kind === 'assist' ? 'Mitten boost!' : `${POWERS[hit.event.actor].name} · slowed`;
  const moves=powerEvents(race).filter(e=>e.actor===id),used=moves.filter(e=>time>=e.time).length;
  const charges=race.simulation.specials?1:(race.cast.find(r=>r.id===id)?.upgrades?.powerReserve??0)>=5?2:1;
  const latest=moves.filter(e=>time>=e.time).at(-1);
  const cooling=race.simulation.manualPowers&&used<charges&&latest&&time<latest.time+Math.max(latest.duration,race.simulation.cooldown??4);
  return `${POWERS[id].name} · ${cooling?'recharging':used&&used<charges?'reserve ready':used?'used':'ready'}`;
}

/** Pure replay-time reaction; seeking never leaves a horse tilted or airborne. */
export function hitReaction(race, id, time) {
  const hit = activePowerEffects(race,id,time).find(e=>e.kind==='slow'&&e.event.impact);
  if(!hit)return {roll:0,lift:0};
  const t=time-hit.event.hitTime,big=Boolean(hit.event.spectacle),decay=Math.exp(-t*(big?1.1:2.5));
  return {roll:Math.sin(t*19)*(big?.35:.15)*decay,lift:Math.abs(Math.sin(t*13))*(big?.45:.22)*decay};
}
