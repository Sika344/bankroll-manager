/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — ticket / formulaire de pari (BK.Form)

   Un seul composant pour tous les cas : ticket construit depuis le programme
   MatchUp, ticket lu sur une capture, saisie à la main, édition d'un pari.
   Une ligne RELIÉE à un match MatchUp porte un marché structuré (réglage
   automatique) et le contexte du match ; une ligne LIBRE garde le texte.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U, M = BK.Markets;
  var esc = U.esc;

  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function short(name) { var t = String(name || '').trim().split(/\s+/); return t.length > 1 ? t.slice(1).join(' ') : name; }
  function idx(side) { return side === 'B' ? 1 : 0; }
  function at(arr, side) { return arr && arr[idx(side)] != null ? arr[idx(side)] : null; }

  /** Ligne de ticket depuis une carte du programme : vainqueur, cote MatchUp. */
  function legFromCard(card, side) {
    return { mu: BK.MU.snapshot(card), mk: { type: 'winner', side: side }, odds: at(card.odds, side), result: 'pending' };
  }

  var WD = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function when(mu) {
    if (!mu || !mu.day) return '';
    var d = new Date(mu.day + 'T12:00:00Z');
    var label = mu.day === U.today() ? 'aujourd\'hui' : mu.day === U.addDays(U.today(), 1) ? 'demain' : WD[d.getUTCDay()] + ' ' + U.fdate(mu.day);
    return label + (mu.time ? ' ' + mu.time : '');
  }

  /** Le contexte MatchUp de la ligne, vu du côté joué. */
  function contextChips(sel) {
    var mu = sel.mu, mk = sel.mk || {};
    if (!mu) return '';
    // Carte réduite (sans abonnement) : rien à afficher, et on ne fait pas
    // comme si le match n'avait ni value ni style : on dit que c'est réservé.
    if (mu.full === false) return '<span class="chip c-lock">🔒 Cote et analyse MatchUp : réservées aux abonnés</span>';
    var side = BK.Stats.side(sel), chips = [];
    var name = side ? short(side === 'A' ? mu.pa : mu.pb) : null;
    if (mu.signal && mu.valueSide) {
      var vName = short(mu.valueSide === 'A' ? mu.pa : mu.pb);
      var lbl = mu.signal === 'STRONG_VALUE' ? 'Value forte' : 'Value modérée';
      if (side && side === mu.valueSide) chips.push('<span class="chip c-val">💎 ' + lbl + ' MatchUp sur ' + esc(vName) + '</span>');
      else if (side) chips.push('<span class="chip c-warn">La value MatchUp est sur ' + esc(vName) + '</span>');
      else chips.push('<span class="chip c-val">💎 ' + lbl + ' sur ' + esc(vName) + '</span>');
    }
    if (side) {
      var p = at(mu.pMkt, side);
      if (p != null) chips.push('<span class="chip">' + (p >= 0.5 ? 'Favori' : 'Outsider') + ' du marché · ' + Math.round(p * 100) + ' %</span>');
      var vs = at(mu.vsStyle, side);
      if (vs && vs.m >= 5 && vs.wr != null) {
        var w = Math.round(vs.wr * 100);
        chips.push('<span class="chip ' + (w >= 60 ? 'c-pos' : w < 45 ? 'c-neg' : '') + '">' + esc(name) + ' : ' + w + ' % face à ce style (' + vs.m + ' m.)</span>');
      }
      var e = at(mu.styleEdge, side);
      if (e != null && Math.abs(e) >= 0.02) chips.push('<span class="chip ' + (e > 0 ? 'c-pos' : 'c-neg') + '">Matrice des styles : ' + (e > 0 ? '+' : '−') + U.fr(Math.abs(e) * 100) + ' pts</span>');
      var pm = at(mu.pModel, side), o = U.num(sel.odds);
      if (mk.type === 'winner' && pm != null && o > 1) {
        var ev = (pm * o - 1) * 100;
        chips.push('<span class="chip ' + (ev >= 0 ? 'c-pos' : 'c-neg') + '" title="Estimation du modèle MatchUp à ta cote. Une aide à la décision, pas une promesse.">Proba MatchUp ' + Math.round(pm * 100) + ' % · espérance ' + U.pct(ev) + '</span>');
      }
      var mkt = at(mu.mkt, side);
      if (mk.type === 'winner' && mkt && o > 1) {
        var r = (o / mkt - 1) * 100;
        if (Math.abs(r) >= 1) chips.push('<span class="chip ' + (r > 0 ? 'c-pos' : 'c-neg') + '">Ta cote vs marché (' + U.odds(mkt) + ') : ' + U.pct(r) + '</span>');
      }
    }
    return chips.join('');
  }

  /** Ligne d'état du règlement (recalculée à chaque saisie). Le règlement
   *  automatique demande un abonnement MatchUp connecté (résultats Premium). */
  function autoLine(mk) {
    var auto = !!(BK.Caps && BK.Caps.autoSettle);
    return M.valid(mk)
      ? (auto ? '<div class="leg-auto ok">✓ Réglé automatiquement après le match, à partir du score MatchUp</div>'
        : '<div class="leg-auto">Tu le règles d\'un geste après le match <span class="dim">· automatique avec MatchUp Premium</span></div>')
      : mk && mk.type === 'other'
        ? '<div class="leg-auto">✍️ Marché libre : tu le régleras à la main (le score te sera rappelé)</div>'
        : '<div class="leg-auto warn">Complète le marché pour le réglage automatique</div>';
  }

  function legHTML(sel, i) {
    if (!sel.mu) {
      return '<div class="leg free" data-i="' + i + '">' +
        '<div class="leg-grid">' +
        '<label class="f wide"><span>Événement</span><input data-f="event" value="' + esc(sel.event) + '" placeholder="Sinner - Alcaraz" autocomplete="off"></label>' +
        '<label class="f"><span>Marché</span><input data-f="market" value="' + esc(sel.market) + '" placeholder="Vainqueur" autocomplete="off"></label>' +
        '<label class="f"><span>Sélection</span><input data-f="pick" value="' + esc(sel.pick) + '" placeholder="Sinner" autocomplete="off"></label>' +
        '<label class="f odds"><span>Cote</span><input data-f="odds" inputmode="decimal" value="' + esc(sel.odds == null ? '' : String(sel.odds).replace('.', ',')) + '" placeholder="1,85"></label>' +
        '</div>' +
        '<div class="leg-actions">' +
        '<button type="button" class="lnk" data-act="leg-link">🎾 Relier à un match MatchUp</button>' +
        '<button type="button" class="lnk muted" data-act="leg-del">Retirer la ligne</button>' +
        '</div></div>';
    }
    var mu = sel.mu, mk = sel.mk || { type: 'winner', side: 'A' };
    var need = M.NEEDS[mk.type] || [];
    var flag = typeof window !== 'undefined' && window.tFlag ? window.tFlag(mu.tournament, mu.country) : '🎾';
    var meta = [mu.tournament, mu.round, BK.MU.surfaceLabel(mu.surface, mu.indoor), when(mu)].filter(Boolean).join(' · ');
    var types = M.TYPES.map(function (t) { return opt(t[0], t[1], t[0] === mk.type); }).join('');
    var lineVal = mk.line == null ? '' : String(mk.line).replace('.', ',');
    var auto = autoLine(mk);
    return '<div class="leg linked" data-i="' + i + '">' +
      '<div class="leg-top"><span class="leg-meta">' + flag + ' ' + esc(meta) + '</span>' +
      '<span class="pill pill-' + esc(mu.circuit) + '">' + esc(BK.MU.CIRCUIT[mu.circuit] || mu.circuit) + '</span>' +
      '<button type="button" class="leg-x" data-act="leg-del" aria-label="Retirer cette ligne">✕</button></div>' +
      '<div class="leg-title">' + esc(mu.pa) + ' <span class="vs">–</span> ' + esc(mu.pb) + '</div>' +
      '<div class="leg-grid">' +
      '<label class="f wide"><span>Marché</span><select data-f="type">' + types + '</select></label>' +
      (need.indexOf('side') !== -1 ? '<label class="f"><span>Joueur</span><select data-f="side">' + opt('A', mu.pa, mk.side === 'A') + opt('B', mu.pb, mk.side === 'B') + '</select></label>' : '') +
      (need.indexOf('ou') !== -1 ? '<label class="f"><span>Sens</span><select data-f="ou">' + opt('over', 'Plus de', mk.ou !== 'under') + opt('under', 'Moins de', mk.ou === 'under') + '</select></label>' : '') +
      (need.indexOf('line') !== -1 ? '<label class="f sm"><span>' + (mk.type.indexOf('hcp') !== -1 ? 'Handicap' : 'Ligne') + '</span><input data-f="line" inputmode="decimal" value="' + esc(lineVal) + '" placeholder="' + (mk.type === 'games_ou' ? '22,5' : mk.type === 'sets_ou' ? '2,5' : mk.type === 'games_hcp' ? '-3,5' : '+1,5') + '"></label>' : '') +
      (need.indexOf('score') !== -1 ? '<label class="f sm"><span>Score</span><select data-f="score">' + M.SCORES.map(function (s) { return opt(s, s, mk.score === s); }).join('') + '</select></label>' : '') +
      (need.indexOf('yes') !== -1 ? '<label class="f sm"><span>Tie-break</span><select data-f="yes">' + opt('1', 'Oui', mk.yes !== false) + opt('0', 'Non', mk.yes === false) + '</select></label>' : '') +
      (mk.type === 'other' ? '<label class="f wide"><span>Libellé du pari</span><input data-f="market" value="' + esc(sel.market && sel.market !== M.LABEL.other ? sel.market : '') + '" placeholder="Aces de Sinner : plus de 9,5" autocomplete="off"></label>' : '') +
      '<label class="f odds"><span>Cote</span><input data-f="odds" inputmode="decimal" value="' + esc(sel.odds == null ? '' : String(sel.odds).replace('.', ',')) + '"></label>' +
      '</div>' +
      '<div class="leg-ctx">' + contextChips(Object.assign({}, sel, { mk: mk })) + '</div>' + auto + '</div>';
  }

  /**
   * Monte le formulaire. draft = pari (ou brouillon) ; opts :
   *   full       — champs complets (statut, dates, sport…) : édition / saisie
   *   saveLabel, onSave(raw) → true|Promise, onCancel()
   *   linkPicker(cb) — ouvre le choix d'un match MatchUp, cb(card, side)
   *   toast(msg, type)
   */
  function mount(el, draft, opts) {
    opts = opts || {};
    var d = JSON.parse(JSON.stringify(draft || {}));
    d.selections = d.selections && d.selections.length ? d.selections : (opts.allowEmpty ? [] : [{}]);
    var settings = BK.Store.state.settings;
    if (!d.bookmaker) d.bookmaker = settings.defaultBook || '';
    var fid = 'f' + Math.random().toString(36).slice(2, 8);

    function books() {
      var list = U.books(settings);
      if (d.bookmaker && list.indexOf(d.bookmaker) === -1 && d.bookmaker !== 'Autre') list.push(d.bookmaker);
      return '<option value="">Choisir…</option>' + list.map(function (b) { return opt(b, b, b === d.bookmaker); }).join('') + opt('Autre', 'Autre', d.bookmaker === 'Autre');
    }
    function autoOdds() {
      var o = d.selections.map(function (s) { return U.num(s.odds); });
      return o.length && o.every(function (x) { return x > 1; }) ? o.reduce(function (a, x) { return a * x; }, 1) : null;
    }
    function num(v) { return v == null ? '' : String(v).replace('.', ','); }

    function render() {
      var full = !!opts.full;
      var st = d.status || 'pending';
      el.innerHTML = '<form class="bk-form" id="' + fid + '" novalidate autocomplete="off">' +
        '<div class="legs">' + d.selections.map(legHTML).join('') + '</div>' +
        '<div class="legs-add">' +
        (opts.linkPicker ? '<button type="button" class="btn btn-ghost btn-sm" data-act="add-linked">＋ Match MatchUp</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="add-free">＋ Ligne libre</button>' +
        (d.selections.length > 1 ? '<span class="hint">Combiné de ' + d.selections.length + ' lignes</span>' : '') +
        '</div>' +
        '<div class="grid3">' +
        '<label class="f"><span>Bookmaker</span><select name="bookmaker">' + books() + '</select></label>' +
        '<label class="f"><span>Mise (' + esc(U.money(0, settings.currency, 0).replace(/[\d\s,.\u00a0]/g, '')) + ')</span><input name="stake" inputmode="decimal" value="' + esc(num(d.stake)) + '" placeholder="10"></label>' +
        '<label class="f"><span>Cote totale</span><input name="totalOdds" inputmode="decimal" value="' + esc(num(d.totalOdds)) + '" placeholder="auto"></label>' +
        '</div>' +
        '<div class="aid" data-z="aid"></div>' +
        '<div class="checks">' +
        '<label><input type="checkbox" name="isLive"' + (d.isLive ? ' checked' : '') + '> Live</label>' +
        '<label><input type="checkbox" name="isFreebet"' + (d.isFreebet ? ' checked' : '') + '> Freebet</label>' +
        '<label><input type="checkbox" name="isBoost"' + (d.isBoost ? ' checked' : '') + '> Cote boostée</label>' +
        '</div>' +
        (full ? '<div class="grid3">' +
          '<label class="f"><span>Statut</span><select name="status">' + Object.keys(U.STATUS).map(function (k) { return opt(k, U.STATUS[k][2] + ' ' + U.STATUS[k][0], k === st); }).join('') + '</select></label>' +
          '<label class="f' + (st === 'cashout' ? '' : ' hide') + '" data-z="cashout"><span>Montant du cashout</span><input name="cashoutAmount" inputmode="decimal" value="' + esc(num(d.cashoutAmount)) + '"></label>' +
          '<label class="f"><span>Date du pari</span><input type="date" name="betDate" value="' + esc(d.betDate || U.today()) + '"></label>' +
          '<label class="f"><span>Date de l\'événement</span><input type="date" name="eventDate" value="' + esc(d.eventDate || '') + '"></label>' +
          '<label class="f"><span>Sport</span><select name="sport">' + U.SPORTS.map(function (s) { return opt(s, s, s === (d.sport || (d.selections.some(function (x) { return x.mu; }) ? 'Tennis' : ''))); }).join('') + '</select></label>' +
          '<label class="f"><span>Compétition</span><input name="competition" value="' + esc(d.competition || '') + '" placeholder="Masters de Paris"></label>' +
          '</div>' : '') +
        '<details class="more"' + (d.notes || d.tipster && d.tipster !== 'Perso' || d.estimatedProb || d.baseOdds || d.closingOdds ? ' open' : '') + '><summary>Plus d\'options (source, confiance, notes…)</summary>' +
        '<div class="grid3">' +
        '<label class="f"><span>Source / tipster</span><input name="tipster" value="' + esc(d.tipster || 'Perso') + '" list="' + fid + '-t"><datalist id="' + fid + '-t">' +
        Array.from(new Set(BK.Store.state.bets.map(function (b) { return b.tipster; }).filter(Boolean))).slice(0, 30).map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></label>' +
        '<label class="f"><span>Confiance</span><select name="confidence">' + opt('', '—', !d.confidence) + [1, 2, 3, 4, 5].map(function (n) { return opt(n, '★'.repeat(n), +d.confidence === n); }).join('') + '</select></label>' +
        '<label class="f"><span>Ta proba (%)</span><input name="estimatedProb" inputmode="decimal" value="' + esc(num(d.estimatedProb)) + '" placeholder="optionnel"></label>' +
        '<label class="f"><span>Cote avant boost</span><input name="baseOdds" inputmode="decimal" value="' + esc(num(d.baseOdds)) + '"></label>' +
        '<label class="f"><span>Cote de clôture</span><input name="closingOdds" inputmode="decimal" value="' + esc(num(d.closingOdds)) + '" placeholder="auto si relié"></label>' +
        '<label class="f wide3"><span>Notes</span><textarea name="notes" rows="2" placeholder="Pourquoi ce pari ?">' + esc(d.notes || '') + '</textarea></label>' +
        '</div></details>' +
        '<div class="form-end">' +
        '<button type="submit" class="btn btn-primary">' + esc(opts.saveLabel || 'Enregistrer le pari') + '</button>' +
        (opts.onCancel ? '<button type="button" class="btn btn-ghost" data-act="cancel">Annuler</button>' : '') +
        '</div></form>';
      aids();
    }

    var form = function () { return el.querySelector('#' + fid); };
    function F(n) { var f = form(); return f ? f.querySelector('[name="' + n + '"]') : null; }

    function aids() {
      var z = el.querySelector('[data-z=aid]');
      if (!z) return;
      var stake = U.num(F('stake') && F('stake').value) || 0;
      var tot = U.num(F('totalOdds') && F('totalOdds').value) || autoOdds();
      var t = F('totalOdds');
      if (t) t.placeholder = autoOdds() ? U.odds(autoOdds()) + ' (auto)' : 'auto';
      var bk = BK.Stats.currentBankroll(BK.Store.state), cur = settings.currency;
      var parts = [];
      if (stake > 0 && bk > 0) {
        var pc = stake / bk * 100;
        parts.push('<b>' + U.fr(pc, 2) + ' %</b> de ta bankroll (' + U.money(bk, cur) + ')');
        if (settings.unitValue > 0) parts.push(U.fr(stake / settings.unitValue, 1) + ' u');
      }
      if (stake > 0 && tot > 1) parts.push('gain potentiel <b>' + U.money(F('isFreebet') && F('isFreebet').checked ? stake * (tot - 1) : stake * tot, cur) + '</b>');
      var p = U.num(F('estimatedProb') && F('estimatedProb').value);
      if (p > 0 && p < 100 && tot > 1) {
        var e = (p / 100 * tot - 1) * 100, kelly = Math.max(0, (p / 100 * tot - 1) / (tot - 1) * 100);
        parts.push('ton edge <b class="' + U.cls(e) + '">' + U.pct(e) + '</b> · Kelly ' + U.fr(kelly, 1) + ' %');
      }
      var warn = '';
      var lim = U.num(settings.maxStakePct);
      if (stake > 0 && bk > 0 && lim > 0 && stake / bk * 100 > lim + 1e-9) {
        warn = '<div class="warnline">⚠️ Au-dessus de ta limite de ' + U.fr(lim, 1) + ' % par pari (Réglages → garde-fous).</div>';
      }
      if (!(bk > 0) && !settings.initialized) warn += '<div class="hintline">Renseigne ta bankroll de départ dans Réglages pour voir le % engagé.</div>';
      z.innerHTML = (parts.length ? '= ' + parts.join(' · ') : '') + warn;
      d.selections.forEach(function (s, i) {
        var row = el.querySelector('.leg[data-i="' + i + '"]');
        if (!row || !s.mu) return;
        var ctx = row.querySelector('.leg-ctx'), st = row.querySelector('.leg-auto');
        if (ctx) ctx.innerHTML = contextChips(s);
        if (st) st.outerHTML = autoLine(s.mk);
      });
    }

    function readLeg(row) {
      var i = +row.dataset.i, s = d.selections[i];
      if (!s) return null;
      var get = function (f) { var x = row.querySelector('[data-f="' + f + '"]'); return x ? x.value : null; };
      s.odds = U.num(get('odds'));
      if (s.mu) {
        var mk = { type: get('type') || 'winner' };
        var need = M.NEEDS[mk.type] || [];
        var prev = s.mk || {};
        if (need.indexOf('side') !== -1) mk.side = get('side') || prev.side || 'A';
        if (need.indexOf('ou') !== -1) mk.ou = get('ou') || 'over';
        if (need.indexOf('line') !== -1) { var l = U.num(get('line')); if (l != null) mk.line = l; }
        if (need.indexOf('score') !== -1) mk.score = get('score') || '2-0';
        if (need.indexOf('yes') !== -1) mk.yes = get('yes') !== '0';
        s.mk = mk;
        if (mk.type === 'other') s.market = get('market') || '';
      } else {
        s.event = get('event') || ''; s.market = get('market') || ''; s.pick = get('pick') || '';
      }
      return s;
    }

    el.addEventListener('input', function (e) {
      var row = e.target.closest('.leg');
      if (row) readLeg(row);
      aids();
    });
    el.addEventListener('change', function (e) {
      var row = e.target.closest('.leg');
      if (row) {
        readLeg(row);
        if (e.target.dataset.f === 'type') {
          var i = +row.dataset.i, s = d.selections[i];
          // Côté conservé d'un marché à l'autre ; ligne remise à zéro.
          var side = s.mk.side || (s.mk.type === 'winner' ? 'A' : null);
          s.mk = { type: s.mk.type };
          if ((M.NEEDS[s.mk.type] || []).indexOf('side') !== -1) s.mk.side = side || 'A';
          if (s.mk.type === 'tiebreak') s.mk.yes = true;
          if ((M.NEEDS[s.mk.type] || []).indexOf('ou') !== -1) s.mk.ou = 'over';
          if (s.mk.type === 'set_score') s.mk.score = '2-0';
          row.outerHTML = legHTML(s, i);
        }
      }
      if (e.target.name === 'status') {
        var c = el.querySelector('[data-z=cashout]');
        if (c) c.classList.toggle('hide', e.target.value !== 'cashout');
      }
      aids();
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !el.contains(b)) return;
      var act = b.dataset.act, row = b.closest('.leg');
      if (act === 'leg-del') {
        snapshotInputs();
        d.selections.splice(+row.dataset.i, 1);
        if (!d.selections.length && !opts.allowEmpty) d.selections.push({});
        render();
      } else if (act === 'add-free') {
        snapshotInputs(); d.selections.push({}); render();
      } else if (act === 'add-linked' && opts.linkPicker) {
        snapshotInputs();
        opts.linkPicker(function (card, side) { api.addLeg(card, side); });
      } else if (act === 'leg-link' && opts.linkPicker) {
        snapshotInputs();
        var i = +row.dataset.i;
        opts.linkPicker(function (card, side) {
          var s = d.selections[i] || {};
          var mk = M.parse(s.market, s.pick, card.pa, card.pb) || (side ? { type: 'winner', side: side } : { type: 'other' });
          d.selections[i] = { mu: BK.MU.snapshot(card), mk: mk, odds: s.odds || at(card.odds, mk.side || side), market: mk.type === 'other' ? s.market : '', result: 'pending' };
          render();
        }, d.selections[i]);
      } else if (act === 'cancel' && opts.onCancel) {
        opts.onCancel();
      }
    });
    el.addEventListener('submit', function (e) {
      e.preventDefault();
      snapshotInputs();
      var raw = collect();
      var err = validate(raw);
      if (err) { if (opts.toast) opts.toast(err, 'err'); return; }
      var btn = el.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      Promise.resolve(opts.onSave ? opts.onSave(raw) : true).catch(function (x) {
        if (opts.toast) opts.toast(x && x.message || 'Enregistrement impossible', 'err');
      }).then(function () { if (btn && btn.isConnected) btn.disabled = false; });
    });

    /** Relit tous les champs dans le brouillon (avant un nouveau rendu). */
    function snapshotInputs() {
      el.querySelectorAll('.leg').forEach(readLeg);
      ['bookmaker', 'stake', 'totalOdds', 'status', 'cashoutAmount', 'betDate', 'eventDate', 'sport', 'competition',
        'tipster', 'confidence', 'estimatedProb', 'baseOdds', 'closingOdds', 'notes'].forEach(function (n) {
        var x = F(n); if (x) d[n] = x.value;
      });
      ['isLive', 'isFreebet', 'isBoost'].forEach(function (n) { var x = F(n); if (x) d[n] = x.checked; });
    }

    function collect() {
      var sels = d.selections.filter(function (s) { return s.mu || s.event || s.pick || U.num(s.odds); }).map(function (s) {
        var o = { odds: U.num(s.odds), result: s.result || 'pending' };
        if (s.mu) { o.mu = s.mu; o.mk = s.mk; if (s.mk && s.mk.type === 'other') o.market = s.market || ''; o.settle = s.settle || null; o.review = s.review || null; }
        else { o.event = s.event; o.market = s.market; o.pick = s.pick; }
        return o;
      });
      var raw = Object.assign({}, draft || {}, {
        selections: sels,
        bookmaker: d.bookmaker || 'Autre',
        stake: U.num(d.stake),
        totalOdds: U.num(d.totalOdds) || null,
        isLive: !!d.isLive, isFreebet: !!d.isFreebet, isBoost: !!d.isBoost,
        tipster: d.tipster, confidence: U.num(d.confidence), estimatedProb: U.num(d.estimatedProb),
        baseOdds: U.num(d.baseOdds), closingOdds: U.num(d.closingOdds), notes: d.notes || ''
      });
      if (sels.length > 1 && raw.betType !== 'systeme') raw.betType = 'combine';
      if (sels.length === 1) raw.betType = 'simple';
      if (opts.full) {
        raw.status = d.status || 'pending';
        raw.cashoutAmount = U.num(d.cashoutAmount);
        raw.betDate = d.betDate; raw.eventDate = d.eventDate;
        raw.sport = d.sport; raw.competition = d.competition;
      }
      return raw;
    }

    function validate(raw) {
      if (!raw.selections.length) return 'Ajoute au moins une ligne au ticket';
      if (!(raw.stake > 0)) return 'Indique ta mise';
      if (!raw.bookmaker || raw.bookmaker === '') return 'Choisis le bookmaker';
      var missing = raw.selections.some(function (s) { return !(s.odds > 1); });
      if (missing && !(raw.totalOdds > 1) && raw.status !== 'void') return 'Indique la cote de chaque ligne (ou la cote totale)';
      var bad = raw.selections.find(function (s) { return s.mu && s.mk && s.mk.type !== 'other' && !M.valid(s.mk); });
      if (bad) return 'Complète le marché « ' + (M.LABEL[bad.mk.type] || '') + ' » (ligne ou score manquant)';
      return null;
    }

    var api = {
      draft: d,
      render: render,
      addLeg: function (card, side) {
        snapshotInputs();
        // Ligne vide de départ remplacée par la première sélection.
        if (d.selections.length === 1 && !d.selections[0].mu && !d.selections[0].event && !d.selections[0].pick && !U.num(d.selections[0].odds)) d.selections = [];
        var dup = d.selections.find(function (s) { return s.mu && s.mu.id === card.id && s.mu.src === card.src && s.mk && s.mk.type === 'winner'; });
        if (dup) { dup.mk.side = side; dup.odds = at(card.odds, side); }
        else d.selections.push(legFromCard(card, side));
        render();
      },
      count: function () { return d.selections.filter(function (s) { return s.mu || s.event || s.pick; }).length; }
    };
    render();
    return api;
  }

  BK.Form = { mount: mount, legFromCard: legFromCard, contextChips: contextChips, when: when, short: short };
})(window.BK = window.BK || {});
