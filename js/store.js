/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — état, persistance et synchro (BK.Store)

   Deux endroits où vivent les paris :

   1. L'APPAREIL (mode « device ») — pour tout le monde, sans compte. Tout
      est gardé dans ce navigateur ; export / import pour changer d'appareil.
      Au premier passage, les paris du Bankroll Manager de juillet
      (bkm_state_v1, même adresse) sont repris tels quels.

   2. LE COMPTE MatchUp (mode « cloud ») — abonné Premium connecté ET synchro
      activée côté MatchUp (sql/bankroll.sql). Le serveur fait foi ; le
      navigateur garde une copie (affichage instantané, hors connexion) et une
      FILE d'écritures non encore confirmées. Une écriture ne sort de la file
      que sur réponse OK : rien ne se perd si le réseau tombe ou si le jeton
      expire.

   Passages de l'un à l'autre, toujours sans perte :
     - abonné qui se connecte avec des paris sur l'appareil → proposition de
       les ajouter à son compte (jamais en silence : l'appareil peut être
       partagé) ;
     - compte sans abonnement qui a des paris sur le serveur (ancien abonné) →
       proposition de les copier sur l'appareil ;
     - abonnement qui s'arrête pendant la session (403) → les paris passent
       sur l'appareil automatiquement, la synchro s'arrête ;
     - synchro pas encore activée (table absente) → appareil, sans bruit.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var U = BK.U;
  var LOT = 200;
  var RESULTS = ['pending', 'won', 'lost', 'void', 'halfwon', 'halflost'];
  var STATUSES = ['pending', 'won', 'lost', 'halfwon', 'halflost', 'void', 'cashout'];
  var ID_RX = /^[A-Za-z0-9_-]{6,64}$/;
  var K = {
    device: 'bk_device_v2',
    v1: 'bkm_state_v1',                       // Bankroll Manager de juillet
    flags: 'bk_flags_v2',
    cache: function (uid) { return 'bk_cloud_v2:' + uid; },
    queue: function (uid) { return 'bk_queue_v2:' + uid; }
  };

  function defaults() {
    return {
      settings: {
        initialBankroll: 0, unitValue: 0, currency: 'EUR',
        maxStakePct: 5, monthlyLossLimit: null, lossStreakAlert: 5,
        defaultBook: '', customBooks: [], initialized: false
      },
      bets: []
    };
  }

  var S = {
    state: defaults(),
    device: null,        // jeu de l'appareil {settings, bets, meta}
    mode: 'device',      // device | cloud | demo
    reason: 'anon',      // en mode device : anon | free | unavailable | lapsed | pending
    uid: null,           // compte synchronisé (mode cloud)
    account: null,       // compte connecté, synchronisé ou non
    sync: { status: 'device', pending: 0, error: null, lastOk: null },
    offers: { merge: 0, copy: null },
    notice: null,
    _before: null,
    _listeners: []
  };

  function on(fn) { S._listeners.push(fn); }
  function emit(reason) { S._listeners.forEach(function (fn) { try { fn(reason); } catch (e) { console.error('[bk/store]', e); } }); }

  /* ── Stockage local (toujours sous try : navigation privée, quota…) ───── */
  function readLS(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {
      console.warn('[bk/store] stockage local indisponible', e && e.message);
      S.notice = { type: 'err', text: 'Ton navigateur refuse d\'enregistrer (navigation privée ou mémoire pleine) : exporte tes paris pour ne pas les perdre.' };
      return false;
    }
  }
  function removeLS(key) { try { localStorage.removeItem(key); } catch (_) { /* rien */ } }

  function flags() { return readLS(K.flags, {}) || {}; }
  function setFlag(name, uid, val) {
    var f = flags(); f[name] = f[name] || {};
    if (val) f[name][uid] = Date.now(); else delete f[name][uid];
    writeLS(K.flags, f);
  }
  function flag(name, uid) { var f = flags(); return !!(f[name] && f[name][uid]); }

  function cleanSettings(s) {
    var d = defaults().settings, o = Object.assign({}, d, s || {});
    o.currency = ['EUR', 'USD', 'GBP'].indexOf(o.currency) !== -1 ? o.currency : 'EUR';
    o.customBooks = (Array.isArray(o.customBooks) ? o.customBooks : []).map(function (b) { return String(b == null ? '' : b).trim().slice(0, 40); })
      .filter(function (b, i, a) { return b && a.indexOf(b) === i; }).slice(0, 30);
    return o;
  }

  function readDevice() {
    var d = readLS(K.device, null) || {};
    return { settings: cleanSettings(d.settings), bets: Array.isArray(d.bets) ? d.bets : [], meta: d.meta && typeof d.meta === 'object' ? d.meta : {} };
  }
  function writeDevice() {
    var d = S.device;
    writeLS(K.device, { settings: d.settings, bets: d.bets, meta: d.meta, at: new Date().toISOString() });
  }
  function persist() {
    if (S.mode === 'device') { writeDevice(); return; }
    if (S.mode === 'cloud' && S.uid) writeLS(K.cache(S.uid), { settings: S.state.settings, bets: S.state.bets, at: new Date().toISOString() });
  }

  /* ── Modèle ───────────────────────────────────────────────────────────── */
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }

  function cleanMk(mk) {
    if (!mk || typeof mk !== 'object' || !BK.Markets.NEEDS[mk.type]) return null;
    var o = { type: mk.type };
    if (mk.side === 'A' || mk.side === 'B') o.side = mk.side;
    if (mk.ou === 'over' || mk.ou === 'under') o.ou = mk.ou;
    var l = U.num(mk.line); if (l != null) o.line = l;
    if (typeof mk.score === 'string') o.score = mk.score.slice(0, 5);
    if (mk.yes === true || mk.yes === false) o.yes = mk.yes;
    if (mk.deduced) o.deduced = true;
    return o;
  }

  function normSel(s) {
    s = s || {};
    var sel = {
      event: str(s.event), market: str(s.market), pick: str(s.pick),
      odds: U.num(s.odds),
      result: RESULTS.indexOf(s.result) !== -1 ? s.result : 'pending',
      mk: cleanMk(s.mk),
      mu: s.mu && typeof s.mu === 'object' ? s.mu : null,
      settle: s.settle && typeof s.settle === 'object' ? s.settle : null,
      review: s.review && typeof s.review === 'object' ? s.review : null
    };
    // Texte lisible recalculé depuis le marché structuré : l'historique, le
    // CSV et la recherche lisent les mêmes mots que la carte.
    if (sel.mu && sel.mk && sel.mk.type !== 'other') {
      var d = BK.Markets.describe(sel.mk, sel.mu.pa, sel.mu.pb);
      sel.event = sel.mu.pa + ' - ' + sel.mu.pb;
      sel.market = d.market; sel.pick = d.pick;
    } else if (sel.mu && !sel.event) {
      sel.event = sel.mu.pa + ' - ' + sel.mu.pb;
    }
    return sel;
  }

  function normalizeBet(b) {
    b = b || {};
    var now = new Date().toISOString(), today = U.today();
    var sels = (Array.isArray(b.selections) && b.selections.length ? b.selections : [{}]).map(normSel);
    var bet = {
      v: 2,
      id: ID_RX.test(String(b.id || '')) ? String(b.id) : U.uid(),
      createdAt: b.createdAt || now,
      updatedAt: now,
      betDate: str(b.betDate, 10) || today,
      eventDate: str(b.eventDate, 10) || (sels[0].mu && sels[0].mu.day) || str(b.betDate, 10) || today,
      sport: str(b.sport, 40) || (sels.some(function (s) { return s.mu; }) ? 'Tennis' : 'Autre'),
      competition: str(b.competition, 120) || (sels[0].mu ? sels[0].mu.tournament : ''),
      bookmaker: str(b.bookmaker, 40) || 'Autre',
      betType: ['simple', 'combine', 'systeme'].indexOf(b.betType) !== -1 ? b.betType : (sels.length > 1 ? 'combine' : 'simple'),
      selections: sels,
      totalOdds: U.num(b.totalOdds),
      settledOdds: U.num(b.settledOdds),
      stake: Math.max(0, U.num(b.stake) || 0),
      stakePercent: U.num(b.stakePercent),
      bankrollBefore: U.num(b.bankrollBefore),
      isLive: !!b.isLive, isFreebet: !!b.isFreebet, isBoost: !!b.isBoost,
      baseOdds: U.num(b.baseOdds),
      status: STATUSES.indexOf(b.status) !== -1 ? b.status : 'pending',
      cashoutAmount: U.num(b.cashoutAmount),
      closingOdds: U.num(b.closingOdds),
      tipster: str(b.tipster, 60) || 'Perso',
      confidence: U.num(b.confidence) ? Math.min(5, Math.max(1, Math.round(U.num(b.confidence)))) : null,
      estimatedProb: U.num(b.estimatedProb),
      notes: str(b.notes, 2000),
      settledAt: b.settledAt || null,
      autoSettled: !!b.autoSettled,
      manualLock: !!b.manualLock,
      source: ['matchup', 'ocr', 'manual', 'import'].indexOf(b.source) !== -1 ? b.source : 'manual'
    };
    if (bet.betType === 'simple' && sels.length > 1) bet.betType = 'combine';
    if (!bet.totalOdds) {
      var o = sels.map(function (s) { return s.odds; }).filter(function (x) { return x > 1; });
      if (o.length && o.length === sels.length) bet.totalOdds = +o.reduce(function (a, x) { return a * x; }, 1).toFixed(3);
    }
    if (bet.status === 'pending') { bet.settledAt = null; bet.settledOdds = null; }
    else if (!bet.settledAt) bet.settledAt = now;
    return bet;
  }

  /** Union par identifiant : à identifiant égal, la version la plus récente gagne. */
  function union(a, b) {
    var map = new Map();
    (a || []).concat(b || []).forEach(function (x) {
      if (!x || !x.id) return;
      var y = map.get(x.id);
      if (!y || String(x.updatedAt || '') > String(y.updatedAt || '')) map.set(x.id, x);
    });
    return Array.from(map.values());
  }
  /** Paris de `from` absents de `into` (ou plus récents que leur copie). */
  function nouveaux(from, into) {
    var m = new Map((into || []).map(function (b) { return [b.id, b]; }));
    return (from || []).filter(function (b) { var y = m.get(b.id); return !y || String(b.updatedAt || '') > String(y.updatedAt || ''); });
  }

  /* ── Démarrage : appareil + reprise du Bankroll Manager de juillet ────── */
  function migrateV1() {
    var dev = S.device;
    if (dev.meta.v1) return 0;
    var old = readLS(K.v1, null), n = 0;
    if (old && Array.isArray(old.bets) && old.bets.length) {
      var have = new Set(dev.bets.map(function (b) { return b.id; }));
      old.bets.forEach(function (raw) {
        var b = normalizeBet(Object.assign({}, raw, { source: 'import' }));
        if (have.has(b.id)) return;
        have.add(b.id); dev.bets.push(b); n++;
      });
      var os = old.settings || {};
      if (!dev.settings.initialized && U.num(os.initialBankroll) > 0) {
        dev.settings = cleanSettings(Object.assign({}, dev.settings, {
          initialBankroll: U.num(os.initialBankroll), unitValue: U.num(os.unitValue) || 0,
          currency: os.currency, initialized: true
        }));
      }
      if (Array.isArray(os.customBooks) && os.customBooks.length) {
        dev.settings = cleanSettings(Object.assign({}, dev.settings, { customBooks: (dev.settings.customBooks || []).concat(os.customBooks) }));
      }
    }
    // L'ancienne version gardait une clé API Claude et un jeton GitHub (sauvegarde
    // Gist). Plus aucun code ne les lit : on ne les laisse pas traîner dans le
    // navigateur. Le reste de l'ancien fichier reste en place (sauvegarde).
    if (old && old.settings && (old.settings.apiKey || old.settings.ghPat)) {
      delete old.settings.apiKey; delete old.settings.ghPat;
      writeLS(K.v1, old);
      dev.meta.v1Secrets = true;
    }
    dev.meta.v1 = { at: new Date().toISOString(), n: n };
    writeDevice();
    return n;
  }

  /** hint = {uid} : session MatchUp présente sur l'appareil et compte
   *  synchronisé la dernière fois. On affiche alors sa copie locale tout de
   *  suite, sans attendre la réponse du serveur (sinon un abonné verrait une
   *  seconde « aucun pari » à chaque ouverture). connect() tranche ensuite. */
  function boot(hint) {
    S.device = readDevice();
    var n = migrateV1();
    useDevice('anon', true);
    var c = hint && hint.uid ? cachedAccount(hint.uid) : null;
    if (c) {
      S.uid = hint.uid; S.account = hint.uid;
      S.mode = 'cloud'; S.reason = null;
      S.state = { settings: cleanSettings(c.settings), bets: c.bets };
      S.sync = { status: 'loading', pending: queue().length, error: null, lastOk: null };
      computeOffers();
      emit('cache');
    }
    return n;
  }

  function useDevice(reason, gardeIndice) {
    clearTimeout(flushTimer);
    if (!gardeIndice && reason !== 'pending') removeLS('bk_last_cloud_v2');
    S.mode = 'device';
    S.uid = null;
    S.reason = reason || 'anon';
    S.state = S.device;
    S.offers.merge = 0;
    S._before = null;
    S.sync = { status: 'device', pending: 0, error: null, lastOk: null };
    emit('mode');
  }

  /* ── File d'écritures (mode cloud) ────────────────────────────────────── */
  function queue(uid) { uid = uid || S.uid; return uid ? readLS(K.queue(uid), []) : []; }
  function saveQueue(q) { if (S.uid) writeLS(K.queue(S.uid), q); S.sync.pending = q.length; }
  /** Ajoute des écritures à la file en UNE lecture / UNE écriture du stockage
   *  (un import de 2 000 paris faisait 2 000 relectures de la file). Une
   *  écriture remplace la précédente du même pari, des réglages idem. */
  function enqueueMany(ops) {
    if (S.mode !== 'cloud' || !ops.length) return;
    var ids = new Set(ops.filter(function (o) { return o.op !== 'set'; }).map(function (o) { return o.id; }));
    var reglages = ops.some(function (o) { return o.op === 'set'; });
    var q = queue().filter(function (x) { return x.op === 'set' ? !reglages : !ids.has(x.id); });
    var t = Date.now();
    ops.forEach(function (o) { o.t = t; q.push(o); });
    saveQueue(q);
    scheduleFlush();
  }
  function enqueue(op) { enqueueMany([op]); }

  var flushTimer = null, flushing = null;
  function scheduleFlush(ms) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { flush(); }, ms == null ? 700 : ms);
  }

  async function api(method, body) {
    var t = BK.Auth ? await BK.Auth.token() : null;
    if (!t) { var e0 = new Error('Session expirée — reconnecte-toi'); e0.status = 401; throw e0; }
    var res;
    try {
      res = await fetch(BK.CONF.SYNC, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store', credentials: 'omit'
      });
    } catch (net) {
      var e1 = new Error('Pas de connexion'); e1.status = 0; throw e1;
    }
    var data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      var e = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
      e.status = res.status; e.code = data && data.code; e.body = data;
      throw e;
    }
    return data || {};
  }

  /** Synchro pas encore en place côté MatchUp : table absente (42P01 /
   *  PGRST205) ou fonction pas déployée (404). */
  function indisponible(e) {
    if (!e) return false;
    if (e.status === 404) return true;
    return e.status === 500 && /42P01|PGRST20[25]/.test(String(e.code || '') + ' ' + String(e.message || ''));
  }

  function setStatus(status, error) {
    S.sync.status = status;
    S.sync.error = error || null;
    S.sync.pending = queue().length;
    if (status === 'synced') S.sync.lastOk = new Date().toISOString();
    emit('sync');
  }

  function erreur(e) {
    if (e.status === 403) return lapse();
    if (indisponible(e)) return toDevice('unavailable');
    if (e.status === 0) return setStatus('offline', 'Hors connexion : tes modifications partiront au retour du réseau.');
    if (e.status === 401) return setStatus('error', 'Session expirée — reconnecte-toi pour synchroniser.');
    return setStatus('error', 'Synchronisation en échec (' + (e.message || 'erreur') + ') — nouvel essai automatique.');
  }

  /** Quitte le compte en recopiant TOUT ce qu'il contenait ici (y compris les
   *  écritures pas encore envoyées) sur l'appareil, puis efface sa copie. */
  function toDevice(reason) {
    var uid = S.uid, copie = false;
    if (S.mode === 'cloud' && uid) {
      S.device.bets = union(S.device.bets, S.state.bets);
      if (!S.device.settings.initialized && S.state.settings && S.state.settings.initialized) S.device.settings = cleanSettings(S.state.settings);
      writeDevice();
      removeLS(K.queue(uid)); removeLS(K.cache(uid));
      copie = true;
    }
    useDevice(reason);
    if (copie && (reason === 'free' || reason === 'lapsed')) {
      S.notice = { type: 'warn', text: 'Ton abonnement Premium n\'est plus actif : la synchro est coupée, tes paris continuent sur cet appareil.' };
      emit('notice');
    }
  }
  function lapse() { toDevice('lapsed'); }

  async function flush() {
    if (S.mode !== 'cloud') return;
    if (flushing) return flushing;
    var q = queue();
    if (!q.length) { setStatus('synced'); return; }
    flushing = (async function () {
      setStatus('saving');
      try {
        var set = q.filter(function (x) { return x.op === 'set'; }).pop();
        if (set) {
          await api('POST', { op: 'settings', settings: set.data });
          drop(function (x) { return x.op === 'set' && x.t <= set.t; });
        }
        var ups = q.filter(function (x) { return x.op === 'up'; });
        for (var i = 0; i < ups.length; i += LOT) {
          var lot = ups.slice(i, i + LOT);
          await api('POST', { op: 'upsert', bets: lot.map(function (x) { return { id: x.id, data: x.data }; }) });
          drop(function (x) { return x.op === 'up' && lot.some(function (y) { return y.id === x.id && x.t <= y.t; }); });
        }
        var dels = q.filter(function (x) { return x.op === 'del'; });
        for (var j = 0; j < dels.length; j += LOT) {
          var lotD = dels.slice(j, j + LOT);
          await api('POST', { op: 'delete', ids: lotD.map(function (x) { return x.id; }) });
          drop(function (x) { return x.op === 'del' && lotD.some(function (y) { return y.id === x.id && x.t <= y.t; }); });
        }
        setStatus(queue().length ? 'saving' : 'synced');
        if (queue().length) scheduleFlush(300);
      } catch (e) {
        if (S.mode === 'cloud') {
          erreur(e);
          if (S.mode === 'cloud' && (e.status === 0 || e.status >= 500)) scheduleFlush(15000);
        }
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }
  /** Retire de la file les opérations confirmées (relue : une écriture plus
   *  récente du même pari, faite pendant l'envoi, y reste). */
  function drop(pred) { saveQueue(queue().filter(function (x) { return !pred(x); })); }

  /* ── Compte ───────────────────────────────────────────────────────────── */
  function applyQueue(bets, settings, uid) {
    var map = new Map(bets.map(function (b) { return [b.id, b]; }));
    queue(uid).forEach(function (x) {
      if (x.op === 'up' && x.data) map.set(x.id, x.data);
      if (x.op === 'del') map.delete(x.id);
      if (x.op === 'set' && x.data) settings = x.data;
    });
    return { bets: Array.from(map.values()), settings: settings };
  }
  /** Ce que la copie locale d'un compte contient (cache + file), sans serveur. */
  function cachedAccount(uid) {
    var c = readLS(K.cache(uid), null);
    if (!c && !queue(uid).length) return null;
    var m = applyQueue((c && c.bets) || [], c && c.settings ? c.settings : null, uid);
    return { bets: m.bets, settings: m.settings };
  }
  function rowsToBets(rows) {
    return (rows || []).map(function (row) { var d = Object.assign({}, row.data || {}); d.id = row.id; return d; })
      .filter(function (b) { return ID_RX.test(String(b.id || '')); });
  }

  function computeOffers() {
    S.offers.merge = 0;
    if (S.mode === 'cloud' && S.uid) S.offers.merge = nouveaux(S.device.bets, S.state.bets).length;
  }

  /**
   * Branche le compte connecté. Abonné → synchro (si active côté MatchUp) ;
   * sinon → appareil, et on regarde si le compte garde des paris d'une époque
   * Premium (proposition de copie).
   */
  async function connect(uid, premium) {
    if (!uid) { await disconnect(); return 'anon'; }
    S.account = uid;
    if (!premium) { toDevice('free'); peek(uid); return 'free'; }
    if (S.mode === 'cloud' && S.uid === uid) { await pull(); return S.mode; }
    S.uid = uid;
    S.offers.copy = null;
    var c = cachedAccount(uid);
    if (c) {
      S.mode = 'cloud';
      S.state = { settings: cleanSettings(c.settings), bets: c.bets };
      S.sync = { status: 'loading', pending: queue().length, error: null, lastOk: null };
      computeOffers();
      emit('cache');
    }
    await pull();
    return S.mode;
  }

  async function pull() {
    var uid = S.uid;
    if (!uid) return false;
    if (S.mode === 'cloud') setStatus('loading');
    var r;
    try { r = await api('GET'); }
    catch (e) {
      if (S.uid !== uid) return false;
      if (S.mode !== 'cloud') {
        // Jamais synchronisé sur cet appareil et serveur muet : on reste sur
        // l'appareil, l'application réessaiera.
        if (indisponible(e)) { useDevice('unavailable'); return false; }
        if (e.status === 403) { useDevice('free'); return false; }
        useDevice('pending');
        return false;
      }
      erreur(e); emit('pull'); return false;
    }
    if (S.uid !== uid) return false;
    var avant = S.mode === 'cloud' ? S.state.settings : null;
    if (!r.premium) {
      // Le serveur ne voit pas d'abonnement actif : pas de synchro.
      if (S.mode === 'cloud') toDevice('free'); else useDevice('free');
      offerCopy(uid, rowsToBets(r.bets), r.settings);
      return false;
    }
    var serverSettings = r.settings ? r.settings : null;
    var merged = applyQueue(rowsToBets(r.bets), serverSettings, uid);
    var hadSettings = !!merged.settings;
    S.mode = 'cloud';
    S.reason = null;
    S.state = { settings: cleanSettings(merged.settings || avant), bets: merged.bets };
    // Compte sans réglages (première connexion) : on reprend ceux de l'appareil.
    if (!hadSettings && !(avant && avant.initialized) && S.device.settings.initialized && !queue(uid).some(function (x) { return x.op === 'set'; })) {
      S.state.settings = cleanSettings(S.device.settings);
      enqueue({ op: 'set', data: S.state.settings });
    }
    persist();
    writeLS('bk_last_cloud_v2', { uid: uid, at: new Date().toISOString() });
    computeOffers();
    emit('pull');
    if (queue(uid).length) await flush(); else setStatus('synced');
    return true;
  }

  /** Compte gratuit : paris gardés sur le serveur du temps de l'abonnement. */
  async function peek(uid) {
    var r = null;
    try { r = await api('GET'); } catch (_) { r = null; /* synchro absente : seule la copie locale compte */ }
    if (S.mode !== 'device' || S.reason !== 'free' || S.account !== uid) return;
    offerCopy(uid, r ? rowsToBets(r.bets) : [], r ? r.settings : null);
  }
  function offerCopy(uid, serverBets, serverSettings) {
    var local = cachedAccount(uid);
    var bets = union(serverBets || [], local ? local.bets : []);
    var n = nouveaux(bets, S.device.bets).length;
    S.offers.copy = n ? { uid: uid, n: n, bets: bets, settings: serverSettings || (local && local.settings) || null } : null;
    emit('offers');
  }

  /** Ajoute au compte les paris de l'appareil (proposition acceptée). */
  function mergeDevice() {
    if (S.mode !== 'cloud') return 0;
    var add = nouveaux(S.device.bets, S.state.bets);
    putMany(add);
    if (!S.state.settings.initialized && S.device.settings.initialized) {
      S.state.settings = cleanSettings(S.device.settings);
      persist();
      enqueue({ op: 'set', data: S.state.settings });
    }
    // Ils vivent maintenant sur le compte : l'appareil n'en garde pas de
    // seconde copie (sinon on les proposerait à nouveau, ou une version
    // périmée réapparaîtrait après la déconnexion).
    var ids = new Set(S.state.bets.map(function (b) { return b.id; }));
    S.device.bets = S.device.bets.filter(function (b) { return !ids.has(b.id); });
    writeDevice();
    setFlag('mergeLater', S.uid, false);
    computeOffers();
    emit('merge');
    return add.length;
  }
  function mergeLater() { if (S.uid) setFlag('mergeLater', S.uid, true); emit('offers'); }
  function mergeDismissed() { return !!(S.uid && flag('mergeLater', S.uid)); }

  /** Copie sur l'appareil les paris du compte (proposition acceptée). */
  function copyAccount() {
    var o = S.offers.copy;
    if (!o) return 0;
    var n = nouveaux(o.bets, S.device.bets).length;
    S.device.bets = union(S.device.bets, o.bets);
    if (!S.device.settings.initialized && o.settings && o.settings.initialized) S.device.settings = cleanSettings(o.settings);
    writeDevice();
    removeLS(K.queue(o.uid)); removeLS(K.cache(o.uid));
    setFlag('copyLater', o.uid, false);
    S.offers.copy = null;
    if (S.mode === 'device') S.state = S.device;
    emit('copy');
    return n;
  }
  function copyLater() { var o = S.offers.copy; if (o) setFlag('copyLater', o.uid, true); emit('offers'); }
  function copyDismissed() { var o = S.offers.copy; return !!(o && flag('copyLater', o.uid)); }

  /** Déconnexion : la copie du compte quitte l'appareil, sauf des écritures
   *  pas encore envoyées (gardées pour la prochaine connexion ici). Renvoie
   *  leur nombre. */
  async function disconnect() {
    var uid = S.uid, reste = 0;
    if (S.mode === 'cloud' && uid) {
      try { await flush(); } catch (_) { /* gardé dans la file */ }
      reste = queue(uid).length;
      if (!reste) { removeLS(K.cache(uid)); removeLS(K.queue(uid)); }
    }
    S.offers.copy = null;
    S.account = null;
    useDevice('anon');
    return reste;
  }
  function pendingWrites() { return S.mode === 'cloud' ? queue().length : 0; }

  /* ── Démo ─────────────────────────────────────────────────────────────── */
  function startDemo(data) {
    if (S.mode !== 'demo') S._before = { mode: S.mode, state: S.state, sync: S.sync, uid: S.uid, reason: S.reason };
    clearTimeout(flushTimer);
    S.mode = 'demo';
    S.state = { settings: cleanSettings(data.settings), bets: (data.bets || []).map(normalizeBet) };
    S.sync = { status: 'demo', pending: 0, error: null, lastOk: null };
    emit('demo');
  }
  function stopDemo() {
    if (S.mode !== 'demo') return;
    var b = S._before;
    S._before = null;
    if (!b) { useDevice('anon'); return; }
    S.mode = b.mode; S.state = b.mode === 'device' ? S.device : b.state; S.sync = b.sync; S.uid = b.uid; S.reason = b.reason;
    emit('mode');
  }

  /* ── Écritures ────────────────────────────────────────────────────────── */
  function canWrite() { return S.mode === 'cloud' || S.mode === 'device'; }
  function guard() {
    if (!canWrite()) { var e = new Error('Exemple : rien n\'est enregistré. Quitte l\'exemple pour ajouter tes paris.'); e.readonly = true; throw e; }
  }

  /** Écrit des paris (état + stockage + file) en une seule passe. */
  function putMany(list) {
    if (!list || !list.length) return;
    var pos = new Map(S.state.bets.map(function (b, i) { return [b.id, i]; }));
    list.forEach(function (bet) {
      var i = pos.get(bet.id);
      if (i == null) { pos.set(bet.id, S.state.bets.length); S.state.bets.push(bet); } else S.state.bets[i] = bet;
    });
    persist();
    enqueueMany(list.map(function (bet) { return { op: 'up', id: bet.id, data: bet }; }));
  }
  function put(bet) { putMany([bet]); }

  function addBet(raw) {
    guard();
    var bet = normalizeBet(raw);
    while (S.state.bets.some(function (b) { return b.id === bet.id; })) bet.id = U.uid();
    if (bet.bankrollBefore == null) {
      var bk = BK.Stats.currentBankroll(S.state);
      bet.bankrollBefore = +bk.toFixed(2);
      bet.stakePercent = bk > 0 ? +(bet.stake / bk * 100).toFixed(2) : null;
    }
    put(bet);
    emit('add');
    return bet;
  }

  /** opts.manual : changement fait par l'utilisateur → le règlement
   *  automatique ne touchera plus jamais à ce pari (manualLock). */
  function updateBet(id, patch, opts) {
    guard();
    var prev = S.state.bets.find(function (b) { return b.id === id; });
    if (!prev) return null;
    var next = normalizeBet(Object.assign({}, prev, patch, { id: prev.id, createdAt: prev.createdAt }));
    if (opts && opts.manual) {
      if (patch.status != null && patch.status !== prev.status) { next.manualLock = next.status !== 'pending'; next.autoSettled = false; }
      if (patch.status === 'pending') { next.manualLock = false; next.selections = next.selections.map(function (s) { return Object.assign({}, s, { result: 'pending', settle: null }); }); }
    }
    put(next);
    emit('update');
    return next;
  }

  /** Lot de patches machine (règlement automatique, horaires, clôtures). */
  function applyPatches(list) {
    if (!canWrite() || !list || !list.length) return 0;
    var byId = new Map(S.state.bets.map(function (b) { return [b.id, b]; })), out = [];
    list.forEach(function (x) {
      var prev = byId.get(x.id);
      if (!prev || prev.manualLock) return;
      out.push(normalizeBet(Object.assign({}, prev, x.patch, { id: prev.id, createdAt: prev.createdAt })));
    });
    putMany(out);
    if (out.length) emit('patches');
    return out.length;
  }

  function deleteBet(id) {
    guard();
    S.state.bets = S.state.bets.filter(function (b) { return b.id !== id; });
    if (S.mode === 'device') S.device = S.state;
    persist();
    enqueue({ op: 'del', id: id });
    emit('delete');
  }

  function saveSettings(patch) {
    guard();
    S.state.settings = cleanSettings(Object.assign({}, S.state.settings, patch, { initialized: true }));
    persist();
    enqueue({ op: 'set', data: S.state.settings });
    emit('settings');
  }

  async function resetAll() {
    guard();
    if (S.mode === 'cloud') {
      await api('POST', { op: 'reset' });
      saveQueue([]);
      S.state = defaults();
      persist();
    } else {
      S.device.bets = []; S.device.settings = cleanSettings(null);
      writeDevice();
      S.state = S.device;
    }
    emit('reset');
  }

  /* ── Import / export ──────────────────────────────────────────────────── */
  function exportData() {
    return { app: 'Bankroll Manager', version: 2, exportedAt: new Date().toISOString(),
      settings: S.state.settings, bets: S.state.bets };
  }

  /** Accepte les sauvegardes de ce site et celles de la version de juillet
   *  ({settings:{initialBankroll…}, bets:[…]}).
   *  Fusion : un pari de même id est remplacé, les autres sont ajoutés. */
  function importData(obj, opts) {
    guard();
    if (!obj || !Array.isArray(obj.bets)) throw new Error('Fichier non reconnu (aucune liste de paris)');
    var list = obj.bets.filter(function (raw) { return raw && typeof raw === 'object'; }).map(function (raw) {
      return normalizeBet(Object.assign({}, raw, { source: raw.source || 'import' }));
    });
    putMany(list);
    var n = list.length;
    if (obj.settings && (opts && opts.withSettings || !S.state.settings.initialized)) {
      var s = obj.settings;
      saveSettings({
        initialBankroll: U.num(s.initialBankroll) || 0, unitValue: U.num(s.unitValue) || 0,
        currency: s.currency, customBooks: (S.state.settings.customBooks || []).concat(Array.isArray(s.customBooks) ? s.customBooks : [])
      });
    }
    emit('import');
    return n;
  }

  BK.Store = Object.assign(S, {
    K: K, defaults: defaults, normalizeBet: normalizeBet, cleanSettings: cleanSettings, on: on, emit: emit,
    boot: boot, connect: connect, disconnect: disconnect, pull: pull, flush: flush, pendingWrites: pendingWrites,
    mergeDevice: mergeDevice, mergeLater: mergeLater, mergeDismissed: mergeDismissed,
    copyAccount: copyAccount, copyLater: copyLater, copyDismissed: copyDismissed,
    startDemo: startDemo, stopDemo: stopDemo, canWrite: canWrite,
    addBet: addBet, updateBet: updateBet, applyPatches: applyPatches, deleteBet: deleteBet,
    saveSettings: saveSettings, resetAll: resetAll, exportData: exportData, importData: importData,
    _queue: queue, _indisponible: indisponible, _union: union
  });
})(window.BK = window.BK || {});
