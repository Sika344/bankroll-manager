/* ══════════════════════════════════════════════
   BETFORM — formulaire pari (manuel / détection / édition)
   ══════════════════════════════════════════════ */
const BetForm = (() => {

  const BOOKS = ['Winamax', 'Betclic', 'Unibet', 'ParionsSport', 'Bwin', 'Zebet', 'PMU', 'Netbet', 'Vbet', 'Olybet', 'Stake', '1xBet', 'Pinnacle', 'Bet365', 'Autre'];
  const SPORTS = ['Tennis', 'Football', 'Basketball', 'Rugby', 'Hockey', 'Baseball', 'MMA', 'Boxe', 'Volleyball', 'Handball', 'Fléchettes', 'Esport', 'Autre'];

  function opts(list, selected) {
    return list.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* Rendu du formulaire dans un conteneur. bet=null → création */
  function render(mount, bet, onSave, opt = {}) {
    const b = bet || {
      betDate: new Date().toISOString().slice(0, 10),
      eventDate: new Date().toISOString().slice(0, 10),
      selections: [{ event: '', market: '', pick: '', odds: '' }],
      status: 'pending', betType: 'simple', tipster: 'Perso'
    };
    const books = [...new Set([...BOOKS.slice(0, -1), ...(Store.state.settings.customBooks || []), ...(b.bookmaker && !BOOKS.includes(b.bookmaker) ? [b.bookmaker] : []), 'Autre'])];
    const sports = [...new Set([...SPORTS.slice(0, -1), ...(b.sport && !SPORTS.includes(b.sport) ? [b.sport] : []), 'Autre'])];
    const fid = 'bf' + Store.uid();

    mount.innerHTML = `
    <form id="${fid}" autocomplete="off">
      <div class="form-grid">
        <div class="field"><label>Bookmaker</label><select name="bookmaker">${opts(books, b.bookmaker)}</select></div>
        <div class="field"><label>Sport</label><select name="sport">${opts(sports, b.sport)}</select></div>
        <div class="field"><label>Compétition</label><input name="competition" value="${esc(b.competition)}" placeholder="Wimbledon, Ligue 1…"></div>
        <div class="field"><label>Type</label>
          <select name="betType">
            <option value="simple" ${b.betType === 'simple' ? 'selected' : ''}>Simple</option>
            <option value="combine" ${b.betType === 'combine' ? 'selected' : ''}>Combiné</option>
            <option value="systeme" ${b.betType === 'systeme' ? 'selected' : ''}>Système</option>
          </select>
        </div>
        <div class="field"><label>Date du pari</label><input type="date" name="betDate" value="${esc(b.betDate)}"></div>
        <div class="field"><label>Date de l'événement</label><input type="date" name="eventDate" value="${esc((b.eventDate || '').slice(0, 10))}"></div>
      </div>

      <div class="divider"></div>
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <label style="font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--text3);font-weight:600">Sélections</label>
        <button type="button" class="btn btn-ghost btn-xs" data-act="add-sel" style="margin-left:auto">＋ Ajouter une ligne</button>
      </div>
      <div data-zone="selections">
        ${b.selections.map(s => selRow(s)).join('')}
      </div>

      <div class="divider"></div>
      <div class="form-grid">
        <div class="field"><label>Cote totale</label><input type="number" name="totalOdds" step="0.001" min="1" value="${b.totalOdds ?? ''}" placeholder="auto si vide"></div>
        <div class="field"><label>Mise (€)</label><input type="number" name="stake" step="0.01" min="0" value="${b.stake ?? ''}" required>
          <span class="aid" data-zone="stake-aid"></span></div>
        <div class="field"><label>Statut</label>
          <select name="status">
            <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>⏳ En attente</option>
            <option value="won" ${b.status === 'won' ? 'selected' : ''}>✓ Gagné</option>
            <option value="lost" ${b.status === 'lost' ? 'selected' : ''}>✗ Perdu</option>
            <option value="halfwon" ${b.status === 'halfwon' ? 'selected' : ''}>½ Gagné</option>
            <option value="halflost" ${b.status === 'halflost' ? 'selected' : ''}>½ Perdu</option>
            <option value="void" ${b.status === 'void' ? 'selected' : ''}>↩ Remboursé</option>
            <option value="cashout" ${b.status === 'cashout' ? 'selected' : ''}>💸 Cashout</option>
          </select>
        </div>
        <div class="field ${b.status === 'cashout' ? '' : 'hide'}" data-zone="cashout-field">
          <label>Montant cashout (€)</label><input type="number" name="cashoutAmount" step="0.01" min="0" value="${b.cashoutAmount ?? ''}">
        </div>
        <div class="field"><label>Source / Tipster</label><input name="tipster" value="${esc(b.tipster)}" list="${fid}-tipsters" placeholder="Perso, SikaPronos…">
          <datalist id="${fid}-tipsters">${[...new Set(Store.state.bets.map(x => x.tipster).filter(Boolean))].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
        </div>
        <div class="field"><label>Confiance (1–5)</label>
          <select name="confidence"><option value="">—</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${b.confidence === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select>
        </div>
      </div>

      <div class="form-row" style="margin:14px 0">
        <label class="check"><input type="checkbox" name="isLive" ${b.isLive ? 'checked' : ''}> Live</label>
        <label class="check"><input type="checkbox" name="isFreebet" ${b.isFreebet ? 'checked' : ''}> Freebet</label>
        <label class="check"><input type="checkbox" name="isBoost" ${b.isBoost ? 'checked' : ''}> Cote boostée</label>
      </div>

      <details ${b.closingOdds || b.estimatedProb || b.baseOdds || b.notes ? 'open' : ''}>
        <summary style="cursor:pointer;font-size:13px;color:var(--text2);font-weight:600;margin-bottom:12px">Champs avancés (CLV, proba, notes)</summary>
        <div class="form-grid">
          <div class="field"><label>Cote de clôture (CLV)</label><input type="number" name="closingOdds" step="0.001" min="1" value="${b.closingOdds ?? ''}">
            <span class="aid">cote au coup d'envoi</span></div>
          <div class="field"><label>Proba estimée (%)</label><input type="number" name="estimatedProb" step="0.1" min="0" max="100" value="${b.estimatedProb ?? ''}">
            <span class="aid" data-zone="kelly-aid">pour edge & Kelly</span></div>
          <div class="field"><label>Cote de base (avant boost)</label><input type="number" name="baseOdds" step="0.001" min="1" value="${b.baseOdds ?? ''}"></div>
          <div class="field span2" style="grid-column:1/-1"><label>Notes</label><textarea name="notes" placeholder="Contexte, raisonnement, météo…">${esc(b.notes)}</textarea></div>
        </div>
      </details>

      <div style="margin-top:18px;display:flex;gap:10px">
        <button type="submit" class="btn btn-primary">${opt.saveLabel || 'Enregistrer le pari'}</button>
        ${opt.cancelable ? '<button type="button" class="btn btn-ghost" data-act="cancel">Annuler</button>' : ''}
      </div>
    </form>`;

    const form = mount.querySelector('#' + fid);
    const F = name => form.querySelector(`[name="${name}"]`);

    /* Ligne de sélection */
    function selRow(s = {}) {
      return `<div class="sel-row">
        <div class="field"><label>Événement</label><input data-s="event" value="${esc(s.event)}" placeholder="Alcaraz - Sinner"></div>
        <div class="field"><label>Marché</label><input data-s="market" value="${esc(s.market)}" placeholder="Vainqueur"></div>
        <div class="field"><label>Sélection</label><input data-s="pick" value="${esc(s.pick)}" placeholder="Alcaraz"></div>
        <div class="field"><label>Cote</label><input data-s="odds" type="number" step="0.001" min="1" value="${s.odds ?? ''}"></div>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="del-sel" title="Supprimer">✕</button>
      </div>`;
    }

    /* Aides dynamiques : % BK + Kelly */
    function refreshAids() {
      const stake = +F('stake').value || 0;
      const bk = Stats.currentBankroll(Store.state);
      const unit = Store.state.settings.unitValue || 0;
      const aid = form.querySelector('[data-zone=stake-aid]');
      if (stake > 0 && bk > 0) {
        let t = `= ${(stake / bk * 100).toFixed(2)} % de la BK (${UI.money(bk)})`;
        if (unit > 0) t += ` · ${(stake / unit).toFixed(1)} u`;
        aid.textContent = t;
      } else aid.textContent = '';
      const kelly = form.querySelector('[data-zone=kelly-aid]');
      const p = (+F('estimatedProb').value || 0) / 100;
      const o = +F('totalOdds').value || autoOdds();
      if (p > 0 && o > 1) {
        const edge = (p * o - 1) * 100;
        const k = ((p * o - 1) / (o - 1)) * 100;
        kelly.innerHTML = `edge <b class="${edge >= 0 ? 'pos' : 'neg'}">${edge.toFixed(1)}%</b> · Kelly plein <b>${Math.max(0, k).toFixed(1)}%</b> de la BK`;
      } else kelly.textContent = 'pour edge & Kelly';
    }

    function autoOdds() {
      const odds = [...form.querySelectorAll('[data-s=odds]')].map(i => +i.value).filter(o => o > 1);
      return odds.length ? odds.reduce((a, o) => a * o, 1) : 0;
    }

    form.addEventListener('input', refreshAids);
    refreshAids();

    form.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'add-sel') {
        form.querySelector('[data-zone=selections]').insertAdjacentHTML('beforeend', selRow());
        if (F('betType').value === 'simple') F('betType').value = 'combine';
      }
      if (act === 'del-sel') {
        const rows = form.querySelectorAll('.sel-row');
        if (rows.length > 1) e.target.closest('.sel-row').remove();
      }
      if (act === 'cancel' && opt.onCancel) opt.onCancel();
    });

    F('status').addEventListener('change', () => {
      form.querySelector('[data-zone=cashout-field]').classList.toggle('hide', F('status').value !== 'cashout');
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const selections = [...form.querySelectorAll('.sel-row')].map(r => ({
        event: r.querySelector('[data-s=event]').value,
        market: r.querySelector('[data-s=market]').value,
        pick: r.querySelector('[data-s=pick]').value,
        odds: r.querySelector('[data-s=odds]').value
      })).filter(s => s.event || s.pick || s.odds);

      const data = {
        bookmaker: F('bookmaker').value,
        sport: F('sport').value,
        competition: F('competition').value,
        betType: F('betType').value,
        betDate: F('betDate').value,
        eventDate: F('eventDate').value,
        selections,
        totalOdds: F('totalOdds').value || null,
        stake: F('stake').value,
        status: F('status').value,
        cashoutAmount: F('cashoutAmount').value,
        tipster: F('tipster').value,
        confidence: F('confidence').value,
        isLive: F('isLive').checked,
        isFreebet: F('isFreebet').checked,
        isBoost: F('isBoost').checked,
        closingOdds: F('closingOdds').value,
        estimatedProb: F('estimatedProb').value,
        baseOdds: F('baseOdds').value,
        notes: F('notes').value
      };
      if (!data.stake || +data.stake <= 0) { UI.toast('Renseigne une mise valide', 'err'); return; }
      if (!data.totalOdds && !selections.some(s => +s.odds > 1) && data.status !== 'void') {
        UI.toast('Renseigne au moins une cote', 'err'); return;
      }
      onSave(data);
    });
  }

  /* Mapping d'un pari détecté par l'IA → structure interne */
  function fromDetection(d) {
    return {
      bookmaker: d.bookmaker || '',
      sport: d.sport || '',
      competition: d.competition || '',
      betType: d.betType || (d.selections?.length > 1 ? 'combine' : 'simple'),
      selections: (d.selections || []).map(s => ({ event: s.event || '', market: s.market || '', pick: s.pick || '', odds: s.odds ?? '' })),
      totalOdds: d.totalOdds ?? '',
      stake: d.stake ?? '',
      betDate: d.betDate || new Date().toISOString().slice(0, 10),
      eventDate: d.eventDate || d.betDate || new Date().toISOString().slice(0, 10),
      isLive: !!d.isLive, isFreebet: !!d.isFreebet, isBoost: !!d.isBoost,
      baseOdds: d.baseOdds ?? '',
      status: ['won', 'lost', 'cashout', 'void'].includes(d.status) ? d.status : 'pending',
      cashoutAmount: d.cashoutAmount ?? '',
      tipster: 'Perso',
      notes: d.notes || ''
    };
  }

  return { render, fromDetection, BOOKS, SPORTS, esc };
})();
