# Analyse des fichiers partagés — rapport par catégorie

Date : 10 octobre 2026. Document lié : [Table d'amélioration des outils de la planche](Table_ameliorations_outils_planche.md).

## 0. Périmètre et source réelle des fichiers

- **Lien Quick Share demandé** (`quickshare.samsungcloud.com/sNtnx2MfTq6X`) : **inaccessible**. La politique réseau de l'environnement d'analyse refuse ce domaine. Aucun fichier n'a pu être lu depuis ce lien.
- **Source utilisée à la place : Google Drive** (connecteur demandé dans la consigne). Ce sont les fichiers déposés le 8 octobre 2026 dans les dossiers `0000` et `Extentions` :

| Fichier Drive | Dossier | Taille | Statut de l'analyse |
| --- | --- | --- | --- |
| `dbs_metal_fab_v2_2.rbz` | `0000` (Mon Drive) | 1,15 Mo | **Analysé** (135 fichiers extraits) |
| `ProfiléAlu-dbs_metal_fab_v2_2 .rbz` | `0000` (partagé par rochdoch5) | 1,15 Mo | **Doublon exact** du précédent (même empreinte SHA-256 `3d400ad1…ea11`) |
| `su_splat.rbz` | `Extentions` | 93,1 Mo | **Non analysé** : le connecteur Drive limite le téléchargement à 10 Mo |
| `.pending-1792093242-su_splat.rbz` | `Extentions` | 68,0 Mo | **Non analysé** : envoi interrompu (fichier partiel), et au-dessus de la limite de 10 Mo |

Si le contenu du lien Quick Share est différent de ces fichiers, il faut soit l'ouvrir dans le réseau de l'environnement (domaine à autoriser), soit le déposer sur Drive en morceaux de moins de 10 Mo.

## 1. Vue d'ensemble — DBS MetalFab v2.2

Extension SketchUp de **conception de structures en profilés** (tubes ronds, rectangulaires, profilés U, L, C, T, H et profils personnalisés), éditeur DBS (Daniel Bieńkowski Solutions), 2025. Le journal des versions (fichier `dbs_metal_fab.rb`) décrit l'évolution : dessin de matériau, compatibilité OpenCutList (groupes convertis en composants), angle de coupe d'onglet, sélection depuis la nomenclature, dessin depuis des arêtes (position extérieure / intérieure, rotation 90°), décalage de longueur, bibliothèque filtrable et triable, poids au mètre calculé depuis la forme, coût au kilo, poids et coût totaux.

Répartition des 135 fichiers :

| Catégorie | Nombre | Taille | Lisible ? |
| --- | --- | --- | --- |
| A. Code Ruby chiffré (`.rbe`) | 37 | ≈ 300 Ko | Non (chiffrement SketchUp `RBS2.0`) — analysé par nom, taille et usages visibles dans les interfaces |
| B. Interfaces (HTML, JS, CSS, SVG de placement) | 21 | 110 Ko | Oui — lu en entier |
| C. Données de profils (`.skp`, notes) | 7 | 963 Ko | Partiellement (modèles SketchUp 2017 compressés ; note de conception lisible) |
| D. Ressources graphiques (icônes SVG/PDF, PNG) | 68 | 505 Ko | Oui (formats et dimensions) |
| E. Chargeur, signature, licence, mise à jour | 2 + 3 `.rbe` | 7 Ko | Chargeur lisible ; signature binaire |

## 2. Catégorie A — Code (modules Ruby chiffrés)

Le cœur du programme est chiffré : seul le rôle de chaque module se déduit de son nom, de sa taille et des appels que les interfaces lui adressent (`sketchup.commit_dialog`, `draw_pipes_from_lines`, `redraw_pipe`, `delete_profile`, `rename_parts`, etc.).

| Module | Taille | Rôle déduit |
| --- | --- | --- |
| `pipe.rbe` | 50 Ko | Objet « barre » : génération du solide le long d'un axe, extrémités, onglets, attributs (profil, matériau, longueur, numéro de repère) |
| `main.rbe` | 36 Ko | Menu, barre d'outils, routage des commandes |
| `report.rbe` | 22 Ko | Nomenclature (BOM) : tableau triable, poids et coût, calcul sur sélection imbriquée, « nesting » (débit en barres) |
| `calc.rbe` | 18 Ko | Calculs : aire de section, poids au mètre selon densité, longueurs de débit |
| `pipes_list.rbe` | 12 Ko | Liste des barres du modèle, numérotation, sélection des instances identiques |
| `profile.rbe` | 11 Ko | Définition d'un profil (cotes, matériau, coût, norme, SKU, fiche technique, paramètres libres) |
| `settings.rbe` | 9 Ko | Réglages : segmentation, longueur de barre par défaut, préfixe et départ de numérotation, ligne médiane, fusion d'arêtes colinéaires, devise |
| `documentation.rbe` | 8 Ko | Renumérotation, étiquettes de repère, outil de texte, export PNG |
| `component.rbe` | 6 Ko | Conversion en composants (compatibilité OpenCutList), pas de renumérotation à la copie |
| `library.rbe` | 5 Ko | Bibliothèque de profils (lecture, écriture, filtre par type) |
| `shape_gen.rbe` | 3 Ko | Génération paramétrique des sections standard (U, L, C, T, H) depuis les modèles `data/profiles` |
| `observers.rbe` | 2 Ko | Observateurs : mise à jour après mise à l'échelle, copie, édition |
| `lic*.rbe`, `update.rbe` | 25 Ko | Licence et vérification de mise à jour |
| `tools/draw_pipe_tool` | 17 Ko | **Outil Dessiner** une barre (2 clics) |
| `tools/align_face_tool` | 11 Ko | **Aligner** une face de barre sur une face cible |
| `tools/miter_joint_tool` | 10 Ko | **Assemblage d'onglet** entre deux barres |
| `tools/pipe_offset_tool` | 9 Ko | **Décaler** une barre |
| `tools/extrude_and_profile_cut_tool` | 9 Ko | **Extruder et couper selon profil** (coupe d'une barre par une autre) |
| `tools/pipe_length_tool` | 6 Ko | **Ajuster la longueur** (+/−, demi-section ou valeur saisie) |
| `tools/edit_pipe_tool` | 6 Ko | **Modifier** le profil ou le matériau d'une barre existante |
| `tools/dimensioning_tool` | 5 Ko | **Coter** une barre |
| `tools/rotate_tool` | 3 Ko | **Pivoter** une barre autour de son axe |
| `lib/tools_drawing`, `geom`, `entities` | 18 Ko | Aperçu dynamique, géométrie (plans, axes, intersections), utilitaires d'entités |
| `dialogs/draw_from_lines.rbe` | — | **Dessiner depuis des arêtes** (une barre par arête sélectionnée) |

**Constats :** architecture classique « outil + dialogue », séparation nette entre objet métier (barre, profil) et outils. Le code n'étant pas lisible, aucun algorithme ne peut être repris tel quel ; on reprend des **fonctionnalités**, pas du code (licence propriétaire).

## 3. Catégorie B — Interfaces (dialogues HTML/JS)

Neuf dialogues, lus intégralement :

| Dialogue | Fonctions visibles |
| --- | --- |
| **Draw tool** | Source Bibliothèque/Utilisateur ; type (rond, rectangulaire, U, L, C, T, H, personnalisé) ; code du profil ; matériau (couleurs du modèle) ; **accrochage au centre** ; **décalage de longueur** (valeur) ; **rotation 90°** ; **position de placement** sur 5 points (centre, 4 coins) ; flèches ◀ ▲ ▶ pour **verrouiller l'axe** ; MAJ pour faire tourner la position de placement |
| **Draw from edges** | Mêmes choix de profil et matériau ; placement **centre / extérieur / intérieur** ; rotation 90° ; **extruder et couper** après dessin ; décalage de longueur ; avertissement sur le temps de calcul |
| **Pipe length offset** | Opération + / − ; source « demi-section » ou « valeur » ; MAJ inverse le sens |
| **Edit profile** | Changer profil et matériau d'une barre, redessin |
| **Add profile** | Code (« RO-200x10 »), type, diamètre, largeur, hauteur, épaisseur, **face personnalisée prise dans le modèle**, longueur de barre, **catégorie de matériau avec densité** (acier 7850, inox 8000, alu 2700, laiton 8500, cuivre 8960, bois 550/750, titane 4500, béton 2400, verre 2500, plastique 950 kg/m³), poids au mètre (estimé), coût au kilo, norme, SKU, URL de fiche technique, info, note, **paramètres libres** nom/valeur |
| **Library** | Tableau des profils : recherche plein texte, tri par colonne (numérique ou texte), filtre par type, actions Suppr / Modifier / Dessiner |
| **Settings** | Segmentation des ronds, longueur de barre par défaut, préfixe et index de numérotation, ligne médiane, fusion d'arêtes colinéaires, devise, unités de présentation du poids et du coût |
| **Documentation** | Renuméroter la sélection, ajouter des étiquettes, outil texte, supprimer toutes les étiquettes, exporter une image PNG |
| **About** | Texte d'information |

**Points de qualité relevés :** recherche sensible à la casse (le code de mise en minuscules est commenté) ; le filtre par type est reconstruit à chaque chargement ; communication par `window.location = 'skp:…'` (API ancienne) mêlée à `sketchup.*` (API récente) ; Échap ferme le dialogue partout. Ce sont des idées d'ergonomie solides (placement sur grille de 5 points, bascule MAJ, verrouillage d'axe par flèches) mais une interface datée.

## 4. Catégorie C — Données de profils

- `data/profiles/{C,H,L,T,U}.skp` et `test.skp` : modèles **SketchUp 2017** (`{17.2.2555}`) contenant une section type dans le plan YZ.
- `info.txt` (en polonais), règles de conception traduites :
  - enregistrer en version 2017 pour la compatibilité ;
  - section dans le plan YZ, dans le quart positif, Y = hauteur ;
  - **la forme est mise à l'échelle par des formules stockées dans les attributs des arêtes** : les cotes dessinées n'ont pas d'importance, seules les formules comptent ;
  - points à coordonnées « rondes » pour éviter les erreurs d'arrondi ;
  - à faire : ajouter des points de construction décrivant par exemple le rayon d'arrondi des angles après mise à l'échelle.

**Constat :** c'est un **gabarit paramétrique de section** (une forme + des formules par arête). C'est l'idée la plus réutilisable pour DrawAll : une section décrite une fois, instanciée pour toutes les dimensions d'une gamme.

## 5. Catégorie D — Ressources graphiques

- 15 icônes de barre d'outils en **SVG** et 14 en **PDF** (pour l'affichage macOS) : dessiner, depuis arêtes, modifier, longueur, décaler, onglet, coupe selon profil, aligner, pivoter, supprimer face, bibliothèque, nomenclature, documentation, réglages. Elles donnent la **liste exacte des 14 commandes** de la barre d'outils.
- 36 PNG 25×25 px (`a`–`z`, `0`–`9`) : alphabet bitmap, vraisemblablement utilisé pour afficher les repères de pièces dans la vue.
- `placing.svg` : schéma de la grille de placement à 5 points.
- Logo 300×300, icônes d'aide.

