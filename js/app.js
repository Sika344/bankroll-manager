/* ══════════════════════════════════════════════
   APP — navigation & orchestration
   ══════════════════════════════════════════════ */
const App = (() => {

  let currentView = 'dashboard';

  /* ── Navigation ─────────────────────────────── */
  function go(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    location.hash = view;
    refresh();
    window.scrollTo({ top: 0 });
  }

  function refresh() {
    if (currentView === 'dashboard') UI.renderDashboard();
    if (currentView === 'history') UI.renderHistory();
    if (currentView === 'stats') UI.renderStats();
    if (currentView === 'add') checkApiWarning();
    if (currentView === 'settings') loadSettingsForm();
  }

  /* ── Actions paris ──────────────────────────── */
  function quickSettle(id, status) {
    if (status === 'cashout') {
      const v = prompt('Montant récupéré au cashout (€) :');
      if (v == null) return;
      Store.settleBet(id, 'cashout', +String(v).replace(',', '.'));
    } else {
      Store.settleBet(id, status);
    }
    const labels = { won: 'Pari gagné ✓', lost: 'Pari perdu', void: 'Pari remboursé', cashout: 'Cashout enregistré' };
    UI.toast(labels[status] || 'Pari mis à jour', status === 'won' ? 'ok' : 'err');
    refresh();
  }

  function deleteBet(id) {
    if (!confirm('Supprimer définitivement ce pari ?')) return;
    Store.deleteBet(id);
    UI.toast('Pari supprimé');
    refresh();
  }

  function editBet(id) {
    const bet = Store.state.bets.find(b => b.id === id);
    if (!bet) return;
    const bg = document.getElementById('modal-bg');
    bg.classList.add('open');
    BetForm.render(document.getElementById('modal-form-mount'), bet, data => {
      Store.updateBet(id, data);
      bg.classList.remove('open');
      UI.toast('Pari modifié ✓', 'ok');
      refresh();
    }, { saveLabel: 'Enregistrer les modifications', cancelable: true, onCancel: () => bg.classList.remove('open') });
  }

  /* ── Mode ajout : screenshot ────────────────── */
  function checkApiWarning() {
    document.getElementById('api-warning').classList.toggle('hide', !!Store.state.settings.apiKey);
  }

  async function handleFiles(files) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { UI.toast('Aucune image reconnue', 'err'); return; }
    if (!Store.state.settings.apiKey) {
      UI.toast('Ajoute ta clé API Anthropic dans Réglages pour la détection', 'err');
      go('settings');
      return;
    }

    const idle = document.getElementById('dz-idle');
    const busy = document.getElementById('dz-busy');
    const preview = document.getElementById('dz-preview');
    idle.classList.add('hide');
    preview.classList.add('hide');
    busy.classList.remove('hide');
    document.getElementById('dz-busy-sub').textContent = `Lecture de ${imgs.length} image${imgs.length > 1 ? 's' : ''} par Claude…`;

    try {
      const compressed = await Promise.all(imgs.map(Vision.compress));
      preview.innerHTML = compressed.map(c => `<img src="${c.dataUrl}" alt="ticket">`).join('');
      const bets = await Vision.analyze(compressed);
      busy.classList.add('hide');
      preview.classList.remove('hide');
      renderDetected(bets);
      UI.toast(`${bets.length} pari${bets.length > 1 ? 's' : ''} détecté${bets.length > 1 ? 's' : ''} — vérifie et valide`, 'ok');
    } catch (e) {
      busy.classList.add('hide');
      idle.classList.remove('hide');
      if (e.message === 'NO_API_KEY') { UI.toast('Clé API manquante — configure-la dans Réglages', 'err'); go('settings'); }
      else UI.toast(`Analyse échouée : ${e.message}`, 'err');
    }
  }

  function renderDetected(bets) {
    const zone = document.getElementById('detected-zone');
    zone.innerHTML = `<div class="page-sub" style="margin-bottom:12px">✨ <b style="color:var(--green)">${bets.length} pari${bets.length > 1 ? 's' : ''} détecté${bets.length > 1 ? 's' : ''}.</b> Vérifie les champs, complète si besoin, puis valide chaque pari.</div>`;
    bets.forEach((d, i) => {
      const card = document.createElement('div');
      card.className = 'detected-card';
      card.innerHTML = `<div class="detected-head">
        <span class="badge badge-green">DÉTECTÉ #${i + 1}</span>
        <span class="dh-title">${BetForm.esc(d.bookmaker || 'Bookmaker ?')} — ${BetForm.esc((d.selections?.[0]?.pick) || d.sport || 'Pari')}</span>
      </div><div class="mount"></div>`;
      zone.appendChild(card);
      BetForm.render(card.querySelector('.mount'), Store.normalizeBet(BetForm.fromDetection(d)), data => {
        Store.addBet(data);
        card.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><span class="badge badge-green">✓ ENREGISTRÉ</span><b>${BetForm.esc(data.selections?.[0]?.pick || 'Pari')}</b> · ${UI.money(+data.stake)} @${(+data.totalOdds || 0).toFixed(2)}</div>`;
        UI.toast('Pari enregistré ✓', 'ok');
      }, { saveLabel: '✓ Valider ce pari' });
    });
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindDropzone() {
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('file-input');
    dz.addEventListener('click', e => { if (!e.target.closest('img')) input.click(); });
    input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
    document.addEventListener('paste', e => {
      if (currentView !== 'add') return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) handleFiles(files);
    });
  }

  /* ── Mode manuel ────────────────────────────── */
  function mountManualForm() {
    BetForm.render(document.getElementById('bet-form-mount'), null, data => {
      Store.addBet(data);
      UI.toast('Pari enregistré ✓', 'ok');
      mountManualForm();
      go('dashboard');
    });
  }

  /* ── Réglages ───────────────────────────────── */
  function loadSettingsForm() {
    const s = Store.state.settings;
    document.getElementById('set-initial').value = s.initialBankroll;
    document.getElementById('set-unit').value = s.unitValue;
    document.getElementById('set-currency').value = s.currency;
    document.getElementById('set-apikey').value = s.apiKey;
    document.getElementById('set-model').value = s.model;
    document.getElementById('set-ghpat').value = s.ghPat;
    document.getElementById('set-autosync').value = s.autoSync ? '1' : '0';
    document.getElementById('gist-status').textContent = s.gistId ? `gist lié : ${s.gistId.slice(0, 8)}…` : '';
  }

  function bindSettings() {
    document.getElementById('save-bankroll').addEventListener('click', () => {
      const s = Store.state.settings;
      s.initialBankroll = +document.getElementById('set-initial').value || 0;
      s.unitValue = +document.getElementById('set-unit').value || 0;
      s.currency = document.getElementById('set-currency').value;
      Store.save();
      UI.toast('Bankroll enregistrée ✓', 'ok');
    });

    document.getElementById('save-api').addEventListener('click', () => {
      const s = Store.state.settings;
      s.apiKey = document.getElementById('set-apikey').value.trim();
      s.model = document.getElementById('set-model').value;
      Store.save();
      UI.toast('Configuration API enregistrée ✓', 'ok');
    });

    document.getElementById('test-api').addEventListener('click', async () => {
      const el = document.getElementById('api-test-result');
      Store.state.settings.apiKey = document.getElementById('set-apikey').value.trim();
      Store.state.settings.model = document.getElementById('set-model').value;
      Store.save();
      el.innerHTML = '<span class="spin"></span>';
      try { await Vision.testKey(); el.innerHTML = '<span class="pos">✓ Connexion OK</span>'; }
      catch (e) { el.innerHTML = `<span class="neg">✗ ${BetForm.esc(e.message)}</span>`; }
    });

    document.getElementById('gist-push').addEventListener('click', () => {
      Store.state.settings.ghPat = document.getElementById('set-ghpat').value.trim();
      Store.state.settings.autoSync = document.getElementById('set-autosync').value === '1';
      Store.save();
      Store.gistPush(false);
    });
    document.getElementById('gist-pull').addEventListener('click', () => {
      Store.state.settings.ghPat = document.getElementById('set-ghpat').value.trim();
      Store.save();
      Store.gistPull();
    });

    document.getElementById('export-json').addEventListener('click', Store.exportJSON);
    document.getElementById('export-csv').addEventListener('click', Store.exportCSV);
    document.getElementById('import-json').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!confirm('Importer ce fichier remplacera tes données actuelles. Continuer ?')) { e.target.value = ''; return; }
      const r = new FileReader();
      r.onload = () => {
        try { Store.importJSON(r.result); UI.toast('Import réussi ✓', 'ok'); refresh(); loadSettingsForm(); }
        catch (err) { UI.toast('Import échoué : ' + err.message, 'err'); }
      };
      r.readAsText(f);
      e.target.value = '';
    });

    document.getElementById('reset-all').addEventListener('click', () => {
      if (!confirm('⚠️ Tout supprimer ? Cette action est irréversible.')) return;
      if (!confirm('Dernière confirmation : effacer TOUS les paris et réglages ?')) return;
      Store.resetAll();
      UI.toast('Données réinitialisées');
      loadSettingsForm();
      go('dashboard');
    });
  }

  /* ── Init ───────────────────────────────────── */
  function init() {
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));

    document.getElementById('mode-screen').addEventListener('click', () => {
      document.getElementById('mode-screen').classList.add('active');
      document.getElementById('mode-manual').classList.remove('active');
      document.getElementById('add-screen-zone').classList.remove('hide');
      document.getElementById('add-manual-zone').classList.add('hide');
    });
    document.getElementById('mode-manual').addEventListener('click', () => {
      document.getElementById('mode-manual').classList.add('active');
      document.getElementById('mode-screen').classList.remove('active');
      document.getElementById('add-manual-zone').classList.remove('hide');
      document.getElementById('add-screen-zone').classList.add('hide');
    });

    document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-bg').classList.remove('open'));
    document.getElementById('modal-bg').addEventListener('click', e => { if (e.target.id === 'modal-bg') e.target.classList.remove('open'); });

    ['f-search', 'f-status', 'f-book', 'f-sport', 'f-tipster', 'f-period'].forEach(id =>
      document.getElementById(id).addEventListener('input', UI.renderHistory));
    document.getElementById('f-reset').addEventListener('click', () => {
      ['f-search', 'f-status', 'f-book', 'f-sport', 'f-tipster', 'f-period'].forEach(id => document.getElementById(id).value = '');
      UI.renderHistory();
    });
    UI.bindHistorySort();

    document.querySelectorAll('.split-tab').forEach(t => t.addEventListener('click', () => UI.renderSplit(t.dataset.split)));

    bindDropzone();
    bindSettings();
    mountManualForm();

    const hash = location.hash.replace('#', '');
    go(['dashboard', 'add', 'history', 'stats', 'settings'].includes(hash) ? hash : 'dashboard');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { go, refresh, quickSettle, deleteBet, editBet };
})();
