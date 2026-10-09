# DrawAll — banc de mesure (lot 19.2)

Rapport écrit par `npm run bench` (`bench/banc.spec.ts`). Concept §11 : retour simple p95 < 100 ms ; budget de trame p95 ≤ 16,7 ms pour 60 images/s. Les valeurs sont celles mesurées sur l’environnement déclaré ci-dessous, et sur lui seul.

## Projet de référence déclaré

Trame de 10 × 10 pièces de 4 000 mm d’axe en axe, sur 2 niveaux (`src/lib/bench/reference.ts`) : 1082 objets (murs : 440, poteaux : 242, portes : 200, pièces : 200). Niveau actif affiché en entier : 541 objets ; vue 3D : 341 maillages.

## Environnement

| Élément | Valeur |
| --- | --- |
| date | 2026-10-09 |
| navigateur | Chromium 141.0.7390.37 (sans tête) |
| processeur | Intel(R) Xeon(R) Processor @ 2.30GHz × 4 |
| memoire | 16 Gio |
| systeme | linux 6.18.44-fc-v80 |
| gpu | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) |
| fenetre | 1440 × 900 |
| reseau | aucun (application servie en local, vite preview) |
| cache | chaud (deuxième chargement) |

## Méthode

- **retour** : de l'horodatage de l'événement d'entrée (Event.timeStamp, entrée Playwright de confiance) à la tâche qui suit la première trame après la mise à jour du DOM ; 60 mesures après 5 d'échauffement.
- **tramePlan** : 120 trames consécutives, la vue zoomée à chaque trame ; intervalle entre rappels requestAnimationFrame et images sautées (intervalle > 25 ms) ; la cible est jugée à la gigue de l'horloge d'affichage près (0.5 ms).
- **trame3d** : mesure intégrée de la vue 3D (lot 15.1) : 60 trames, gl.finish.

## Résultats

Ouverture du projet (rechargement jusqu’au cadrage) : 512 ms.

Colonne « p95 précédent » : mesure versionnée du 2026-10-08, avant ce passage.

| Retour | Mesures | Médiane (ms) | p95 (ms) | Max (ms) | p95 précédent (ms) | Cible p95 < 100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| Zoom à la molette | 60 | 69,1 | 90,8 | 102,8 | 113,3 | atteinte |
| Sélection d’un mur au clic | 60 | 28,2 | 30 | 30,5 | 51,3 | atteinte |
| Déplacement au clavier (nouvelle version) | 60 | 37 | 46,1 | 52,9 | 95,4 | atteinte |
| Annuler (Ctrl+Z) | 60 | 45,5 | 61,6 | 99,5 | 100,5 | atteinte |

| Trame | Mesures | Médiane (ms) | p95 (ms) | Images sautées | p95 précédent (ms) | Cible p95 ≤ 16,7 ms |
| --- | --- | --- | --- | --- | --- | --- |
| Plan, vue zoomée à chaque trame | 120 | 16,7 | 16,8 | 5 | 100 | atteinte |
| Vue 3D (orbite) | 60 | — | 2,9 | — | 10,5 | atteinte |

## Lecture

- Toutes les cibles sont atteintes sur ce projet.
- Rendu du plan : pendant un geste de zoom, seule la transformation du plan change ; les objets sont redessinés à la nouvelle échelle (épaisseurs de trait, tailles d’annotation) 120 ms après le dernier pas. Après une modification ou une annulation, seuls les objets touchés sont redessinés. Le reste du temps de retour est surtout le travail du navigateur (style et peinture du SVG).
- Vue 3D : budget de trame tenu, rendu par le processeur graphique déclaré.

## Limites

- Un seul appareil, celui déclaré : ni téléphone, ni projet très volumineux (Concept §11 : bancs propres).
- Navigateur sans tête ; le rendu graphique est celui indiqué à la ligne « gpu » (rendu logiciel le cas échéant), qui pèse sur la vue 3D.
- Une cible non atteinte est un résultat, pas un échec du banc : elle désigne ce qu’il faut optimiser.
