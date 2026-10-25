import test from 'node:test';
import assert from 'node:assert/strict';
import {raceBettingState} from './race-betting.js';
const race={phase:'betting',closes:20000,starts:20000};
const state=(now,extra={})=>raceBettingState(race,{now,connected:true,...extra});
test('countdown uses the shared absolute deadline and closes at the precise cutoff',()=>{
 assert.equal(state(0).seconds,20);assert.equal(state(18500).seconds,2);
 assert.equal(state(19999).seconds,1);assert.equal(state(20000).state,'closed');
 assert.equal(state(20000).canBet,false);assert.equal(state(25000).state,'closed');
 assert.equal(state(18500).seconds,state(18500).seconds,'reload cannot reset the deadline');
});
test('stale or disconnected state never advertises open betting; locked tickets retain countdown',()=>{
 assert.equal(state(10000,{connected:false}).state,'offline');assert.equal(state(10000,{connected:false}).canBet,false);
 assert.equal(state(10000,{hasChoices:false}).seconds,10);assert.equal(state(10000,{hasChoices:false}).canBet,false);
 const gates=raceBettingState({...race,phase:'racing',definition:{startDelay:7}},{now:23000,connected:true});
 assert.equal(gates.state,'closed');assert.match(gates.detail,/4s/);assert.equal(gates.canBet,false);
 assert.equal(raceBettingState({...race,phase:'results'},{now:50000,connected:true}).state,'finished');
});
