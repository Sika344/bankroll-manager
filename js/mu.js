/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — lien avec le programme MatchUp Tennis (BK.MU)

   Lit le programme du jour sur l'API de MatchUp (matches = ATP + Challenger,
   matches_wta = WTA + ITF), avec les règles de MatchUp :
     - sans compte, ou compte gratuit : cartes RÉDUITES (joueurs, tournoi,
       horaire, tour, surface), plus le match offert du jour en entier ;
     - abonné connecté : cartes entières (cotes, analyse du match).
   Le jeton n'est envoyé que pour un abonné : pour les autres la réponse est
   la même, autant épargner au serveur une vérification de jeton.

   Quand un pari est relié à un match, on enregistre une PHOTO du match au
   moment du pari (sel.mu) : cotes, proba du marché, signal value, styles.
   Elle n'est JAMAIS recalculée ensuite : « as-tu suivi la value MatchUp »
   doit décrire ce que tu voyais quand tu as parié, pas ce que le modèle a dit
   plus tard. Seuls l'horaire (report) et la cote de clôture sont mis à jour.
   Une photo prise sur une carte réduite porte full:false : la value, le style
   ou la proba y sont INCONNUS (et non « absents »), les découpages le disent.

   Horaires : TOUJOURS via horaire.js de MatchUp (window.MU_HORAIRE, chargé
   depuis matchup-tennis.fr, source unique) : l'ATP est en heure de Paris au
   « Z » trompeur, la WTA en vrai UTC.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U, M = BK.Markets;

  function horaire() { return (typeof window !== 'undefined' && window.MU_HORAIRE) || null; }

  var CIRCUIT = { ATP: 'ATP', CH: 'Challenger', WTA: 'WTA', ITF: 'ITF' };
  var SURFACE = { Hard: 'Dur', Clay: 'Terre', Grass: 'Gazon', Carpet: 'Moquette' };
  var TIER = {
    atp: { G: 'Grand Chelem', M: 'Masters 1000', '500': 'ATP 500', '250': 'ATP 250', C: 'Challenger' },
    wta: { G: 'Grand Chelem', '1000': 'WTA 1000', WTA: 'WTA 250/500', '125': 'WTA 125', ITF: 'ITF', BJK: 'BJK Cup' }
  };

  function surfaceLabel(surface, indoor) {
    var s = SURFACE[surface] || surface || 'Surface ?';
    return indoor === true ? s + ' (salle)' : s;
  }

  /** « ATP Almaty - Semi-finals » → « Demi-finale » ; « 1/2 » → idem ; « Q1 » → « Qualif. T1 ». */
  function roundLabel(r) {
    var s = String(r || '').split(' - ').pop().trim();
    if (!s) return '';
    var t = s.toLowerCase();
    if (/^q(\d)$/.test(t)) return 'Qualif. T' + t.slice(1);
    if (/semi|^1\/2/.test(t) || t === 'sf') return 'Demi-finale';
    if (/quarter|^1\/4/.test(t) || t === 'qf') return 'Quart de finale';
    if (/^1\/8/.test(t) || t === 'r16') return '8e de finale';
    if (/^1\/16/.test(t) || t === 'r32') return '16e de finale';
    if (/^1\/32/.test(t) || t === 'r64') return '32e de finale';
    if (/^1\/64/.test(t) || t === 'r128') return '1er tour';
    if (/^(final|finale|f)$/.test(t)) return 'Finale';
    return s;
  }
  function roundGroup(r, qualif) {
    var t = String(r || '').toLowerCase();
    if (qualif || /(^|\s|-)q\d\b|qualif/.test(t)) return 'Qualifications';
    if (/semi|1\/2\b|\bsf\b|demi/.test(t)) return 'Demies';
    if (/quarter|1\/4\b|\bqf\b|quart/.test(t)) return 'Quarts';
    if (/(^|\s|-)(final|finale|f)$/.test(t.trim())) return 'Finale';
    if (/1\/8|1\/16|1\/32|1\/64|\br(16|32|64|128)\b|round|tour/.test(t)) return 'Premiers tours';
    return 'Tour inconnu';
  }

  function num(v) { var n = U.num(v); return n == null ? null : n; }
  function pair(a, b) { return a == null && b == null ? null : [a == null ? null : a, b == null ? null : b]; }

  /** Carte compacte d'un match du programme. src = 'atp' | 'wta'. */
  function normalize(m, src) {
    if (!m || !m.pa || !m.pb) return null;
    var H = horaire();
    var p = m.prediction || {};
    var par = H ? H.paris(m.commence) : null;
    var start = H ? H.instant(m.commence) : null;
    var circuit = src === 'wta' ? (m.catTier === 'ITF' ? 'ITF' : 'WTA') : (m.level === 'CH' ? 'CH' : 'ATP');
    var tier = src === 'wta' ? (m.catTier || null) : (m.tierCode || null);
    var qualif = m.qualif === true || /^q\d$/i.test(String(m.round || '').split(' - ').pop().trim());
    var e = num(p.archetypeEdge != null ? p.archetypeEdge : m.archetypeEdge);
    var elo = num(p.eloProbA);
    var signal = p.signal === 'STRONG_VALUE' || p.signal === 'MODERATE_VALUE' ? p.signal : null;
    return {
      key: src + ':' + m.id, id: String(m.id), src: src, circuit: circuit, tier: tier,
      // premium_locked : posé par l'API de MatchUp sur les cartes réduites.
      full: m.premium_locked !== true,
      tierLabel: (TIER[src] || {})[tier] || null,
      tournament: m.tournament || '', country: m.country || null,
      surface: m.surface || null, indoor: m.indoor === true ? true : m.indoor === false ? false : null,
      round: roundLabel(m.round), roundGroup: roundGroup(m.round, qualif), qualif: qualif,
      commence: m.commence || null, start: start == null ? null : start,
      day: par ? par.jour : String(m.commence || '').slice(0, 10), time: par ? par.heure : '',
      pa: m.pa, pb: m.pb,
      odds: pair(num(m.oa), num(m.ob)),
      mkt: pair(num(m.marketOa), num(m.marketOb)),
      pModel: pair(num(p.probA), num(p.probB)),
      pMkt: pair(num(p.marketProbA), num(p.marketProbB)),
      pElo: elo == null ? null : [elo, +(1 - elo).toFixed(4)],
      signal: signal, valueSide: signal && (p.valueSide === 'A' || p.valueSide === 'B') ? p.valueSide : null,
      valueEdge: signal ? num(p.valueEdge) : null,
      arch: pair(p.archA || (m.detailA && m.detailA.arch) || null, p.archB || (m.detailB && m.detailB.arch) || null),
      styleEdge: e == null ? null : [e, -e],
      vsStyle: pair(m.vsArchA || null, m.vsArchB || null),
      rank: pair(num(m.rankA), num(m.rankB))
    };
  }

  /** La photo enregistrée dans sel.mu (les deux côtés : le marché peut changer). */
  function snapshot(card) {
    var mu = {};
    ['id', 'src', 'full', 'circuit', 'tier', 'tierLabel', 'tournament', 'country', 'surface', 'indoor', 'round', 'roundGroup',
      'qualif', 'commence', 'start', 'day', 'time', 'pa', 'pb', 'odds', 'mkt', 'pModel', 'pMkt', 'pElo', 'signal',
      'valueSide', 'valueEdge', 'arch', 'styleEdge', 'vsStyle', 'rank'].forEach(function (k) { mu[k] = card[k] == null ? null : card[k]; });
    mu.at = new Date().toISOString();
    mu.closing = null;
    return mu;
  }

  /* ── Lecture de l'API de MatchUp ──────────────────────────────────────── */
  /** GET d'un fichier de données de MatchUp. opts.auth : envoyer le jeton du
   *  compte connecté (abonné). Lève une erreur parlante, jamais muette. */
  async function getData(file, opts) {
    var headers = {};
    if (opts && opts.auth && BK.Auth) {
      var t = await BK.Auth.token();
      if (t) headers.Authorization = 'Bearer ' + t;
    }
    var res;
    try {
      res = await fetch(BK.CONF.DATA + file + '?v=' + Date.now(), { headers: headers, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      var e0 = new Error('MatchUp injoignable (connexion ?)'); e0.status = 0; throw e0;
    }
    if (!res.ok) { var e1 = new Error('HTTP ' + res.status); e1.status = res.status; throw e1; }
    return res.json();
  }

  /* ── Chargement du programme ──────────────────────────────────────────── */
  var state = { cards: [], at: 0, errors: [], loading: null, full: false };
  var TTL = 5 * 60e3;

  async function lire(file, src, auth) {
    var data;
    try { data = await getData(file, { auth: auth }); }
    catch (e) { throw new Error((src === 'wta' ? 'Programme WTA' : 'Programme ATP') + ' : ' + e.message); }
    var list = Array.isArray(data) ? data : (data && data.matches) || [];
    return list.map(function (m) { return normalize(m, src); }).filter(Boolean);
  }

  function premium() { return !!(BK.Auth && BK.Auth.user && BK.Auth.premium); }

  async function load(force) {
    var p = premium();
    // Un programme chargé sans jeton ne doit pas servir à un abonné (ni
    // l'inverse) : le statut fait partie de la clé du cache.
    if (!force && state.cards.length && state.full === p && Date.now() - state.at < TTL) return state;
    if (state.loading) {
      // Chargement en cours avec l'AUTRE statut (connexion pendant la lecture) :
      // on attend qu'il finisse, puis on relit avec le bon.
      if (state.loadingFull === p) return state.loading;
      return state.loading.then(function () { return load(force); }, function () { return load(force); });
    }
    state.loadingFull = p;
    state.loading = (async function () {
      try {
        var r = await Promise.allSettled([lire('matches', 'atp', p), lire('matches_wta', 'wta', p)]);
        var cards = [], errors = [];
        r.forEach(function (x) { if (x.status === 'fulfilled') cards = cards.concat(x.value); else errors.push(x.reason && x.reason.message); });
        cards.sort(function (a, b) { return (a.start || 0) - (b.start || 0) || a.tournament.localeCompare(b.tournament); });
        // Panne totale : on garde le dernier programme connu plutôt qu'une liste vide.
        if (cards.length || !state.cards.length) { state.cards = cards; state.full = p; }
        state.errors = errors; state.at = Date.now();
        return state;
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  function invalidate() { state.at = 0; }

  function byId(id, src) {
    for (var i = 0; i < state.cards.length; i++) {
      var c = state.cards[i];
      if (c.id === id && (!src || c.src === src)) return c;
    }
    return null;
  }

  function started(card, now) { return !!(card && card.start && card.start <= (now || Date.now())); }

  /* ── Capture d'écran → match du programme ─────────────────────────────── */
  /** Retrouve le match d'une ligne lue par l'OCR. Exige les DEUX joueurs dans
   *  le texte (affiche + sélection) : un seul nom commun ne suffit pas. */
  function matchText(event, pick, cards, now) {
    var txt = (event || '') + ' ' + (pick || '');
    if (!txt.trim()) return null;
    var cands = (cards || state.cards).filter(function (c) {
      var a = M.sideOf(txt, c.pa, '__'), b = M.sideOf(txt, '__', c.pb);
      return a === 'A' && b === 'B';
    });
    if (!cands.length) return null;
    var t = now || Date.now();
    cands.sort(function (x, y) {
      var fx = x.start && x.start > t ? 0 : 1, fy = y.start && y.start > t ? 0 : 1;
      return fx - fy || Math.abs((x.start || t) - t) - Math.abs((y.start || t) - t);
    });
    var card = cands[0];
    return { card: card, side: M.sideOf(pick || '', card.pa, card.pb), ambiguous: cands.length > 1 };
  }

  /* ── Mise à jour des paris en attente depuis le programme ─────────────── */
  /** Report d'horaire + cote de clôture (dernier relevé avant le coup
   *  d'envoi : le pipeline garde les matchs commencés « tels quels » jusqu'au
   *  soir, cf. rétention d'update_daily_v2). Renvoie [{id, patch}]. */
  function refreshFromSlate(bets, now) {
    var t = now || Date.now(), out = [];
    (bets || []).forEach(function (b) {
      if (b.status !== 'pending') return;
      var changed = false;
      var sels = (b.selections || []).map(function (s) {
        if (!s.mu || !s.mu.id || (s.result && s.result !== 'pending')) return s;
        var c = byId(s.mu.id, s.mu.src);
        if (!c) return s;
        var mu = Object.assign({}, s.mu), touched = false;
        if (!started(c, t) && c.start && c.start !== mu.start) {
          mu.start = c.start; mu.commence = c.commence; mu.day = c.day; mu.time = c.time; touched = true;
        }
        if (started(c, t) && !mu.closing && (c.odds || c.mkt)) {
          mu.closing = { odds: c.odds, mkt: c.mkt, at: new Date(t).toISOString() };
          touched = true;
        }
        if (!touched) return s;
        changed = true;
        return Object.assign({}, s, { mu: mu });
      });
      if (changed) out.push({ id: b.id, patch: { selections: sels } });
    });
    return out;
  }

  BK.MU = {
    CIRCUIT: CIRCUIT, TIER: TIER, surfaceLabel: surfaceLabel, roundLabel: roundLabel, roundGroup: roundGroup,
    normalize: normalize, snapshot: snapshot, load: load, invalidate: invalidate, getData: getData, byId: byId, started: started,
    matchText: matchText, refreshFromSlate: refreshFromSlate, state: state
  };
})(window.BK = window.BK || {});
