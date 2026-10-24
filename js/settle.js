/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — règlement automatique des paris tennis (BK.Settle)

   Réservé aux abonnés MatchUp qui ont connecté leur compte : la source est
   celle des pages MatchUp (api/data/recentHistory_v2 et recentHistory_wta,
   fichiers Premium), lue avec leur jeton. Sans abonnement, rien n'est
   téléchargé : le pari se règle d'un geste. Ligne = [aaaammjj, adversaire, tournoi, surface, score,
   tour, gagné(0/1)], le score étant écrit du point de vue du joueur de la
   ligne (fix_score_pov). Rien n'est ajouté au pipeline.

   Ce qui n'est JAMAIS réglé tout seul :
   - un abandon ou un forfait (« ret. », « W/O ») : la règle change d'un
     bookmaker à l'autre (un set joué ou non, joueur qualifié ou pari annulé).
     Le pari passe « à vérifier », avec le score, et l'abonné tranche ;
   - un score incohérent avec le drapeau de victoire (11 lignes ATP sur 44 406
     le 24/10) : on préfère ne rien dire que dire faux ;
   - un marché non structuré (« Autre ») : le résultat est montré, l'abonné
     règle ;
   - un pari système, un combiné à demi-résultat ou dont une cote manque.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U, M = BK.Markets;

  var FIN_MIN_MS = 75 * 60e3;     // pas de recherche avant 1 h 15 après le début
  var FENETRE = [-1, 4];          // jours : report, ou date décalée d'un jour (fuseaux)

  /* ── Score ────────────────────────────────────────────────────────────── */
  function validSet(a, b) {
    var w = Math.max(a, b), l = Math.min(a, b);
    if (w === 7 && l === 6) return true;
    return w >= 6 && w - l >= 2;
  }

  function parseScore(raw) {
    var s = String(raw == null ? '' : raw).trim();
    var ret = /\bret\b|ret\.|\babd\b|abandon|retired/i.test(s);
    var wo = /\bw\s*\/\s*o\b|walk\s*over|forfait/i.test(s);
    var def = /\bdef\b|def\.|disq/i.test(s);
    var sets = [], tb = [], m, re = /(\d{1,2})-(\d{1,2})(?:\((\d{1,2})\))?/g;
    while ((m = re.exec(s))) {
      var a = +m[1], b = +m[2];
      sets.push([a, b]);
      tb.push((a === 7 && b === 6) || (a === 6 && b === 7));
    }
    var won = 0, lost = 0;
    sets.forEach(function (x) { if (x[0] > x[1]) won++; else if (x[1] > x[0]) lost++; });
    var need = Math.max(won, lost) >= 3 ? 3 : 2;
    var complete = !ret && !wo && !def && sets.length >= 2 &&
      (won === need || lost === need) && won + lost === sets.length &&
      sets.every(function (x) { return validSet(x[0], x[1]); });
    return { raw: s, sets: sets, tb: tb, setsA: won, setsB: lost, bestOf: need === 3 ? 5 : 3,
      ret: ret, wo: wo, def: def, complete: complete };
  }

  function swap(sc) {
    return {
      raw: sc.raw, sets: sc.sets.map(function (x) { return [x[1], x[0]]; }), tb: sc.tb.slice(),
      setsA: sc.setsB, setsB: sc.setsA, bestOf: sc.bestOf, ret: sc.ret, wo: sc.wo, def: sc.def,
      complete: sc.complete, swapped: !sc.swapped
    };
  }

  function scoreText(sc) {
    var txt = sc.sets.map(function (x) { return x[0] + '-' + x[1]; }).join(' ');
    if (sc.wo) return (txt ? txt + ' ' : '') + 'forfait';
    if (sc.ret) return txt + ' ab.';
    return txt;
  }

  /* ── Évaluation d'un marché ───────────────────────────────────────────── */
  function signe(x) { return x > 1e-9 ? 'won' : x < -1e-9 ? 'lost' : 'void'; }
  function combine(a, b) {
    if (a === b) return a;
    var k = [a, b].sort().join('+');
    if (k === 'void+won') return 'halfwon';
    if (k === 'lost+void') return 'halflost';
    return null;
  }
  /** Lignes asiatiques en quart (−2,25 / 22,75) : la mise est coupée en deux. */
  function quart(line, f) {
    var q = Math.round(line * 4);
    if (Math.abs(q - line * 4) < 1e-9 && Math.abs(q) % 2 === 1) return combine(f(line - 0.25), f(line + 0.25));
    return f(line);
  }

  /** Résultat d'un marché structuré à partir du score vu du joueur A.
   *  'won' | 'lost' | 'void' | 'halfwon' | 'halflost' | null (non réglable). */
  function evaluate(mk, scA) {
    if (!M.valid(mk) || !scA || !scA.complete) return null;
    var sc = mk.side === 'B' ? swap(scA) : scA;
    var sf = 0, sa = 0, gf = 0, ga = 0;
    sc.sets.forEach(function (x) { gf += x[0]; ga += x[1]; if (x[0] > x[1]) sf++; else sa++; });
    switch (mk.type) {
      case 'winner': return sf > sa ? 'won' : 'lost';
      case 'set1': return sc.sets[0][0] > sc.sets[0][1] ? 'won' : 'lost';
      case 'win_a_set': return sf >= 1 ? 'won' : 'lost';
      case 'set_score': return (sf + '-' + sa) === mk.score ? 'won' : 'lost';
      case 'games_ou': return quart(mk.line, function (l) { var t = gf + ga; return signe(mk.ou === 'over' ? t - l : l - t); });
      case 'sets_ou': return quart(mk.line, function (l) { var n = sf + sa; return signe(mk.ou === 'over' ? n - l : l - n); });
      case 'games_hcp': return quart(mk.line, function (l) { return signe(gf + l - ga); });
      case 'sets_hcp': return quart(mk.line, function (l) { return signe(sf + l - sa); });
      case 'tiebreak': return sc.tb.some(Boolean) === mk.yes ? 'won' : 'lost';
      default: return null;
    }
  }

  /* ── Recherche du résultat ────────────────────────────────────────────── */
  function index(hist) {
    var m = new Map();
    if (!hist) return m;
    for (var k in hist) if (Object.prototype.hasOwnProperty.call(hist, k)) m.set(U.normName(k), hist[k]);
    return m;
  }
  function ymd(v) { var s = String(v); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }

  /** Lignes contre cet adversaire dans la fenêtre, la plus proche d'abord.
   *  {row, conflict} : conflict = plusieurs lignes qui ne disent pas la même
   *  chose. Vécu le 24/10 : Saraiva Dos Santos–Bennani (Brazzaville) existe
   *  DEUX fois le même jour, « 4-6 6-1 6-7(4) » perdu ET « 6-4 1-6 » gagné
   *  (homonyme scindé, §19sexies). Prendre la première aurait réglé au hasard. */
  function findRow(rows, opp, day) {
    var on = U.normName(opp), cands = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.length < 7 || U.normName(r[1]) !== on) continue;
      var d = U.dayDiff(day, ymd(r[0]));
      if (d < FENETRE[0] || d > FENETRE[1]) continue;
      cands.push({ row: r, d: Math.abs(d) });
    }
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.d - b.d; });
    var ref = cands[0].row, conflict = cands.some(function (c) {
      return String(c.row[6]) !== String(ref[6]) || String(c.row[4]).trim() !== String(ref[4]).trim();
    });
    return { row: ref, conflict: conflict };
  }

  /** {winner:'A'|'B', sc (vu de A), score (texte vu de A), date, coherent} ou null. */
  function lookup(idx, pa, pb, day) {
    if (!idx || !pa || !pb || !day) return null;
    var ra = idx.get(U.normName(pa)), rb = idx.get(U.normName(pb));
    var fa = ra ? findRow(ra, pb, day) : null, fb = rb ? findRow(rb, pa, day) : null;
    if (fa) {
      var res = build(fa, false);
      // Les deux joueurs ont une ligne : elles doivent se répondre (l'un a
      // gagné, l'autre a perdu). Sinon la base se contredit → à vérifier.
      if (fb && String(fb.row[6]) === String(fa.row[6])) { res.coherent = false; res.conflict = true; }
      return res;
    }
    if (fb) return build(fb, true);
    return null;
    function build(found, inverse) {
      var row = found.row;
      var sc = parseScore(row[4]);
      var gagne = row[6] === 1 || row[6] === '1' || row[6] === true;
      var scA = inverse ? swap(sc) : sc;
      var winner = (gagne !== inverse) ? 'A' : 'B';
      // Le drapeau de victoire doit dire la même chose que le score, et
      // aucune autre ligne du même match ne doit dire autre chose.
      var coherent = !found.conflict && (!sc.complete || ((sc.setsA > sc.setsB) === gagne));
      return { winner: winner, sc: scA, score: scoreText(scA), date: ymd(row[0]), coherent: coherent,
        conflict: found.conflict, tournament: row[2], round: row[5] };
    }
  }

  function circuitHist(mu) { return mu && (mu.circuit === 'WTA' || mu.circuit === 'ITF') ? 'wta' : 'atp'; }

  /** La sélection attend-elle un résultat qui peut exister maintenant ? */
  function attend(s, now) {
    if (!s || (s.result && s.result !== 'pending')) return false;
    var mu = s.mu;
    if (!mu || !mu.pa || !mu.pb || !mu.day) return false;
    if (mu.start) return now >= mu.start + FIN_MIN_MS;
    return U.dayDiff(mu.day, U.today(now)) >= 0;
  }

  /** Quels historiques charger : {atp: bool, wta: bool}. */
  function besoins(bets, now) {
    var need = { atp: false, wta: false };
    (bets || []).forEach(function (b) {
      if (b.status !== 'pending' || b.manualLock) return;
      (b.selections || []).forEach(function (s) { if (attend(s, now)) need[circuitHist(s.mu)] = true; });
    });
    return need;
  }

  function aggregate(bet, sels) {
    if (bet.betType === 'systeme') return null;
    var res = sels.map(function (s) { return s.result || 'pending'; });
    if (sels.length === 1) return res[0] !== 'pending' ? { status: res[0] } : null;
    if (res.indexOf('lost') !== -1) return { status: 'lost' };
    if (res.indexOf('pending') !== -1) return null;
    if (res.indexOf('halfwon') !== -1 || res.indexOf('halflost') !== -1) return null;
    var gagnees = sels.filter(function (s) { return s.result === 'won'; });
    if (!gagnees.length) return { status: 'void' };
    if (res.indexOf('void') === -1) return { status: 'won' };
    // Ligne remboursée : la cote du combiné est recalculée sur les lignes
    // gagnées. Sans toutes leurs cotes, on ne devine pas → réglage manuel.
    if (!gagnees.every(function (s) { return U.num(s.odds) > 1; })) return null;
    var o = gagnees.reduce(function (a, s) { return a * U.num(s.odds); }, 1);
    return { status: 'won', odds: +o.toFixed(3) };
  }

  function memeRevue(a, b) { return JSON.stringify(a || null) === JSON.stringify(b || null); }

  /**
   * Règle un pari si possible. Renvoie un patch {selections, status?, …} ou
   * null si rien ne change. idx = {atp: Map|null, wta: Map|null}.
   */
  function settleBet(bet, idx, now) {
    if (!bet || bet.status !== 'pending' || bet.manualLock) return null;
    var changed = false, dernier = null;
    var sels = (bet.selections || []).map(function (s) { return Object.assign({}, s); });
    sels.forEach(function (s) {
      if (!attend(s, now)) return;
      var r = lookup(idx[circuitHist(s.mu)], s.mu.pa, s.mu.pb, s.mu.day);
      if (!r) return;
      var revue = null;
      if (!r.coherent) revue = { reason: 'data', score: r.score, winner: r.winner, date: r.date };
      else if (!r.sc.complete) {
        // Abandon / forfait explicites, sinon score tronqué (« 6-4 1-6 » noté
        // gagné : la ligne existe dans la base) → jamais deviné.
        var why = r.sc.wo ? 'wo' : (r.sc.ret || r.sc.def) ? 'ret' : 'data';
        revue = { reason: why, score: r.score, winner: r.winner, date: r.date };
      }
      else if (!M.valid(s.mk)) revue = { reason: 'market', score: r.score, winner: r.winner, date: r.date };
      if (revue) {
        if (!memeRevue(s.review, revue)) { s.review = revue; changed = true; }
        return;
      }
      var res = evaluate(s.mk, r.sc);
      if (!res) return;
      s.result = res;
      s.settle = { by: 'matchup', at: new Date(now).toISOString(), score: r.score, date: r.date, winner: r.winner };
      delete s.review;
      changed = true;
      if (!dernier || r.date > dernier) dernier = r.date;
    });
    if (!changed) return null;
    var patch = { selections: sels };
    var agg = aggregate(bet, sels);
    if (agg) {
      patch.status = agg.status;
      patch.settledOdds = agg.odds || null;
      patch.settledAt = (dernier || U.today(now)) + 'T21:00:00.000Z';
      patch.autoSettled = true;
    }
    return patch;
  }

  /* ── Chargement des historiques (navigateur) ──────────────────────────── */
  var cache = { atp: null, wta: null, at: { atp: 0, wta: 0 }, err: { atp: null, wta: null } };
  var TTL = 15 * 60e3;
  var SRC = { atp: 'recentHistory_v2', wta: 'recentHistory_wta' };

  async function charger(qui) {
    if (cache[qui] && Date.now() - cache.at[qui] < TTL) return cache[qui];
    var data;
    try { data = await BK.MU.getData(SRC[qui], { auth: true }); }
    catch (e) {
      cache.err[qui] = e.message;
      throw new Error('Résultats ' + qui.toUpperCase() + ' indisponibles (' + e.message + ')');
    }
    cache[qui] = index(data);
    cache.at[qui] = Date.now();
    cache.err[qui] = null;
    return cache[qui];
  }

  /**
   * Passe sur tous les paris en attente. Renvoie {patches:[{id, patch}],
   * checked, errors:[…]}. Ne charge que les historiques nécessaires.
   */
  async function run(bets, now) {
    now = now || Date.now();
    var need = besoins(bets, now), idx = { atp: null, wta: null }, errors = [];
    for (var qui in need) {
      if (!need[qui]) continue;
      try { idx[qui] = await charger(qui); } catch (e) { errors.push(e.message); }
    }
    var patches = [];
    (bets || []).forEach(function (b) {
      var p = settleBet(b, idx, now);
      if (p) patches.push({ id: b.id, patch: p });
    });
    return { patches: patches, checked: need.atp || need.wta, errors: errors };
  }

  BK.Settle = {
    parseScore: parseScore, swap: swap, scoreText: scoreText, evaluate: evaluate, index: index,
    lookup: lookup, settleBet: settleBet, aggregate: aggregate, besoins: besoins, attend: attend,
    run: run, _cache: cache
  };
})(window.BK = window.BK || {});
