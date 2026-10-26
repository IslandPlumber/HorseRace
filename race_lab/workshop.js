import {UPGRADES,UPGRADE_GROUPS,upgradeCost,upgradeName,upgradeReadout} from './progression.js';

export class WorkshopUI {
  constructor(root,{buy}) {
    this.root=root;this.buy=buy;this.group='horse';this.signature='';
    root.innerHTML='<div class="workshop-heading"><div><p class="eyebrow">BUILD YOUR OWN RACING STYLE</p><h3>Horse & power workshop</h3><p class="club-note">20 new upgrade paths. Purchases follow your account when you change riders. Your original Speed, Stamina and Focus stay in your stable.</p></div><strong id="workshop-wallet"></strong></div><p id="workshop-status" class="club-note" role="status"></p><div class="workshop-tabs" role="tablist" aria-label="Upgrade categories"></div><div class="workshop-grid" id="workshop-cards" role="tabpanel"></div>';
    const tabs=root.querySelector('.workshop-tabs');
    for(const [id,name] of Object.entries(UPGRADE_GROUPS)){
      const button=document.createElement('button');button.type='button';button.className='button quiet';button.textContent=name;button.dataset.group=id;button.id=`workshop-tab-${id}`;button.setAttribute('role','tab');button.setAttribute('aria-controls','workshop-cards');
      button.onclick=()=>{this.group=id;this.signature='';this.render(this.state);};
      button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const ids=Object.keys(UPGRADE_GROUPS),at=ids.indexOf(id),next=e.key==='Home'?0:e.key==='End'?ids.length-1:(at+(e.key==='ArrowRight'?1:-1)+ids.length)%ids.length;tabs.children[next].click();tabs.children[next].focus();};tabs.append(button);
    }
  }
  render(state) {
    if(!state)return;this.state=state;const {user,locked,busy,online}=state,levels=user.upgrades??{};
    const signature=JSON.stringify([user.id,user.horse,user.coins,levels,locked,busy,online,this.group]);if(signature===this.signature)return;this.signature=signature;
    this.root.querySelector('#workshop-wallet').textContent=`${user.coins.toLocaleString()} coins`;
    this.root.querySelector('#workshop-status').textContent=!online?'Reconnect to buy upgrades.':locked?'This round’s build is locked. Buy upgrades after the prizes are saved.':'Every purchase has a real effect. Pick a specialty, protect against rivals, or build your powers. Costs rise with each level.';
    for(const button of this.root.querySelectorAll('[role=tab]')){const selected=button.dataset.group===this.group;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    const cards=this.root.querySelector('#workshop-cards');cards.setAttribute('aria-labelledby',`workshop-tab-${this.group}`);
    cards.replaceChildren(...Object.entries(UPGRADES).filter(([,item])=>item.group===this.group).map(([kind,item])=>{
      const level=levels[kind]??0,cost=upgradeCost(kind,level,levels),card=document.createElement('article');card.className='workshop-card';card.dataset.upgrade=kind;card.dataset.level=String(level);
      const heading=document.createElement('h4');heading.textContent=upgradeName(kind,user.horse);
      const rank=document.createElement('span');rank.className='workshop-level';rank.textContent=item.max===null?`Mastery rank ${level} · repeatable`:`Level ${level} / ${item.max}`;
      const description=document.createElement('p');description.textContent=item.description;
      const current=document.createElement('p');current.className='workshop-current';current.textContent=`Now: ${upgradeReadout(kind,level)}`;
      const next=document.createElement('p');next.className='workshop-next';next.textContent=cost===null?'This path is complete.':`Next: ${upgradeReadout(kind,level+1)}`;
      const detail=document.createElement('p');detail.className='workshop-detail';detail.textContent=item.effect;
      const button=document.createElement('button');button.type='button';button.className='button primary';button.textContent=cost===null?'Complete':`Upgrade · ${cost.toLocaleString()} coins`;button.setAttribute('aria-label',cost===null?`${item.name} complete`:`Upgrade ${item.name} to level ${level+1} for ${cost} coins`);button.disabled=locked||busy||!online||cost===null||user.coins<cost;
      button.onclick=()=>this.buy(kind,level);card.append(rank,heading,description,current,next,detail,button);return card;
    }));
  }
}
