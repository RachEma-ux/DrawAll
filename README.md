# DrawAll

Application web de dessin technique, de versionnement de projet et de documentation produit, construite à partir du dossier DrawAll V4.1.

## État actuel

Cette branche contient une application full-stack :

- **Atelier 2D** : murs (épaisseur, axe ou nu, jonctions L/T/croix nettoyées), ouvertures (portes, fenêtres hébergées par un mur) et pièces (surface au centième de m², associative aux murs) sur des niveaux (altitude, copie de niveau, fond de plan du niveau inférieur), symboles de plan (nord, repères de coupe, cotes de niveau) et bibliothèque de blocs bâtiment, cotes tolérancées (±, écarts, classes et ajustements ISO 286) et états de surface, lignes, rectangles, cercles, arcs (3 points ou centre), polylignes, textes, calques, blocs, hachures, cotes associatives (rayon ou diamètre au choix) et cotes par points (en série, cumulées, angulaires, de niveau) et mesures ; matériaux et profils de dessin versionnés (le profil change le motif, jamais le matériau) ; propriétés de trait ISO 128-2 (couleur, type, épaisseur) par calque et par objet, « du calque » par défaut ; édition par ajuster (couper à une arête), prolonger (jusqu’à une arête), congé (rayon saisi), chanfrein (deux distances), copier-coller (presse-papiers interne) et réseaux rectangulaire et polaire.
- **Précision de dessin** : accrochage objet activable type par type (extrémités, milieux, centres, intersections, coins, quadrants, insertion, perpendiculaire, tangent, proche), grille réglable (1 à 1 000 mm), mode ortho, saisie de points absolue, relative (`@dx;dy`) et polaire (`@L<angle`), unité d’affichage mm, cm ou m (modèle toujours en millimètres) ; mesures d’aire et de périmètre (inspecteur et outil « Aire » par points), zoom, panoramique et ajustement de vue.
- **Interopérabilité DXF** : import `LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE` (courbes comprises) avec conversion d’unités ; export DXF R2000 lisible par les lecteurs stricts, hachures comprises ; rapport conservé / transformé / perdu à chaque échange.
- **Comptes et persistance cloud** : connexion Kimi, projets en base MySQL, révisions optimistes et résolution explicite des conflits.
- **Feuilles** : mise en page A4–A0, cadre, fenêtres à l’échelle (ISO 5455) déplaçables au geste, calques par fenêtre ; cartouche (projet, titre, échelle, date, indice émis et figé sur la version, auteur, méthode de projection) ; export PDF vectoriel aux dimensions exactes de la feuille et impression.
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
npm run e2e     # recette navigateur Playwright (ordinateur + téléphone)
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

- import : `LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE`, `TEXT`, `MTEXT` ; les arcs sont conservés tels quels ; les segments courbes de polyligne (`bulge`) sont approchés avec un écart de corde ≤ 0,05 mm ; les entités en repère symétrique (extrusion 0,0,−1) sont replacées ;
- unités : l’unité déclarée par le fichier (`$INSUNITS`) est convertie en millimètres ; un fichier sans unité fait demander l’unité ;
- export : DXF R2000 (`AC1015`) en millimètres — primitives, hachures (`HATCH`), calques, types de ligne ISO 128-2 (`LTYPE`), épaisseurs et couleurs (calque ou objet) ; cotes converties en traits + texte et occurrences de blocs éclatées ;
- chaque import et export affiche un rapport de ce qui est conservé, transformé ou perdu ;
- l’intégration continue vérifie les exports avec ezdxf (`scripts/check-dxf.py`) et les PDF avec pypdf (`scripts/check-pdf.py`).

Détail et matrice : [`docs/DrawAll_v4.1_Conventions_Dessin.md`](docs/DrawAll_v4.1_Conventions_Dessin.md).

## Limites connues

- Le moteur est un moteur SVG 2D, pas un noyau B-Rep 3D.
- Les blocs sont aplatis à l’export DXF ; les attributs de blocs et références externes ne sont pas encore pris en charge.
- La collaboration en temps réel, le partage par droits et la comparaison visuelle de versions restent à implémenter.
- Le bundle principal dépasse légèrement 500 kB ; un découpage par routes pourra être ajouté.

## Documents sources

- `docs/DrawAll_v4.1_Concept.md`
- `docs/DrawAll_v4.1_Architecture.md`
- `docs/DrawAll_v4.1_Exigences_Sources.md`
- `docs/DrawAll_v4.1_Conventions_Dessin.md`
