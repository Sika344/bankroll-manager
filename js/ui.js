/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — rendu des vues (BK.UI)
   Tout texte venant d'un pari passe par U.esc avant innerHTML.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U, ST = BK.Stats, M = BK.Markets, esc = U.esc;
  var charts = {};

  function $(id) { return document.getElementById(id); }
  function cur() { return BK.Store.state.settings.currency; }
  function money(v, dec) { return U.money(v, cur(), dec); }
  function smoney(v, dec) { return U.signMoney(v, cur(), dec); }
  function writable() { return BK.Store.canWrite(); }

  /* ── Petits éléments ──────────────────────────────────────────────────── */
  function toast(msg, type) {
    var z = $('bk-toasts'); if (!z) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'ok');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    z.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, 3600);
  }

  function badge(status) {
    var s = U.STATUS[status] || [status, 'b-gray', ''];
    return '<span class="badge ' + s[1] + '">' + s[2] + ' ' + esc(s[0]) + '</span>';
  }

  function flagOf(b) {
    var mu = (b.selections || [])[0] && b.selections[0].mu;
    if (mu && window.tFlag) return window.tFlag(mu.tournament, mu.country);
    return b.sport === 'Tennis' ? '🎾' : b.sport === 'Basketball' ? '🏀' : b.sport === 'Football' ? '⚽' : '🎯';
  }

  function title(b) {
    var sels = b.selections || [];
    if (sels.length > 1) return 'Combiné · ' + sels.length + ' lignes';
    var s = sels[0] || {};
    if (s.mu && s.mk && s.mk.type === 'winner') return s.pick || s.event || 'Pari';
    return s.pick || s.event || 'Pari';
  }
  function sub(b) {
    var sels = b.selections || [], parts = [];
    if (sels.length > 1) parts.push(sels.map(function (s) { return s.pick || s.event; }).filter(Boolean).join(' + '));
    else {
      var s = sels[0] || {};
      if (s.mu) parts.push(s.mu.pa + ' – ' + s.mu.pb);
      else if (s.event && s.event !== s.pick) parts.push(s.event);
      if (s.market && !(s.mk && s.mk.type === 'winner')) parts.push(s.market);
    }
    if (b.competition) parts.push(b.competition);
    return parts.join(' · ');
  }

  function chart(id, cfg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    var c = $(id);
    if (!c || typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'Inter Tight', ui-monospace, monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#6b6b75';
    charts[id] = new Chart(c, cfg);
  }
  var GRID = { color: 'rgba(255,255,255,.05)' };

  /* ── Bandeaux ─────────────────────────────────────────────────────────── */
  function caps() { return BK.Caps || {}; }
  var LINKS = function () { return BK.CONF.LINKS; };

  function syncBar() {
    var z = $('bk-sync'); if (!z) return;
    var S = BK.Store, s = S.sync, txt, cls = 'sync';
    if (S.mode === 'demo') { z.innerHTML = '<span class="sync demo">● Exemple — données fictives</span>'; return; }
    if (S.mode === 'device') {
      txt = {
        anon: '● Enregistré sur cet appareil',
        free: '● Enregistré sur cet appareil',
        unavailable: '● Enregistré sur cet appareil (synchro du compte bientôt disponible)',
        lapsed: '● Enregistré sur cet appareil (synchro arrêtée)',
        pending: '● Enregistré sur cet appareil — compte injoignable, nouvel essai…'
      }[S.reason] || '● Enregistré sur cet appareil';
      z.innerHTML = '<span class="sync' + (S.reason === 'pending' ? ' warn' : '') + '">' + esc(txt) + '</span>';
      return;
    }
    switch (s.status) {
      case 'synced': txt = '● Synchronisé avec ton compte MatchUp'; cls += ' ok'; break;
      case 'saving': txt = '● Enregistrement…'; break;
      case 'loading': txt = '● Chargement de tes paris…'; break;
      case 'offline': txt = '● Hors connexion — ' + s.pending + ' modif. en attente'; cls += ' warn'; break;
      case 'error': txt = '● ' + (s.error || 'Erreur de synchronisation'); cls += ' err'; break;
      default: txt = '';
    }
    z.innerHTML = txt ? '<span class="' + cls + '">' + esc(txt) + '</span>' : '';
  }

  /** Bouton du compte, en haut à droite. */
  function acct() {
    var z = $('bk-acct'); if (!z) return;
    var A = BK.Auth || {};
    if (!A.ready) { z.innerHTML = '<span class="acct-dot"></span>Compte<span class="acct-long"> MatchUp</span>'; return; }
    if (!A.user) { z.innerHTML = '<span class="acct-dot"></span>Connexion<span class="acct-long"> MatchUp</span>'; z.classList.remove('on'); return; }
    var mail = String(A.user.email || 'Mon compte');
    z.classList.add('on');
    z.innerHTML = '<span class="acct-dot' + (A.premium ? ' prem' : '') + '"></span><span class="acct-mail">' + esc(mail) + '</span><span class="acct-short">Compte</span>' +
      (A.premium ? '<span class="acct-tag">Premium</span>' : '');
  }

  function gate() {
    var z = $('bk-gate'); if (!z) return;
    var S = BK.Store, html = '';
    if (S.notice) {
      html += '<div class="gate ' + (S.notice.type === 'err' ? 'err' : 'warn') + '"><div class="gate-txt">' + esc(S.notice.text) + '</div>' +
        '<div class="gate-cta">' + (S.notice.type !== 'err' && S.reason === 'lapsed' ? '<a class="btn btn-primary btn-sm" href="' + esc(LINKS().premium) + '" target="_blank" rel="noopener">Réactiver Premium</a>' : '') +
        '<button class="btn btn-ghost btn-sm" data-act="notice-ok">OK</button></div></div>';
    }
    if (S.mode === 'demo') {
      html += '<div class="gate info"><div class="gate-txt"><b>Exemple, données fictives.</b> Rien de tout ça n\'est enregistré : c\'est pour voir à quoi ressemble ton suivi une fois quelques paris ajoutés.</div>' +
        '<div class="gate-cta"><button class="btn btn-primary btn-sm" data-act="demo-stop">Commencer avec mes paris</button></div></div>';
    }
    if (S.mode === 'cloud' && S.offers.merge > 0) {
      var n = S.offers.merge;
      html += '<div class="gate"><div class="gate-txt"><b>' + n + ' pari' + (n > 1 ? 's' : '') + ' enregistré' + (n > 1 ? 's' : '') + ' sur cet appareil</b> en dehors de ton compte. ' +
        (S.mergeDismissed() ? '' : 'Les ajouter à ton compte pour les retrouver partout ?') + '</div>' +
        '<div class="gate-cta"><button class="btn btn-primary btn-sm" data-act="merge">Les ajouter à mon compte</button>' +
        (S.mergeDismissed() ? '' : '<button class="btn btn-ghost btn-sm" data-act="merge-later">Plus tard</button>') + '</div></div>';
    }
    if (S.mode === 'device' && S.offers.copy && !S.copyDismissed()) {
      var c = S.offers.copy.n;
      html += '<div class="gate info"><div class="gate-txt"><b>Ton compte MatchUp contient ' + c + ' pari' + (c > 1 ? 's' : '') + '</b> synchronisé' + (c > 1 ? 's' : '') + ' quand tu étais abonné. ' +
        'Tu peux les copier sur cet appareil et continuer gratuitement (sans synchro).</div>' +
        '<div class="gate-cta"><button class="btn btn-primary btn-sm" data-act="copy">Les copier ici</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="copy-later">Non merci</button></div></div>';
    }
    z.innerHTML = html;
    onboard();
  }

  function onboard() {
    var z = $('bk-onboard'); if (!z) return;
    var S = BK.Store, s = S.state.settings;
    if (!writable() || s.initialized || S.state.bets.length) { z.innerHTML = ''; return; }
    if (z.querySelector('form[data-form=onboard]')) return;   // ne pas effacer une saisie en cours
    z.innerHTML = '<form class="onboard" data-form="onboard">' +
      '<div><b>Pour commencer : combien as-tu sur tes comptes de paris ?</b>' +
      '<span class="hint">C\'est ta bankroll de départ. Elle sert à calculer le % engagé à chaque pari et ta progression. Tu pourras la changer dans Réglages.</span></div>' +
      '<label class="f sm"><span>Bankroll de départ</span><input name="initialBankroll" inputmode="decimal" placeholder="500"></label>' +
      '<label class="f sm"><span>1 unité =</span><input name="unitValue" inputmode="decimal" placeholder="10"></label>' +
      '<button class="btn btn-primary" type="submit">Valider</button></form>';
  }

  /* ── Garde-fous (jeu responsable) ─────────────────────────────────────── */
  function alerts(g) {
    if (BK.Store.mode === 'demo') return '';
    var s = BK.Store.state.settings, out = [];
    var lim = U.num(s.monthlyLossLimit);
    if (lim > 0 && -g.monthLoss >= lim) {
      out.push('Tu as atteint ta limite de perte du mois (' + money(lim, 0) + '). C\'est peut-être le bon moment pour faire une pause.');
    }
    var n = U.num(s.lossStreakAlert);
    if (n > 0 && g.streaks.type === 'L' && g.streaks.current >= n) {
      out.push(g.streaks.current + ' pertes d\'affilée. Une série comme ça arrive à tout le monde ; évite d\'augmenter tes mises pour « te refaire ».');
    }
    return out.map(function (t) { return '<div class="alert">' + esc(t) + ' <a href="https://www.joueurs-info-service.fr/" target="_blank" rel="noopener">Joueurs Info Service</a></div>'; }).join('');
  }

  /* ── Tableau de bord ──────────────────────────────────────────────────── */
  function pendingLine(b) {
    var sels = b.selections || [], now = Date.now(), msg = '', cls = '';
    var review = sels.map(function (s) { return s.review; }).filter(Boolean)[0];
    var linked = sels.filter(function (s) { return s.mu; });
    var auto = !!caps().autoSettle;
    if (review) {
      var sx = sels.find(function (s) { return s.review; });
      var who = sx && sx.mu ? (review.winner === 'A' ? sx.mu.pa : sx.mu.pb) : '';
      var R = {
        ret: 'Abandon en cours de match (' + review.score + '). La règle dépend de ton bookmaker : à toi de trancher.',
        wo: 'Forfait avant le match. La plupart des bookmakers remboursent : à vérifier.',
        data: 'Résultat incertain dans nos données (' + review.score + '). Vérifie avant de régler.',
        market: 'Résultat : ' + who + ' gagne ' + (review.winner === 'A' ? review.score : BK.Settle.scoreText(BK.Settle.swap(BK.Settle.parseScore(review.score)))) + '. Marché libre : règle-le toi-même.'
      };
      msg = '⚠️ ' + (R[review.reason] || 'À vérifier.'); cls = 'warn';
    } else if (linked.length) {
      var started = linked.filter(function (s) { return s.mu.start && s.mu.start <= now; });
      var tous = started.length === linked.length || linked.some(function (s) { return s.result && s.result !== 'pending'; });
      var structure = linked.every(function (s) { return M.valid(s.mk); });
      if (auto && structure) msg = tous ? '🔄 En attente du résultat MatchUp (mis à jour toutes les 3 h environ)' : '🎾 ' + BK.Form.when(linked[0].mu) + ' — réglé automatiquement après le match';
      else if (tous) msg = '✍️ Match commencé : règle-le dès qu\'il est fini';
      else msg = '🎾 ' + BK.Form.when(linked[0].mu);
    }
    return msg ? '<div class="pline ' + cls + '">' + esc(msg) + '</div>' : '';
  }

  function quick(b, noEdit) {
    if (!writable()) return '';
    return '<div class="quick">' +
      '<button class="q q-won" data-act="settle" data-id="' + esc(b.id) + '" data-st="won" title="Gagné">✓</button>' +
      '<button class="q q-lost" data-act="settle" data-id="' + esc(b.id) + '" data-st="lost" title="Perdu">✗</button>' +
      '<button class="q" data-act="settle" data-id="' + esc(b.id) + '" data-st="void" title="Remboursé">↩</button>' +
      (noEdit ? '' : '<button class="q" data-act="edit" data-id="' + esc(b.id) + '" title="Modifier">✎</button>') + '</div>';
  }

  function betRow(b, opts) {
    var p = ST.betProfit(b), settled = ST.isSettled(b);
    return '<div class="brow" data-id="' + esc(b.id) + '">' +
      '<div class="brow-main"><div class="brow-t"><span class="flag">' + flagOf(b) + '</span>' + esc(title(b)) +
      (b.autoSettled ? ' <span class="badge b-auto" title="Réglé automatiquement à partir du score MatchUp">Auto</span>' : '') +
      '</div><div class="brow-s">' + esc(sub(b)) + '</div>' + (!settled ? pendingLine(b) : '') + '</div>' +
      '<div class="brow-n"><span class="mono">@' + U.odds(ST.oddsOf(b)) + '</span><span class="mono dim">' + money(U.num(b.stake), 2) + (b.isFreebet ? ' FB' : '') + '</span></div>' +
      '<div class="brow-r">' + (settled ? '<span class="mono ' + U.cls(p) + '">' + smoney(p) + '</span>' + badge(b.status) : (opts && opts.quick ? quick(b, opts.noEdit) : badge('pending'))) + '</div>' +
      '</div>';
  }

  function kpi(label, val, subtxt, cls) {
    return '<div class="kpi"><div class="kpi-l">' + esc(label) + '</div><div class="kpi-v ' + (cls || '') + '">' + val + '</div><div class="kpi-s">' + (subtxt || '') + '</div></div>';
  }
  function pctOrRaw(v, n, won) {
    if (n < ST.MIN_PCT) return n ? won + '/' + n : '—';
    return U.pct(v).replace('+', '');
  }

  function dash() {
    var z = $('v-dash'); if (!z) return;
    var S = BK.Store.state, g = ST.global(S), s = S.settings;
    var pending = S.bets.filter(function (b) { return b.status === 'pending'; })
      .sort(function (a, b) { return String(a.eventDate || '').localeCompare(String(b.eventDate || '')); });
    var recent = S.bets.filter(ST.isSettled).sort(function (a, b) { return ST.sortKey(b).localeCompare(ST.sortKey(a)); }).slice(0, 6);
    var mv = ST.split(S, 'muValue').find(function (x) { return x.key === 'Dans le sens de la value'; });

    if (!S.bets.length && writable()) {
      z.innerHTML = alerts(g) + '<div class="empty"><div class="empty-ico">🎾</div><h3>Aucun pari pour l\'instant</h3>' +
        '<p>Ajoute ton premier pari en deux touches depuis le programme tennis du jour (joueurs, tournoi et horaire pré-remplis), en photo de ton ticket, ou à la main pour les autres sports.</p>' +
        '<div class="empty-cta"><button class="btn btn-primary" data-act="go" data-view="add">Ajouter un pari</button>' +
        '<button class="btn btn-ghost" data-act="demo">Voir un exemple</button></div></div>';
      return;
    }

    var bkCls = g.profit > 0.004 ? 'pos' : g.profit < -0.004 ? 'neg' : '';
    var showMu = !!(mv || g.nAuto || caps().premium);
    var k = [
      kpi('Yield', g.yield == null ? '—' : U.pct(g.yield), 'sur ' + money(g.staked, 0) + ' misés', U.cls(g.yield || 0)),
      kpi('Réussite', g.nDecided < ST.MIN_PCT ? (g.nDecided ? g.nWon + '/' + g.nDecided : '—') : U.fr(g.winrate, 1) + ' %', g.nWon + ' gagnés sur ' + g.nDecided, ''),
      kpi('Cote moyenne', g.avgOdds ? U.odds(g.avgOdds) : '—', g.nSettled + ' paris réglés', ''),
      kpi('Drawdown max', g.maxDD.value > 0 ? '−' + money(g.maxDD.value, 0) : '—', g.maxDD.value > 0 ? '−' + U.fr(g.maxDD.pct, 1) + ' % depuis le plus haut' : 'aucune baisse', g.maxDD.value > 0 ? 'neg' : ''),
      kpi('Série en cours', g.streaks.type ? g.streaks.current + (g.streaks.type === 'W' ? ' ✓' : ' ✗') : '—', 'record ' + g.streaks.bestWin + ' ✓ / ' + g.streaks.bestLoss + ' ✗', g.streaks.type === 'W' ? 'pos' : g.streaks.type === 'L' ? 'neg' : ''),
      kpi('CLV', g.clvN >= ST.MIN_PCT ? U.pct(g.clvAvg) : '—', g.clvN ? 'clôture battue ' + (g.clvN >= ST.MIN_PCT ? U.fr(g.clvBeat, 0) + ' %' : g.clvN + ' pari(s)') : 'cote obtenue vs clôture', g.clvN >= ST.MIN_PCT ? U.cls(g.clvAvg) : '')
    ];
    if (showMu) {
      k.push(kpi('Value MatchUp suivie', mv ? (mv.brut ? mv.won + '/' + mv.decided : U.pct(mv.yield)) : '—', mv ? mv.n + ' pari' + (mv.n > 1 ? 's' : '') + (mv.brut ? '' : ' · yield') : 'paris dans le sens d\'un signal', mv && !mv.brut ? U.cls(mv.yield) : ''));
      k.push(kpi('Réglés tout seuls', String(g.nAuto), 'à partir des scores MatchUp', ''));
    } else {
      k.push(kpi('Profit factor', g.profitFactor == null ? '—' : g.profitFactor === Infinity ? '∞' : U.fr(g.profitFactor, 2), 'gains ÷ pertes', ''));
      k.push(kpi('Mise moyenne', g.nSettled ? money(g.avgStake) : '—', g.avgStakePct != null ? U.fr(g.avgStakePct, 2) + ' % de ta bankroll' : '', ''));
    }
    z.innerHTML = alerts(g) +
      '<div class="hero">' +
      '<div><div class="hero-l">Bankroll actuelle</div><div class="hero-v ' + bkCls + '">' + money(g.bankroll) + '</div>' +
      '<div class="hero-s">Départ ' + money(g.initial, 0) + ' · <b class="' + U.cls(g.profit) + '">' + smoney(g.profit) + '</b>' +
      (g.growth != null ? ' (' + U.pct(g.growth) + ')' : '') + '</div></div>' +
      '<div class="hero-side"><div><span>Ce mois-ci</span><b class="' + U.cls(g.monthProfit) + '">' + smoney(g.monthProfit) + '</b></div>' +
      '<div><span>En jeu</span><b>' + money(g.exposure) + '</b><em>' + g.nPending + ' pari' + (g.nPending > 1 ? 's' : '') + '</em></div>' +
      '<div><span>Gain potentiel</span><b class="pos">+' + money(g.potential) + '</b></div></div></div>' +
      '<div class="kpis">' + k.join('') + '</div>' +
      '<div class="card"><div class="card-h"><h3>Évolution de la bankroll</h3><span class="hint">' + g.nSettled + ' paris réglés</span></div>' +
      '<div class="chart-box"><canvas id="ch-bk"></canvas></div></div>' +
      '<div class="cols2">' +
      '<div class="card"><div class="card-h"><h3>En attente</h3><span class="hint">' + (pending.length ? pending.length + ' · ' + money(g.exposure) + ' engagés' : '') + '</span></div>' +
      (pending.length ? pending.slice(0, 12).map(function (b) { return betRow(b, { quick: true }); }).join('') +
        (pending.length > 12 ? '<button class="lnk" data-act="go" data-view="hist" data-filter="pending">Voir les ' + pending.length + ' paris en attente →</button>' : '')
        : '<div class="emptyline">Aucun pari en cours.</div>') + '</div>' +
      '<div class="card"><div class="card-h"><h3>Derniers résultats</h3><button class="lnk" data-act="go" data-view="hist">Historique →</button></div>' +
      (recent.length ? recent.map(function (b) { return betRow(b); }).join('') : '<div class="emptyline">Pas encore de pari réglé.</div>') + '</div>' +
      '</div>';

    var pts = g.curve;
    chart('ch-bk', {
      type: 'line',
      data: { labels: pts.map(function (p) { return p.date ? U.fdate(p.date) : 'Départ'; }),
        datasets: [{ data: pts.map(function (p) { return p.value; }), borderColor: '#4ade80', borderWidth: 2,
          pointRadius: pts.length > 60 ? 0 : 2.5, pointBackgroundColor: '#4ade80', fill: true, tension: .25,
          backgroundColor: function (c) {
            var gr = c.chart.ctx.createLinearGradient(0, 0, 0, c.chart.height || 260);
            gr.addColorStop(0, 'rgba(74,222,128,.18)'); gr.addColorStop(1, 'rgba(74,222,128,0)'); return gr;
          } }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: function (it) { var p = pts[it[0].dataIndex]; return p.bet ? title(p.bet) + ' — ' + U.fdate(p.date) : 'Bankroll de départ'; },
          label: function (it) { var p = pts[it.dataIndex]; return ' ' + money(it.parsed.y) + (p.bet ? ' (' + smoney(ST.betProfit(p.bet)) + ')' : ''); } } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } }, y: { grid: GRID, ticks: { callback: function (v) { return money(v, 0); } } } } }
    });
  }

  /* ── Historique ───────────────────────────────────────────────────────── */
  var H = { q: '', status: '', book: '', circuit: '', period: '', auto: '', limit: 60 };

  function hist() {
    var z = $('v-hist'); if (!z) return;
    var S = BK.Store.state;
    var books = Array.from(new Set(S.bets.map(function (b) { return b.bookmaker; }).filter(Boolean))).sort();
    if (!z.querySelector('.filters')) {
      z.innerHTML = '<div class="filters">' +
        '<input class="fin" data-h="q" placeholder="Rechercher un joueur, un tournoi…" value="' + esc(H.q) + '">' +
        '<select class="fsel" data-h="status"><option value="">Tous les statuts</option>' + Object.keys(U.STATUS).map(function (k) { return '<option value="' + k + '"' + (H.status === k ? ' selected' : '') + '>' + esc(U.STATUS[k][0]) + '</option>'; }).join('') + '</select>' +
        '<select class="fsel" data-h="book"><option value="">Tous les bookmakers</option></select>' +
        '<select class="fsel" data-h="circuit"><option value="">Tous les circuits</option><option value="ATP">ATP</option><option value="CH">Challenger</option><option value="WTA">WTA</option><option value="ITF">ITF</option><option value="none">Hors programme MatchUp</option></select>' +
        '<select class="fsel" data-h="period"><option value="">Toute la période</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">3 derniers mois</option><option value="365">12 derniers mois</option></select>' +
        '<select class="fsel" data-h="auto"><option value="">Tous les règlements</option><option value="1">Réglés automatiquement</option><option value="0">Réglés à la main</option></select>' +
        '</div><div class="hist-count" data-z="count"></div><div data-z="list"></div>';
    }
    var bs = z.querySelector('[data-h=book]');
    bs.innerHTML = '<option value="">Tous les bookmakers</option>' + books.map(function (b) { return '<option' + (H.book === b ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('');
    ['status', 'circuit', 'period', 'auto'].forEach(function (k) { var x = z.querySelector('[data-h=' + k + ']'); if (x) x.value = H[k]; });

    var q = U.normName(H.q), today = U.today();
    var list = S.bets.filter(function (b) {
      if (H.status && b.status !== H.status) return false;
      if (H.book && b.bookmaker !== H.book) return false;
      if (H.auto === '1' && !b.autoSettled) return false;
      if (H.auto === '0' && (b.autoSettled || b.status === 'pending')) return false;
      if (H.circuit) {
        var mu = (b.selections || [])[0] && b.selections[0].mu;
        if (H.circuit === 'none' ? mu : (!mu || mu.circuit !== H.circuit)) return false;
      }
      if (H.period) {
        var d = String(b.eventDate || b.betDate || '').slice(0, 10);
        if (!d || U.dayDiff(d, today) > +H.period) return false;
      }
      if (q) {
        var hay = U.normName([b.bookmaker, b.competition, b.notes, b.tipster].concat((b.selections || []).map(function (s) { return [s.event, s.pick, s.market, s.mu && s.mu.tournament].join(' '); })).join(' '));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return String(b.eventDate || b.betDate).localeCompare(String(a.eventDate || a.betDate)) || String(b.createdAt).localeCompare(String(a.createdAt)); });

    var prof = list.filter(ST.isSettled).reduce(function (a, b) { return a + ST.betProfit(b); }, 0);
    z.querySelector('[data-z=count]').innerHTML = list.length + ' pari' + (list.length > 1 ? 's' : '') + (list.length ? ' · <span class="' + U.cls(prof) + '">' + smoney(prof) + '</span>' : '');
    z.querySelector('[data-z=list]').innerHTML = list.length
      ? list.slice(0, H.limit).map(function (b) {
        return '<div class="hrow">' +
          '<div class="hrow-d mono">' + esc(U.fdate(b.eventDate || b.betDate)) + '<span>' + esc(b.bookmaker) + '</span></div>' +
          betRow(b, { quick: b.status === 'pending', noEdit: true }) +
          '<div class="hrow-a">' + (writable() ? '<button class="q" data-act="edit" data-id="' + esc(b.id) + '" title="Modifier">✎</button><button class="q" data-act="del" data-id="' + esc(b.id) + '" title="Supprimer">🗑</button>' : '') + '</div>' +
          '</div>';
      }).join('') + (list.length > H.limit ? '<button class="btn btn-ghost btn-sm more-btn" data-act="more">Afficher plus (' + (list.length - H.limit) + ')</button>' : '')
      : '<div class="emptyline">Aucun pari ne correspond à ces filtres.</div>';
  }

  /* ── Analyse ──────────────────────────────────────────────────────────── */
  // [dimension, titre, aide, demande l'analyse d'abonné]
  var MU_DIMS = [
    ['muValue', 'Avec ou contre la value MatchUp', 'Ton pari allait-il dans le sens d\'un signal value (ATP) au moment où tu l\'as pris ?', true],
    ['muFav', 'Favori ou outsider', 'D\'après la proba du marché (Pinnacle) au moment du pari.', true],
    ['muStyle', 'Avantage de style', 'Matrice style × style × surface de MatchUp, vue du joueur que tu as joué.', true],
    ['muPrice', 'Ta cote face au marché', 'Cote obtenue comparée à la cote du marché au moment du pari (vainqueur du match).', true],
    ['muSurface', 'Surface', '', false],
    ['muCircuit', 'Circuit', '', false],
    ['muRound', 'Tour du tableau', '', false],
    ['muMarket', 'Type de marché', '', false],
    ['muArch', 'Style du joueur joué', '', true]
  ];
  var HORS = ['Hors programme MatchUp', 'Combinés'];
  var CLASSIC = [['bookmaker', 'Bookmaker'], ['sport', 'Sport'], ['oddsRange', 'Tranche de cotes'], ['betType', 'Type'],
    ['market', 'Marché'], ['live', 'Live'], ['confidence', 'Confiance'], ['tipster', 'Source'], ['source', 'Ajout'], ['month', 'Mois'], ['weekday', 'Jour']];
  var anaTab = 'bookmaker';

  function splitRows(rows) {
    if (!rows.length) return '<div class="emptyline">Pas encore de pari réglé ici.</div>';
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.profit); }).concat([1]));
    return rows.map(function (r) {
      var y = r.brut ? '<span class="dim" title="Moins de ' + ST.MIN_PCT + ' paris : pas de pourcentage">' + r.won + '/' + r.decided + '</span>'
        : '<span class="' + U.cls(r.yield) + (r.fragile ? ' fragile' : '') + '" title="' + (r.fragile ? 'Moins de ' + ST.FRAGILE + ' paris : à prendre avec prudence' : '') + '">' + U.pct(r.yield) + '</span>';
      var w = Math.round(Math.abs(r.profit) / max * 100);
      return '<div class="srow' + (r.brut ? ' brut' : '') + '"><div class="srow-k">' + esc(r.key) + '</div>' +
        '<div class="srow-n mono">' + r.n + '</div>' +
        '<div class="srow-y mono">' + y + '</div>' +
        '<div class="srow-p mono ' + U.cls(r.profit) + '">' + smoney(r.profit, 0) + '</div>' +
        '<div class="srow-bar"><i class="' + (r.profit >= 0 ? 'pos' : 'neg') + '" style="width:' + w + '%"></i></div></div>';
    }).join('');
  }
  var SPLIT_HEAD = '<div class="srow head"><div class="srow-k"></div><div class="srow-n">Paris</div><div class="srow-y">Yield</div><div class="srow-p">Profit</div><div class="srow-bar"></div></div>';

  /** Carte « Lecture MatchUp » : tes paris reliés au programme, découpés avec
   *  ses données. Les découpages qui demandent l'analyse d'abonné (value,
   *  style, cote du marché) n'apparaissent que si au moins un pari a été pris
   *  avec cette analyse visible. */
  function muCard(S) {
    var settled = S.bets.filter(ST.isSettled);
    var lies = settled.filter(function (b) { return b.selections && b.selections.length === 1 && b.selections[0].mu; });
    if (!lies.length) {
      return '<div class="card"><div class="card-h"><h3>🎾 Lecture MatchUp</h3></div><p class="hint">Les paris tennis ajoutés depuis le programme MatchUp seront découpés ici : surface, circuit, tour du tableau, type de marché' +
        (caps().premium ? ', value MatchUp, style de jeu et cote du marché' : '') + '.</p></div>';
    }
    var full = lies.some(function (b) { return b.selections[0].mu.full !== false; });
    var dims = MU_DIMS.filter(function (d) { return full || !d[3]; });
    return '<div class="card"><div class="card-h"><h3>🎾 Lecture MatchUp</h3><span class="hint">tes paris reliés au programme, découpés avec les données MatchUp</span></div>' +
      '<p class="disclaimer">Ces chiffres décrivent tes paris passés ; ils ne prédisent pas les prochains. Sous ' + ST.MIN_PCT + ' paris on n\'affiche pas de pourcentage, et sous ' + ST.FRAGILE + ' le chiffre est grisé.</p>' +
      (full ? '' : '<p class="hint mu-lock">🔒 Value MatchUp, avantage de style et cote du marché : visibles pour les paris ajoutés avec un compte <a href="' + esc(LINKS().premium) + '" target="_blank" rel="noopener">MatchUp Premium</a> connecté.</p>') +
      '<div class="mugrid">' + dims.map(function (d) {
        var rows = ST.split(S, d[0]).filter(function (r) { return HORS.indexOf(r.key) === -1 && r.key !== ST.NON_VISIBLE; });
        return '<div class="mucard"><h4>' + esc(d[1]) + '</h4>' + (d[2] ? '<p class="hint">' + esc(d[2]) + '</p>' : '') + SPLIT_HEAD + splitRows(rows) + '</div>';
      }).join('') + '</div></div>';
  }

  function ana() {
    var z = $('v-ana'); if (!z) return;
    var S = BK.Store.state, g = ST.global(S);
    if (!g.nSettled) {
      z.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><h3>L\'analyse arrive avec tes premiers résultats</h3><p>Dès que des paris sont réglés, tu verras ici où tu gagnes vraiment : bookmakers, cotes, marchés, surfaces, circuits.</p></div>';
      return;
    }
    z.innerHTML =
      '<div class="kpis">' +
      kpi('Profit', smoney(g.profit), money(g.staked, 0) + ' misés', U.cls(g.profit)) +
      kpi('Yield', g.yield == null ? '—' : U.pct(g.yield), g.nSettled + ' paris', U.cls(g.yield || 0)) +
      kpi('Profit factor', g.profitFactor == null ? '—' : g.profitFactor === Infinity ? '∞' : U.fr(g.profitFactor, 2), 'gains ÷ pertes', '') +
      kpi('Espérance / pari', smoney(g.evPerBet), 'écart-type ' + money(g.stdDev), U.cls(g.evPerBet)) +
      kpi('Mise moyenne', money(g.avgStake), g.avgStakePct != null ? U.fr(g.avgStakePct, 2) + ' % de ta bankroll' : '', '') +
      kpi('Meilleur pari', g.best ? smoney(ST.betProfit(g.best), 0) : '—', g.best ? esc(title(g.best)) : '', 'pos') +
      kpi('Pire pari', g.worst ? smoney(ST.betProfit(g.worst), 0) : '—', g.worst ? esc(title(g.worst)) : '', 'neg') +
      kpi('CLV moyen', g.clvN >= ST.MIN_PCT ? U.pct(g.clvAvg) : '—', g.clvN + ' pari' + (g.clvN > 1 ? 's' : '') + ' avec clôture', g.clvN >= ST.MIN_PCT ? U.cls(g.clvAvg) : '') +
      '</div>' +
      muCard(S) +
      '<div class="cols2">' +
      '<div class="card"><div class="card-h"><h3>Profit par mois</h3></div><div class="chart-box sm"><canvas id="ch-month"></canvas></div></div>' +
      '<div class="card"><div class="card-h"><h3>Yield par tranche de cotes</h3></div><div class="chart-box sm"><canvas id="ch-odds"></canvas></div></div>' +
      '</div>' +
      '<div class="card"><div class="card-h"><h3>Tous les découpages</h3></div>' +
      '<div class="tabs2">' + CLASSIC.map(function (c) { return '<button data-act="anatab" data-tab="' + c[0] + '" aria-pressed="' + (anaTab === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<div data-z="classic">' + SPLIT_HEAD + splitRows(ST.split(S, anaTab)) + '</div></div>';

    var months = ST.split(S, 'month');
    chart('ch-month', { type: 'bar', data: { labels: months.map(function (m) { return m.key; }),
      datasets: [{ data: months.map(function (m) { return +m.profit.toFixed(2); }), backgroundColor: months.map(function (m) { return m.profit >= 0 ? 'rgba(74,222,128,.7)' : 'rgba(239,68,68,.7)'; }), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: GRID, ticks: { callback: function (v) { return money(v, 0); } } } } } });
    // Une tranche sous 5 paris n'a pas de yield (garde-fou) : on ne la dessine
    // pas à 0 %, ce qui ferait croire à un résultat nul.
    var odds = ST.split(S, 'oddsRange').filter(function (r) { return r.key !== 'Cote inconnue' && !r.brut; });
    if (!odds.length) {
      var box = $('ch-odds') && $('ch-odds').parentNode;
      if (box) box.innerHTML = '<div class="emptyline">Pas encore 5 paris dans une même tranche de cotes.</div>';
    } else chart('ch-odds', { type: 'bar', data: { labels: odds.map(function (r) { return r.key + ' (' + r.n + ')'; }),
      datasets: [{ data: odds.map(function (r) { return +(r.yield || 0).toFixed(1); }), backgroundColor: odds.map(function (r) { return (r.yield || 0) >= 0 ? 'rgba(74,222,128,.7)' : 'rgba(239,68,68,.7)'; }), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (it) { var r = odds[it.dataIndex]; return ' yield ' + U.pct(r.yield) + ' sur ' + r.n + ' paris'; } } } },
        scales: { x: { grid: { display: false } }, y: { grid: GRID, ticks: { callback: function (v) { return v + ' %'; } } } } } });
  }
  function setAnaTab(t) {
    anaTab = t;
    var z = $('v-ana'); if (!z) return;
    z.querySelectorAll('[data-act=anatab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === t)); });
    var c = z.querySelector('[data-z=classic]');
    if (c) c.innerHTML = SPLIT_HEAD + splitRows(ST.split(BK.Store.state, t));
  }

  /* ── Compte MatchUp ───────────────────────────────────────────────────── */
  var PERKS = '<ul class="perks"><li>Cotes du programme pré-remplies</li><li>Photo de l\'analyse MatchUp au moment du pari (value, styles, proba)</li>' +
    '<li>Paris tennis réglés tout seuls après le match</li><li>Tes paris synchronisés sur tous tes appareils</li></ul>';

  function accountHTML() {
    var A = BK.Auth || {}, S = BK.Store, L = LINKS();
    if (!A.user) {
      return '<p class="hint">Pas connecté. Le site marche entièrement sans compte : tes paris restent sur cet appareil.</p>' +
        '<p class="acct-p"><b>Abonné MatchUp Tennis ?</b> Connecte ton compte pour avoir en plus :</p>' + PERKS +
        '<div class="row-btns"><button class="btn btn-primary btn-sm" data-act="login">Connecter mon compte MatchUp</button>' +
        '<a class="btn btn-ghost btn-sm" href="' + esc(L.premium) + '" target="_blank" rel="noopener">Découvrir MatchUp Premium ↗</a></div>';
    }
    var who = '<p class="acct-p">Connecté : <b>' + esc(A.user.email || '') + '</b> · ' + (A.premium ? '<span class="pos">Premium ✓</span>' : 'compte gratuit') + '</p>';
    var etat;
    if (A.premium && S.mode === 'cloud') etat = '<p class="hint">Cotes, analyse et règlement automatique actifs. Tes paris sont synchronisés : tu les retrouves sur tous tes appareils, visibles de toi seul.</p>';
    else if (A.premium) etat = '<p class="hint">Cotes, analyse et règlement automatique actifs. La synchro entre appareils n\'est pas encore activée : tes paris restent sur cet appareil (exporte-les pour en changer).</p>';
    else etat = '<p class="hint">Le compte gratuit n\'ajoute rien ici : avec MatchUp Premium tu aurais en plus :</p>' + PERKS;
    var offre = '';
    if (S.mode === 'device' && S.offers.copy) offre = '<p class="hint">Ton compte contient ' + S.offers.copy.n + ' pari(s) d\'une période Premium. <button class="lnk" data-act="copy">Les copier sur cet appareil</button></p>';
    if (S.mode === 'cloud' && S.offers.merge) offre = '<p class="hint">' + S.offers.merge + ' pari(s) de cet appareil ne sont pas sur ton compte. <button class="lnk" data-act="merge">Les ajouter</button></p>';
    return who + etat + offre + '<div class="row-btns">' +
      (A.premium ? '' : '<a class="btn btn-primary btn-sm" href="' + esc(L.premium) + '" target="_blank" rel="noopener">Passer Premium ↗</a><button class="btn btn-ghost btn-sm" data-act="refresh-premium">J\'ai pris Premium : actualiser</button>') +
      '<button class="btn btn-ghost btn-sm" data-act="logout">Se déconnecter</button></div>';
  }

  function loginModal(msg) {
    var L = LINKS();
    modal('Compte MatchUp Tennis', '<form class="bk-form" data-form="login" autocomplete="on">' +
      '<p class="hint">Mêmes identifiants que sur matchup-tennis.fr. Ta session ici est indépendante : te déconnecter d\'un site ne déconnecte pas l\'autre.</p>' +
      '<label class="f"><span>E-mail</span><input name="email" type="email" autocomplete="username" inputmode="email" required></label>' +
      '<label class="f"><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password" required></label>' +
      '<div data-z="loginmsg" class="loginmsg">' + (msg ? esc(msg) : '') + '</div>' +
      '<div class="form-end"><button class="btn btn-primary" type="submit">Se connecter</button>' +
      '<button type="button" class="lnk" data-act="forgot">Mot de passe oublié ?</button></div>' +
      '<p class="acct-p">Avec MatchUp Premium :</p>' + PERKS +
      '<p class="hint">Pas encore de compte ? <a href="' + esc(L.signup) + '" target="_blank" rel="noopener">Crée-le sur matchup-tennis.fr</a> (gratuit), puis reviens te connecter ici.</p>' +
      '</form>');
    setTimeout(function () { var i = document.querySelector('#bk-modal input[name=email]'); if (i) i.focus(); }, 30);
  }
  function accountModal() {
    if (!(BK.Auth && BK.Auth.user)) return loginModal();
    modal('Compte MatchUp Tennis', '<div class="acct-box">' + accountHTML() + '</div>');
  }

  /* ── Réglages ─────────────────────────────────────────────────────────── */
  function settingsView() {
    var z = $('v-set'); if (!z) return;
    var S = BK.Store, s = S.state.settings, w = writable(), dis = w ? '' : ' disabled';
    var v = function (x) { return x == null || x === 0 && !s.initialized ? '' : esc(String(x).replace('.', ',')); };
    var donnees = S.mode === 'cloud'
      ? 'Tes paris sont enregistrés sur ton compte MatchUp : tu les retrouves sur tous tes appareils, visibles de toi seul.'
      : S.mode === 'demo' ? 'Exemple : rien n\'est enregistré.'
        : 'Tes paris sont enregistrés dans ce navigateur, sur cet appareil. Exporte-les de temps en temps : vider les données du navigateur les efface.';
    z.innerHTML =
      '<form class="card" data-form="bankroll"><div class="card-h"><h3>💰 Bankroll</h3></div><div class="grid3">' +
      '<label class="f"><span>Bankroll de départ</span><input name="initialBankroll" inputmode="decimal" value="' + v(s.initialBankroll) + '"' + dis + '></label>' +
      '<label class="f"><span>Valeur d\'une unité</span><input name="unitValue" inputmode="decimal" value="' + v(s.unitValue) + '"' + dis + '></label>' +
      '<label class="f"><span>Devise</span><select name="currency"' + dis + '>' + [['EUR', '€ Euro'], ['USD', '$ Dollar'], ['GBP', '£ Livre']].map(function (c) { return '<option value="' + c[0] + '"' + (s.currency === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Bookmaker par défaut</span><select name="defaultBook"' + dis + '><option value="">Aucun</option>' + U.books(s).map(function (b) { return '<option' + (s.defaultBook === b ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f wide2"><span>Tes bookmakers en plus (séparés par des virgules)</span><input name="customBooks" value="' + esc((s.customBooks || []).join(', ')) + '" placeholder="Ex. : Bet777, Feelingbet"' + dis + '></label>' +
      '</div>' + (w ? '<div class="form-end"><button class="btn btn-primary btn-sm" type="submit">Enregistrer</button></div>' : '') + '</form>' +
      '<form class="card" data-form="guard"><div class="card-h"><h3>🛡️ Garde-fous</h3><span class="hint">des alertes, jamais des blocages</span></div><div class="grid3">' +
      '<label class="f"><span>Mise max par pari (% de la bankroll)</span><input name="maxStakePct" inputmode="decimal" value="' + v(s.maxStakePct) + '"' + dis + '></label>' +
      '<label class="f"><span>Limite de perte par mois</span><input name="monthlyLossLimit" inputmode="decimal" value="' + v(s.monthlyLossLimit) + '" placeholder="aucune"' + dis + '></label>' +
      '<label class="f"><span>Alerte après X pertes d\'affilée</span><input name="lossStreakAlert" inputmode="numeric" value="' + v(s.lossStreakAlert) + '"' + dis + '></label>' +
      '</div>' + (w ? '<div class="form-end"><button class="btn btn-primary btn-sm" type="submit">Enregistrer</button></div>' : '') + '</form>' +
      '<div class="card"><div class="card-h"><h3>🎾 Compte MatchUp</h3><span class="hint">facultatif</span></div><div class="acct-box">' + accountHTML() + '</div></div>' +
      '<div class="card"><div class="card-h"><h3>💾 Tes données</h3></div>' +
      '<p class="hint">' + esc(donnees) + '</p>' +
      '<div class="row-btns">' +
      '<button class="btn btn-ghost btn-sm" data-act="export-json">⬇ Sauvegarde (JSON)</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="export-csv">⬇ Export CSV (Excel)</button>' +
      (w ? '<button class="btn btn-ghost btn-sm" data-act="import">⬆ Importer un fichier JSON</button><input type="file" accept=".json,application/json" data-z="import" hidden>' : '') +
      (w ? '<button class="btn btn-danger btn-sm" data-act="reset">Tout effacer</button>' : '') +
      '</div><p class="hint">L\'import accepte aussi les sauvegardes de l\'ancienne version du Bankroll Manager.</p></div>' +
      '<div class="card rg"><div class="card-h"><h3>Jouer reste un jeu</h3></div>' +
      '<p>Ce site t\'aide à suivre tes paris ; il ne prédit rien. Aucune analyse ne garantit un gain, et une bonne période peut être suivie d\'une mauvaise. ' +
      'Ne mise que ce que tu peux te permettre de perdre. Besoin d\'en parler ? <a href="https://www.joueurs-info-service.fr/" target="_blank" rel="noopener">Joueurs Info Service</a> — 09 74 75 13 13 (appel non surtaxé).</p></div>';
  }

  /* ── Fenêtre modale ───────────────────────────────────────────────────── */
  function modal(titleTxt, build) {
    var m = $('bk-modal'); if (!m) return null;
    m.querySelector('[data-z=mtitle]').textContent = titleTxt;
    var body = m.querySelector('[data-z=mbody]');
    body.innerHTML = '';
    m.hidden = false;
    document.body.classList.add('bk-noscroll');
    if (typeof build === 'string') body.innerHTML = build; else if (build) build(body);
    return body;
  }
  function closeModal() {
    var m = $('bk-modal'); if (!m) return;
    m.hidden = true;
    document.body.classList.remove('bk-noscroll');
    m.querySelector('[data-z=mbody]').innerHTML = '';
  }

  BK.UI = {
    toast: toast, badge: badge, title: title, sub: sub, flagOf: flagOf, betRow: betRow,
    syncBar: syncBar, gate: gate, acct: acct, dash: dash, hist: hist, H: H, ana: ana, setAnaTab: setAnaTab,
    settings: settingsView, accountHTML: accountHTML, loginModal: loginModal, accountModal: accountModal,
    modal: modal, closeModal: closeModal, chart: chart
  };
})(window.BK = window.BK || {});
