/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — orchestration (BK.App)

   Ordre de démarrage : l'appareil d'abord (affichage immédiat, avec reprise
   du Bankroll Manager de juillet), puis le compte MatchUp s'il y en a un.
   BK.Caps dit ce que le compte permet ; tout le reste du site le lit là.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U, S = BK.Store, UI = BK.UI, esc = U.esc;
  var VIEWS = ['dash', 'add', 'hist', 'ana', 'set'];
  var app = { view: 'dash', key: null, lastSettle: 0, raf: 0, retry: null };
  BK.Caps = { account: false, premium: false, autoSettle: false };

  function $(id) { return document.getElementById(id); }

  /* ── Navigation ───────────────────────────────────────────────────────── */
  function go(v, push) {
    if (VIEWS.indexOf(v) === -1) v = 'dash';
    app.view = v;
    document.querySelectorAll('.bk-tabs [data-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === v)); });
    document.querySelectorAll('.bk-view').forEach(function (s) { s.hidden = s.id !== 'v-' + v; });
    if (push !== false && location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    renderView();
  }
  function renderView() {
    if (app.view === 'dash') UI.dash();
    else if (app.view === 'add') BK.Add.render();
    else if (app.view === 'hist') UI.hist();
    else if (app.view === 'ana') UI.ana();
    else if (app.view === 'set') UI.settings();
  }
  function renderAll() {
    cancelAnimationFrame(app.raf);
    app.raf = requestAnimationFrame(function () {
      // Une fois des paris enregistrés, l'accroche d'accueil laisse la place
      // aux chiffres (sur téléphone elle occupait le premier écran).
      document.body.classList.toggle('bk-compact', S.state.bets.length > 0);
      UI.acct(); UI.syncBar(); UI.gate(); renderView();
    });
  }

  /* ── Compte ───────────────────────────────────────────────────────────── */
  function onAuth(A) {
    var user = A && A.user, premium = !!(A && A.premium);
    var key = (user ? user.id : 'anon') + '|' + premium;
    UI.acct();
    if (key === app.key) return;            // rappelé à chaque rafraîchissement de jeton
    app.key = key;
    BK.Caps = { account: !!user, premium: premium, autoSettle: premium };
    BK.MU.invalidate();                     // cartes réduites ↔ entières
    clearTimeout(app.retry);
    S.connect(user ? user.id : null, premium).then(function () {
      renderAll();
      if (S.mode === 'device' && S.reason === 'pending') app.retry = setTimeout(function () { app.key = null; onAuth(BK.Auth); }, 60e3);
      if (premium) autoSettle(true);
    });
    renderAll();
  }

  /* ── Règlement automatique + horaires / clôtures depuis le programme ──── */
  async function autoSettle(force) {
    if (!S.canWrite()) return;
    if (!force && Date.now() - app.lastSettle < 4 * 60e3) return;
    app.lastSettle = Date.now();
    try {
      if (S.state.bets.some(function (b) { return b.status === 'pending' && (b.selections || []).some(function (s) { return s.mu; }); })) {
        await BK.MU.load();
        var p1 = BK.MU.refreshFromSlate(S.state.bets);
        if (p1.length) S.applyPatches(p1);
      }
      if (!BK.Caps.autoSettle) return;      // résultats = fichiers Premium de MatchUp
      var r = await BK.Settle.run(S.state.bets);
      if (r.patches.length) {
        S.applyPatches(r.patches);
        var regles = r.patches.filter(function (p) { return p.patch.status; }).length;
        var revue = r.patches.filter(function (p) { return !p.patch.status && (p.patch.selections || []).some(function (s) { return s.review; }); }).length;
        if (regles) UI.toast(regles + ' pari' + (regles > 1 ? 's réglés' : ' réglé') + ' automatiquement à partir des scores MatchUp', 'ok');
        if (revue) UI.toast(revue + ' pari' + (revue > 1 ? 's' : '') + ' à vérifier (abandon, marché libre…)', 'warn');
      }
      if (r.errors.length) console.warn('[bk] résultats indisponibles :', r.errors.join(' · '));
    } catch (e) {
      console.warn('[bk] règlement automatique', e);
    }
  }

  /* ── Export ───────────────────────────────────────────────────────────── */
  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function exportCSV() {
    var cols = ['Date', 'Bookmaker', 'Type', 'Événement', 'Marché', 'Sélection', 'Circuit', 'Tournoi', 'Surface', 'Cote', 'Mise', 'Statut', 'Profit',
      'Réglé automatiquement', 'Value MatchUp', 'Freebet', 'Boost', 'Live', 'Source', 'Notes'];
    // Une cellule de TEXTE qui commence par = + - @ serait lue comme une formule
    // par Excel (injection CSV, via un fichier importé par exemple) : on la
    // préfixe d'une apostrophe. Les nombres (« -15,00 ») restent des nombres.
    var q = function (v) {
      var t = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(,\d+)?$/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    var num = function (v) { return v == null ? '' : String(+(+v).toFixed(2)).replace('.', ','); };
    var rows = S.state.bets.slice().sort(function (a, b) { return String(a.eventDate).localeCompare(String(b.eventDate)); }).map(function (b) {
      var s = b.selections || [], mu = s[0] && s[0].mu, f = s.length === 1 ? BK.Stats.follows(s[0]) : null;
      return [b.eventDate, b.bookmaker, b.betType, s.map(function (x) { return x.event; }).join(' + '), s.map(function (x) { return x.market; }).join(' + '),
        s.map(function (x) { return x.pick; }).join(' + '), mu ? BK.MU.CIRCUIT[mu.circuit] : '', mu ? mu.tournament : b.competition,
        mu ? BK.MU.surfaceLabel(mu.surface, mu.indoor) : '', num(BK.Stats.oddsOf(b)), num(b.stake), (U.STATUS[b.status] || [b.status])[0],
        num(BK.Stats.betProfit(b)), b.autoSettled ? 'oui' : 'non', f === true ? 'dans le sens' : f === false ? 'contre' : '',
        b.isFreebet ? 'oui' : '', b.isBoost ? 'oui' : '', b.isLive ? 'oui' : '', b.source, b.notes].map(q).join(';');
    });
    download('bankroll-' + U.today() + '.csv', '﻿' + cols.map(q).join(';') + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
  }

  /* ── Actions ──────────────────────────────────────────────────────────── */
  function edit(id) {
    var b = S.state.bets.find(function (x) { return x.id === id; });
    if (!b) return;
    UI.modal('Modifier le pari', function (body) {
      BK.Form.mount(body, b, {
        full: true, saveLabel: 'Enregistrer les modifications', linkPicker: BK.Add.linkPicker, toast: UI.toast,
        onCancel: UI.closeModal,
        onSave: function (raw) { S.updateBet(id, raw, { manual: true }); UI.closeModal(); UI.toast('Pari modifié ✓', 'ok'); }
      });
    });
  }

  async function logout() {
    var reste = 0;
    if (S.mode === 'cloud') { try { await S.flush(); } catch (_) { /* gardé */ } reste = S.pendingWrites(); }
    if (reste && !confirm(reste + ' modification' + (reste > 1 ? 's ne sont' : ' n\'est') + ' pas encore envoyée' + (reste > 1 ? 's' : '') +
      ' à ton compte (pas de connexion ?). Elles partiront à ta prochaine connexion sur cet appareil. Se déconnecter quand même ?')) return;
    UI.closeModal();
    await BK.Auth.signOut();
    UI.toast('Déconnecté. Tes paris synchronisés t\'attendent sur ton compte.', 'info');
  }

  function onClick(e) {
    if (BK.Add.onClick(e)) return;
    var b = e.target.closest('[data-act], [data-view]');
    if (!b) return;
    if (b.matches('.bk-tabs [data-view]')) { go(b.dataset.view); return; }
    var act = b.dataset.act;
    if (!act) return;
    try {
      switch (act) {
        case 'go':
          if (b.dataset.filter) { UI.H.status = b.dataset.filter; }
          go(b.dataset.view);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'account': UI.accountModal(); break;
        case 'login': UI.loginModal(); break;
        case 'logout': logout(); break;
        case 'forgot': {
          var mail = document.querySelector('#bk-modal input[name=email]');
          var msg = document.querySelector('#bk-modal [data-z=loginmsg]');
          var v = mail ? mail.value.trim() : '';
          if (!/.+@.+\..+/.test(v)) { if (msg) msg.textContent = 'Indique ton e-mail ci-dessus, puis touche « Mot de passe oublié ? ».'; break; }
          BK.Auth.resetPassword(v).then(function () {
            if (msg) msg.textContent = 'Si un compte existe pour cette adresse, un e-mail vient de partir. Son lien ouvre matchup-tennis.fr pour choisir un nouveau mot de passe ; reviens ensuite te connecter ici.';
          }, function (err) { if (msg) msg.textContent = err.message; });
          break;
        }
        case 'refresh-premium':
          BK.Auth.refresh(true).then(function (A) {
            UI.toast(A.premium ? 'Premium actif ✓' : 'Pas encore d\'abonnement actif sur ce compte. Il peut falloir une minute après le paiement.', A.premium ? 'ok' : 'info');
            if (!A.premium) UI.settings();
          });
          break;
        case 'merge': { var n = S.mergeDevice(); UI.toast(n + ' pari' + (n > 1 ? 's ajoutés' : ' ajouté') + ' à ton compte ✓', 'ok'); break; }
        case 'merge-later': S.mergeLater(); renderAll(); break;
        case 'copy': { var c = S.copyAccount(); UI.toast(c + ' pari' + (c > 1 ? 's copiés' : ' copié') + ' sur cet appareil ✓', 'ok'); break; }
        case 'copy-later': S.copyLater(); renderAll(); break;
        case 'notice-ok': S.notice = null; renderAll(); break;
        case 'demo': S.startDemo(BK.Demo.build()); go('dash'); window.scrollTo({ top: 0 }); break;
        case 'demo-stop': S.stopDemo(); go('dash'); break;
        case 'settle': {
          var st = b.dataset.st;
          S.updateBet(b.dataset.id, { status: st }, { manual: true });
          UI.toast(st === 'won' ? 'Pari gagné ✓' : st === 'lost' ? 'Pari perdu' : 'Pari remboursé', st === 'won' ? 'ok' : 'info');
          break;
        }
        case 'edit': edit(b.dataset.id); break;
        case 'del':
          if (confirm('Supprimer définitivement ce pari ?')) { S.deleteBet(b.dataset.id); UI.toast('Pari supprimé', 'info'); }
          break;
        case 'more': UI.H.limit += 100; UI.hist(); break;
        case 'anatab': UI.setAnaTab(b.dataset.tab); break;
        case 'export-json': download('bankroll-' + U.today() + '.json', JSON.stringify(S.exportData(), null, 2), 'application/json'); break;
        case 'export-csv': exportCSV(); break;
        case 'import': { var f = document.querySelector('[data-z=import]'); if (f) f.click(); break; }
        case 'reset': {
          var partout = S.mode === 'cloud';
          if (!confirm('Effacer TOUS tes paris et réglages ? C\'est définitif.')) break;
          if (!confirm(partout ? 'Dernière confirmation : tout effacer, sur ton compte et tous tes appareils ?' : 'Dernière confirmation : tout effacer de cet appareil ? (pense à exporter avant)')) break;
          S.resetAll().then(function () { UI.toast('Tout a été effacé', 'info'); }, function (err) { UI.toast(err.message || 'Effacement impossible', 'err'); });
          break;
        }
        case 'mclose': UI.closeModal(); break;
      }
    } catch (err) {
      UI.toast(err && err.message || 'Action impossible', 'err');
    }
  }

  function onSubmit(e) {
    var f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    var val = function (n) { var x = f.querySelector('[name="' + n + '"]'); return x ? x.value : null; };
    try {
      if (f.dataset.form === 'login') {
        var btn = f.querySelector('button[type=submit]'), msg = f.querySelector('[data-z=loginmsg]');
        if (btn) btn.disabled = true;
        if (msg) msg.textContent = 'Connexion…';
        BK.Auth.signIn(val('email'), val('password')).then(function (A) {
          UI.closeModal();
          UI.toast(A.premium ? 'Connecté · Premium ✓' : 'Connecté (compte gratuit)', 'ok');
        }, function (err) {
          if (msg) msg.textContent = err.message;
          if (btn) btn.disabled = false;
        });
        return;
      }
      if (f.dataset.form === 'onboard') {
        var ini = U.num(val('initialBankroll'));
        if (!(ini > 0)) { UI.toast('Indique ta bankroll de départ', 'err'); return; }
        S.saveSettings({ initialBankroll: ini, unitValue: U.num(val('unitValue')) || 0 });
        UI.toast('Bankroll enregistrée ✓', 'ok');
      } else if (f.dataset.form === 'bankroll') {
        S.saveSettings({ initialBankroll: U.num(val('initialBankroll')) || 0, unitValue: U.num(val('unitValue')) || 0,
          currency: val('currency') || 'EUR', defaultBook: val('defaultBook') || '',
          customBooks: String(val('customBooks') || '').split(/[,;\n]/) });
        UI.toast('Réglages enregistrés ✓', 'ok');
      } else if (f.dataset.form === 'guard') {
        S.saveSettings({ maxStakePct: U.num(val('maxStakePct')), monthlyLossLimit: U.num(val('monthlyLossLimit')),
          lossStreakAlert: U.num(val('lossStreakAlert')) });
        UI.toast('Garde-fous enregistrés ✓', 'ok');
      }
    } catch (err) { UI.toast(err.message || 'Enregistrement impossible', 'err'); }
  }

  function onInput(e) {
    if (BK.Add.onInput(e)) return;
    var h = e.target && e.target.dataset && e.target.dataset.h;
    if (h && UI.H[h] !== e.target.value) { UI.H[h] = e.target.value; UI.H.limit = 60; UI.hist(); }
  }

  function onChange(e) {
    if (e.target && e.target.matches && e.target.matches('[data-z=import]')) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var n = S.importData(JSON.parse(rd.result));
          UI.toast(n + ' pari' + (n > 1 ? 's importés' : ' importé') + ' ✓', 'ok');
        } catch (err) { UI.toast('Import impossible : ' + (err.message || 'fichier illisible'), 'err'); }
      };
      rd.readAsText(file);
      return;
    }
    onInput(e);
  }

  /* ── Démarrage ────────────────────────────────────────────────────────── */
  /** Compte synchronisé la dernière fois ET session encore présente : la
   *  copie du compte s'affiche sans attendre le serveur. */
  function indiceCompte() {
    try {
      var last = JSON.parse(localStorage.getItem('bk_last_cloud_v2') || 'null');
      var sess = JSON.parse(localStorage.getItem(BK.CONF.SESSION_KEY) || 'null');
      var u = sess && (sess.user || (sess.currentSession && sess.currentSession.user));
      var uid = u && u.id;
      return last && uid && last.uid === uid ? { uid: uid } : null;
    } catch (_) { return null; }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', function (e) { if (e.target.tagName !== 'SELECT') onInput(e); });
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('bk-modal').hidden) UI.closeModal(); });
    $('bk-modal').addEventListener('click', function (e) { if (e.target.id === 'bk-modal') UI.closeModal(); });
    window.addEventListener('hashchange', function () { go(location.hash.slice(1), false); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (S.mode === 'cloud') S.flush();
      // Retour sur l'onglet après un abonnement pris sur matchup-tennis.fr.
      if (BK.Auth.user) BK.Auth.refresh(false);
      autoSettle(false);
    });
    setInterval(function () { if (document.visibilityState === 'visible') autoSettle(false); }, 10 * 60e3);

    S.on(function (reason) {
      if (reason === 'sync') { UI.syncBar(); return; }
      renderAll();
    });

    var repris = S.boot(indiceCompte());
    go(location.hash.slice(1) || 'dash', false);
    renderAll();
    if (repris) UI.toast(repris + ' pari' + (repris > 1 ? 's' : '') + ' de l\'ancienne version repris ✓', 'ok');
    // Le programme se charge tôt : la vue Ajouter s'ouvre sans attente.
    BK.MU.load().catch(function () { /* affiché dans la vue */ });
    BK.Auth.on(onAuth);
    BK.Auth.init();
    autoSettle(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  BK.App = { go: go, autoSettle: autoSettle, app: app, exportCSV: exportCSV };
})(window.BK = window.BK || {});
