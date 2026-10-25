import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Game} from './game.js';
import {ACTOR_IDS} from '../race-core.js';
import {BET_TYPES,ticketReturn} from '../betting.js';
function fixture(t){
 const dir=mkdtempSync(path.join(tmpdir(),'horserace-bets-'));let now=100000;
 const db=path.join(dir,'game.sqlite'),clock=()=>now;
 const g=new Game(db,{clock,bettingMs:1000,duration:10});
 const a=g.register('Alice','test-password-123').user,code=g.create(a.id);g.start(a.id,code);
 t.after(()=>{g.close();rmSync(dir,{recursive:true,force:true})});
 return {g,a,code,db,clock,advance:n=>now+=n};
}
test('Win pays only first; Place pays first or second; Show pays any top-three finish',t=>{
 for(let finish=1;finish<=7;finish++){
  const {g,a,code}=fixture(t),r=g.latest(code);
  for(const kind of Object.keys(BET_TYPES))g.bet(a.id,code,'elon',51,kind);
  const order=ACTOR_IDS.filter(id=>id!=='elon');order.splice(finish-1,0,'elon');
  g.settle(r,{outcome:order});
  const tickets=g.room(a.id,code).race.bets;
  for(const b of tickets)assert.equal(b.payout,finish<=BET_TYPES[b.kind].places?ticketReturn(51,BET_TYPES[b.kind].units):0);
  assert.equal(g.profile(a.id).coins,1000-153+tickets.reduce((n,b)=>n+b.payout,0)+g.room(a.id,code).race.results.find(e=>e.userId===a.id).prize);
 }
});
test('one ticket of each type locks independently and duplicate or invalid bets never charge coins',t=>{
 const {g,a,code}=fixture(t);
 g.bet(a.id,code,'elon',50,'win');g.bet(a.id,code,'trump',50,'place');g.bet(a.id,code,'snoop',51,'show');
 const before=g.profile(a.id).coins;
 for(const kind of ['win','place','show'])assert.throws(()=>g.bet(a.id,code,'biden',50,kind),/already/);
 for(const kind of ['__proto__','fourth',null,{},1])assert.throws(()=>g.bet(a.id,code,'elon',50,kind),/Win, Place or Show/);
 assert.equal(g.profile(a.id).coins,before);assert.equal(g.raceBets(g.latest(code).id,a.id).length,3);
});
test('multiple types share the same bankroll and exact cutoff; fractional Show returns round down',t=>{
 const {g,a,code,advance}=fixture(t);
 g.bet(a.id,code,'elon',500,'win');g.bet(a.id,code,'elon',500,'place');
 assert.throws(()=>g.bet(a.id,code,'elon',10,'show'),/Not enough/);
 assert.equal(g.profile(a.id).coins,0);assert.equal(g.raceBets(g.latest(code).id,a.id).length,2);
 advance(1000);assert.throws(()=>g.bet(a.id,code,'elon',10,'show'),/closed/);
 assert.equal(ticketReturn(11,150),16);assert.equal(ticketReturn(51,150),76);
});
test('typed tickets and all payouts survive restart without duplicate credits or private-bet leakage',t=>{
 const {g,a,code,db,clock,advance}=fixture(t);
 const b=g.register('Bobby','test-password-123').user;g.horse(b.id,'snoop');g.join(b.id,code);
 for(const kind of ['win','place','show'])g.bet(a.id,code,'elon',50,kind);
 assert.deepEqual(g.room(b.id,code).race.bets,[]);
 const pending=g.history(a.id)[0].bets;assert.equal(pending.length,3);assert.ok(pending.every(b=>b.payout===null&&b.place===null));
 const restored=new Game(db,{clock});
 try{
  assert.deepEqual(restored.history(a.id)[0].bets,pending);advance(20000);restored.tick();
  const after=restored.profile(a.id),history=restored.history(a.id);
  assert.equal(history[0].bets.length,3);assert.ok(history[0].bets.every(b=>b.payout!==null));
  restored.tick();g.tick();assert.deepEqual(restored.profile(a.id),after);assert.deepEqual(g.history(a.id),history);
 }finally{restored.close()}
});
test('legacy Win tickets remain unchanged and can coexist with new Place and Show tickets',t=>{
 const {g,a,code}=fixture(t),r=g.latest(code);
 g.run('INSERT INTO bets VALUES(?,?,?,?,?,NULL)','legacy-win',a.id,r.id,'elon',50);g.credit(a.id,-50,'Win bet',r.id);
 assert.throws(()=>g.bet(a.id,code,'elon',50,'win'),/already/);
 g.bet(a.id,code,'elon',50,'place');g.bet(a.id,code,'elon',50,'show');
 const order=['elon',...ACTOR_IDS.filter(h=>h!=='elon')];g.settle(r,{outcome:order});
 const legacy=g.one('SELECT * FROM bets WHERE id=?','legacy-win');assert.equal(legacy.payout,200);
 const tickets=g.history(a.id)[0].bets;assert.deepEqual(tickets.map(b=>[b.kind,b.payout]),[['win',200],['place',100],['show',75]]);
 const balance=g.profile(a.id).coins;g.settle(r,{outcome:order});assert.equal(g.profile(a.id).coins,balance);
 assert.deepEqual(g.one('SELECT * FROM bets WHERE id=?','legacy-win'),legacy);
});
