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
  return {
    id: r.id, roomCode: room.code, number: r.number, phase: r.phase, starts: r.starts,
    ownHorse: r.entrants.find((e) => e.userId === user.id)?.horse ?? null,
    place: finish?.place ?? null, prize: finish?.prize ?? 0, points: finish?.points ?? 0,
    winner: r.results?.[0]?.horse ?? null,
    bet: r.bet ? { ...r.bet, net: r.bet.payout === null ? null : r.bet.payout - r.bet.stake,
      status: r.bet.payout === null ? "pending" : r.bet.payout > 0 ? "won" : "lost" } : null,
    netCoins: (finish?.prize ?? 0) + (r.bet?.payout ?? 0) - (r.bet?.stake ?? 0),
  };
}
export function betSlip(round) {
  const settled = round.phase === "results";
  const status = round.bet?.status ?? "none";
  const card = el("article", `bet-slip bet-${status}`);
  card.dataset.raceId = round.id;
  card.dataset.betStatus = status;
  const heading = el("div", "slip-heading");
  heading.append(el("h4", "", `Race ${round.number}`),
    el("span", `bet-status status-${status}`, round.bet ? status === "won" ? "Bet won" : status === "lost" ? "Bet lost" : "Locked in" : "No bet"));
  const date = new Date(round.starts);
  const stamp = el("time", "slip-date", `Room ${round.roomCode} · ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
  stamp.dateTime = date.toISOString();
  card.append(heading, stamp);
  if (round.bet) {
    const pick = el("p", "slip-pick");
    pick.append(el("strong", "", riderName(round.bet.horse)), el("span", "", `${coins(round.bet.stake)} coins to win`));
    card.append(pick);
  } else card.append(el("p", "slip-pick", settled ? "You did not place a bet this round." : "Optional win bet · place your pick before betting closes."));
  if (settled) card.append(el("p", "slip-winner", `Winner: ${riderName(round.winner)}`));
  const metrics = el("dl", "slip-metrics");
  metrics.append(
    metric("Bet return", round.bet ? round.bet.payout === null ? "Pending" : `${coins(round.bet.payout)} coins` : "—"),
    metric("Bet profit / loss", round.bet ? round.bet.net === null ? "Pending" : `${signed(round.bet.net)} coins` : "—", round.bet?.net > 0 ? "positive" : round.bet?.net < 0 ? "negative" : ""),
    metric("Your rider", riderName(round.ownHorse)),
    metric("Your finish", settled ? `${placeName(round.place)} · +${round.points} pts` : "Pending"),
    metric("Finish prize", settled ? `+${coins(round.prize)} coins` : "Pending"),
  );
  card.append(metrics);
  const total = el("div", "slip-total");
  total.append(el("span", "", settled ? "Round total" : "Stake paid"), el("strong", "", `${signed(round.netCoins)} coins`));
  card.append(total);
  const equation = settled
    ? `${round.bet ? `−${coins(round.bet.stake)} stake + ${coins(round.bet.payout)} bet return + ` : ""}${coins(round.prize)} finish prize = ${signed(round.netCoins)} coins`
    : "Bet returns and finish prizes are added when the race ends.";
  card.append(el("p", "slip-equation", equation));
  return card;
}
export function historyList(container, rounds, { filter = "all", visible = 6 } = {}) {
  const filtered = rounds.filter((r) => filter === "all" || (r.bet?.status ?? "none") === filter);
  container.replaceChildren(...filtered.slice(0, visible).map(betSlip));
  if (!filtered.length) container.append(el("p", "history-empty", rounds.length ? "No rounds match this filter." : "Your saved bet slips and race prizes will appear here after you join a round."));
  return filtered.length;
}
