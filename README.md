# DrawAll

Application web de dessin technique, de versionnement de projet et de documentation produit, construite à partir du dossier DrawAll V4.1.

## État actuel

Cette branche contient une application full-stack :

- **Atelier 2D** : lignes, rectangles, cercles, polylignes, calques, blocs, hachures, cotes associatives et mesures.
- **Précision de dessin** : accrochage objet (extrémités, milieux, centres, quadrants, intersections), grille 10 mm, mode ortho, saisie de coordonnées X/Y, zoom, panoramique et ajustement de vue.
- **Interopérabilité DXF** : import/export `LINE`, `CIRCLE` et `LWPOLYLINE`, avec conversion de l’axe Y entre SVG et DXF.
- **Comptes et persistance cloud** : connexion Kimi, projets en base MySQL, révisions optimistes et résolution explicite des conflits.
- **Historique** : microversions, annulation/rétablissement, versions nommées et diagnostics de cohérence.
- **Documentation intégrée** : Concept, Architecture de référence et explorateur des 324 exigences.

## Pile technique

React 19 · TypeScript · Vite · Tailwind CSS · tRPC · Hono · Drizzle ORM · MySQL · OAuth Kimi.

## Développement

```bash
npm ci
npm run dev
```

Validation locale :

```bash
npm run lint
npm run check
npm run test
npm run build
```

Production locale :

```bash
npm run build
npm start
```

Le serveur écoute sur le port `3000`.

## Base de données

Le schéma Drizzle se trouve dans `db/schema.ts`. Pendant le développement :

```bash
npm run db:push
```

Pour une migration versionnée :

```bash
npm run db:generate
npm run db:migrate
```

Les variables attendues sont documentées dans `.env.example`. Ne jamais committer `.env`.

## Interopérabilité DXF

Le format DXF est pris en charge de façon volontairement limitée et explicite :

- import : `LINE`, `CIRCLE`, `LWPOLYLINE` ;
- export : primitives, calques, cotes aplaties et occurrences de blocs aplaties ;
- unités : millimètres (`$INSUNITS = 4`) ;
- les entités non prises en charge sont signalées au lieu d’être silencieusement perdues.

## Limites connues

- Le moteur est un moteur SVG 2D, pas un noyau B-Rep 3D.
- Les blocs sont aplatis à l’export DXF ; les attributs de blocs et références externes ne sont pas encore pris en charge.
- La collaboration en temps réel, le partage par droits et la comparaison visuelle de versions restent à implémenter.
- Le bundle principal dépasse légèrement 500 kB ; un découpage par routes pourra être ajouté.

## Documents sources

- `docs/DrawAll_v4.1_Concept.md`
- `docs/DrawAll_v4.1_Architecture.md`
- `docs/DrawAll_v4.1_Exigences_Sources.md`
