/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — marchés tennis structurés (BK.Markets)

   Un pari tennis relié à un match MatchUp porte un marché STRUCTURÉ
   (sel.mk = {type, side, ou, line, score, yes}). C'est ce qui permet de le
   régler tout seul à partir du score (bk/settle.js). Un marché non reconnu
   reste « other » : réglage à la main, jamais deviné.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U;

  var TYPES = [
    ['winner', 'Vainqueur du match'],
    ['set1', 'Vainqueur du 1er set'],
    ['games_ou', 'Total de jeux'],
    ['games_hcp', 'Handicap jeux'],
    ['sets_ou', 'Nombre de sets'],
    ['sets_hcp', 'Handicap sets'],
    ['set_score', 'Score exact (sets)'],
    ['win_a_set', 'Gagne au moins un set'],
    ['tiebreak', 'Tie-break dans le match'],
    ['other', 'Autre marché']
  ];
  var LABEL = {};
  TYPES.forEach(function (t) { LABEL[t[0]] = t[1]; });

  var NEEDS = {
    winner: ['side'], set1: ['side'], win_a_set: ['side'],
    games_ou: ['ou', 'line'], sets_ou: ['ou', 'line'],
    games_hcp: ['side', 'line'], sets_hcp: ['side', 'line'],
    set_score: ['side', 'score'], tiebreak: ['yes'], other: []
  };
  var SCORES = ['2-0', '2-1', '1-2', '0-2', '3-0', '3-1', '3-2', '2-3', '1-3', '0-3'];

  /** Le marché est-il complet (donc réglable automatiquement) ? */
  function valid(mk) {
    if (!mk || !NEEDS[mk.type] || mk.type === 'other') return false;
    return NEEDS[mk.type].every(function (k) {
      if (k === 'side') return mk.side === 'A' || mk.side === 'B';
      if (k === 'ou') return mk.ou === 'over' || mk.ou === 'under';
      if (k === 'line') return typeof mk.line === 'number' && isFinite(mk.line);
      if (k === 'score') return SCORES.indexOf(mk.score) !== -1;
      if (k === 'yes') return mk.yes === true || mk.yes === false;
      return false;
    });
  }

  function signed(v) {
    if (v == null || !isFinite(v)) return '?';
    var s = Math.abs(v).toString().replace('.', ',');
    return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
  }

  /** Texte lisible du pari : {market, pick}. */
  function describe(mk, pa, pb) {
    if (!mk) return { market: '', pick: '' };
    var who = mk.side === 'A' ? pa : mk.side === 'B' ? pb : '?';
    var line = mk.line != null && isFinite(mk.line) ? String(mk.line).replace('.', ',') : '?';
    var lbl = LABEL[mk.type] || 'Autre marché';
    switch (mk.type) {
      case 'winner': return { market: lbl, pick: who };
      case 'set1': return { market: lbl, pick: who };
      case 'win_a_set': return { market: lbl, pick: who };
      case 'games_ou': return { market: lbl, pick: (mk.ou === 'under' ? 'Moins de ' : 'Plus de ') + line + ' jeux' };
      case 'sets_ou': return { market: lbl, pick: (mk.ou === 'under' ? 'Moins de ' : 'Plus de ') + line + ' sets' };
      case 'games_hcp': return { market: lbl, pick: who + ' ' + signed(mk.line) + ' jeux' };
      case 'sets_hcp': return { market: lbl, pick: who + ' ' + signed(mk.line) + (Math.abs(mk.line) >= 2 ? ' sets' : ' set') };
      case 'set_score': return { market: lbl, pick: who + ' ' + (mk.score || '?') };
      case 'tiebreak': return { market: lbl, pick: mk.yes === false ? 'Non' : 'Oui' };
      default: return { market: mk.text || lbl, pick: mk.pick || '' };
    }
  }

  /* ── Lecture d'un libellé de bookmaker ──────────────────────────────────── */
  function low(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[−–—]/g, '-').replace(/(\d),(\d)/g, '$1.$2');
  }

  /** Mots du nom de famille d'un joueur (tout sauf le premier mot, ≥ 3 lettres).
   *  « Maria Camila Osorio Serrano » → camila, osorio, serrano : un bookmaker
   *  qui écrit « C. Osorio » est ainsi reconnu. */
  function surnameTokens(name) {
    var t = U.normName(name).split(' ').filter(Boolean);
    var rest = t.length > 1 ? t.slice(1) : t;
    return rest.filter(function (w) { return w.length >= 3; });
  }

  /** Quel joueur le texte désigne-t-il ? 'A', 'B' ou null (aucun / les deux). */
  function sideOf(text, pa, pb) {
    var nt = ' ' + U.normName(text) + ' ';
    function score(name) {
      return surnameTokens(name).reduce(function (n, w) { return n + (nt.indexOf(' ' + w + ' ') !== -1 ? 1 : 0); }, 0);
    }
    var a = pa ? score(pa) : 0, b = pb ? score(pb) : 0;
    if (a > b) return 'A';
    if (b > a) return 'B';
    return null;
  }

  function firstNumber(s, signedOnly) {
    var rx = signedOnly ? /(^|[^\d.])([+-]\s?\d{1,2}(?:\.\d{1,2})?)(?!\d)/ : /(^|[^\d.])([+-]?\s?\d{1,2}(?:\.\d{1,2})?)(?!\d)/;
    var m = String(s).match(rx);
    return m ? parseFloat(m[2].replace(/\s/g, '')) : null;
  }

  /**
   * Libellés de bookmaker → marché structuré, ou null si on ne sait pas.
   * Sert à l'OCR et à la saisie libre d'un pari relié à un match MatchUp.
   * Règle : dans le doute, null (réglage manuel). Un marché mal compris
   * réglerait le pari dans le mauvais sens.
   */
  function parse(market, pick, pa, pb) {
    var m = low(market), p = low(pick), all = m + ' | ' + p;
    var side = sideOf(pick, pa, pb);
    var mSide = sideOf(market, pa, pb);

    // Total ou handicap PROPRE À UN JOUEUR (« jeux remportés par Sinner ») :
    // le score total ne suffit pas à le régler sans ambiguïté → manuel.
    if (mSide && /jeux|games|aces|points/.test(m) && !/handicap/.test(m)) return null;

    if (/tie[ -]?break|jeu decisif/.test(m)) {
      var yes = /\b(oui|yes)\b/.test(p) ? true : /\b(non|no)\b/.test(p) ? false : null;
      return yes == null ? null : { type: 'tiebreak', yes: yes };
    }
    if (/score (exact|final|du match)|resultat exact|correct score|score en sets/.test(m)) {
      var sm = p.match(/\b([0-3])\s*[-:]\s*([0-3])\b/);
      if (!sm || !side) return null;
      var sc = sm[1] + '-' + sm[2];
      return SCORES.indexOf(sc) !== -1 ? { type: 'set_score', side: side, score: sc } : null;
    }
    if (/au moins un set|gagne(r)? un set|remporte(r)? un set|un set gagne|to win a set/.test(all)) {
      return side ? { type: 'win_a_set', side: side } : null;
    }
    if (/(1er|premier|1st|first) set|set 1\b/.test(m) && /(vainqueur|gagnant|winner|resultat|gagne)/.test(m)) {
      return side ? { type: 'set1', side: side } : null;
    }
    if (/handicap/.test(m)) {
      var line = firstNumber(p, true);
      if (line == null || !side) return null;
      if (/\bsets?\b/.test(m) && !/jeu/.test(m)) return { type: 'sets_hcp', side: side, line: line };
      if (/jeu|game/.test(m)) return { type: 'games_hcp', side: side, line: line };
      return null;
    }
    var ou = /\b(plus|over)\b|\+ de/.test(p) ? 'over' : /\b(moins|under)\b|- de/.test(p) ? 'under' : null;
    if (/\bsets?\b/.test(m) && /(nombre|total)/.test(m)) {
      var ls = firstNumber(p.replace(/\b(plus|moins|de|over|under)\b/g, ' '), false);
      return ou && ls != null ? { type: 'sets_ou', ou: ou, line: Math.abs(ls) } : null;
    }
    if (/jeux|games/.test(m) || (/jeux|games/.test(p) && ou)) {
      var lg = firstNumber(p.replace(/\b(plus|moins|de|over|under)\b/g, ' '), false);
      if (lg == null) lg = firstNumber(m.replace(/\b(plus|moins|de|over|under)\b/g, ' '), false);
      return ou && lg != null ? { type: 'games_ou', ou: ou, line: Math.abs(lg) } : null;
    }
    if (/vainqueur|gagnant|face a face|resultat( du match| final)?|match winner|winner|victoire|qui (va )?gagne|1n2/.test(m)) {
      if (/\bset|jeu/.test(m)) return null;
      return side ? { type: 'winner', side: side } : null;
    }
    // Aucun libellé de marché, mais le pick désigne un des deux joueurs : c'est
    // la présentation par défaut du vainqueur chez la plupart des bookmakers.
    if (!m.trim() && side && !/\d/.test(p.replace(/\b\d{1,2}[.,]\d{2}\b/g, ''))) {
      return { type: 'winner', side: side, deduced: true };
    }
    return null;
  }

  BK.Markets = {
    TYPES: TYPES, LABEL: LABEL, NEEDS: NEEDS, SCORES: SCORES,
    valid: valid, describe: describe, parse: parse, sideOf: sideOf, signed: signed
  };
})(window.BK = window.BK || {});
