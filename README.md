# 💰 Bankroll Manager

Gestion de bankroll paris sportifs — 100 % statique, hébergé sur GitHub Pages. Charte graphique MatchUp.

**Live : https://sika344.github.io/bankroll-manager/**

## Fonctionnalités

- **Ajout par screenshot** : glisse/colle un ticket (Winamax, Betclic, Unibet…), Claude Vision détecte bookmaker, sélections, cotes, mise, dates, freebet/boost, combinés — tu valides, c'est enregistré.
- **Ajout manuel** complet avec calcul live du % de bankroll, unités, edge & Kelly.
- **Dashboard** : bankroll, courbe d'évolution, yield, winrate, drawdown max, séries, espérance/pari, exposition en cours.
- **Historique** : filtres (statut, book, sport, source, période), recherche, tri, règlement rapide, édition, suppression.
- **Stats avancées** : profit factor, meilleur/pire pari & jour, profit mensuel, répartition par bookmaker, perf par tranche de cotes, jour de semaine, splits (book/sport/source/marché/type/cotes/live/confiance/mois/jour), CLV.
- **Données** : localStorage + export/import JSON & CSV + synchro cross-device via Gist GitHub secret.

## Configuration

1. **Réglages → Bankroll** : bankroll initiale, valeur d'unité, devise.
2. **Réglages → Détection screenshot** : clé API Anthropic ([console.anthropic.com](https://console.anthropic.com)). Appel direct navigateur → API, la clé reste en localStorage. ~0,003 € par analyse (Haiku 4.5).
3. **Réglages → Sync GitHub** *(optionnel)* : PAT scope `gist` pour sauvegarder/restaurer sur tous tes appareils.

## Stack

HTML/CSS/JS vanilla · Chart.js (CDN) · API Anthropic (vision) · API GitHub Gist (sync). Aucun build, aucun backend.

## Modèle de données (pari)

`bookmaker, sport, competition, betType (simple/combiné/système), selections[{event, market, pick, odds, result}], totalOdds, stake, stakePercent, bankrollBefore, isLive, isFreebet, isBoost, baseOdds, status (pending/won/lost/halfwon/halflost/void/cashout), cashoutAmount, closingOdds (CLV), tipster, confidence, estimatedProb, notes, betDate, eventDate, settledAt`
