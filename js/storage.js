/* ══════════════════════════════════════════════
   STORAGE — état, persistance, export/import, Gist
   ══════════════════════════════════════════════ */
const Store = (() => {
  const KEY = 'bkm_state_v1';

  const defaults = () => ({
    settings: {
      initialBankroll: 1000,
      unitValue: 10,
      currency: 'EUR',
      engine: 'ocr',
      apiKey: '',
      model: 'claude-haiku-4-5-20251001',
      ghPat: '',
      gistId: '',
      autoSync: false,
      customBooks: []
    },
    bets: []
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      return { ...defaults(), ...parsed, settings: { ...defaults().settings, ...(parsed.settings || {}) } };
    } catch (e) {
      console.error('Load error', e);
      return defaults();
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (state.settings.autoSync && state.settings.ghPat) {
      clearTimeout(save._t);
      save._t = setTimeout(() => gistPush(true), 1500);
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ── Modèle d'un pari ─────────────────────────
     id, createdAt, betDate, eventDate, sport, competition,
     bookmaker, betType(simple|combine|systeme),
     selections:[{event,market,pick,odds,result}], totalOdds,
     stake, stakePercent, bankrollBefore, isLive, isFreebet, isBoost, baseOdds,
     status(pending|won|lost|halfwon|halflost|void|cashout),
     cashoutAmount, closingOdds, tipster, confidence, estimatedProb,
     notes, settledAt
  ─────────────────────────────────────────────── */

  function normalizeBet(b) {
    const bet = {
      id: b.id || uid(),
      createdAt: b.createdAt || new Date().toISOString(),
      betDate: b.betDate || new Date().toISOString().slice(0, 10),
      eventDate: b.eventDate || b.betDate || new Date().toISOString().slice(0, 10),
      sport: (b.sport || '').trim() || 'Autre',
      competition: (b.competition || '').trim(),
      bookmaker: (b.bookmaker || '').trim() || 'Autre',
      betType: b.betType || (Array.isArray(b.selections) && b.selections.length > 1 ? 'combine' : 'simple'),
      selections: (Array.isArray(b.selections) && b.selections.length ? b.selections : [{ event: '', market: '', pick: '', odds: null }])
        .map(s => ({
          event: (s.event || '').trim(),
          market: (s.market || '').trim(),
          pick: (s.pick || '').trim(),
          odds: s.odds != null && s.odds !== '' ? +s.odds : null,
          result: s.result || 'pending'
        })),
      totalOdds: +b.totalOdds || null,
      stake: +b.stake || 0,
      stakePercent: b.stakePercent != null ? +b.stakePercent : null,
      bankrollBefore: b.bankrollBefore != null ? +b.bankrollBefore : null,
      isLive: !!b.isLive,
      isFreebet: !!b.isFreebet,
      isBoost: !!b.isBoost,
      baseOdds: b.baseOdds ? +b.baseOdds : null,
      status: b.status || 'pending',
      cashoutAmount: b.cashoutAmount != null && b.cashoutAmount !== '' ? +b.cashoutAmount : null,
      closingOdds: b.closingOdds ? +b.closingOdds : null,
      tipster: (b.tipster || '').trim() || 'Perso',
      confidence: b.confidence ? Math.min(5, Math.max(1, +b.confidence)) : null,
      estimatedProb: b.estimatedProb ? +b.estimatedProb : null,
      notes: b.notes || '',
      settledAt: b.settledAt || null
    };
    // Cote totale auto pour combinés si absente
    if (!bet.totalOdds) {
      const odds = bet.selections.map(s => s.odds).filter(o => o > 1);
      if (odds.length) bet.totalOdds = +odds.reduce((a, o) => a * o, 1).toFixed(3);
    }
    return bet;
  }

  function addBet(raw) {
    const bet = normalizeBet(raw);
    if (bet.stakePercent == null || bet.bankrollBefore == null) {
      const bk = Stats.currentBankroll(state);
      bet.bankrollBefore = +bk.toFixed(2);
      bet.stakePercent = bk > 0 ? +((bet.stake / bk) * 100).toFixed(2) : null;
    }
    if (bet.status !== 'pending' && !bet.settledAt) bet.settledAt = new Date().toISOString();
    state.bets.push(bet);
    save();
    return bet;
  }

  function updateBet(id, patch) {
    const i = state.bets.findIndex(b => b.id === id);
    if (i === -1) return null;
    const prev = state.bets[i];
    const next = normalizeBet({ ...prev, ...patch, id: prev.id, createdAt: prev.createdAt });
    if (next.status !== 'pending' && !next.settledAt) next.settledAt = new Date().toISOString();
    if (next.status === 'pending') next.settledAt = null;
    state.bets[i] = next;
    save();
    return next;
  }

  function deleteBet(id) {
    state.bets = state.bets.filter(b => b.id !== id);
    save();
  }

  function settleBet(id, status, cashoutAmount) {
    const patch = { status, settledAt: new Date().toISOString() };
    if (status === 'cashout') patch.cashoutAmount = cashoutAmount;
    return updateBet(id, patch);
  }

  /* ── Export / Import ─────────────────────────── */
  function exportJSON() {
    const clean = JSON.parse(JSON.stringify(state));
    delete clean.settings.apiKey;
    delete clean.settings.ghPat;
    downloadFile(`bankroll-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(clean, null, 2), 'application/json');
  }

  function exportCSV() {
    const cols = ['id', 'betDate', 'eventDate', 'sport', 'competition', 'bookmaker', 'betType',
      'selections', 'totalOdds', 'stake', 'stakePercent', 'bankrollBefore', 'isLive', 'isFreebet',
      'isBoost', 'status', 'cashoutAmount', 'closingOdds', 'tipster', 'confidence', 'notes', 'profit', 'settledAt'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = state.bets.map(b => {
      const sel = b.selections.map(s => `${s.event} | ${s.market} | ${s.pick} @${s.odds ?? '?'}`).join(' + ');
      return cols.map(c => {
        if (c === 'selections') return esc(sel);
        if (c === 'profit') return esc(Stats.betProfit(b).toFixed(2));
        return esc(b[c]);
      }).join(';');
    });
    downloadFile(`bankroll-paris-${new Date().toISOString().slice(0, 10)}.csv`,
      '\uFEFF' + cols.join(';') + '\n' + rows.join('\n'), 'text/csv');
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.bets)) throw new Error('Format invalide');
    const keepKeys = { apiKey: state.settings.apiKey, ghPat: state.settings.ghPat };
    state = { ...defaults(), ...parsed, settings: { ...defaults().settings, ...(parsed.settings || {}), ...keepKeys } };
    state.bets = state.bets.map(normalizeBet);
    save();
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ── Sync GitHub Gist (secret) ───────────────── */
  const GIST_FILE = 'bankroll-data.json';

  async function gistPush(silent) {
    const pat = state.settings.ghPat;
    if (!pat) { if (!silent) UI.toast('Configure ton PAT GitHub dans Réglages', 'err'); return; }
    const payload = JSON.parse(JSON.stringify(state));
    delete payload.settings.apiKey;
    delete payload.settings.ghPat;
    const body = { description: 'Bankroll Manager — données (privé)', files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } } };
    try {
      let res;
      if (state.settings.gistId) {
        res = await fetch(`https://api.github.com/gists/${state.settings.gistId}`, {
          method: 'PATCH',
          headers: { Authorization: `token ${pat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.status === 404) { state.settings.gistId = ''; return gistPush(silent); }
      } else {
        body.public = false;
        res = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: { Authorization: `token ${pat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const data = await res.json();
      state.settings.gistId = data.id;
      localStorage.setItem(KEY, JSON.stringify(state));
      const el = document.getElementById('gist-status');
      if (el) el.textContent = `✓ synchronisé ${new Date().toLocaleTimeString('fr-FR')}`;
      if (!silent) UI.toast('Données sauvegardées sur GitHub ✓', 'ok');
    } catch (e) {
      if (!silent) UI.toast(`Échec sync : ${e.message}`, 'err');
    }
  }

  async function gistPull() {
    const pat = state.settings.ghPat;
    if (!pat) { UI.toast('Configure ton PAT GitHub dans Réglages', 'err'); return; }
    try {
      let gistId = state.settings.gistId;
      if (!gistId) {
        const res = await fetch('https://api.github.com/gists?per_page=100', { headers: { Authorization: `token ${pat}` } });
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        const gists = await res.json();
        const found = gists.find(g => g.files && g.files[GIST_FILE]);
        if (!found) { UI.toast('Aucune sauvegarde trouvée sur ce compte', 'err'); return; }
        gistId = found.id;
      }
      const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { Authorization: `token ${pat}` } });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const data = await res.json();
      const content = data.files[GIST_FILE]?.content;
      if (!content) throw new Error('Fichier introuvable dans le gist');
      importJSON(content);
      state.settings.gistId = gistId;
      save();
      UI.toast('Données restaurées depuis GitHub ✓', 'ok');
      App.refresh();
    } catch (e) {
      UI.toast(`Échec restauration : ${e.message}`, 'err');
    }
  }

  function resetAll() {
    localStorage.removeItem(KEY);
    state = defaults();
  }

  return {
    get state() { return state; },
    save, addBet, updateBet, deleteBet, settleBet, normalizeBet,
    exportJSON, exportCSV, importJSON, gistPush, gistPull, resetAll, uid
  };
})();
