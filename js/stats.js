/* ══════════════════════════════════════════════
   STATS — tous les calculs
   ══════════════════════════════════════════════ */
const Stats = (() => {

  const SETTLED = ['won', 'lost', 'halfwon', 'halflost', 'void', 'cashout'];

  /* Profit net d'un pari.
     Freebet : mise non débitée → gagné = stake*(odds-1), perdu = 0. */
  function betProfit(b) {
    const s = b.stake || 0, o = b.totalOdds || 0;
    switch (b.status) {
      case 'won': return s * (o - 1);
      case 'lost': return b.isFreebet ? 0 : -s;
      case 'halfwon': return s * (o - 1) / 2;
      case 'halflost': return b.isFreebet ? 0 : -s / 2;
      case 'void': return 0;
      case 'cashout': return (b.cashoutAmount || 0) - (b.isFreebet ? 0 : s);
      default: return 0;
    }
  }

  function betPayout(b) {
    return betProfit(b) + (b.isFreebet ? 0 : (b.status !== 'pending' && b.status !== 'lost' ? b.stake : 0));
  }

  const isSettled = b => SETTLED.includes(b.status);
  const settledSortKey = b => b.settledAt || b.eventDate || b.betDate || b.createdAt;

  function currentBankroll(state) {
    return state.settings.initialBankroll + state.bets.filter(isSettled).reduce((a, b) => a + betProfit(b), 0);
  }

  /* Courbe bankroll : points chronologiques après chaque pari réglé */
  function bankrollCurve(state) {
    const settled = state.bets.filter(isSettled).slice().sort((a, b) => settledSortKey(a).localeCompare(settledSortKey(b)));
    let bk = state.settings.initialBankroll;
    const pts = [{ label: 'Départ', value: bk, date: null }];
    for (const b of settled) {
      bk += betProfit(b);
      pts.push({ label: shortLabel(b), value: +bk.toFixed(2), date: settledSortKey(b).slice(0, 10), bet: b });
    }
    return pts;
  }

  function shortLabel(b) {
    const s = b.selections[0] || {};
    return (s.pick || s.event || b.sport || 'Pari').slice(0, 28);
  }

  function maxDrawdown(curve) {
    let peak = -Infinity, mdd = 0, mddPct = 0;
    for (const p of curve) {
      if (p.value > peak) peak = p.value;
      const dd = peak - p.value;
      if (dd > mdd) { mdd = dd; mddPct = peak > 0 ? dd / peak * 100 : 0; }
    }
    return { value: mdd, pct: mddPct, peak: Math.max(...curve.map(p => p.value)) };
  }

  function streaks(state) {
    const settled = state.bets.filter(b => ['won', 'lost', 'halfwon', 'halflost'].includes(b.status))
      .sort((a, b) => settledSortKey(a).localeCompare(settledSortKey(b)));
    let bestW = 0, bestL = 0, cur = 0, curType = null;
    for (const b of settled) {
      const w = b.status === 'won' || b.status === 'halfwon';
      if ((w && curType === 'W') || (!w && curType === 'L')) cur++;
      else { cur = 1; curType = w ? 'W' : 'L'; }
      if (curType === 'W') bestW = Math.max(bestW, cur);
      else bestL = Math.max(bestL, cur);
    }
    return { bestWin: bestW, bestLoss: bestL, current: cur, currentType: curType };
  }

  function global(state) {
    const bets = state.bets;
    const settled = bets.filter(isSettled);
    const pending = bets.filter(b => b.status === 'pending');
    const decided = settled.filter(b => ['won', 'lost', 'halfwon', 'halflost'].includes(b.status));
    const wins = decided.filter(b => b.status === 'won' || b.status === 'halfwon');

    const totalStaked = settled.reduce((a, b) => a + (b.isFreebet ? 0 : b.stake), 0);
    const profit = settled.reduce((a, b) => a + betProfit(b), 0);
    const grossWin = settled.reduce((a, b) => a + Math.max(0, betProfit(b)), 0);
    const grossLoss = settled.reduce((a, b) => a + Math.min(0, betProfit(b)), 0);

    const profits = settled.map(betProfit);
    const mean = profits.length ? profit / profits.length : 0;
    const variance = profits.length > 1 ? profits.reduce((a, p) => a + (p - mean) ** 2, 0) / (profits.length - 1) : 0;

    const stakes = settled.map(b => b.stake).sort((a, b) => a - b);
    const median = stakes.length ? (stakes.length % 2 ? stakes[(stakes.length - 1) / 2] : (stakes[stakes.length / 2 - 1] + stakes[stakes.length / 2]) / 2) : 0;

    const curve = bankrollCurve(state);
    const dd = maxDrawdown(curve);
    const stk = streaks(state);

    // Meilleur/pire pari & jour
    let best = null, worst = null;
    for (const b of settled) {
      const p = betProfit(b);
      if (!best || p > betProfit(best)) best = b;
      if (!worst || p < betProfit(worst)) worst = b;
    }
    const byDay = {};
    for (const b of settled) {
      const d = settledSortKey(b).slice(0, 10);
      byDay[d] = (byDay[d] || 0) + betProfit(b);
    }
    const days = Object.entries(byDay);
    const bestDay = days.length ? days.reduce((a, b) => b[1] > a[1] ? b : a) : null;
    const worstDay = days.length ? days.reduce((a, b) => b[1] < a[1] ? b : a) : null;

    // CLV
    const clvBets = settled.filter(b => b.closingOdds > 1 && b.totalOdds > 1);
    const clvAvg = clvBets.length ? clvBets.reduce((a, b) => a + (b.totalOdds / b.closingOdds - 1), 0) / clvBets.length * 100 : null;
    const clvPos = clvBets.length ? clvBets.filter(b => b.totalOdds > b.closingOdds).length / clvBets.length * 100 : null;

    // Mois en cours
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthProfit = settled.filter(b => settledSortKey(b).slice(0, 7) === monthKey).reduce((a, b) => a + betProfit(b), 0);

    return {
      bankroll: currentBankroll(state),
      initial: state.settings.initialBankroll,
      profit, totalStaked,
      roi: state.settings.initialBankroll > 0 ? profit / state.settings.initialBankroll * 100 : 0,
      yield: totalStaked > 0 ? profit / totalStaked * 100 : 0,
      nTotal: bets.length, nSettled: settled.length, nPending: pending.length,
      nWon: wins.length, nDecided: decided.length,
      winrate: decided.length ? wins.length / decided.length * 100 : 0,
      avgStake: settled.length ? totalStaked / settled.length : 0,
      medianStake: median,
      avgStakePct: settled.filter(b => b.stakePercent != null).length
        ? settled.filter(b => b.stakePercent != null).reduce((a, b) => a + b.stakePercent, 0) / settled.filter(b => b.stakePercent != null).length : 0,
      avgOdds: settled.filter(b => b.totalOdds).length ? settled.reduce((a, b) => a + (b.totalOdds || 0), 0) / settled.filter(b => b.totalOdds).length : 0,
      avgOddsWon: wins.length ? wins.reduce((a, b) => a + (b.totalOdds || 0), 0) / wins.length : 0,
      exposure: pending.reduce((a, b) => a + (b.isFreebet ? 0 : b.stake), 0),
      potential: pending.reduce((a, b) => a + b.stake * ((b.totalOdds || 1) - 1), 0),
      evPerBet: mean, stdDev: Math.sqrt(variance),
      profitFactor: grossLoss < 0 ? grossWin / -grossLoss : (grossWin > 0 ? Infinity : 0),
      maxDD: dd, streaks: stk, curve,
      best, worst, bestDay, worstDay,
      clvAvg, clvPos, clvCount: clvBets.length,
      monthProfit
    };
  }

  /* ── Splits ─────────────────────────────────── */
  const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  function oddsRange(o) {
    if (!o) return 'Inconnue';
    if (o < 1.5) return '< 1.50';
    if (o < 2) return '1.50 – 1.99';
    if (o < 3) return '2.00 – 2.99';
    if (o < 5) return '3.00 – 4.99';
    return '≥ 5.00';
  }

  function splitKey(b, dim) {
    switch (dim) {
      case 'bookmaker': return b.bookmaker || 'Autre';
      case 'sport': return b.sport || 'Autre';
      case 'tipster': return b.tipster || 'Perso';
      case 'market': return b.betType === 'combine' ? 'Combiné' : (b.selections[0]?.market || 'Autre');
      case 'betType': return { simple: 'Simple', combine: 'Combiné', systeme: 'Système' }[b.betType] || b.betType;
      case 'oddsRange': return oddsRange(b.totalOdds);
      case 'live': return b.isLive ? 'Live' : 'Prématch';
      case 'confidence': return b.confidence ? '★'.repeat(b.confidence) : 'Non notée';
      case 'month': return settledSortKey(b).slice(0, 7);
      case 'weekday': return WEEKDAYS[new Date(settledSortKey(b)).getDay()];
      default: return 'Autre';
    }
  }

  function split(state, dim) {
    const groups = {};
    for (const b of state.bets.filter(isSettled)) {
      const k = splitKey(b, dim);
      if (!groups[k]) groups[k] = { key: k, n: 0, won: 0, decided: 0, staked: 0, profit: 0 };
      const g = groups[k];
      g.n++;
      g.staked += b.isFreebet ? 0 : b.stake;
      g.profit += betProfit(b);
      if (['won', 'lost', 'halfwon', 'halflost'].includes(b.status)) {
        g.decided++;
        if (b.status === 'won' || b.status === 'halfwon') g.won++;
      }
    }
    const arr = Object.values(groups).map(g => ({
      ...g,
      winrate: g.decided ? g.won / g.decided * 100 : 0,
      yield: g.staked > 0 ? g.profit / g.staked * 100 : 0
    }));
    if (dim === 'month') arr.sort((a, b) => a.key.localeCompare(b.key));
    else if (dim === 'weekday') arr.sort((a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key));
    else if (dim === 'oddsRange') {
      const order = ['< 1.50', '1.50 – 1.99', '2.00 – 2.99', '3.00 – 4.99', '≥ 5.00', 'Inconnue'];
      arr.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    else arr.sort((a, b) => b.profit - a.profit);
    return arr;
  }

  return { betProfit, betPayout, isSettled, settledSortKey, currentBankroll, bankrollCurve, global, split, oddsRange, WEEKDAYS };
})();
