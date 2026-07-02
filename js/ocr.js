/* ══════════════════════════════════════════════
   OCR — détection de tickets 100 % locale
   Tesseract.js (navigateur) + parseur FR.
   Aucune clé API, aucun envoi de données.
   ══════════════════════════════════════════════ */
const Ocr = (() => {

  const TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let libPromise = null, worker = null, statusCb = null, statusPrefix = '';

  /* ── Chargement paresseux de la lib ─────────── */
  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = TESS_CDN;
      s.onload = res;
      s.onerror = () => { libPromise = null; rej(new Error('Moteur OCR inaccessible (CDN) — vérifie ta connexion')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  async function getWorker() {
    await loadLib();
    if (worker) return worker;
    statusCb?.('Téléchargement du modèle OCR (première fois, ~4 Mo)…');
    worker = await Tesseract.createWorker('fra', 1, {
      logger: m => {
        if (m.status === 'recognizing text') statusCb?.(`${statusPrefix}Lecture du ticket… ${Math.round(m.progress * 100)} %`);
      }
    });
    return worker;
  }

  /* ── Préparation image ──────────────────────── */
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
      img.src = url;
    });
  }

  function prep(img) {
    /* échantillon 48×48 : luminance moyenne + teinte dominante */
    const s = document.createElement('canvas'); s.width = s.height = 48;
    const sx = s.getContext('2d', { willReadFrequently: true });
    sx.drawImage(img, 0, 0, 48, 48);
    const px = sx.getImageData(0, 0, 48, 48).data;
    let lum = 0;
    const hue = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0 };
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      lum += 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 70 && mx && (mx - mn) / mx > 0.45) {
        let h;
        if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
        else if (mx === g) h = (b - r) / (mx - mn) + 2;
        else h = (r - g) / (mx - mn) + 4;
        h *= 60;
        if (h < 20 || h >= 340) hue.red++;
        else if (h < 45) hue.orange++;
        else if (h < 70) hue.yellow++;
        else if (h < 170) hue.green++;
        else if (h < 260) hue.blue++;
      }
    }
    lum /= px.length / 4;
    const dom = Object.entries(hue).sort((a, b) => b[1] - a[1])[0];
    const colorCandidates = dom[1] > 30
      ? ({ red: ['Winamax', 'Betclic'], orange: ['ZEbet'], yellow: ['Bwin'], green: ['Unibet', 'PMU'], blue: ['ParionsSport'] })[dom[0]]
      : null;

    /* canvas OCR : upscale si petit, cap si géant, inversion si ticket sombre */
    const scale = img.width < 900 ? 2 : (img.width > 2200 ? 2200 / img.width : 1);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const x = c.getContext('2d');
    x.filter = (lum < 128 ? 'invert(1) ' : '') + 'grayscale(1) contrast(1.25)';
    x.drawImage(img, 0, 0, c.width, c.height);

    /* miniature preview (couleurs d'origine) */
    const p = document.createElement('canvas');
    const ps = Math.min(1, 480 / img.width);
    p.width = Math.round(img.width * ps);
    p.height = Math.round(img.height * ps);
    p.getContext('2d').drawImage(img, 0, 0, p.width, p.height);

    return { canvas: c, preview: p.toDataURL('image/jpeg', 0.8), colorCandidates };
  }

  /* ── Dictionnaires ──────────────────────────── */
  const BOOK_WORDS = [
    ['winamax', 'Winamax'], ['betclic', 'Betclic'], ['unibet', 'Unibet'],
    ['parionssport', 'ParionsSport'], ['parions sport', 'ParionsSport'], ['fdj', 'ParionsSport'],
    ['pmu', 'PMU'], ['zebet', 'ZEbet'], ['bwin', 'Bwin'], ['netbet', 'Netbet'],
    ['vbet', 'Vbet'], ['olybet', 'Olybet'], ['stake', 'Stake'], ['1xbet', '1xBet'],
    ['pinnacle', 'Pinnacle'], ['bet365', 'Bet365'], ['genybet', 'Genybet'], ['france pari', 'France Pari']
  ];
  const SPORT_WORDS = [
    [/\bfoot(ball)?\b/i, 'Football'], [/\btennis\b/i, 'Tennis'],
    [/\bbasket(ball)?\b/i, 'Basketball'], [/\brugby\b/i, 'Rugby'],
    [/\bhandball\b/i, 'Handball'], [/\bhockey\b/i, 'Hockey'],
    [/\bbaseball\b/i, 'Baseball'], [/\bmma\b|\bufc\b/i, 'MMA'], [/\bboxe\b/i, 'Boxe'],
    [/volley/i, 'Volleyball'], [/e-?sport|counter.strike|\bcs2\b|valorant|league of legends/i, 'eSport'],
    [/\bgolf\b/i, 'Golf'], [/formule 1|\bf1\b/i, 'F1'], [/fléchettes|\bdarts?\b/i, 'Fléchettes'], [/\bpadel\b/i, 'Padel']
  ];
  const COMP_SPORT = [
    [/ligue [12]\b|premier league|la ?liga|serie a|bundesliga|ligue des champions|champions league|europa league|coupe de france|\bcan\b/i, 'Football'],
    [/\batp\b|\bwta\b|wimbledon|roland[- ]garros|us open|open d'australie|australian open|challenger/i, 'Tennis'],
    [/\bnba\b|betclic [ée]lite|euroligue/i, 'Basketball'],
    [/top 14|pro d2|champions cup/i, 'Rugby'],
    [/\bnhl\b/i, 'Hockey'], [/\bmlb\b/i, 'Baseball'], [/\bufc\b/i, 'MMA']
  ];
  const MARKET_SPORT = [
    [/1n2|mi-temps|buteur|corner|carton|clean sheet|les deux équipes/i, 'Football'],
    [/\bsets?\b|jeux? décisif|tie.?break|double faute|\baces?\b/i, 'Tennis'],
    [/rebonds?|passes? décisives?|paniers/i, 'Basketball'],
    [/\bessais?\b/i, 'Rugby'], [/\brounds?\b|\bko\b/i, 'MMA']
  ];
  const MARKET_HINT = /vainqueur|résultat|1n2|plus de|moins de|\bover\b|\bunder\b|handicap|score exact|nombre de|buteur|double chance|les deux|mi-temps|\btotal\b|marge|écart|\bsets?\b|\bjeux?\b|\bbuts?\b|points?|corners?|cartons?|qualifi/i;

  /* ── Parseur texte → pari ───────────────────── */
  const num = s => parseFloat(String(s).replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
  const localISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function oddsInLine(l) {
    return [...l.matchAll(/(?<!\d)(\d{1,3}[.,]\d{2})(?!\d)(?!\s*[€%])/g)]
      .map(m => num(m[1])).filter(v => v >= 1.01 && v <= 150);
  }

  function parseText(raw, opts = {}) {
    const today = opts.today ? new Date(opts.today + 'T12:00:00') : new Date();
    const text = raw.replace(/[\u202f\u00a0]/g, ' ');
    const low = text.toLowerCase();
    const lines = text.split(/\n/).map(l => l.replace(/\s{2,}/g, ' ').trim()).filter(Boolean);

    /* bookmaker : présélection utilisateur > mots-clés > couleur */
    let bookmaker = null;
    if (opts.forcedBook) bookmaker = opts.forcedBook;
    else {
      for (const [w, name] of BOOK_WORDS) if (low.includes(w)) { bookmaker = name; break; }
      if (!bookmaker && opts.colorCandidates?.length === 1) bookmaker = opts.colorCandidates[0];
    }

    /* montants */
    const mStake = low.match(/mise(?:\s+totale)?[^0-9€]{0,15}(\d[\d\s]*[.,]?\d*)\s*€/i);
    const stake = mStake ? num(mStake[1]) : null;
    const mGain = low.match(/gains?(?:\s+(?:potentiels?|éventuels?|possibles?|nets?))?[^0-9€]{0,12}(\d[\d\s]*[.,]?\d*)\s*€/i);
    const gains = mGain ? num(mGain[1]) : null;

    /* cote totale explicite */
    let totalOdds = null;
    const mTot = low.match(/cote\s+(?:totale|finale|globale|du combiné)[^0-9]{0,10}(\d{1,3}[.,]\d{1,2})/i);
    if (mTot) totalOdds = num(mTot[1]);

    /* flags */
    const isLive = /\b(live|en direct)\b/i.test(low);
    const isFreebet = /free ?bets?|paris? gratuits?/i.test(low);
    const isBoost = /boost/i.test(low);
    const mBase = low.match(/au lieu de\s*(\d{1,3}[.,]\d{1,2})/i);
    const baseOdds = mBase ? num(mBase[1]) : null;

    /* statut */
    let status = 'pending', cashoutAmount = null;
    if (/cash ?out/i.test(low) && /encaissé|récupéré/i.test(low)) {
      status = 'cashout';
      const mc = low.match(/(?:encaissé|récupéré)[^0-9€]{0,12}(\d[\d\s]*[.,]?\d*)\s*€/i);
      if (mc) cashoutAmount = num(mc[1]);
    }
    else if (/(?<![a-zà-ÿ])gagné(?![a-zà-ÿ])/i.test(low)) status = 'won';
    else if (/\bperdu\b/i.test(low)) status = 'lost';
    else if (/remboursé|annulé/i.test(low)) status = 'void';

    /* date de l'événement */
    let eventDate = null;
    if (/aujourd'?hui/i.test(low)) eventDate = localISO(today);
    else if (/demain/i.test(low)) eventDate = localISO(new Date(+today + 864e5));
    else {
      const MONTHS = { janv: 0, févr: 1, fevr: 1, mars: 2, avr: 3, mai: 4, juin: 5, juil: 6, août: 7, aout: 7, sept: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
      const dm = low.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      const dn = low.match(/(\d{1,2})\s+(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)/i);
      if (dm) {
        let y = dm[3] ? +dm[3] : today.getFullYear();
        if (y < 100) y += 2000;
        const d = new Date(y, +dm[2] - 1, +dm[1]);
        if (!isNaN(d)) eventDate = localISO(d);
      } else if (dn) {
        const d = new Date(today.getFullYear(), MONTHS[dn[2].toLowerCase()], +dn[1]);
        if (!isNaN(d)) eventDate = localISO(d);
      }
    }

    /* compétition : motif "Compétition · date/heure" puis liste connue */
    let competition = null;
    for (const l of lines) {
      const parts = l.split(/\s*[·•]\s*/);
      if (parts.length >= 2 && parts[0].length <= 40 && /[a-zà-ÿ]/i.test(parts[0])
        && /aujourd|demain|\d{1,2}[h:]\d{2}|\d{1,2}\//i.test(parts.slice(1).join(' '))) {
        competition = parts[0].trim(); break;
      }
    }
    if (!competition) for (const [re] of COMP_SPORT) {
      const m = text.match(re);
      if (m) { competition = m[0].trim().replace(/\b\p{L}/gu, c => c.toUpperCase()); break; }
    }

    /* lignes "affiche" (Équipe A - Équipe B) */
    const stripOdds = s => s.replace(/(?<!\d)\d{1,3}[.,]\d{2}(?!\d)\s*$/, '').trim();
    const matchLine = l => {
      if (/€/.test(l) || MARKET_HINT.test(l) || /[·•]/.test(l)) return null;
      const m = l.match(/^(.{2,40}?)\s+(?:-|–|—|vs\.?)\s+(.{2,40})$/i);
      if (!m) return null;
      if (/^[\d\s.,]+$/.test(m[1]) && /^[\d\s.,]+$/.test(m[2])) return null; /* score */
      return (m[1] + ' - ' + m[2]).replace(/\s+/g, ' ').trim();
    };
    const isBreak = l => /^(mise|gains?|cote totale|total)/i.test(l);

    const matchIdx = [];
    lines.forEach((l, i) => { if (matchLine(l)) matchIdx.push(i); });

    /* extraction des sélections bloc par bloc */
    const selections = [];
    matchIdx.forEach((idx, k) => {
      const end = k + 1 < matchIdx.length ? matchIdx[k + 1] : lines.length;
      let market = null, pick = null, odds = null;
      for (let j = idx + 1; j < end; j++) {
        const l = lines[j];
        if (isBreak(l)) break;
        if (/[·•]/.test(l)) continue; /* ligne compétition·date */
        const o = oddsInLine(l);
        if (l.includes(':') && /[a-zà-ÿ]/i.test(l.split(':')[0])) {
          const ci = l.indexOf(':');
          const left = l.slice(0, ci).trim();
          let right = l.slice(ci + 1).trim();
          if (o.length) { odds = odds ?? o[o.length - 1]; right = stripOdds(right); }
          if (!market) { market = stripOdds(left); pick = right || pick; }
        } else if (MARKET_HINT.test(l)) {
          if (!market) market = stripOdds(l);
          if (o.length) odds = odds ?? o[o.length - 1];
        } else if (o.length === 1 && /^[\d\s.,x]+$/i.test(l)) {
          odds = odds ?? o[0]; /* ligne = juste la cote */
        } else if (!pick && !o.length && l.length <= 40 && /[a-zà-ÿ]/i.test(l)) {
          pick = l; /* format pick isolé (Betclic) */
        } else if (o.length && odds == null) {
          odds = o[o.length - 1];
        }
      }
      selections.push({ event: matchLine(lines[idx]), market, pick, odds });
    });

    /* repli : aucune affiche détectée mais un marché coté */
    if (!selections.length) {
      for (const l of lines) {
        if (/€|mise|gains?|cote/i.test(l.toLowerCase()) || /[·•]/.test(l)) continue;
        const o = oddsInLine(l);
        if (!MARKET_HINT.test(l) && !o.length) continue;
        let market = null, pick = null;
        if (l.includes(':')) {
          const ci = l.indexOf(':');
          market = stripOdds(l.slice(0, ci).trim());
          pick = stripOdds(l.slice(ci + 1).trim()) || null;
        } else {
          market = stripOdds(l);
        }
        selections.push({ event: null, market, pick, odds: o.length ? o[o.length - 1] : null });
        break;
      }
    }

    /* cote totale : repli sélections puis gains/mise */
    if (!totalOdds) {
      const withOdds = selections.filter(s => s.odds);
      if (withOdds.length === selections.length && selections.length === 1) totalOdds = selections[0].odds;
      else if (withOdds.length === selections.length && selections.length > 1)
        totalOdds = +withOdds.reduce((a, s) => a * s.odds, 1).toFixed(2);
      else if (stake && gains && gains > 0) {
        const r = gains / stake + (isFreebet ? 1 : 0);
        if (r >= 1.01 && r <= 1000) totalOdds = +r.toFixed(2);
      }
    }

    /* type de pari */
    let betType = 'simple';
    if (/systèmes?|system/i.test(low)) betType = 'systeme';
    else if (/combinés?/i.test(low) || selections.length > 1) betType = 'combine';

    /* sport */
    let sport = null;
    for (const [re, sp] of SPORT_WORDS) if (re.test(text)) { sport = sp; break; }
    if (!sport) for (const [re, sp] of COMP_SPORT) if (re.test(text)) { sport = sp; break; }
    if (!sport) {
      const mk = selections.map(s => s.market || '').join(' ');
      for (const [re, sp] of MARKET_SPORT) if (re.test(mk)) { sport = sp; break; }
    }

    const empty = !stake && !totalOdds && !selections.length;
    return {
      bookmaker, sport, competition, betType, selections, totalOdds, stake,
      isLive, isFreebet, isBoost, baseOdds, status, cashoutAmount,
      eventDate, betDate: null,
      _engine: 'ocr', _empty: empty
    };
  }

  /* ── API principale ─────────────────────────── */
  async function analyze(files, onStatus, opts = {}) {
    statusCb = onStatus || null;
    const preps = [];
    for (const f of files) preps.push(prep(await loadImage(f)));
    const previews = preps.map(p => p.preview);
    const w = await getWorker();
    const bets = [];
    for (let i = 0; i < preps.length; i++) {
      statusPrefix = files.length > 1 ? `Ticket ${i + 1}/${files.length} — ` : '';
      onStatus?.(`${statusPrefix}Lecture du ticket… 0 %`);
      const { data } = await w.recognize(preps[i].canvas);
      bets.push(parseText(data.text || '', { colorCandidates: preps[i].colorCandidates, forcedBook: opts.forcedBook }));
    }
    statusCb = null; statusPrefix = '';
    return { bets, previews };
  }

  return { analyze, parseText };
})();
