# DrawAll — banc de mesure (lot 19.2)

Rapport écrit par `npm run bench` (`bench/banc.spec.ts`). Concept §11 : retour simple p95 < 100 ms ; budget de trame p95 ≤ 16,7 ms pour 60 images/s. Les valeurs sont celles mesurées sur l’environnement déclaré ci-dessous, et sur lui seul.

## Projet de référence déclaré

Trame de 10 × 10 pièces de 4 000 mm d’axe en axe, sur 2 niveaux (`src/lib/bench/reference.ts`) : 1082 objets (murs : 440, poteaux : 242, portes : 200, pièces : 200). Niveau actif affiché en entier : 541 objets ; vue 3D : 341 maillages.

## Environnement

| Élément | Valeur |
| --- | --- |
| date | 2026-10-08 |
| navigateur | Chromium 141.0.7390.37 (sans tête) |
| processeur | Intel(R) Xeon(R) Processor @ 2.80GHz × 4 |
| memoire | 16 Gio |
| systeme | linux 6.18.44-fc-v80 |
| gpu | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) |
| fenetre | 1440 × 900 |
| reseau | aucun (application servie en local, vite preview) |
| cache | chaud (deuxième chargement) |

## Méthode

- **retour** : de l'horodatage de l'événement d'entrée (Event.timeStamp, entrée Playwright de confiance) à la tâche qui suit la première trame après la mise à jour du DOM ; 60 mesures après 5 d'échauffement.
- **tramePlan** : 120 trames consécutives, la vue zoomée à chaque trame ; intervalle entre rappels requestAnimationFrame.
- **trame3d** : mesure intégrée de la vue 3D (lot 15.1) : 60 trames, gl.finish.

## Résultats

Ouverture du projet (rechargement jusqu’au cadrage) : 911 ms.

| Retour | Mesures | Médiane (ms) | p95 (ms) | Max (ms) | Cible p95 < 100 ms |
| --- | --- | --- | --- | --- | --- |
| Zoom à la molette | 60 | 91,7 | 113,3 | 135,9 | non atteinte |
| Sélection d’un mur au clic | 60 | 36,5 | 51,3 | 53,4 | atteinte |
| Déplacement au clavier (nouvelle version) | 60 | 66,5 | 95,4 | 106,8 | atteinte |
| Annuler (Ctrl+Z) | 60 | 70,1 | 100,5 | 105,7 | non atteinte |

| Trame | Mesures | Médiane (ms) | p95 (ms) | Cible p95 ≤ 16,7 ms |
| --- | --- | --- | --- | --- |
| Plan, vue zoomée à chaque trame | 120 | 66,7 | 100 | non atteinte |
| Vue 3D (orbite) | 60 | — | 10,5 | atteinte |

## Lecture

- Au-dessus des cibles sur ce projet : zoom à la molette (retour), annuler (ctrl+z) (retour), trame en plan. Chaque pas de zoom et chaque version redessinent l’ensemble des objets affichés (épaisseurs de trait et tailles d’annotation dépendent du zoom) : c’est la prochaine piste d’optimisation, non engagée dans ce lot.
- Vue 3D : budget de trame tenu, rendu par le processeur graphique déclaré.

## Limites

- Un seul appareil, celui déclaré : ni téléphone, ni projet très volumineux (Concept §11 : bancs propres).
- Navigateur sans tête ; le rendu graphique est celui indiqué à la ligne « gpu » (rendu logiciel le cas échéant), qui pèse sur la vue 3D.
- Une cible non atteinte est un résultat, pas un échec du banc : elle désigne ce qu’il faut optimiser.
