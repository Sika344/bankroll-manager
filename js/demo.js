/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — données d'EXEMPLE pour les visiteurs (BK.Demo)

   Fictives, signalées comme telles à l'écran (« Exemple — données fictives »),
   jamais enregistrées. Le profil est volontairement MODESTE (yield ≈ +4 %,
   un creux de ~11 %) : c'est un exemple de l'outil, pas une promesse. Et le
   segment « dans le sens de la value MatchUp » ne compte que 3 paris, donc
   aucun pourcentage n'est affiché : une démo ne fabrique pas de track record.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U;

  // [joueur A, joueur B, tournoi, surface, salle, circuit, style A, style B, pays]
  var MATCHS = [
    ['Jannik Sinner', 'Alexander Zverev', 'Rolex Paris Masters', 'Hard', true, 'ATP', 'Attaquant de Fond (Power)', 'Big Server + Baseliner', 'FRA'],
    ['Carlos Alcaraz', 'Taylor Fritz', 'Rolex Paris Masters', 'Hard', true, 'ATP', 'All-Court Élite', 'Big Server', 'FRA'],
    ['Arthur Fils', 'Holger Rune', 'Swiss Indoors Basel', 'Hard', true, 'ATP', 'Attaquant de Fond (Power)', 'Attaquant Irrégulier', 'SUI'],
    ['Ugo Humbert', 'Alex de Minaur', 'Erste Bank Open - Vienna', 'Hard', true, 'ATP', 'Attaquant de Fond (Power)', 'Counter Puncher Offensif', 'AUT'],
    ['Joao Fonseca', 'Lorenzo Musetti', 'Swiss Indoors Basel', 'Hard', true, 'ATP', 'Attaquant de Fond (Power)', 'Attaquant de Fond (Lift)', 'SUI'],
    ['Aryna Sabalenka', 'Coco Gauff', 'WTA Finals - Riyadh', 'Hard', true, 'WTA', 'Attaquante de Fond (Plat)', 'Contre-Attaquante', 'KSA'],
    ['Iga Swiatek', 'Elena Rybakina', 'WTA Finals - Riyadh', 'Hard', true, 'WTA', 'Attaquante de Fond (Lift)', 'Serveuse-Puncheuse', 'KSA'],
    ['Mirra Andreeva', 'Jessica Pegula', 'Ningbo Open - Ningbo', 'Hard', false, 'WTA', 'Solide Polyvalente', 'Contre-Attaquante', 'CHN'],
    ['Valentin Royer', 'Luca Van Assche', 'Brest Challenger', 'Hard', true, 'CH', 'Solide Offensif Core', 'Counter Puncher Offensif', 'FRA'],
    ['Titouan Droguet', 'Harold Mayot', 'Roanne Challenger', 'Hard', true, 'CH', 'Big Server', 'Solide Offensif Retourneur', 'FRA'],
    ['Thiago Agustin Tirante', 'Camilo Ugo Carabelli', 'Lima Challenger', 'Clay', false, 'CH', 'Pur Terrien', 'Solide Défensif', 'PER']
  ];
  var BOOKS = ['Winamax', 'Betclic', 'Unibet', 'PMU'];

  // [jour, match, marché, cote, mise, issue W/L/V, value 'pour'|'contre'|null]
  var PARIS = [
    [-44, 0, { type: 'winner', side: 'A' }, 1.62, 20, 'W'], [-43, 5, { type: 'winner', side: 'B' }, 2.45, 10, 'L'],
    [-41, 8, { type: 'winner', side: 'A' }, 1.85, 15, 'W'], [-40, 2, { type: 'games_ou', ou: 'over', line: 22.5 }, 1.80, 15, 'L'],
    [-38, 10, { type: 'winner', side: 'B' }, 2.10, 10, 'W', 'pour'], [-37, 6, { type: 'winner', side: 'A' }, 1.55, 20, 'L'],
    [-35, 3, { type: 'set1', side: 'A' }, 1.70, 10, 'W'], [-34, 1, { type: 'games_hcp', side: 'A', line: -3.5 }, 1.90, 15, 'L'],
    [-33, 7, { type: 'winner', side: 'A' }, 1.75, 15, 'L'], [-31, 9, { type: 'winner', side: 'A' }, 1.95, 10, 'L'],
    [-30, 4, { type: 'winner', side: 'B' }, 1.68, 20, 'W'], [-28, 0, { type: 'games_ou', ou: 'over', line: 23.5 }, 1.85, 10, 'W'],
    [-27, 5, { type: 'winner', side: 'A' }, 1.45, 25, 'W'], [-26, 2, { type: 'winner', side: 'A' }, 2.30, 10, 'L', 'pour'],
    [-24, 8, { type: 'set1', side: 'B' }, 2.05, 10, 'L'], [-23, 6, { type: 'games_hcp', side: 'B', line: 4.5 }, 1.80, 15, 'W'],
    [-21, 3, { type: 'winner', side: 'B' }, 1.90, 15, 'W'], [-20, 1, { type: 'winner', side: 'A' }, 1.40, 25, 'L'],
    [-18, 7, { type: 'winner', side: 'B' }, 2.20, 10, 'W'], [-17, 9, { type: 'games_ou', ou: 'under', line: 21.5 }, 1.75, 10, 'W'],
    [-15, 10, { type: 'winner', side: 'A' }, 1.65, 15, 'W'], [-14, 4, { type: 'winner', side: 'A' }, 2.60, 10, 'L', 'contre'],
    [-12, 0, { type: 'winner', side: 'A' }, 1.50, 20, 'W'], [-11, 5, { type: 'games_hcp', side: 'A', line: -2.5 }, 1.85, 15, 'L'],
    [-9, 2, { type: 'winner', side: 'B' }, 1.95, 15, 'V'], [-7, 6, { type: 'winner', side: 'B' }, 2.00, 10, 'L'],
    [-5, 8, { type: 'winner', side: 'A' }, 1.70, 15, 'W'], [-3, 3, { type: 'winner', side: 'A' }, 3.10, 10, 'W', 'pour'],
    [-2, 1, { type: 'set1', side: 'A' }, 1.60, 15, 'W'],
    // en attente : à venir
    [0, 0, { type: 'winner', side: 'A' }, 1.55, 20, null], [0, 6, { type: 'games_ou', ou: 'over', line: 21.5 }, 1.82, 10, null],
    [1, 9, { type: 'winner', side: 'B' }, 2.05, 10, null]
  ];

  function build() {
    var today = U.today(), now = Date.now(), bets = [];
    PARIS.forEach(function (p, i) {
      var m = MATCHS[p[1]], mk = p[2], odds = p[3], side = mk.side || 'A', other = side === 'A' ? 'B' : 'A';
      var day = U.addDays(today, p[0]);
      var start = p[5] ? Date.parse(day + 'T13:00:00Z') : now + (p[0] ? 26 : 4) * 3600e3;
      // Proba du marché déduite de la cote (marge de 4 %), côté joué.
      var pSide = mk.type === 'winner' ? Math.min(0.9, 0.96 / odds) : 0.55;
      var pA = side === 'A' ? pSide : 1 - pSide;
      var oA = +(0.96 / pA).toFixed(2), oB = +(0.96 / (1 - pA)).toFixed(2);
      var e = ((i * 37) % 9 - 4) / 100;                 // avantage de style −4 à +4 pts
      var won = p[5] === 'W', settled = !!p[5];
      var res = p[5] === 'W' ? 'won' : p[5] === 'L' ? 'lost' : p[5] === 'V' ? 'void' : 'pending';
      var mu = {
        id: 'demo-' + i, src: m[5] === 'WTA' ? 'wta' : 'atp', circuit: m[5], tier: null, tierLabel: null,
        tournament: m[2], country: m[8], surface: m[3], indoor: m[4], round: i % 4 ? '8e de finale' : 'Quart de finale',
        roundGroup: i % 4 ? 'Premiers tours' : 'Quarts', qualif: false, commence: null, start: start,
        day: day, time: settled ? '14:00' : new Date(start).toISOString().slice(11, 16), pa: m[0], pb: m[1],
        odds: [oA, oB], mkt: [+(oA * 1.01).toFixed(2), +(oB * 1.01).toFixed(2)],
        pModel: [+(pA + e / 4).toFixed(3), +(1 - pA - e / 4).toFixed(3)], pMkt: [+pA.toFixed(3), +(1 - pA).toFixed(3)], pElo: null,
        signal: p[6] ? 'MODERATE_VALUE' : null, valueSide: p[6] === 'pour' ? side : p[6] === 'contre' ? other : null, valueEdge: p[6] ? 0.021 : null,
        arch: [m[6], m[7]], styleEdge: [e, -e],
        vsStyle: [{ wr: 0.5 + e * 3, m: 14 + (i % 7) * 5 }, { wr: 0.5 - e * 3, m: 11 + (i % 5) * 6 }], rank: [null, null],
        at: day + 'T09:00:00Z',
        closing: settled && mk.type === 'winner' ? { odds: null, mkt: side === 'A' ? [+(odds * (i % 3 ? 0.98 : 1.02)).toFixed(2), oB] : [oA, +(odds * (i % 3 ? 0.98 : 1.02)).toFixed(2)] } : null
      };
      var w = side === 'A' ? won : !won;
      bets.push({
        id: 'demo-bet-' + i, betDate: day, eventDate: day, sport: 'Tennis', competition: m[2],
        bookmaker: BOOKS[i % BOOKS.length], stake: p[4], totalOdds: odds, status: res,
        settledAt: settled ? day + 'T21:00:00.000Z' : null, autoSettled: settled && p[5] !== 'V', manualLock: p[5] === 'V', source: 'matchup',
        selections: [{ mu: mu, mk: mk, odds: odds, result: res,
          settle: settled && p[5] !== 'V' ? { by: 'matchup', score: w ? '6-4 7-5' : '4-6 5-7', date: day } : null }]
      });
    });
    return { settings: { initialBankroll: 500, unitValue: 10, currency: 'EUR', initialized: true, maxStakePct: 5, lossStreakAlert: 5 }, bets: bets };
  }

  BK.Demo = { build: build };
})(window.BK = window.BK || {});
