/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — outils communs (BK.U)
   Aucun accès au DOM ni au stockage au chargement : ce fichier est aussi
   chargé tel quel par les bancs d'essai Node (global.window = global).
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Échappement HTML. TOUT texte venant d'un pari (saisi, importé, lu par
   *  l'OCR, reçu du programme) passe par ici avant innerHTML : un fichier
   *  importé peut contenir du HTML. */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  function uid() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) { /* contexte non sécurisé : repli */ }
    var s = '';
    for (var i = 0; i < 4; i++) s += Math.random().toString(36).slice(2, 8);
    return ('bk' + Date.now().toString(36) + s).slice(0, 40);
  }

  /** Nombre saisi à la française (« 2,10 », « 1 250 ») → nombre, ou null. */
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = parseFloat(String(v).replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  var CUR = { EUR: '€', USD: '$', GBP: '£' };
  function money(v, cur, dec) {
    if (dec == null) dec = 2;
    var n = (v == null || !isFinite(v) ? 0 : v);
    var s = n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return s + '\u00a0' + (CUR[cur] || '€');
  }
  /** Le signe se lit sur la valeur ARRONDIE à l'affichage : −0,0004 € donnait « −0 € ». */
  function signMoney(v, cur, dec) {
    if (dec == null) dec = 2;
    var r = +(+v || 0).toFixed(dec);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + money(Math.abs(r), cur, dec);
  }
  function pct(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    if (dec == null) dec = 1;
    var r = +v.toFixed(dec);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(dec).replace('.', ',') + '\u00a0%';
  }
  function odds(v) { return v ? Number(v).toFixed(2).replace('.', ',') : '—'; }
  function fr(v, dec) { return v == null || !isFinite(v) ? '—' : Number(v).toFixed(dec == null ? 1 : dec).replace('.', ','); }
  function cls(v) { return v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'flat'; }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /** Jour calendaire de PARIS : c'est celui des cartes MatchUp (horaire.js). */
  function today(ms) {
    var t = ms == null ? Date.now() : ms;
    var H = typeof window !== 'undefined' ? window.MU_HORAIRE : null;
    if (H && H.jourParis) return H.jourParis(t);
    return isoLocal(new Date(t));
  }
  function addDays(day, n) {
    var d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function dayDiff(a, b) {
    var ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    var tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((tb - ta) / 864e5);
  }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function fdate(day) {
    if (!day) return '—';
    var s = String(day).slice(0, 10);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '—';
    return (+m[3]) + ' ' + MOIS[+m[2] - 1];
  }

  /** Nom normalisé pour comparer des joueurs : sans accents, minuscules,
   *  ponctuation retirée. « Stan Wawrinka » == « stan  wawrinka ». */
  function normName(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /** Dernier mot d'un nom (« V. Golubic » → « golubic »). */
  function lastName(s) {
    var t = normName(s).split(' ').filter(Boolean);
    return t.length ? t[t.length - 1] : '';
  }

  var BOOKS = ['Winamax', 'Betclic', 'Unibet', 'ParionsSport', 'PMU', 'Bwin', 'ZEbet', 'Netbet',
    'Vbet', 'Olybet', 'Genybet', 'France Pari', 'Pinnacle', 'Bet365', 'Stake', '1xBet'];
  /** Bookmakers proposés : ceux du site + ceux ajoutés dans les réglages. */
  function books(settings) {
    var out = BOOKS.slice();
    var extra = settings && Array.isArray(settings.customBooks) ? settings.customBooks : [];
    extra.forEach(function (b) {
      b = String(b == null ? '' : b).trim().slice(0, 40);
      if (b && b !== 'Autre' && out.indexOf(b) === -1) out.push(b);
    });
    return out;
  }
  var SPORTS = ['Tennis', 'Basketball', 'Football', 'Rugby', 'Hockey', 'Baseball', 'MMA', 'Boxe',
    'Volleyball', 'Handball', 'Fléchettes', 'eSport', 'Autre'];

  var STATUS = {
    pending: ['En attente', 'b-amber', '⏳'],
    won: ['Gagné', 'b-green', '✓'],
    lost: ['Perdu', 'b-red', '✗'],
    halfwon: ['½ gagné', 'b-green', '½'],
    halflost: ['½ perdu', 'b-red', '½'],
    void: ['Remboursé', 'b-gray', '↩'],
    cashout: ['Cashout', 'b-violet', '💸']
  };

  BK.U = {
    esc: esc, uid: uid, num: num, money: money, signMoney: signMoney, pct: pct, odds: odds, fr: fr,
    cls: cls, today: today, addDays: addDays, dayDiff: dayDiff, fdate: fdate, isoLocal: isoLocal,
    normName: normName, lastName: lastName, BOOKS: BOOKS, books: books, SPORTS: SPORTS, STATUS: STATUS
  };
})(window.BK = window.BK || {});
