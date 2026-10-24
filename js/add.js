/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — vue « Ajouter » (BK.Add)
   Trois entrées : le programme MatchUp (par défaut), une capture d'écran,
   la saisie à la main. Les trois aboutissent au même formulaire (BK.Form).
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U, esc = U.esc;
  var A = { mode: 'prog', day: 'today', circ: { ATP: true, CH: true, WTA: true, ITF: true }, q: '', slip: null, manual: null, ocrBusy: false };

  function $(id) { return document.getElementById(id); }
  function z() { return $('v-add'); }

  function skeleton() {
    var el = z();
    el.innerHTML =
      '<div class="modes" role="tablist">' +
      '<button data-act="mode" data-mode="prog" role="tab">🎾 Programme MatchUp</button>' +
      '<button data-act="mode" data-mode="ocr" role="tab">📸 Capture d\'écran</button>' +
      '<button data-act="mode" data-mode="manual" role="tab">✍️ À la main</button></div>' +
      '<div data-pane="prog"><div class="addgrid">' +
      '<div class="prog"><div class="pfilters">' +
      '<div class="chips" data-z="days">' +
      '<button class="chip-b" data-act="day" data-day="today">Aujourd\'hui</button>' +
      '<button class="chip-b" data-act="day" data-day="tomorrow">Demain</button>' +
      '<button class="chip-b" data-act="day" data-day="all">Tout</button></div>' +
      '<div class="chips" data-z="circs">' + ['ATP', 'CH', 'WTA', 'ITF'].map(function (c) {
        return '<button class="chip-b" data-act="circ" data-c="' + c + '">' + BK.MU.CIRCUIT[c] + '</button>';
      }).join('') + '</div>' +
      '<input class="fin" data-z="q" placeholder="Joueur ou tournoi…" autocomplete="off">' +
      '<button class="btn btn-ghost btn-sm" data-act="reload" title="Recharger le programme">↻</button>' +
      '</div><div data-z="upsell"></div><div data-z="plist" class="plist"></div></div>' +
      '<aside class="slip" id="bk-slip"><div class="card"><div class="card-h"><h3>🎫 Ton ticket</h3>' +
      '<button class="lnk muted" data-act="slip-clear">Vider</button></div>' +
      '<p class="hint" data-z="sliphint">Touche un joueur dans le programme pour l\'ajouter. Plusieurs lignes = combiné.</p>' +
      '<div data-z="slip"></div></div></aside>' +
      '</div><div class="slipbar" data-z="slipbar" hidden></div></div>' +
      '<div data-pane="ocr" hidden><div class="card">' +
      '<div class="ocr-top"><label class="f"><span>🎯 Bookmaker du ticket</span><select data-z="ocrbook"><option value="">🔍 Détecter automatiquement</option>' +
      U.books(BK.Store.state.settings).map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('') + '</select></label>' +
      '<p class="hint">La lecture se fait dans ton navigateur : la capture ne quitte pas ton téléphone. Les matchs du programme MatchUp sont reconnus et reliés tout seuls.</p></div>' +
      '<div class="dropzone" data-z="drop" tabindex="0" role="button" aria-label="Choisir une capture">' +
      '<div class="dz-ico">📸</div><div class="dz-main">Glisse ta capture ici</div>' +
      '<div class="dz-sub">ou touche pour la choisir · ou colle-la avec Ctrl+V · plusieurs tickets acceptés</div>' +
      '<input type="file" accept="image/*" multiple hidden data-z="file"></div>' +
      '<div data-z="ocrstatus" class="ocrstatus"></div></div><div data-z="ocrres"></div></div>' +
      '<div data-pane="manual" hidden><div class="card"><div class="card-h"><h3>Saisie à la main</h3>' +
      '<span class="hint">pour un pari hors programme (autre sport, match passé…)</span></div><div data-z="manual"></div></div></div>';
    el.dataset.ready = '1';
    bindDrop();
  }

  function render() {
    if (!z()) return;
    if (!z().dataset.ready) skeleton();
    var el = z();
    el.querySelectorAll('[data-act=mode]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mode === A.mode)); });
    el.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== A.mode; });
    if (!BK.Store.canWrite()) {
      el.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = true; });
      var ro = el.querySelector('[data-z=ro]');
      if (!ro) el.insertAdjacentHTML('beforeend', '<div class="emptyline" data-z="ro">Tu regardes un exemple : rien n\'y est enregistré. ' +
        '<button class="lnk" data-act="demo-stop">Commencer avec mes paris →</button></div>');
      return;
    }
    var ro2 = el.querySelector('[data-z=ro]'); if (ro2) ro2.remove();
    if (A.mode === 'prog') { prog(); slip(); }
    if (A.mode === 'manual' && !A.manual) manual();
  }

  /* ── Programme ────────────────────────────────────────────────────────── */
  /** Une ligne, pas un mur : ce qu'apporte un abonnement, là où ça se voit. */
  function upsell() {
    var box = z().querySelector('[data-z=upsell]');
    if (!box) return;
    var A = BK.Auth || {};
    if (A.user && A.premium) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="upsell">🔒 Cotes et analyse MatchUp réservées aux abonnés : touche un joueur, puis tape ta cote.' +
      '<div class="upsell-cta">' + (A.user ? '' : '<button class="lnk" data-act="login">Connecter mon compte</button> · ') +
      '<a class="lnk" href="' + esc(BK.CONF.LINKS.premium) + '" target="_blank" rel="noopener">Découvrir Premium ↗</a></div></div>';
  }

  function prog() {
    var el = z(), st = BK.MU.state;
    upsell();
    el.querySelectorAll('[data-act=day]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.day === A.day)); });
    el.querySelectorAll('[data-act=circ]').forEach(function (b) { b.setAttribute('aria-pressed', String(!!A.circ[b.dataset.c])); });
    var list = el.querySelector('[data-z=plist]');
    if (!st.at) {
      list.innerHTML = '<div class="emptyline"><span class="spin"></span> Chargement du programme…</div>';
      BK.MU.load().then(function () { if (A.mode === 'prog') prog(); });
      return;
    }
    var today = U.today(), tom = U.addDays(today, 1), q = U.normName(A.q), now = Date.now();
    var cards = st.cards.filter(function (c) {
      if (!A.circ[c.circuit]) return false;
      if (A.day === 'today' && c.day !== today) return false;
      if (A.day === 'tomorrow' && c.day !== tom) return false;
      if (q && U.normName(c.pa + ' ' + c.pb + ' ' + c.tournament).indexOf(q) === -1) return false;
      return true;
    });
    // À venir d'abord ; les matchs commencés (paris en live) sont repliés en
    // bas. À midi, un « Aujourd'hui » qui commence par 20 matchs déjà joués
    // cache ceux sur lesquels on peut encore parier.
    var avenir = cards.filter(function (c) { return !BK.MU.started(c, now); });
    var commences = cards.filter(function (c) { return BK.MU.started(c, now); });
    if (!cards.length) {
      list.innerHTML = '<div class="emptyline">' + (st.errors.length && !st.cards.length ? 'Programme MatchUp indisponible pour le moment (' + esc(st.errors.join(' · ')) + '). <button class="lnk" data-act="reload">Réessayer</button> · <button class="lnk" data-act="mode" data-mode="manual">Ajouter à la main</button>' :
        A.day === 'today' && st.cards.some(function (c) { return c.day === tom; }) ? 'Aucun match aujourd\'hui avec ces filtres. <button class="lnk" data-act="day" data-day="tomorrow">Voir demain →</button>' :
          'Aucun match avec ces filtres.') + '</div>';
      return;
    }
    var html = avenir.length ? groupes(avenir, now)
      : '<div class="emptyline">Plus de match à venir ' + (A.day === 'tomorrow' ? 'demain' : 'aujourd\'hui') + ' avec ces filtres.' +
        (A.day === 'today' && st.cards.some(function (c) { return c.day === tom; }) ? ' <button class="lnk" data-act="day" data-day="tomorrow">Voir demain →</button>' : '') + '</div>';
    if (commences.length) {
      html += '<details class="started-box"' + (A.startedOpen ? ' open' : '') + '><summary>Déjà commencés · ' + commences.length +
        ' match' + (commences.length > 1 ? 's' : '') + ' <span class="hint">(paris en live)</span></summary>' + groupes(commences, now) + '</details>';
    }
    list.innerHTML = html;
    var det = list.querySelector('details.started-box');
    if (det) det.addEventListener('toggle', function () { A.startedOpen = det.open; });
  }

  function groupes(cards, now) {
    var groups = [], byKey = {};
    cards.forEach(function (c) {
      var k = c.src + '|' + c.tournament + '|' + c.day;
      if (!byKey[k]) { byKey[k] = { card: c, list: [] }; groups.push(byKey[k]); }
      byKey[k].list.push(c);
    });
    return groups.map(function (g) {
      var c = g.card, flag = window.tFlag ? window.tFlag(c.tournament, c.country) : '🎾';
      return '<div class="tgroup"><div class="thead"><span>' + flag + ' ' + esc(c.tournament) + '</span>' +
        '<span class="tmeta">' + esc([c.tierLabel || BK.MU.CIRCUIT[c.circuit], BK.MU.surfaceLabel(c.surface, c.indoor), A.day === 'all' ? U.fdate(c.day) : ''].filter(Boolean).join(' · ')) + '</span></div>' +
        g.list.map(function (m) { return matchRow(m, now); }).join('') + '</div>';
    }).join('');
  }

  function oddsBtn(m, side) {
    var o = side === 'A' ? m.odds && m.odds[0] : m.odds && m.odds[1];
    var name = side === 'A' ? m.pa : m.pb;
    var val = m.signal && m.valueSide === side;
    // Carte réduite : pas de cote à montrer, on ne met pas « — » (qui se lit
    // « pas de cote chez les bookmakers ») mais une invitation à choisir.
    var droite = o ? '<span class="ob-o mono">' + U.odds(o) + '</span>' : (m.full ? '<span class="ob-o mono">—</span>' : '<span class="ob-o ob-pick">＋</span>');
    return '<button class="ob' + (val ? ' val' : '') + '" data-act="pick" data-key="' + esc(m.key) + '" data-side="' + side + '"' + (o ? '' : ' title="Ajouter ' + esc(name) + ' au ticket"') + '>' +
      '<span class="ob-n">' + (val ? '💎 ' : '') + esc(name) + '</span>' + droite + '</button>';
  }

  function matchRow(m, now) {
    var started = BK.MU.started(m, now);
    // Le match offert du jour arrive entier même sans abonnement : on le dit.
    var offert = m.full && !BK.MU.state.full;
    return '<div class="mrow' + (started ? ' started' : '') + '">' +
      '<div class="mtime mono">' + (m.time || '—') + '<small>' + esc(started ? 'commencé' : (m.round || '')) + '</small></div>' +
      '<div class="mbtns">' + oddsBtn(m, 'A') + oddsBtn(m, 'B') + '</div>' +
      (offert ? '<div class="tmeta offert">🎁 Analyse offerte par MatchUp aujourd\'hui</div>' : '') + '</div>';
  }

  /* ── Ticket ───────────────────────────────────────────────────────────── */
  function slip() {
    var mount = z().querySelector('[data-z=slip]');
    if (!A.slip) {
      A.slip = BK.Form.mount(mount, { selections: [], source: 'matchup' }, {
        allowEmpty: true,
        saveLabel: 'Enregistrer le pari',
        linkPicker: BK.Add.linkPicker,
        toast: BK.UI.toast,
        onSave: function (raw) {
          raw.source = 'matchup';
          var bet = BK.Store.addBet(raw);
          var auto = BK.Caps && BK.Caps.autoSettle && bet.selections.some(function (s) { return s.mu && BK.Markets.valid(s.mk); });
          BK.UI.toast('Pari enregistré ✓' + (auto ? ' — il se règlera tout seul après le match' : ''), 'ok');
          A.slip = null; slip();
        }
      });
    }
    slipBar();
  }
  // La barre « Ticket » (mobile) se cache quand le ticket lui-même est à
  // l'écran : elle masquait les champs qu'elle invite à remplir.
  var slipVisible = false, obs = null;
  function watchSlip() {
    if (obs || typeof IntersectionObserver === 'undefined') return;
    var el = document.getElementById('bk-slip');
    if (!el) return;
    obs = new IntersectionObserver(function (es) { slipVisible = es.some(function (e) { return e.isIntersecting; }); slipBar(); }, { threshold: 0.15 });
    obs.observe(el);
  }
  function slipBar() {
    watchSlip();
    var bar = z().querySelector('[data-z=slipbar]'), hint = z().querySelector('[data-z=sliphint]');
    var n = A.slip ? A.slip.count() : 0;
    if (hint) hint.hidden = n > 0;
    if (!bar) return;
    bar.hidden = n === 0 || slipVisible;
    bar.innerHTML = n ? '<span>🎫 Ticket · ' + n + ' sélection' + (n > 1 ? 's' : '') + '</span><button class="btn btn-primary btn-sm" data-act="slip-scroll">Valider ›</button>' : '';
  }
  function pick(key, side) {
    var c = BK.MU.state.cards.find(function (x) { return x.key === key; });
    if (!c || !A.slip) return;
    A.slip.addLeg(c, side);
    slipBar();
    BK.UI.toast('Ajouté au ticket : ' + (side === 'A' ? c.pa : c.pb), 'ok');
  }

  /* ── Capture ──────────────────────────────────────────────────────────── */
  function bindDrop() {
    var el = z(), dz = el.querySelector('[data-z=drop]'), inp = el.querySelector('[data-z=file]');
    if (!dz) return;
    dz.addEventListener('click', function () { if (!A.ocrBusy) inp.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', function () { files(inp.files); inp.value = ''; });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('drag'); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('drag'); files(e.dataTransfer.files); });
    document.addEventListener('paste', function (e) {
      if (A.mode !== 'ocr' || !BK.Store.canWrite()) return;
      var f = Array.from((e.clipboardData && e.clipboardData.files) || []);
      if (f.length) files(f);
    });
  }

  async function files(list) {
    var imgs = Array.from(list || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!imgs.length) { BK.UI.toast('Aucune image reconnue', 'err'); return; }
    if (!BK.Ocr) { BK.UI.toast('La lecture de capture n\'est pas disponible sur ce navigateur', 'err'); return; }
    var el = z(), status = el.querySelector('[data-z=ocrstatus]'), res = el.querySelector('[data-z=ocrres]');
    var book = el.querySelector('[data-z=ocrbook]').value || null;
    A.ocrBusy = true;
    status.innerHTML = '<span class="spin"></span> <span data-z="ocrmsg">Lecture…</span>';
    try {
      var r = await BK.Ocr.analyze(imgs, function (m) { var x = status.querySelector('[data-z=ocrmsg]'); if (x) x.textContent = m; }, { forcedBook: book });
      await BK.MU.load();
      status.innerHTML = '';
      res.innerHTML = '';
      r.bets.forEach(function (d, i) { detected(res, d, r.previews[i], i, r.bets.length); });
      res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      status.innerHTML = '<div class="warnline">' + esc(e.message || 'Lecture impossible') + '</div>';
    } finally { A.ocrBusy = false; }
  }

  /** Ticket lu → brouillon : chaque ligne est cherchée dans le programme. */
  function detected(root, d, preview, i, n) {
    var linked = 0;
    var sels = (d.selections && d.selections.length ? d.selections : [{}]).map(function (s) {
      var hit = BK.MU.matchText(s.event, s.pick);
      if (!hit) return { event: s.event || '', market: s.market || '', pick: s.pick || '', odds: s.odds };
      linked++;
      var c = hit.card, mk = BK.Markets.parse(s.market, s.pick, c.pa, c.pb) || { type: 'other' };
      return { mu: BK.MU.snapshot(c), mk: mk, odds: s.odds, market: mk.type === 'other' ? [s.market, s.pick].filter(Boolean).join(' : ') : '' };
    });
    var box = document.createElement('div');
    box.className = 'card detected';
    box.innerHTML = '<div class="det-h">' + (preview ? '<img src="' + preview + '" alt="Capture ' + (i + 1) + '">' : '') +
      '<div><b>Ticket ' + (n > 1 ? (i + 1) + '/' + n : 'lu') + '</b>' +
      (d._empty ? ' <span class="badge b-amber">Lecture partielle</span>' : '') +
      '<div class="hint">' + (linked ? '🎾 ' + linked + ' ligne' + (linked > 1 ? 's' : '') + ' reliée' + (linked > 1 ? 's' : '') + ' au programme MatchUp' : 'Aucun match du programme reconnu : tu peux en relier un à la main.') +
      ' Vérifie, complète, puis enregistre.</div></div></div><div data-z="f"></div>';
    root.appendChild(box);
    BK.Form.mount(box.querySelector('[data-z=f]'), {
      selections: sels, bookmaker: d.bookmaker || '', stake: d.stake, totalOdds: d.totalOdds,
      isLive: d.isLive, isFreebet: d.isFreebet, isBoost: d.isBoost, baseOdds: d.baseOdds,
      status: ['won', 'lost', 'void', 'cashout'].indexOf(d.status) !== -1 ? d.status : 'pending',
      cashoutAmount: d.cashoutAmount, eventDate: d.eventDate || (sels[0].mu && sels[0].mu.day) || '', sport: d.sport || (linked ? 'Tennis' : ''),
      competition: d.competition || '', source: 'ocr'
    }, {
      full: true, saveLabel: 'Enregistrer ce pari', linkPicker: BK.Add.linkPicker, toast: BK.UI.toast,
      onSave: function (raw) {
        raw.source = 'ocr';
        if (raw.status && raw.status !== 'pending') raw.manualLock = true;
        BK.Store.addBet(raw);
        box.innerHTML = '<div class="saved">✓ Pari enregistré</div>';
        BK.UI.toast('Pari enregistré ✓', 'ok');
      }
    });
  }

  /* ── Saisie à la main ─────────────────────────────────────────────────── */
  function manual() {
    var mount = z().querySelector('[data-z=manual]');
    A.manual = BK.Form.mount(mount, { selections: [{}], source: 'manual' }, {
      full: true, saveLabel: 'Enregistrer le pari', linkPicker: BK.Add.linkPicker, toast: BK.UI.toast,
      onSave: function (raw) {
        raw.source = 'manual';
        if (raw.status && raw.status !== 'pending') raw.manualLock = true;
        BK.Store.addBet(raw);
        BK.UI.toast('Pari enregistré ✓', 'ok');
        A.manual = null; manual();
      }
    });
  }

  /* ── Choix d'un match du programme (relier une ligne) ─────────────────── */
  function linkPicker(cb, sel) {
    var body = BK.UI.modal('Relier à un match MatchUp', '<input class="fin" data-z="lq" placeholder="Nom d\'un joueur…" autocomplete="off">' +
      '<div data-z="ll" class="plist"></div>');
    if (!body) return;
    var inp = body.querySelector('[data-z=lq]'), ll = body.querySelector('[data-z=ll]');
    inp.value = sel && (sel.event || sel.pick) ? String(sel.pick || sel.event).split(/\s+-\s+/)[0] : '';
    function draw() {
      var st = BK.MU.state;
      if (!st.at) { ll.innerHTML = '<div class="emptyline"><span class="spin"></span> Chargement du programme…</div>'; return; }
      var q = U.normName(inp.value);
      var cards = st.cards.filter(function (c) { return !q || q.split(' ').every(function (w) { return U.normName(c.pa + ' ' + c.pb + ' ' + c.tournament).indexOf(w) !== -1; }); }).slice(0, 40);
      ll.innerHTML = cards.length ? cards.map(function (c) {
        return '<div class="mrow"><div class="mtime mono">' + esc(c.time || '—') + '<small>' + esc(U.fdate(c.day)) + '</small></div><div class="mbtns">' +
          '<button class="ob" data-pick="' + esc(c.key) + '" data-side="A"><span class="ob-n">' + esc(c.pa) + '</span><span class="ob-o mono">' + U.odds(c.odds && c.odds[0]) + '</span></button>' +
          '<button class="ob" data-pick="' + esc(c.key) + '" data-side="B"><span class="ob-n">' + esc(c.pb) + '</span><span class="ob-o mono">' + U.odds(c.odds && c.odds[1]) + '</span></button>' +
          '</div><div class="tmeta">' + esc(c.tournament) + '</div></div>';
      }).join('') : '<div class="emptyline">Aucun match du programme ne correspond. Le programme couvre aujourd\'hui et demain.</div>';
    }
    inp.addEventListener('input', draw);
    ll.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      var c = BK.MU.state.cards.find(function (x) { return x.key === b.dataset.pick; });
      if (c) { BK.UI.closeModal(); cb(c, b.dataset.side); }
    });
    BK.MU.load().then(draw);
    draw();
    setTimeout(function () { inp.focus(); }, 30);
  }

  /* ── Événements de la vue ─────────────────────────────────────────────── */
  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !z() || !z().contains(b)) return false;
    var act = b.dataset.act;
    if (act === 'mode') { A.mode = b.dataset.mode; render(); return true; }
    if (act === 'day') { A.day = b.dataset.day; prog(); return true; }
    if (act === 'circ') {
      A.circ[b.dataset.c] = !A.circ[b.dataset.c];
      if (!Object.keys(A.circ).some(function (k) { return A.circ[k]; })) A.circ[b.dataset.c] = true;
      prog(); return true;
    }
    if (act === 'reload') { BK.MU.load(true).then(prog); return true; }
    if (act === 'pick') { pick(b.dataset.key, b.dataset.side); return true; }
    if (act === 'slip-clear') { A.slip = null; slip(); return true; }
    if (act === 'slip-scroll') { $('bk-slip').scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    return false;
  }
  function onInput(e) {
    if (e.target && e.target.dataset && e.target.dataset.z === 'q' && z().contains(e.target)) {
      // L'événement « change » part au BLUR, c'est-à-dire au moment où l'on
      // touche un résultat : re-dessiner la liste à ce moment-là remplace le
      // bouton sous le doigt et le clic est perdu. On ne redessine que si la
      // recherche a vraiment changé.
      if (A.q !== e.target.value) { A.q = e.target.value; prog(); }
      return true;
    }
    return false;
  }

  BK.Add = { A: A, render: render, prog: prog, onClick: onClick, onInput: onInput, linkPicker: linkPicker, _detected: detected };
})(window.BK = window.BK || {});
