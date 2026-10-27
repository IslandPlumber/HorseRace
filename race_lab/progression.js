/** Extensible, shared upgrade catalogue. The server owns levels, prices and purchases. */
export const UPGRADE_GROUPS = Object.freeze({horse:'Horse training',tack:'Tack & recovery',power:'Signature powers',stable:'Stable & mastery'});
export const UPGRADES = Object.freeze({
  gatecraft: {group:'horse',name:'Gate school',base:70,max:10,description:'Sharper reactions when the gates open.',effect:'2.5% quicker reactions per level.'},
  stride: {group:'horse',name:'Stride strength',base:90,max:10,description:'Build speed faster out of the gate and after a stumble.',effect:'4% more acceleration per level.'},
  cornering: {group:'horse',name:'Rail runner',base:85,max:10,description:'Keep more pace through all four corners.',effect:'4% less corner loss per level.'},
  conditioning: {group:'horse',name:'Long gallops',base:90,max:10,description:'Reduce the fatigue that builds late in the race.',effect:'2% less fatigue per level.'},
  finishing: {group:'horse',name:'Photo-finish kick',base:110,max:10,description:'Save a surge for the last stretch.',effect:'Up to 0.6% more late pace per level.'},
  drafting: {group:'horse',name:'Slipstream school',base:80,max:10,description:'Find extra pace tucked just behind another racer.',effect:'0.4% more pace per level while drafting.'},
  balance: {group:'horse',name:'Sure-footed',base:75,max:10,description:'Fewer rhythm breaks, with shorter interruptions.',effect:'4% fewer rhythm breaks and 3% shorter breaks per level.'},
  secondWind: {group:'horse',name:'Second wind',base:100,max:10,description:'Delay the point where fatigue starts to build.',effect:'Fatigue begins 0.7% of the course later per level.'},
  horseshoes: {group:'tack',name:'Lucky horseshoes',base:100,max:10,description:'Better grip and a small improvement to cruising pace.',effect:'0.2% more pace and 1% less corner loss per level.'},
  saddle: {group:'tack',name:'Shock-absorbing saddle',base:100,max:10,description:'Soften both the jolt and lingering slowdown from a heavy hit.',effect:'2.5% less heavy-hit damage per level.'},
  recovery: {group:'tack',name:'Bounce-back training',base:95,max:10,description:'Shake off attacks sooner and regain your stride faster.',effect:'2.5% shorter attacks; 4% more recovery acceleration per level.'},
  blinkers: {group:'tack',name:'Distraction blinkers',base:95,max:10,description:'Keep more pace when another rider targets you.',effect:'2.5% less incoming slowdown per level.'},
  powerPotency: {group:'power',name:'Power punch',base:130,max:10,description:'Strengthen your signature boost, distraction or impact.',effect:'2% more power strength per level, within race effect caps.'},
  powerDuration: {group:'power',name:'Make it last',base:120,max:10,description:'Extend your signature boost and its effect on targets.',effect:'2.5% longer power effects per level.'},
  powerReach: {group:'power',name:'Delivery service',base:110,max:10,description:'Reach a wider pack and deliver attacks faster when you choose to use them.',effect:'1 metre more area range and faster delivery per level.'},
  powerReserve: {group:'power',name:'Power budget',base:250,max:5,description:'Make your single big move last longer and cost fewer coins.',effect:'4% longer self boost and 5 fewer coins per use per level. One use per race.'},
  powerDiscipline: {group:'power',name:'Keep your cool',base:100,max:10,description:'Turn your active power into steadier, cleaner running.',effect:'0.4% more pace, 8% less rhythm loss and 3% less corner loss per level during your boost.'},
  prizeBonus: {group:'stable',name:'Club purse bonus',base:90,max:10,description:'Earn a bigger prize for your own finishing place.',effect:'4% larger finish prize per level; bet returns and points stay the same.'},
  trainingDiscount: {group:'stable',name:'Training co-op',base:100,max:10,description:'Save coins on other workshop purchases.',effect:'1.5% lower workshop prices per level; excludes this path and the original three skills.'},
  mastery: {group:'stable',name:'Lifetime stable mastery',base:500,max:null,description:'Keep building your stable rank after the other paths are complete. No reset required.',effect:'Repeatable ranks with diminishing pace gains, approaching a total 3% bonus.'},
});

export function normalizeUpgrades(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid workshop levels.');
  const result={};
  for(const [kind,level] of Object.entries(input)){
    if(!Object.hasOwn(UPGRADES,kind)||!Number.isSafeInteger(level)||level<0||level>(UPGRADES[kind].max??Number.MAX_SAFE_INTEGER))throw Error('Invalid workshop level.');
    if(level)result[kind]=level;
  }
  return result;
}
export function upgradeCost(kind,level,levels={}) {
  const item=UPGRADES[kind];if(!item||!Number.isSafeInteger(level)||level<0)throw Error('Unknown workshop upgrade.');
  if(item.max!==null&&level>=item.max)return null;
  const discount=kind==='trainingDiscount'?0:Math.min(10,levels.trainingDiscount??0)*.015;
  const cost=Math.ceil(item.base*(level+1)**(kind==='mastery'?1.25:1.5)*(1-discount));
  return Number.isSafeInteger(cost)?cost:null;
}
export const masteryPace = level => .03*level/(level+25);
export const finishPrize = (base,levels) => Math.floor(base*(100+4*(levels?.prizeBonus??0))/100);
export function upgradeReadout(kind,level) {
  const text={gatecraft:`${(level*2.5).toFixed(1)}% quicker reaction`,stride:`+${level*4}% acceleration`,cornering:`${level*4}% less corner loss`,conditioning:`${level*2}% less fatigue`,finishing:`+${(level*.6).toFixed(1)}% late pace`,drafting:`+${(level*.4).toFixed(1)}% drafting pace`,balance:`${level*4}% fewer rhythm breaks`,secondWind:`fatigue starts at ${(42+level*.7).toFixed(1)}% of the course`,horseshoes:`+${(level*.2).toFixed(1)}% cruise pace`,saddle:`${(level*2.5).toFixed(1)}% softer heavy hits`,recovery:`${(level*2.5).toFixed(1)}% shorter attacks`,blinkers:`${(level*2.5).toFixed(1)}% less slowing`,powerPotency:`+${level*2}% power strength`,powerDuration:`+${(level*2.5).toFixed(1)}% effect duration`,powerReach:`+${level}m area reach`,powerReserve:`+${level*4}% boost duration · ${75-level*5} coins per use`,powerDiscipline:`+${(level*.4).toFixed(1)}% pace during your power`,prizeBonus:`+${level*4}% finish coins`,trainingDiscount:`${(level*1.5).toFixed(1)}% workshop discount`,mastery:`Rank ${level} · +${(masteryPace(level)*100).toFixed(3)}% pace`};
  return text[kind];
}
export function upgradeName(kind,horse) {
  if(kind!=='powerPotency')return UPGRADES[kind].name;
  return ({trump:'Reinforced red cap',elon:'Bigger rocket',biden:'Triple scoop',mcconnell:'Industrial paperwork',bernie:'Extra-warm mittens',gordon:'Cast-iron cookware',snoop:'Deeper groove'})[horse]??UPGRADES[kind].name;
}
