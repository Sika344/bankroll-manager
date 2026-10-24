# 💰 Bankroll Manager

Suivi de bankroll paris sportifs — site statique sur GitHub Pages, charte MatchUp Tennis, **à part de MatchUp** mais branché sur son programme.

**En ligne : https://sika344.github.io/bankroll-manager/**

## Ce que ça fait

- **Ajout depuis le programme tennis du jour** (ATP, Challenger, WTA, ITF), lu sur l'API de [MatchUp Tennis](https://matchup-tennis.fr) : on touche un joueur, le match, le tournoi, la surface et l'horaire sont remplis ; plusieurs lignes = combiné. Marchés tennis structurés : vainqueur, 1er set, total et handicap de jeux, sets, score exact, tie-break…
- **Ajout par capture d'écran**, lue dans le navigateur (Tesseract.js embarqué) : la capture ne quitte pas le téléphone. Les matchs du programme sont reconnus et reliés tout seuls.
- **Saisie à la main** pour tout le reste (autres sports, matchs passés).
- **Tableau de bord, historique, analyse** : bankroll, courbe, yield, réussite, drawdown, séries, CLV, découpages par bookmaker, cote, marché, surface, circuit, tour… Garde-fous d'échantillon : pas de pourcentage sous 5 paris, chiffre grisé sous 20.
- **Garde-fous de jeu responsable** : mise max en % de la bankroll, limite de perte du mois, alerte de série de pertes — des alertes, jamais des blocages.
- **Export** JSON (sauvegarde) et CSV (Excel), **import** des sauvegardes (ancienne version comprise).

## Sans compte / avec un compte MatchUp

| | Sans compte | Compte MatchUp Premium connecté |
|---|---|---|
| Programme du jour | joueurs, tournoi, horaire, surface (+ le match offert du jour en entier) | entier : cotes et analyse |
| Photo du match au moment du pari | — | cotes, proba du marché, value MatchUp, styles |
| Règlement | d'un geste après le match | automatique à partir des scores MatchUp |
| Cote de clôture (CLV) | à la main | relevée toute seule |
| Où vivent les paris | sur l'appareil | sur le compte, tous les appareils |

La connexion se fait avec les identifiants de matchup-tennis.fr (e-mail + mot de passe) ; la session de ce site est indépendante de celle de MatchUp. Création de compte et mot de passe oublié : sur matchup-tennis.fr.

## Côté MatchUp (dépôt `Sika344/-aceedge-data`)

- `api/data/[file].js` et `api/bankroll.js` autorisent l'origine `https://sika344.github.io` (CORS). **Un domaine personnalisé un jour = l'ajouter dans ces deux fichiers.**
- La synchro des paris entre appareils demande les tables de `sql/bankroll.sql` (à exécuter une fois dans Supabase). Sans elles, le site garde les paris sur l'appareil.
- `horaire.js` et `drapeaux.js` sont chargés depuis matchup-tennis.fr : une seule définition de l'heure d'un match et du drapeau d'un tournoi.

## Données

Rien n'est envoyé ailleurs que sur matchup-tennis.fr (programme, et compte si connecté). Sans compte, tout reste dans le navigateur (`localStorage`, clé `bk_device_v2`). Les paris de la première version (clé `bkm_state_v1`) sont repris automatiquement au premier passage ; la clé API et le jeton GitHub qu'elle pouvait contenir sont retirés de l'appareil.

## Code

HTML/CSS/JS sans étape de build. `js/` : `config` (adresses), `core`, `markets` (marchés structurés), `settle` (règlement automatique), `stats`, `mu` (programme MatchUp + photo du match), `auth` (compte MatchUp, facultatif), `store` (appareil / compte), `form` (ticket), `ui`, `add`, `demo` (exemple fictif), `ocr` (lecture de capture), `app`. Bibliothèques embarquées dans `vendor/` (Supabase JS, Chart.js, Tesseract.js 5.1.1), police Inter Tight dans `fonts/` (OFL).
