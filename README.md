# 💰 Bankroll Manager

Gestion de bankroll paris sportifs — 100 % statique, hébergé sur GitHub Pages. Charte graphique MatchUp.

**Live : https://sika344.github.io/bankroll-manager/**

## Fonctionnalités

- **Ajout par screenshot, sans clé API** : glisse/colle un ticket (Winamax, Betclic, Unibet…), l'**OCR local** (Tesseract.js, 100 % navigateur, gratuit) détecte bookmaker (mots-clés + couleurs dominantes), sélections, cotes, mise, cote totale, dates ("Aujourd'hui/Demain"), live, freebet, boost, statut — tu valides, c'est enregistré. Les tickets sombres sont automatiquement inversés avant lecture. En option : moteur **Claude Vision** (clé API) pour la précision max.
- **Ajout manuel** complet avec calcul live du % de bankroll, unités, edge & Kelly.
- **Dashboard** : bankroll, courbe d'évolution, yield, winrate, drawdown max, séries, espérance/pari, exposition en cours.
- **Historique** : filtres (statut, book, sport, source, période), recherche, tri, règlement rapide, édition, suppression.
- **Stats avancées** : profit factor, meilleur/pire pari & jour, profit mensuel, répartition par bookmaker, perf par tranche de cotes, jour de semaine, splits (book/sport/source/marché/type/cotes/live/confiance/mois/jour), CLV.
- **Données** : localStorage + export/import JSON & CSV + synchro cross-device via Gist GitHub secret.

## Configuration

1. **Réglages → Bankroll** : bankroll initiale, valeur d'unité, devise.
2. **Détection screenshot** : rien à configurer — l'OCR local est actif par défaut (premier lancement : téléchargement du modèle ~4 Mo, mis en cache). Option Claude Vision dans Réglages si besoin (clé API Anthropic, ~0,003 €/analyse).
3. **Réglages → Sync GitHub** *(optionnel)* : PAT scope `gist` pour sauvegarder/restaurer sur tous tes appareils.

## Stack

HTML/CSS/JS vanilla · Chart.js (CDN) · Tesseract.js (OCR local) · API Anthropic (vision, optionnel) · API GitHub Gist (sync). Aucun build, aucun backend.

## Modèle de données (pari)

`bookmaker, sport, competition, betType (simple/combiné/système), selections[{event, market, pick, odds, result}], totalOdds, stake, stakePercent, bankrollBefore, isLive, isFreebet, isBoost, baseOdds, status (pending/won/lost/halfwon/halflost/void/cashout), cashoutAmount, closingOdds (CLV), tipster, confidence, estimatedProb, notes, betDate, eventDate, settledAt`
