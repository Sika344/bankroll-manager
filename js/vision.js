/* ══════════════════════════════════════════════
   VISION — analyse de screenshot via API Anthropic
   ══════════════════════════════════════════════ */
const Vision = (() => {

  /* Redimensionne + compresse l'image (max 1568px, JPEG) */
  function compress(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1568;
        let { width: w, height: h } = img;
        if (Math.max(w, h) > MAX) {
          const r = MAX / Math.max(w, h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], dataUrl, mediaType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = URL.createObjectURL(file);
    });
  }

  function buildPrompt(forcedBook) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekday = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][now.getDay()];
    const bookLine = forcedBook
      ? `\n\nIMPORTANT : l'utilisateur a indiqué que le bookmaker est "${forcedBook}". Utilise EXACTEMENT cette valeur pour le champ "bookmaker" de chaque pari, sans essayer de le deviner depuis l'image.`
      : '';
    return `Tu analyses un screenshot de ticket(s) de pari sportif (bookmaker français ou international). Date d'aujourd'hui : ${weekday} ${today}.${bookLine}

Extrais TOUTES les informations visibles et réponds UNIQUEMENT avec un JSON valide, sans texte avant/après, sans backticks markdown. Schéma :

{"bets":[{
  "bookmaker": "nom exact du bookmaker (Winamax, Betclic, Unibet, ParionsSport, Bwin, Zebet, PMU, Netbet, Vbet, Olybet, Stake, 1xBet, Pinnacle, Bet365...) — identifie-le via le logo, les couleurs ou la mise en page. null si vraiment impossible",
  "sport": "Tennis / Football / Basketball / ... (déduis-le des équipes/joueurs si non affiché)",
  "competition": "tournoi ou compétition si visible, sinon null",
  "betType": "simple | combine | systeme",
  "selections": [{"event": "Joueur A - Joueur B ou Équipe A - Équipe B", "market": "type de pari (Vainqueur, Plus de 2.5 buts, Handicap -1.5, Nombre de jeux, Les deux équipes marquent...)", "pick": "la sélection jouée exactement", "odds": 1.85}],
  "totalOdds": 1.85,
  "stake": 50.0,
  "potentialPayout": 92.5,
  "eventDate": "YYYY-MM-DD (convertis 'Aujourd'hui'/'Demain'/jours relatifs avec la date fournie ci-dessus ; null si invisible)",
  "eventTime": "HH:MM ou null",
  "betDate": "YYYY-MM-DD si la date de placement du pari est visible, sinon null",
  "isLive": false,
  "isFreebet": false,
  "isBoost": false,
  "baseOdds": null,
  "status": "pending | won | lost | cashout (si le ticket montre un résultat : Gagné/Perdu/Remboursé...)",
  "cashoutAmount": null,
  "notes": "toute info utile supplémentaire visible (boost %, bonus, code promo...) ou null"
}]}

Règles :
- Un screenshot peut contenir PLUSIEURS tickets → un objet par ticket dans "bets".
- Pour un combiné : liste chaque sélection avec sa cote individuelle si visible, et mets la cote totale dans totalOdds.
- Les cotes utilisent le format décimal européen (virgules → points).
- La mise (stake) est le montant misé, pas le gain potentiel. Attention à ne pas les confondre.
- isFreebet=true si mention "freebet", "paris gratuit", "EnPlus"...
- isBoost=true si cote boostée visible (mets alors l'ancienne cote dans baseOdds).
- Si une info est absente ou illisible : null. N'invente RIEN.`;
  }

  async function analyze(images, opts = {}) {
    const { apiKey, model } = Store.state.settings;
    if (!apiKey) throw new Error('NO_API_KEY');

    const content = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
    }));
    content.push({ type: 'text', text: buildPrompt(opts.forcedBook) });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('Clé API invalide (401)');
      throw new Error(msg);
    }

    const data = await res.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Réponse IA non exploitable');
    const parsed = JSON.parse(clean.slice(start, end + 1));
    if (!Array.isArray(parsed.bets)) throw new Error('Aucun pari détecté');
    return parsed.bets;
  }

  async function testKey() {
    const { apiKey, model } = Store.state.settings;
    if (!apiKey) throw new Error('Aucune clé renseignée');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'ok' }] })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    return true;
  }

  return { compress, analyze, testKey };
})();
