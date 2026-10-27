import {riderName} from './bet-slips.js';
const HORSES=['trump','biden','mcconnell','bernie','elon','gordon','snoop'];
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export class RoomBrowser {
 constructor(root,{join,refresh}){
  this.root=root;this.join=join;this.picks=new Map();
  root.innerHTML='<div class="room-directory-heading"><h4>Rooms online</h4><button id="mp-find" class="button quiet">Refresh</button></div><p id="mp-online" class="club-note" role="status">Looking for other racers…</p><label class="room-filter"><input id="mp-online-only" type="checkbox" checked> Online rooms only</label><p id="mp-switch-note" class="club-note" hidden>Finish your current race before switching rooms. Your bet and prizes stay safe.</p><div id="mp-rooms" class="room-directory-list"></div>';
  root.querySelector('#mp-find').onclick=refresh;
  root.querySelector('#mp-online-only').onchange=()=>{this.signature=null;this.render(this.data,this.state);};
 }
 render(data={rooms:[],online:0},state={}){
  this.data=data;this.state=state;
  const onlineOnly=this.root.querySelector('#mp-online-only').checked;
  const signature=JSON.stringify([data,state,onlineOnly]);
  if(signature===this.signature)return;this.signature=signature;
  this.root.querySelector('#mp-online').textContent=`${data.online??0} ${(data.online??0)===1?'racer':'racers'} online · live room list`;
  this.root.querySelector('#mp-switch-note').hidden=!state.locked;
  const list=this.root.querySelector('#mp-rooms');list.replaceChildren();
  const rooms=(data.rooms??[]).filter(r=>!onlineOnly||r.main||r.online>0||r.code===state.currentCode);
  for(const room of rooms){
   const own=room.code===state.currentCode,full=room.players>=room.capacity;
   const card=make('article','room-card'+(own?' room-current':''));card.dataset.roomCode=room.code;
   const heading=make('div','room-card-heading');heading.append(make('strong','',room.main?'Main room':room.code),make('span','room-phase',own?'Your room':room.phase==='racing'?'Race live':room.phase==='betting'?'Betting open':'Ready to race'));card.append(heading);
   card.append(make('p','room-occupancy',`${room.online} online · ${room.players}/${room.capacity} places`));
   card.append(make('p','room-people',room.members.map(m=>m.username+(m.online?'':' (away)')).join(' · ')));
   if(!own){
    const available=HORSES.filter(h=>!room.members.some(m=>m.horse===h));
    const label=make('label','field','Join as');const select=make('select');select.setAttribute('aria-label',`Rider for room ${room.code}`);
    for(const horse of available){const option=make('option','',riderName(horse));option.value=horse;select.append(option);}
    select.value=available.includes(this.picks.get(room.code))?this.picks.get(room.code):available.includes(state.horse)?state.horse:available[0]??'';
    select.onchange=()=>this.picks.set(room.code,select.value);
    select.disabled=Boolean(state.locked||state.busy||full||!state.online);
    label.append(select);
    const button=make('button','button primary',full?'Room full':['racing','betting'].includes(room.phase)?'Join next round':'Join room');button.type='button';
    button.setAttribute('aria-label',`${button.textContent} ${room.code}`);
    button.disabled=select.disabled||!available.length;
    button.onclick=()=>this.join(room.code,select.value);
    const actions=make('div','room-join-actions');actions.append(label,button);card.append(actions);
   }
   list.append(card);
  }
  if(!rooms.length)list.append(make('p','club-note','No other rooms online. New players join the main room automatically.'));
 }
}