## 6. Catégorie E — Chargeur, signature, licence

- `dbs_metal_fab.rb` : chargeur standard SketchUp (`SketchupExtension`), version 2.2, journal des versions.
- `dbs_metal_fab.susig` : signature numérique Extension Warehouse (7 Ko) — le paquet est signé ; toute modification casse la signature.
- `extension_info.txt` : identifiants d'extension et de version.
- `lic.rbe`, `lic_common.rbe`, `update.rbe` : contrôle de licence et de mise à jour en ligne. **Logiciel commercial** : on s'en inspire fonctionnellement, sans copier code, icônes ni données.

## 7. Catégorie F — SU Splat (non analysé)

`su_splat.rbz` (93 Mo) et sa copie partielle `.pending-…` (68 Mo) dépassent la limite de 10 Mo du connecteur Google Drive ; leur contenu n'a donc **pas** été lu. Le nom seul ne suffit pas à décrire l'extension ; aucune conclusion n'est tirée ici. Pour l'analyser : autoriser `drive.google.com` dans le réseau de l'environnement, ou déposer l'archive décompressée (fichiers < 10 Mo).

## 8. Synthèse des fonctionnalités transposables dans DrawAll

| Idée tirée des fichiers | Catégorie source | Intérêt pour DrawAll |
| --- | --- | --- |
| Bibliothèque de profils (code, cotes, norme, SKU, fiche, paramètres libres) | B, C | Catalogue de sections pour poteaux, poutres, menuiseries alu, serrurerie |
| Section paramétrique par formules | C | Une forme → toute une gamme (IPE, UPN, cornières, tubes) |
| Dessin d'une barre par axe avec point d'insertion sur 5 positions et rotation 90° | B | Murs, poutres, lisses, montants alignés au nu ou à l'axe |
| Dessin depuis des arêtes existantes (centre / extérieur / intérieur) | B | Transformer un tracé filaire en ossature ou en murs |
| Décalage de longueur (+/−, demi-section) | B | Prolonger ou raccourcir une ligne ou un mur jusqu'au nu |
| Onglet et coupe selon profil | A, D | Angles de cadres, liaisons de murs et de poutres |
| Matériau → densité → poids au mètre → coût | B | Métrés et estimation directement depuis le dessin |
| Nomenclature triable, débit en barres, poids et coût totaux | A, B | Extension de la nomenclature existante |
| Renumérotation et repères de pièces | B | Repérage automatique sur plan et feuille |
| Verrouillage d'axe par flèches, MAJ pour basculer une option | B | Gestes clavier rapides pendant le tracé |
