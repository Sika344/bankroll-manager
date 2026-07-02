/* ══════════════════════════════════════════════
   UI — rendering des vues + graphiques
   ══════════════════════════════════════════════ */
const UI = (() => {

  const charts = {};
  const esc = BetForm.esc;

  /* ── Helpers ────────────────────────────────── */
  function money(v, dec = 2) {
    const cur = { EUR: '€', USD: '$', GBP: '£' }[Store.state.settings.currency] || '€';
    const n = (v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return `${n} ${cur}`;
  }
  const pct = (v, dec = 1) => `${(v ?? 0) >= 0 ? '+' : ''}${(v ?? 0).toFixed(dec)} %`;
  const signMoney = v => `${v >= 0 ? '+' : ''}${money(v)}`;
  const cls = v => v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'muted';
  const fdate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';

  const STATUS = {
    pending: ['⏳ En attente', 'badge-amber'],
    won: ['✓ Gagné', 'badge-green'],
    lost: ['✗ Perdu', 'badge-red'],
    halfwon: ['½ Gagné', 'badge-green'],
    halflost: ['½ Perdu', 'badge-red'],
    void: ['↩ Remboursé', 'badge-gray'],
    cashout: ['💸 Cashout', 'badge-violet']
  };
  const statusBadge = s => { const [t, c] = STATUS[s] || [s, 'badge-gray']; return `<span class="badge ${c}">${t}</span>`; };

  function betTitle(b) {
    if (b.betType !== 'simple' && b.selections.length > 1) return `Combiné ${b.selections.length} sélections`;
    const s = b.selections[0] || {};
    return s.pick || s.event || 'Pari';
  }
  function betSubtitle(b) {
    const s = b.selections[0] || {};
    const parts = [];
    if (b.betType !== 'simple' && b.selections.length > 1) parts.push(b.selections.map(x => x.pick || x.event).filter(Boolean).join(' + '));
    else { if (s.event && s.pick && s.event !== s.pick) parts.push(s.event); if (s.market) parts.push(s.market); }
    if (b.competition) parts.push(b.competition);
    return parts.join(' · ');
  }

  function toast(msg, type = 'ok') {
    const z = document.getElementById('toast-zone');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    z.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  function chart(id, config) {
    if (charts[id]) charts[id].destroy();
    const ctx = document.getElementById(id);
    if (!ctx) return;
    Chart.defaults.font.family = "'JetBrains Mono', monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#6b6b75';
    charts[id] = new Chart(ctx, config);
  }

  const gridCfg = { color: 'rgba(255,255,255,.05)' };

  /* ── DASHBOARD ──────────────────────────────── */
  function renderDashboard() {
    const g = Stats.global(Store.state);
    const s = Store.state;

    document.getElementById('d-bankroll').textContent = money(g.bankroll);
    document.getElementById('d-bankroll').style.color = g.profit > 0.004 ? 'var(--green)' : g.profit < -0.004 ? 'var(--red)' : 'var(--text)';
    document.getElementById('d-initial').textContent = money(g.initial);
    const pt = document.getElementById('d-profit-total');
    pt.textContent = `${signMoney(g.profit)} (${pct(g.roi)})`;
    pt.className = cls(g.profit);
    const md = document.getElementById('d-month-delta');
    md.textContent = signMoney(g.monthProfit);
    md.className = 'delta ' + (g.monthProfit > 0.004 ? 'up' : g.monthProfit < -0.004 ? 'down' : 'flat');
    document.getElementById('d-exposure').textContent = money(g.exposure);
    document.getElementById('d-potential').textContent = '+' + money(g.potential);

    const unit = s.settings.unitValue;
    const cards = [
      ['YIELD', pct(g.yield), `sur ${money(g.totalStaked, 0)} misés`, cls(g.yield)],
      ['WINRATE', `${g.winrate.toFixed(1)} %`, `${g.nWon}/${g.nDecided} paris décidés`, ''],
      ['PARIS', g.nTotal, `${g.nPending} en attente · ${g.nSettled} réglés`, ''],
      ['MISE MOYENNE', money(g.avgStake), unit > 0 ? `${(g.avgStake / unit).toFixed(1)} u · ${g.avgStakePct.toFixed(1)} % BK` : `${g.avgStakePct.toFixed(1)} % BK moyen`, ''],
      ['COTE MOYENNE', g.avgOdds ? g.avgOdds.toFixed(2) : '—', g.avgOddsWon ? `${g.avgOddsWon.toFixed(2)} sur les gagnés` : '', ''],
      ['DRAWDOWN MAX', `−${money(g.maxDD.value)}`, `−${g.maxDD.pct.toFixed(1)} % depuis le pic`, g.maxDD.value > 0 ? 'neg' : ''],
      ['SÉRIE EN COURS', g.streaks.currentType ? `${g.streaks.current} ${g.streaks.currentType === 'W' ? '✓' : '✗'}` : '—', `best : ${g.streaks.bestWin}W / ${g.streaks.bestLoss}L`, g.streaks.currentType === 'W' ? 'pos' : g.streaks.currentType === 'L' ? 'neg' : ''],
      ['ESPÉRANCE / PARI', signMoney(g.evPerBet), `écart-type ${money(g.stdDev)}`, cls(g.evPerBet)]
    ];
    document.getElementById('d-stat-cards').innerHTML = cards.map(([l, v, sub, c]) => `
      <div class="stat-card"><div class="stat-icon">${l}</div>
      <div class="stat-val ${c}">${v}</div><div class="stat-sub">${sub}</div></div>`).join('');

    // Courbe bankroll
    const curve = g.curve;
    document.getElementById('d-curve-hint').textContent = `${g.nSettled} paris réglés`;
    chart('chart-bankroll', {
      type: 'line',
      data: {
        labels: curve.map((p, i) => p.date ? fdate(p.date) : 'Départ'),
        datasets: [{
          data: curve.map(p => p.value),
          borderColor: '#4ade80', borderWidth: 2,
          pointRadius: curve.length > 60 ? 0 : 2.5, pointBackgroundColor: '#4ade80',
          fill: true, tension: .3,
          backgroundColor: c => {
            const g2 = c.chart.ctx.createLinearGradient(0, 0, 0, c.chart.height);
            g2.addColorStop(0, 'rgba(74,222,128,.18)'); g2.addColorStop(1, 'rgba(74,222,128,0)');
            return g2;
          }
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => { const p = curve[items[0].dataIndex]; return p.bet ? `${betTitle(p.bet)} — ${fdate(p.date)}` : 'Bankroll de départ'; },
              label: item => ` ${money(item.parsed.y)}${curve[item.dataIndex].bet ? ` (${signMoney(Stats.betProfit(curve[item.dataIndex].bet))})` : ''}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { grid: gridCfg, ticks: { callback: v => money(v, 0) } }
        }
      }
    });

    // Paris en attente
    const pending = s.bets.filter(b => b.status === 'pending')
      .sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));
    document.getElementById('d-pending-count').textContent = pending.length ? `${pending.length} pari${pending.length > 1 ? 's' : ''} · ${money(g.exposure)} engagés` : '';
    document.getElementById('d-pending-list').innerHTML = pending.length ? pending.map(b => `
      <div class="pending-item">
        <div class="pi-main">
          <div class="pi-title">${esc(betTitle(b))}</div>
          <div class="pi-sub">${esc(b.bookmaker)} · @${b.totalOdds?.toFixed(2) ?? '?'} · ${money(b.stake)} (${b.stakePercent != null ? b.stakePercent.toFixed(1) + '%' : '—'}) · ${fdate(b.eventDate)}${b.isLive ? ' · LIVE' : ''}${b.isFreebet ? ' · FB' : ''}</div>
        </div>
        <div class="pi-actions">
          <button class="btn btn-xs" style="background:rgba(74,222,128,.14);color:var(--green)" onclick="App.quickSettle('${b.id}','won')">✓ Gagné</button>
          <button class="btn btn-xs" style="background:rgba(239,68,68,.12);color:var(--red)" onclick="App.quickSettle('${b.id}','lost')">✗ Perdu</button>
          <button class="btn btn-ghost btn-xs" onclick="App.editBet('${b.id}')">✎</button>
        </div>
      </div>`).join('') :
      `<div class="empty"><div class="e-ico">🎫</div><div class="e-t">Aucun pari en attente</div><div class="e-s">Ajoute un pari via un screenshot ou en manuel.</div></div>`;

    // Derniers réglés
    const recent = s.bets.filter(Stats.isSettled)
      .sort((a, b) => Stats.settledSortKey(b).localeCompare(Stats.settledSortKey(a))).slice(0, 6);
    document.getElementById('d-recent-list').innerHTML = recent.length ? recent.map(b => {
      const p = Stats.betProfit(b);
      return `<div class="pending-item">
        <div class="pi-main">
          <div class="pi-title">${esc(betTitle(b))}</div>
          <div class="pi-sub">${esc(b.bookmaker)} · @${b.totalOdds?.toFixed(2) ?? '?'} · ${money(b.stake)} · ${fdate(Stats.settledSortKey(b))}</div>
        </div>
        <div style="text-align:right">
          ${statusBadge(b.status)}
          <div class="num ${cls(p)}" style="font-size:14px;font-weight:600;margin-top:4px">${signMoney(p)}</div>
        </div>
      </div>`;
    }).join('') :
      `<div class="empty"><div class="e-ico">◔</div><div class="e-t">Rien de réglé pour l'instant</div><div class="e-s">Tes résultats apparaîtront ici.</div></div>`;
  }

  /* ── HISTORIQUE ─────────────────────────────── */
  let sortField = 'eventDate', sortDir = -1;

  function historyFilters() {
    const s = Store.state;
    const fill = (id, values) => {
      const el = document.getElementById(id);
      const cur = el.value;
      el.innerHTML = el.options[0].outerHTML + [...new Set(values)].sort().map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
      el.value = cur;
    };
    fill('f-book', s.bets.map(b => b.bookmaker).filter(Boolean));
    fill('f-sport', s.bets.map(b => b.sport).filter(Boolean));
    fill('f-tipster', s.bets.map(b => b.tipster).filter(Boolean));
  }

  function filteredBets() {
    const q = document.getElementById('f-search').value.toLowerCase();
    const st = document.getElementById('f-status').value;
    const bk = document.getElementById('f-book').value;
    const sp = document.getElementById('f-sport').value;
    const tp = document.getElementById('f-tipster').value;
    const pe = document.getElementById('f-period').value;
    const now = new Date();

    return Store.state.bets.filter(b => {
      if (st && b.status !== st) return false;
      if (bk && b.bookmaker !== bk) return false;
      if (sp && b.sport !== sp) return false;
      if (tp && b.tipster !== tp) return false;
      if (pe) {
        const d = new Date(b.eventDate || b.betDate);
        if (pe === 'month') { if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false; }
        else if (pe === 'year') { if (d.getFullYear() !== now.getFullYear()) return false; }
        else if ((now - d) / 864e5 > +pe) return false;
      }
      if (q) {
        const hay = [b.bookmaker, b.sport, b.competition, b.tipster, b.notes,
          ...b.selections.flatMap(x => [x.event, x.market, x.pick])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderHistory() {
    historyFilters();
    let bets = filteredBets();
    const get = b => sortField === 'profit' ? Stats.betProfit(b) : (b[sortField] ?? '');
    bets.sort((a, b) => {
      const va = get(a), vb = get(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sortDir;
    });

    document.getElementById('f-count').textContent = `${bets.length} pari${bets.length > 1 ? 's' : ''}`;
    const body = document.getElementById('history-body');
    const emptyEl = document.getElementById('history-empty');

    if (!bets.length) {
      body.innerHTML = '';
      emptyEl.classList.remove('hide');
      emptyEl.innerHTML = `<div class="empty"><div class="e-ico">☰</div><div class="e-t">Aucun pari trouvé</div><div class="e-s">Ajuste tes filtres ou ajoute ton premier pari.</div></div>`;
      return;
    }
    emptyEl.classList.add('hide');

    body.innerHTML = bets.map(b => {
      const p = Stats.betProfit(b);
      const flags = [b.isLive ? 'LIVE' : '', b.isFreebet ? 'FB' : '', b.isBoost ? 'BOOST' : ''].filter(Boolean).join(' ');
      return `<tr>
        <td class="num">${fdate(b.eventDate)}<span class="sub">${esc(b.sport)}</span></td>
        <td><b>${esc(betTitle(b))}</b>${flags ? ` <span class="badge badge-violet">${flags}</span>` : ''}<span class="sub">${esc(betSubtitle(b))}${b.tipster && b.tipster !== 'Perso' ? ' · ' + esc(b.tipster) : ''}</span></td>
        <td>${esc(b.bookmaker)}</td>
        <td class="num">${b.totalOdds ? b.totalOdds.toFixed(2) : '—'}${b.closingOdds ? `<span class="sub">clo ${b.closingOdds.toFixed(2)}</span>` : ''}</td>
        <td class="num">${money(b.stake)}</td>
        <td class="num muted">${b.stakePercent != null ? b.stakePercent.toFixed(1) + '%' : '—'}</td>
        <td>${statusBadge(b.status)}</td>
        <td class="num ${cls(p)}" style="font-weight:600">${b.status === 'pending' ? '—' : signMoney(p)}</td>
        <td style="white-space:nowrap;text-align:right">
          ${b.status === 'pending' ? `
            <button class="btn btn-xs" style="background:rgba(74,222,128,.14);color:var(--green)" onclick="App.quickSettle('${b.id}','won')" title="Gagné">✓</button>
            <button class="btn btn-xs" style="background:rgba(239,68,68,.12);color:var(--red)" onclick="App.quickSettle('${b.id}','lost')" title="Perdu">✗</button>` : ''}
          <button class="btn btn-ghost btn-xs" onclick="App.editBet('${b.id}')" title="Modifier">✎</button>
          <button class="btn btn-ghost btn-xs" onclick="App.deleteBet('${b.id}')" title="Supprimer">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  function bindHistorySort() {
    document.querySelectorAll('#history-table thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (sortField === f) sortDir *= -1; else { sortField = f; sortDir = -1; }
        renderHistory();
      });
    });
  }

  /* ── STATS ──────────────────────────────────── */
  let currentSplit = 'bookmaker';

  function renderStats() {
    const g = Stats.global(Store.state);

    const advCards = [
      ['PROFIT FACTOR', g.profitFactor === Infinity ? '∞' : g.profitFactor.toFixed(2), 'gains bruts / pertes brutes', g.profitFactor >= 1 ? 'pos' : 'neg'],
      ['MEILLEUR PARI', g.best ? signMoney(Stats.betProfit(g.best)) : '—', g.best ? betTitle(g.best) : '', 'pos'],
      ['PIRE PARI', g.worst ? signMoney(Stats.betProfit(g.worst)) : '—', g.worst ? betTitle(g.worst) : '', 'neg'],
      ['MEILLEUR JOUR', g.bestDay ? signMoney(g.bestDay[1]) : '—', g.bestDay ? fdate(g.bestDay[0]) : '', 'pos'],
      ['PIRE JOUR', g.worstDay ? signMoney(g.worstDay[1]) : '—', g.worstDay ? fdate(g.worstDay[0]) : '', 'neg'],
      ['MISE MÉDIANE', money(g.medianStake), `moyenne ${money(g.avgStake)}`, ''],
      ['PLUS HAUT', money(g.maxDD.peak), 'pic de bankroll atteint', ''],
      ['ROI GLOBAL', pct(g.roi), 'profit / bankroll initiale', cls(g.roi)]
    ];
    document.getElementById('s-adv-cards').innerHTML = advCards.map(([l, v, sub, c]) => `
      <div class="stat-card"><div class="stat-icon">${l}</div>
      <div class="stat-val ${c}" style="font-size:20px">${v}</div><div class="stat-sub">${esc(String(sub))}</div></div>`).join('');

    // Profit mensuel
    const months = Stats.split(Store.state, 'month');
    chart('chart-monthly', {
      type: 'bar',
      data: {
        labels: months.map(m => m.key),
        datasets: [{ data: months.map(m => +m.profit.toFixed(2)), backgroundColor: months.map(m => m.profit >= 0 ? 'rgba(74,222,128,.75)' : 'rgba(239,68,68,.7)'), borderRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${signMoney(i.parsed.y)}` } } },
        scales: { x: { grid: { display: false } }, y: { grid: gridCfg, ticks: { callback: v => money(v, 0) } } }
      }
    });

    // Donut books
    const books = Stats.split(Store.state, 'bookmaker');
    const palette = ['#4ade80', '#8b7ff6', '#fbbf24', '#38bdf8', '#f472b6', '#fb923c', '#a3e635', '#e879f9', '#22d3ee', '#facc15'];
    chart('chart-books', {
      type: 'doughnut',
      data: {
        labels: books.map(b => b.key),
        datasets: [{ data: books.map(b => +b.staked.toFixed(2)), backgroundColor: books.map((_, i) => palette[i % palette.length]), borderColor: '#0a0a0c', borderWidth: 3 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, padding: 10 } },
          tooltip: { callbacks: { label: i => ` ${i.label} : ${money(i.parsed)} misés` } }
        }
      }
    });

    // Perf par tranche de cotes (bars profit + line winrate)
    const odds = Stats.split(Store.state, 'oddsRange').filter(o => o.key !== 'Inconnue');
    chart('chart-odds', {
      type: 'bar',
      data: {
        labels: odds.map(o => o.key),
        datasets: [
          { type: 'bar', label: 'Profit', data: odds.map(o => +o.profit.toFixed(2)), backgroundColor: odds.map(o => o.profit >= 0 ? 'rgba(74,222,128,.75)' : 'rgba(239,68,68,.7)'), borderRadius: 6, yAxisID: 'y' },
          { type: 'line', label: 'Winrate', data: odds.map(o => +o.winrate.toFixed(1)), borderColor: '#8b7ff6', borderWidth: 2, pointBackgroundColor: '#8b7ff6', tension: .3, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: gridCfg, ticks: { callback: v => money(v, 0) } },
          y2: { position: 'right', grid: { display: false }, min: 0, max: 100, ticks: { callback: v => v + '%' } }
        }
      }
    });

    // Jour de semaine
    const wd = Stats.split(Store.state, 'weekday');
    chart('chart-weekday', {
      type: 'bar',
      data: {
        labels: wd.map(d => d.key.slice(0, 3)),
        datasets: [{ data: wd.map(d => +d.profit.toFixed(2)), backgroundColor: wd.map(d => d.profit >= 0 ? 'rgba(74,222,128,.75)' : 'rgba(239,68,68,.7)'), borderRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${signMoney(i.parsed.y)} (${wd[i.dataIndex].n} paris)` } } },
        scales: { x: { grid: { display: false } }, y: { grid: gridCfg, ticks: { callback: v => money(v, 0) } } }
      }
    });

    renderSplit(currentSplit);
    renderCLV(g);
  }

  function renderSplit(dim) {
    currentSplit = dim;
    document.querySelectorAll('.split-tab').forEach(t => t.classList.toggle('active', t.dataset.split === dim));
    const rows = Stats.split(Store.state, dim);
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.profit)));
    document.getElementById('split-body').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td><b>${esc(r.key)}</b></td>
        <td class="num">${r.n}</td>
        <td class="num">${r.decided ? r.winrate.toFixed(0) + '%' : '—'}</td>
        <td class="num">${money(r.staked, 0)}</td>
        <td class="num ${cls(r.profit)}" style="font-weight:600">${signMoney(r.profit)}</td>
        <td class="num ${cls(r.yield)}">${r.staked > 0 ? pct(r.yield) : '—'}</td>
        <td><div class="bar-bg"><div class="bar-fill ${r.profit < 0 ? 'neg' : ''}" style="width:${Math.abs(r.profit) / maxAbs * 100}%"></div></div></td>
      </tr>`).join('') :
      `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Aucune donnée réglée pour l'instant</td></tr>`;
  }

  function renderCLV(g) {
    const el = document.getElementById('clv-content');
    if (!g.clvCount) {
      el.innerHTML = `<div class="empty" style="padding:26px"><div class="e-t">Pas encore de données CLV</div><div class="e-s">Renseigne la « cote de clôture » (champs avancés) sur tes paris : battre la clôture est le meilleur indicateur long terme d'un parieur gagnant.</div></div>`;
      return;
    }
    el.innerHTML = `<div class="stats-grid" style="margin-bottom:0;grid-template-columns:repeat(3,1fr)">
      <div class="stat-card"><div class="stat-icon">CLV MOYEN</div><div class="stat-val ${cls(g.clvAvg)}">${pct(g.clvAvg, 2)}</div><div class="stat-sub">cote prise vs clôture</div></div>
      <div class="stat-card"><div class="stat-icon">% CLÔTURES BATTUES</div><div class="stat-val ${g.clvPos >= 50 ? 'pos' : 'neg'}">${g.clvPos.toFixed(0)} %</div><div class="stat-sub">paris avec CLV positif</div></div>
      <div class="stat-card"><div class="stat-icon">ÉCHANTILLON</div><div class="stat-val">${g.clvCount}</div><div class="stat-sub">paris avec cote de clôture</div></div>
    </div>`;
  }

  return { renderDashboard, renderHistory, renderStats, renderSplit, bindHistorySort, toast, money, statusBadge, betTitle, cls, signMoney };
})();
