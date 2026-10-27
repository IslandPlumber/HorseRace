/** Countdown follows the last verified server clock, never a local restart. */
export function raceBettingState(race, { now, connected, hasChoices = true } = {}) {
  if (!connected) return { state: "offline", title: "Connection lost", detail: "Reconnect to confirm betting status.", seconds: null, canBet: false };
  if (!race) return { state: "waiting", title: "Waiting for the host", detail: "Betting opens when the host starts a round.", seconds: null, canBet: false };
  if (race.phase === "betting") {
    const seconds = Math.max(0, Math.ceil((race.closes - now) / 1000));
    return seconds ? { state: "open", title: "Bets open", detail: hasChoices ? "Place Win, Place or Show bets before the countdown ends." : "Your Win, Place and Show bets are locked in.", seconds, canBet: hasChoices }
      : { state: "closed", title: "Bets closed", detail: "Preparing the shared race. No more bets this round.", seconds: null, canBet: false };
  }
  if (race.phase === "results") return { state: "finished", title: "Race complete", detail: "Bets settled · prizes and progress saved.", seconds: null, canBet: false };
  const gates = Math.max(0, Math.ceil((race.starts + (race.definition?.startDelay ?? 0) * 1000 - now) / 1000));
  return { state: "closed", title: "Bets closed", detail: gates ? `Gates open in ${gates}s · all bets are final.` : "Race live · all bets are final.", seconds: null, canBet: false };
}
export class RaceBettingBanner {
  constructor(container, onBet) {
    this.container = container;
    container.innerHTML = '<div><strong id="race-bet-status" role="status"></strong><p id="race-bet-detail"></p></div><strong id="race-bet-countdown" aria-label="Seconds left to place bets"></strong><button id="race-place-bet" class="button primary">Place bets</button>';
    this.title = container.querySelector('#race-bet-status');
    this.detail = container.querySelector('#race-bet-detail');
    this.counter = container.querySelector('#race-bet-countdown');
    this.button = container.querySelector('button');
    this.button.onclick = onBet;
  }
  render(room, options) {
    this.container.hidden = !room;
    if (!room) return;
    const state = raceBettingState(room.race, options);
    this.container.dataset.state = state.state;
    if (this.title.textContent !== state.title) this.title.textContent = state.title;
    if (this.detail.textContent !== state.detail) this.detail.textContent = state.detail;
    this.counter.textContent = state.seconds === null ? '' : `${state.seconds}s`;
    this.counter.hidden = state.seconds === null;
    this.button.hidden = !state.canBet;
    this.button.disabled = !state.canBet;
  }
}
