/* ══════════════════════════════════════════════════════════════════════════
   Bankroll Manager — réglages du site (BK.CONF)

   Le site est À PART de MatchUp Tennis (dépôt Sika344/bankroll-manager,
   GitHub Pages). Il n'en lit que ce que MatchUp sert déjà à ses propres pages,
   avec les MÊMES règles d'accès :
     - le programme du jour (matches, matches_wta) : public, cartes réduites
       (joueurs, tournoi, horaire, surface) sans compte, entier pour un abonné ;
     - les résultats (recentHistory_*) : abonnés seulement, pour le règlement
       automatique ;
     - la synchro des paris (api/bankroll) : abonnés seulement.
   Côté MatchUp, ce site est autorisé (CORS) dans api/data/[file].js et
   api/bankroll.js. ⚠️ Un domaine personnalisé un jour = l'ajouter LÀ-BAS
   aussi, sinon le navigateur bloque toutes les lectures.
   ══════════════════════════════════════════════════════════════════════════ */
(function (BK) {
  'use strict';
  var MU = 'https://matchup-tennis.fr';
  BK.CONF = {
    MU: MU,
    DATA: MU + '/api/data/',
    SYNC: MU + '/api/bankroll',
    // Compte MatchUp : même projet Supabase que matchup-tennis.fr. La clé
    // « anon » est publique par nature (chaque page du site MatchUp la porte) ;
    // ce qu'elle permet est borné par les règles de la base, pas par le secret.
    SB_URL: 'https://jnthxdjcykkmgjjjivad.supabase.co',
    SB_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudGh4ZGpjeWtrbWdqamppdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTExNDUsImV4cCI6MjA4OTQ4NzE0NX0.oXuDzZ7fA6c4J_wBiJpzkkRMpaj_EwMJalVlk2B1k0g',
    // Session gardée sous SA clé : jamais partagée avec matchup-tennis.fr (deux
    // sites qui rafraîchiraient le même jeton feraient révoquer la session).
    SESSION_KEY: 'bk-matchup-session',
    LINKS: {
      home: MU + '/',
      premium: MU + '/#pricing',
      signup: MU + '/compte?signup=1',
      account: MU + '/compte',
      app: MU + '/app',
      reset: MU + '/compte?reset=1'
    }
  };
})(window.BK = window.BK || {});
