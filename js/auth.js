/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — compte MatchUp, FACULTATIF (BK.Auth)

   Le site marche entièrement sans compte. Un abonné MatchUp qui connecte son
   compte récupère en plus : cotes et analyse du programme, règlement
   automatique, synchro de ses paris entre appareils.

   - Connexion par e-mail + mot de passe : le seul mode du site MatchUp, et le
     seul qui ne demande aucun réglage de redirection chez Supabase.
   - Session PROPRE à ce site (sa propre clé de stockage) : se connecter ici ne
     touche pas à la session de matchup-tennis.fr, et inversement.
   - Création de compte et mot de passe oublié : sur matchup-tennis.fr, qui
     crée aussi le profil (ce site n'écrit jamais dans la table profiles).
   - Statut Premium : même règle que le serveur de données de MatchUp
     (api/data : is_premium ET bêta non expirée), qui décide de toute façon de
     ce qu'il renvoie.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var C = BK.CONF;
  var A = { client: null, user: null, premium: false, profile: null, ready: false, error: null, _l: [], _at: 0 };

  function emit() { A._l.forEach(function (fn) { try { fn(A); } catch (e) { console.error('[bk/auth]', e); } }); }
  /** Abonnement aux changements ; rappelle tout de suite si le module est prêt. */
  function on(fn) { A._l.push(fn); if (A.ready) fn(A); }

  function client() {
    if (A.client) return A.client;
    var lib = typeof window !== 'undefined' && window.supabase;
    if (!lib || !lib.createClient) return null;
    A.client = lib.createClient(C.SB_URL, C.SB_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: C.SESSION_KEY }
    });
    return A.client;
  }

  /** Messages Supabase → français. */
  function fr(msg) {
    var m = String(msg || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/email not confirmed/i.test(m)) return 'Adresse e-mail pas encore confirmée.';
    if (/rate limit|only request this after|too many/i.test(m)) return 'Trop de tentatives : réessaie dans une minute.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Pas de connexion : réessaie quand le réseau revient.';
    if (/user not found/i.test(m)) return 'Aucun compte avec cette adresse.';
    return m || 'Connexion impossible.';
  }

  async function loadProfile() {
    var sb = client();
    if (!sb || !A.user) { A.premium = false; A.profile = null; return; }
    try {
      var r = await sb.from('profiles').select('is_premium, beta_until').eq('id', A.user.id).maybeSingle();
      if (r && r.error) throw r.error;
      var p = r && r.data;
      var betaFinie = !!(p && p.beta_until && new Date(p.beta_until) < new Date());
      A.profile = p || null;
      A.premium = !!(p && p.is_premium === true && !betaFinie);
      A._at = Date.now();
    } catch (e) {
      // Réseau coupé : on garde le dernier statut connu plutôt que de rétrograder
      // un abonné en « gratuit » (il retrouverait des cartes vides).
      console.warn('[bk/auth] profil illisible', e && e.message);
    }
  }

  async function init() {
    var sb = client();
    if (!sb) { A.ready = true; A.error = 'Bibliothèque de connexion indisponible'; emit(); return; }
    try {
      var r = await sb.auth.getSession();
      A.user = r && r.data && r.data.session ? r.data.session.user : null;
    } catch (_) { A.user = null; }
    await loadProfile();
    A.ready = true;
    emit();
    sb.auth.onAuthStateChange(function (event, session) {
      var u = session ? session.user : null;
      var autre = (u && u.id) !== (A.user && A.user.id);
      A.user = u;
      if (!u) { if (autre || event === 'SIGNED_OUT') { A.premium = false; A.profile = null; emit(); } return; }
      // Jamais d'appel Supabase DANS ce rappel (verrou interne de supabase-js) :
      // on le reporte d'un tour.
      if (autre || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setTimeout(function () { loadProfile().then(emit); }, 0);
      }
    });
  }

  async function signIn(email, password) {
    var sb = client();
    if (!sb) throw new Error('Connexion indisponible pour le moment.');
    var r;
    try { r = await sb.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') }); }
    catch (e) { throw new Error(fr(e && e.message)); }
    if (r.error) throw new Error(fr(r.error.message));
    A.user = r.data.user;
    await loadProfile();
    emit();
    return A;
  }

  /** scope 'local' : ne déconnecte QUE ce site sur cet appareil (le défaut de
   *  Supabase révoquerait aussi les sessions de matchup-tennis.fr). */
  async function signOut() {
    var sb = client();
    try { if (sb) await sb.auth.signOut({ scope: 'local' }); } catch (_) { /* session déjà morte */ }
    A.user = null; A.premium = false; A.profile = null;
    emit();
  }

  async function resetPassword(email) {
    var sb = client();
    if (!sb) throw new Error('Indisponible pour le moment.');
    var r = await sb.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo: C.LINKS.reset });
    if (r.error) throw new Error(fr(r.error.message));
  }

  /** Jeton d'accès FRAIS (rafraîchi s'il expire dans moins d'une minute). */
  async function token() {
    var sb = client();
    if (!sb || !A.user) return null;
    try {
      var r = await sb.auth.getSession();
      var s = r && r.data && r.data.session;
      if (!s) return null;
      var maintenant = Math.floor(Date.now() / 1000);
      if (s.expires_at && s.expires_at - maintenant < 60) {
        var rr = await sb.auth.refreshSession();
        s = rr && rr.data && rr.data.session;
      }
      return s ? s.access_token : null;
    } catch (_) { return null; }
  }

  /** Relit le statut Premium (retour sur l'onglet après un abonnement pris
   *  sur matchup-tennis.fr). Au plus une fois par minute, sauf force. */
  async function refresh(force) {
    if (!A.user) return A;
    if (!force && Date.now() - A._at < 60e3) return A;
    var avant = A.premium;
    await loadProfile();
    if (A.premium !== avant) emit();
    return A;
  }

  BK.Auth = Object.assign(A, { init: init, on: on, signIn: signIn, signOut: signOut, resetPassword: resetPassword, token: token, refresh: refresh, _fr: fr });
})(window.BK = window.BK || {});
