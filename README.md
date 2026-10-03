# DrawAll

**Application web universelle de dessin, de conception et de documentation — prototype v4.1 (base de développement).**

Ce dépôt contient le prototype frontal de DrawAll, construit à partir du dossier produit V4 :

- [Concept produit V4](docs/DrawAll_v4.1_Concept.md) — vision, « un objet, deux lectures », cinq engagements, parcours de preuve
- [Architecture de référence V4](docs/DrawAll_v4.1_Architecture.md) — contrats de modularité, cycle transactionnel, données et stockage
- [Exigences et sources V4](docs/DrawAll_v4.1_Exigences_Sources.md) — 324 exigences candidates DA-XX-YY, 20 exigences transversales T01–T20, décisions D1–D6

## Ce que contient le prototype

### Atelier (prototype de dessin 2D — étape P0/P1)

- **Cinq repères permanents (UX1)** : navigateur du projet, zone de travail, commandes, inspecteur, panneau des modifications/problèmes.
- **Niveaux d'affichage progressifs** : Essentiel / Contextuel / Complet — sans changer la signification des commandes.
- **Palette de commandes commune (UX2, ⌘K)** : outils, actions, modules et exigences recherchables, avec synonymes courants.
- **Aperçu avant validation (UX3)** : accrochage grille 10 mm, tracé prévisualisé, diagnostics dans le panneau des problèmes.
- **Objets identifiés** : identifiants stables `OBJ-XXXX`, classification métier par ontologie (`building.architecture`, `building.structure`, `industry.mechanical`, `industry.electrical`).
- **Un objet, deux lectures** : bascule Lecture bâtiment / Lecture industrie sur la même identité, sans conversion ni duplication.
- **Versionnement Git-like** : chaque édition crée une microversion ; versions nommées (jalons) ; annulation/rétablissement et navigation dans l'historique.
- **Export de paquet** : JSON avec manifeste versionné, unités et objets (niveau Complet).

### Documentation (le dossier V4 dans l'application)

- **Concept** : vision, schéma « un objet, deux lectures », cinq engagements, 17 modules M01–M17, parcours de preuve, étapes P0–P4.
- **Architecture** : schéma logique, décisions normatives D1–D6, cycle transactionnel, données et stockage.
- **Exigences** : les **324 entrées** de l'annexe B consultables (recherche plein texte, filtres par module et étape P1–P3), les 20 exigences transversales et l'exemple de fiche DA-07-10.

## Pile technique

React 19 · TypeScript · Vite · Tailwind CSS. Rendu du canvas en SVG (grille, accrochage, zoom/panoramique).

```bash
npm install
npm run dev    # développement
npm run build  # production → dist/
```

## Limites connues (fidèle à la posture V4)

- **Persistance locale uniquement** : le projet est conservé dans le `localStorage` du navigateur (espace de travail local — Concept §8). Pas de synchronisation entre appareils ; l'effacement des données du navigateur supprime le projet. L'autorité de projet partagée (Architecture §2) n'est pas encore implémentée.
- Géométrie 2D vectorielle ; le noyau B-Rep (décision D1, occt-wasm) est hors périmètre de ce prototype.
- Les diagnostics sont des contrôles légers (classification manquante, géométrie dégénérée, position dans l'historique) ; pas de calcul métier.

## Trajectoire

| Étape | Périmètre |
| --- | --- |
| P0 — Faisabilité | Géométrie, contraintes, dépendances, import, interface |
| P1 — Socle universel | Dessin, pièces, assemblages simples, bâtiment essentiel, documents, versions |
| P2 — Approfondissement | Structure, bois, tôlerie, réseaux, surfaces, coordination |
| P3 — Ingénierie avancée | Électricité complète, PCB, calculs, FAO, production |
