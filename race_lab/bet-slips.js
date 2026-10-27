import { BET_TYPES, roundBets, betStatus, ticketReturn, returnLabel } from "./betting.js";
const HORSES = {
  trump: "Donald Trump", biden: "Joe Biden", mcconnell: "Mitch McConnell",
  bernie: "Bernie Sanders", elon: "Elon Musk", gordon: "Gordon Ramsay", snoop: "Snoop Dogg",
};
export const riderName = (id) => HORSES[id] ?? "Not entered";
const coins = (n) => Number(n).toLocaleString();
const signed = (n) => `${n >= 0 ? "+" : "−"}${coins(Math.abs(n))}`;
const placeName = (n) => n ? `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}` : "Not entered";
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function metric(label, value, className = "") {
  const group = el("div", className);
  group.append(el("dt", "", label), el("dd", "", value));
  return group;
}
export function roundFromRoom(room, user) {
  const r = room.race;
  const finish = r.results?.find((e) => e.userId === user.id);
  const bets = roundBets(r);
  return {
    id: r.id, roomCode: room.code, number: r.number, phase: r.phase, starts: r.starts,
    ownHorse: r.entrants.find((e) => e.userId === user.id)?.horse ?? null,
    place: finish?.place ?? null, prize: finish?.prize ?? 0, points: finish?.points ?? 0,
    winner: r.results?.[0]?.horse ?? null,
    bets,
    powerSpent:r.powerSpent??0,
    bet: r.bet ? { ...r.bet, net: r.bet.payout === null ? null : r.bet.payout - r.bet.stake,
      status: r.bet.payout === null ? "pending" : r.bet.payout > 0 ? "won" : "lost" } : null,
    netCoins: (finish?.prize ?? 0) + bets.reduce((n, b) => n + (b.payout ?? 0) - b.stake, 0)-(r.powerSpent??0),
  };
}
export function betSlip(round) {
  const settled = round.phase === "results";
  const bets = roundBets(round), status = betStatus(bets);
  const stake = bets.reduce((n,b) => n+b.stake,0);
  const payout = bets.reduce((n,b) => n+(b.payout ?? 0),0), net = payout-stake;
  const won = bets.filter((b) => b.payout > 0).length;
  const card = el("article", `bet-slip bet-${status}`);
  card.dataset.raceId = round.id;
  card.dataset.betStatus = status;
  const heading = el("div", "slip-heading");
  heading.append(el("h4", "", `Race ${round.number}`),
    el("span", `bet-status status-${status}`, bets.length ? status === "pending" ? `Locked in${bets.length > 1 ? ` · ${bets.length} bets` : ""}` : bets.length > 1 ? `${won} of ${bets.length} bets won` : status === "won" ? "Bet won" : "Bet lost" : "No bet"));
  const date = new Date(round.starts);
  const stamp = el("time", "slip-date", `Room ${round.roomCode} · ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
  stamp.dateTime = date.toISOString();
  card.append(heading, stamp);
  if (bets.length) for (const bet of bets) {
    const type = BET_TYPES[bet.kind ?? "win"], units = bet.returnUnits ?? 400;
    const pick = el("p", "slip-pick");
    pick.dataset.betKind = bet.kind ?? "win";
    pick.append(el("strong", "", `${type.label} · ${riderName(bet.horse)}`),
      el("span", "", `${coins(bet.stake)} coins · ${type.condition} · ${returnLabel(units)} return`),
      el("span", `ticket-result ${bet.payout === null ? "" : bet.payout > 0 ? "positive" : "negative"}`,
        bet.payout === null ? `Potential return: ${coins(ticketReturn(bet.stake, units))} coins` :
        `${bet.place ? `${placeName(bet.place)} · ` : ""}${bet.payout > 0 ? "Won" : "Lost"} · ${coins(bet.payout)} coins returned`));
    card.append(pick);
  } else card.append(el("p", "slip-pick", settled ? "You did not place a bet this round." : round.phase === "betting" ? "Optional Win, Place or Show bets · place your picks before betting closes." : "No bet placed · betting is closed for this race."));
  if (settled) card.append(el("p", "slip-winner", `Winner: ${riderName(round.winner)}`));
  const metrics = el("dl", "slip-metrics");
  metrics.append(
    metric("Bet return", bets.length ? status === "pending" ? "Pending" : `${coins(payout)} coins` : "—"),
    metric("Bet profit / loss", bets.length ? status === "pending" ? "Pending" : `${signed(net)} coins` : "—", settled && net > 0 ? "positive" : settled && net < 0 ? "negative" : ""),
    metric("Your rider", riderName(round.ownHorse)),
    metric("Your finish", settled ? `${placeName(round.place)} · +${round.points} pts` : "Pending"),
    metric("Finish prize", settled ? `+${coins(round.prize)} coins` : "Pending"),
  );
  card.append(metrics);
  if(round.powerSpent)card.append(el('p','slip-power-cost',`Special power used · −${coins(round.powerSpent)} coins`));
  const total = el("div", "slip-total");
  total.append(el("span", "", settled ? "Round total" : round.powerSpent ? "Coins spent so far" : bets.length ? "Stakes paid" : "Race prize pending"), el("strong", "", !settled && !bets.length && !round.powerSpent ? "Pending" : `${signed(round.netCoins)} coins`));
  card.append(total);
  const equation = settled
    ? `${bets.length ? `−${coins(stake)} stakes + ${coins(payout)} bet return + ` : ""}${coins(round.prize)} finish prize${round.powerSpent?` − ${coins(round.powerSpent)} power`:''} = ${signed(round.netCoins)} coins`
    : "Bet returns and finish prizes are added when the race ends.";
  card.append(el("p", "slip-equation", equation));
  return card;
}
export function historyList(container, rounds, { filter = "all", visible = 6 } = {}) {
  const filtered = rounds.filter((r) => {
    const bets = roundBets(r);
    return bets.length>0 && (filter === "all" || bets.some((b) =>
      (b.status ?? (b.payout === null ? "pending" : b.payout > 0 ? "won" : "lost")) === filter));
  });
  container.replaceChildren(...filtered.slice(0, visible).map(betSlip));
  if (!filtered.length) container.append(el("p", "history-empty", rounds.length ? "No bets match this filter." : "No bets yet. Place a bet to save your first slip."));
  return filtered.length;
}
