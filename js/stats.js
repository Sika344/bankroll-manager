/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — calculs (BK.Stats)
   Profit, bankroll, courbe, drawdown, séries, découpages classiques ET
   découpages « Lecture MatchUp » (value, style, surface, circuit, prix…).

   Garde-fou d'échantillon, même règle que le reste du produit : sous 5 paris
   on ne donne JAMAIS de pourcentage (juste « 2/3 »), et sous 20 le chiffre est
   marqué fragile. Un yield de +80 % sur 4 paris n'apprend rien à personne.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U;

  var MIN_PCT = 5, FRAGILE = 20;
  var SETTLED = ['won', 'lost', 'halfwon', 'halflost', 'void', 'cashout'];
  var DECIDED = ['won', 'lost', 'halfwon', 'halflost'];

  function isSettled(b) { return SETTLED.indexOf(b.status) !== -1; }
  function oddsOf(b) { return U.num(b.settledOdds) || U.num(b.totalOdds) || 0; }

  /** Profit net. Freebet : la mise n'est pas débitée (perdu = 0, gagné = mise × (cote − 1)). */
  function betProfit(b) {
    var s = U.num(b.stake) || 0, o = oddsOf(b);
    switch (b.status) {
      case 'won': return s * (o - 1);
      case 'lost': return b.isFreebet ? 0 : -s;
      case 'halfwon': return s * (o - 1) / 2;
      case 'halflost': return b.isFreebet ? 0 : -s / 2;
      case 'void': return 0;
      case 'cashout': return (U.num(b.cashoutAmount) || 0) - (b.isFreebet ? 0 : s);
      default: return 0;
    }
  }
  function realStake(b) { return b.isFreebet ? 0 : (U.num(b.stake) || 0); }
  function sortKey(b) { return String(b.settledAt || b.eventDate || b.betDate || b.createdAt || ''); }

  function initial(state) { return U.num(state.settings && state.settings.initialBankroll) || 0; }

  function currentBankroll(state) {
    return initial(state) + state.bets.filter(isSettled).reduce(function (a, b) { return a + betProfit(b); }, 0);
  }

  function curve(state) {
    var bk = initial(state);
    var pts = [{ value: bk, date: null, bet: null }];
    state.bets.filter(isSettled).slice().sort(function (a, b) { return sortKey(a).localeCompare(sortKey(b)); })
      .forEach(function (b) {
        bk += betProfit(b);
        pts.push({ value: +bk.toFixed(2), date: sortKey(b).slice(0, 10), bet: b });
      });
    return pts;
  }

  function maxDrawdown(pts) {
    var peak = -Infinity, mdd = 0, pct = 0;
    pts.forEach(function (p) {
      if (p.value > peak) peak = p.value;
      var dd = peak - p.value;
      if (dd > mdd) { mdd = dd; pct = peak > 0 ? dd / peak * 100 : 0; }
    });
    return { value: mdd, pct: pct };
  }

  function streaks(state) {
    var bestW = 0, bestL = 0, cur = 0, type = null;
    state.bets.filter(function (b) { return DECIDED.indexOf(b.status) !== -1; })
      .sort(function (a, b) { return sortKey(a).localeCompare(sortKey(b)); })
      .forEach(function (b) {
        var w = b.status === 'won' || b.status === 'halfwon';
        if ((w && type === 'W') || (!w && type === 'L')) cur++;
        else { cur = 1; type = w ? 'W' : 'L'; }
        if (type === 'W') bestW = Math.max(bestW, cur); else bestL = Math.max(bestL, cur);
      });
    return { bestWin: bestW, bestLoss: bestL, current: cur, type: type };
  }

  /* ── Lecture MatchUp : ce que la photo du match dit du pari ───────────── */
  function single(b) { return b.selections && b.selections.length === 1 ? b.selections[0] : null; }
  var SIDE_TYPES = ['winner', 'set1', 'win_a_set', 'games_hcp', 'sets_hcp', 'set_score'];
  function side(sel) { return sel && sel.mk && SIDE_TYPES.indexOf(sel.mk.type) !== -1 ? sel.mk.side : null; }

  /** true = dans le sens de la value MatchUp, false = contre, null = pas de signal / sans objet. */
  function follows(sel) {
    var s = side(sel), mu = sel && sel.mu;
    if (!s || !mu || !mu.signal || !mu.valueSide) return null;
    return mu.valueSide === s;
  }
  function sideVal(mu, s, arrKey) {
    if (!mu || !s || !mu[arrKey]) return null;
    var v = mu[arrKey][s === 'A' ? 0 : 1];
    return v == null ? null : v;
  }
  /** Proba du marché (Pinnacle) du joueur choisi au moment de l'ajout. */
  function pMarket(sel) { return sideVal(sel.mu, side(sel), 'pMkt'); }

  /** CLV : cote obtenue / cote de clôture du marché − 1 (marché vainqueur seulement). */
  function clvOf(b) {
    var sel = single(b), s = side(sel);
    if (sel && s && sel.mk.type === 'winner' && sel.mu && sel.mu.closing) {
      var close = sideVal(sel.mu.closing, s, 'mkt') || sideVal(sel.mu.closing, s, 'odds');
      var taken = U.num(sel.odds) || oddsOf(b);
      if (close > 1 && taken > 1 && !b.isBoost) return taken / close - 1;
    }
    var c = U.num(b.closingOdds), t = oddsOf(b);
    return c > 1 && t > 1 ? t / c - 1 : null;
  }

  var SURF = { Hard: 'Dur', Clay: 'Terre battue', Grass: 'Gazon', Carpet: 'Moquette' };
  var NON_VISIBLE = 'Analyse non visible';
  var MU_CACHE = ['muValue', 'muFav', 'muStyle', 'muPrice', 'muArch'];
  var ROUND_ORDER = ['Qualifications', 'Premiers tours', 'Quarts', 'Demies', 'Finale', 'Tour inconnu'];

  function muKey(b, dim) {
    if (b.selections && b.selections.length > 1) return 'Combinés';
    var sel = single(b), mu = sel && sel.mu;
    if (!mu) return 'Hors programme MatchUp';
    // Photo prise sur une carte RÉDUITE (sans abonnement) : value, style et cote
    // du marché y sont INCONNUS. Les ranger dans « sans value » ou « style
    // neutre » serait faux : on le dit.
    if (mu.full === false && MU_CACHE.indexOf(dim) !== -1) return NON_VISIBLE;
    switch (dim) {
      case 'muValue': {
        var f = follows(sel);
        return f === true ? 'Dans le sens de la value' : f === false ? 'Contre la value' : 'Sans value MatchUp';
      }
      case 'muSurface': {
        var s = SURF[mu.surface] || 'Surface inconnue';
        return s === 'Dur' && mu.indoor === true ? 'Dur (salle)' : s;
      }
      case 'muCircuit': return { ATP: 'ATP', CH: 'Challenger', WTA: 'WTA', ITF: 'ITF' }[mu.circuit] || 'Circuit inconnu';
      case 'muRound': return mu.roundGroup || 'Tour inconnu';
      case 'muFav': {
        var p = pMarket(sel);
        if (p == null) return side(sel) ? 'Cote marché inconnue' : 'Marché sans côté (totaux…)';
        return p >= 0.5 ? 'Favori du marché' : 'Outsider du marché';
      }
      case 'muStyle': {
        var e = sideVal(mu, side(sel), 'styleEdge');
        if (e == null) return side(sel) ? 'Style non mesuré' : 'Marché sans côté (totaux…)';
        // archetypeEdge (matrice style × style × surface) : médiane |0,047|,
        // max 0,19 sur le programme du 24/10. Sous 2 points : neutre.
        return e > 0.02 ? 'Le style favorise ton joueur' : e < -0.02 ? 'Le style le défavorise' : 'Style neutre';
      }
      case 'muPrice': {
        var mk = sideVal(mu, side(sel), 'mkt'), taken = U.num(sel.odds);
        if (!(sel.mk && sel.mk.type === 'winner') || !mk || !taken) return 'Prix non comparable';
        var r = taken / mk - 1;
        return r > 0.02 ? 'Mieux payé que le marché' : r < -0.02 ? 'Moins bien payé que le marché' : 'Au prix du marché';
      }
      case 'muMarket': return sel.mk ? (BK.Markets.LABEL[sel.mk.type] || 'Autre marché') : 'Autre marché';
      case 'muArch': return sideVal(mu, side(sel), 'arch') || (side(sel) ? 'Style inconnu' : 'Marché sans côté (totaux…)');
      default: return 'Autre';
    }
  }

  /* ── Découpages ───────────────────────────────────────────────────────── */
  var WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var ODDS_ORDER = ['< 1,50', '1,50 – 1,99', '2,00 – 2,99', '3,00 – 4,99', '≥ 5,00', 'Cote inconnue'];
  function oddsRange(o) {
    if (!o) return 'Cote inconnue';
    if (o < 1.5) return '< 1,50';
    if (o < 2) return '1,50 – 1,99';
    if (o < 3) return '2,00 – 2,99';
    if (o < 5) return '3,00 – 4,99';
    return '≥ 5,00';
  }

  function key(b, dim) {
    if (dim.indexOf('mu') === 0) return muKey(b, dim);
    var s0 = (b.selections || [])[0] || {};
    switch (dim) {
      case 'bookmaker': return b.bookmaker || 'Autre';
      case 'sport': return b.sport || 'Autre';
      case 'tipster': return b.tipster || 'Perso';
      case 'betType': return { simple: 'Simple', combine: 'Combiné', systeme: 'Système' }[b.betType] || 'Simple';
      case 'oddsRange': return oddsRange(oddsOf(b));
      case 'live': return b.isLive ? 'Live' : 'Avant-match';
      case 'confidence': return b.confidence ? '★'.repeat(b.confidence) : 'Non notée';
      case 'month': return sortKey(b).slice(0, 7);
      case 'weekday': return WEEKDAYS[new Date(sortKey(b).slice(0, 10) + 'T12:00:00Z').getUTCDay()] || '—';
      case 'market': return b.selections && b.selections.length > 1 ? 'Combiné' : (s0.mk ? BK.Markets.LABEL[s0.mk.type] : (s0.market || 'Autre'));
      case 'source': return { matchup: 'Programme MatchUp', ocr: 'Capture d\'écran', manual: 'Saisie manuelle', import: 'Import' }[b.source] || 'Saisie manuelle';
      default: return 'Autre';
    }
  }

  function decorate(g) {
    g.winrate = g.decided ? g.won / g.decided * 100 : null;
    g.yield = g.staked > 0 ? g.profit / g.staked * 100 : null;
    g.brut = g.n < MIN_PCT;
    g.fragile = g.n < FRAGILE;
    return g;
  }

  function split(state, dim, filter) {
    var groups = {};
    state.bets.filter(isSettled).filter(filter || function () { return true; }).forEach(function (b) {
      var k = key(b, dim);
      var g = groups[k] || (groups[k] = { key: k, n: 0, won: 0, decided: 0, staked: 0, profit: 0 });
      g.n++;
      g.staked += realStake(b);
      g.profit += betProfit(b);
      if (DECIDED.indexOf(b.status) !== -1) {
        g.decided++;
        if (b.status === 'won' || b.status === 'halfwon') g.won++;
      }
    });
    var arr = Object.keys(groups).map(function (k) { return decorate(groups[k]); });
    if (dim === 'month') arr.sort(function (a, b) { return a.key.localeCompare(b.key); });
    else if (dim === 'weekday') arr.sort(function (a, b) { return WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key); });
    else if (dim === 'oddsRange') arr.sort(function (a, b) { return ODDS_ORDER.indexOf(a.key) - ODDS_ORDER.indexOf(b.key); });
    else if (dim === 'muRound') arr.sort(function (a, b) { return ROUND_ORDER.indexOf(a.key) - ROUND_ORDER.indexOf(b.key); });
    else arr.sort(function (a, b) { return b.n - a.n || b.profit - a.profit; });
    return arr;
  }

  /* ── Vue d'ensemble ───────────────────────────────────────────────────── */
  function global(state) {
    var bets = state.bets, settled = bets.filter(isSettled);
    var pending = bets.filter(function (b) { return b.status === 'pending'; });
    var decided = settled.filter(function (b) { return DECIDED.indexOf(b.status) !== -1; });
    var wins = decided.filter(function (b) { return b.status === 'won' || b.status === 'halfwon'; });
    var staked = settled.reduce(function (a, b) { return a + realStake(b); }, 0);
    var profit = settled.reduce(function (a, b) { return a + betProfit(b); }, 0);
    var grossW = 0, grossL = 0;
    settled.forEach(function (b) { var p = betProfit(b); if (p > 0) grossW += p; else grossL += p; });
    var profits = settled.map(betProfit);
    var mean = profits.length ? profit / profits.length : 0;
    var variance = profits.length > 1 ? profits.reduce(function (a, p) { return a + (p - mean) * (p - mean); }, 0) / (profits.length - 1) : 0;
    var pts = curve(state), dd = maxDrawdown(pts);
    var withOdds = settled.filter(function (b) { return oddsOf(b) > 0; });
    var pctStakes = settled.filter(function (b) { return U.num(b.stakePercent) != null; });

    var best = null, worst = null;
    settled.forEach(function (b) {
      var p = betProfit(b);
      if (!best || p > betProfit(best)) best = b;
      if (!worst || p < betProfit(worst)) worst = b;
    });

    var clvs = settled.map(clvOf).filter(function (v) { return v != null; });
    var month = U.today().slice(0, 7);
    var monthBets = settled.filter(function (b) { return sortKey(b).slice(0, 7) === month; });
    var muBets = settled.filter(function (b) { var s = single(b); return s && s.mu; });

    var ini = initial(state);
    return {
      bankroll: ini + profit, initial: ini, profit: profit, staked: staked,
      growth: ini > 0 ? profit / ini * 100 : null,
      yield: staked > 0 ? profit / staked * 100 : null,
      nTotal: bets.length, nSettled: settled.length, nPending: pending.length,
      nWon: wins.length, nDecided: decided.length,
      winrate: decided.length ? wins.length / decided.length * 100 : null,
      avgStake: settled.length ? staked / settled.length : 0,
      avgStakePct: pctStakes.length ? pctStakes.reduce(function (a, b) { return a + U.num(b.stakePercent); }, 0) / pctStakes.length : null,
      avgOdds: withOdds.length ? withOdds.reduce(function (a, b) { return a + oddsOf(b); }, 0) / withOdds.length : null,
      exposure: pending.reduce(function (a, b) { return a + realStake(b); }, 0),
      potential: pending.reduce(function (a, b) { return a + (U.num(b.stake) || 0) * ((U.num(b.totalOdds) || 1) - 1); }, 0),
      evPerBet: mean, stdDev: Math.sqrt(variance),
      profitFactor: grossL < 0 ? grossW / -grossL : (grossW > 0 ? Infinity : null),
      maxDD: dd, streaks: streaks(state), curve: pts, best: best, worst: worst,
      clvAvg: clvs.length ? clvs.reduce(function (a, v) { return a + v; }, 0) / clvs.length * 100 : null,
      clvBeat: clvs.length ? clvs.filter(function (v) { return v > 0; }).length / clvs.length * 100 : null,
      clvN: clvs.length,
      monthProfit: monthBets.reduce(function (a, b) { return a + betProfit(b); }, 0),
      monthLoss: Math.min(0, monthBets.reduce(function (a, b) { return a + betProfit(b); }, 0)),
      nAuto: settled.filter(function (b) { return b.autoSettled; }).length,
      nMu: muBets.length
    };
  }

  BK.Stats = {
    MIN_PCT: MIN_PCT, FRAGILE: FRAGILE, WEEKDAYS: WEEKDAYS, NON_VISIBLE: NON_VISIBLE,
    isSettled: isSettled, betProfit: betProfit, oddsOf: oddsOf, realStake: realStake, sortKey: sortKey,
    currentBankroll: currentBankroll, curve: curve, maxDrawdown: maxDrawdown, streaks: streaks,
    follows: follows, side: side, clvOf: clvOf, key: key, split: split, global: global, oddsRange: oddsRange
  };
})(window.BK = window.BK || {});
