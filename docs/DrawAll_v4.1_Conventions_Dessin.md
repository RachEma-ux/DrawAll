# DrawAll — Conventions de dessin V4.1

Ce document fixe les conventions graphiques et numériques du socle de dessin commun (module M01, exigences transversales T03, T04 et T13). Il prolonge le [Concept produit](DrawAll_v4.1_Concept.md) et sert de référence aux tests de recette. Il distingue trois statuts :

- **Règle** : comportement que l'application garantit et que les tests vérifient.
- **Préréglage** : valeur par défaut modifiable, issue d'un usage documenté.
- **À décider** : choix réservé au maître d'ouvrage ; l'application ne le tranche pas.

Les conventions de dessin (comment représenter) sont distinctes des règles de conception (ce qu'il faut construire : Eurocodes, normes SIA, accessibilité, urbanisme). Ces dernières relèvent des modules métier et de leurs propres validations ; elles ne figurent pas ici.

## 1. Unités et précision

### 1.1 Quatre notions distinctes (règle)

| Notion | Ce qu'elle contrôle | Exemple | Modifie le modèle ? |
| --- | --- | --- | --- |
| Unité du modèle | Signification des coordonnées stockées | Un mur mesure 5 000 mm | — |
| Mise à l'échelle géométrique | Dimensions réelles de l'objet (commandes « Échelle ×2 / ÷2 ») | Le mur passe à 10 000 mm | Oui |
| Échelle de représentation | Rapport modèle → feuille (1:50, 5:1) | Le mur occupe 100 mm sur une feuille au 1:50 | Non |
| Zoom écran | Taille de l'aperçu à l'écran | Zoom avant | Non |

Un dessin peut être « sans échelle d'impression » ; il n'est jamais « sans unité ».

### 1.2 Unité interne (règle)

- L'unité interne du modèle est le **millimètre**. Aucune coordonnée n'est stockée dans une autre unité.
- À l'import, l'unité déclarée par le fichier est convertie en millimètres et la conversion figure dans le rapport d'échange.
- Si le fichier ne déclare pas d'unité exploitable, l'utilisateur choisit l'unité ; aucune unité n'est supposée en silence.

### 1.3 Quatre niveaux de précision (règle)

| Niveau | Valeur actuelle | Rôle |
| --- | --- | --- |
| Précision stockée | Nombre flottant double ; export DXF à 10⁻⁶ mm | Ce que conserve la géométrie. Jamais arrondie par l'affichage ni par l'inspecteur. |
| Tolérance de calcul | 10⁻⁶ mm | En deçà, une longueur est considérée comme nulle. Aucune taille minimale métier n'est imposée (un perçage de Ø 0,8 mm est possible). |
| Tolérance d'approximation | 0,05 mm (écart de corde) | Écart maximal entre un segment courbe de polyligne importé (`bulge`) et la polyligne qui le représente ; annoncé dans le rapport. Au-delà de 100 000 segments par arc (rayons de l'ordre de la centaine de kilomètres), la tolérance n'est plus tenue et le rapport le signale. |
| Précision affichée | 2 décimales au plus | Présentation des cotes et des mesures. Préréglage ; ne modifie jamais la géométrie. |

La tolérance de fabrication (variation physique admissible d'une pièce, ISO 2768, ISO 286) est une donnée métier portée par l'objet ; elle n'est pas une précision d'affichage.

### 1.4 À décider

- Unité d'affichage par défaut selon le contexte (millimètre partout, ou centimètre / mètre pour les plans de bâtiment). En attendant : millimètre.

### 1.5 Saisie précise (règle)

- L'unité d'affichage (mm, cm, m) se choisit dans la barre d'état. Elle commande les coordonnées du pointeur, les mesures, les étiquettes de sélection et l'interprétation des valeurs saisies ; elle ne modifie jamais le modèle, qui reste en millimètres. Les cotes et l'inspecteur restent en millimètres jusqu'au lot 2.4.
- Précision affichée constante : 0,01 mm quelle que soit l'unité (2 décimales en mm, 3 en cm, 5 en m).
- Formes de saisie d'un point : `x;y` (absolu), `@dx;dy` (relatif au dernier point), `L<angle` (polaire depuis l'origine), `@L<angle` (polaire relatif). La virgule est décimale ; le point-virgule sépare X et Y.
- X et Y sont ceux qu'affiche l'atelier (Y croît vers le bas de l'écran ; l'export DXF le retourne). Un angle se compte en degrés depuis +X, positif dans le sens antihoraire à l'écran : `@3000<90` monte de 3 m.
- Une saisie relative sans point précédent est refusée avec un message ; aucune origine n'est supposée.
- Le pas de grille (1, 5, 10, 50, 100, 500 ou 1 000 mm) commande l'accrochage à la grille et son tracé ; le trait fin disparaît quand il deviendrait illisible.

## 2. Échelles de représentation

### 2.1 Définition (règle)

L'échelle est le rapport **dimension sur la feuille : dimension réelle**. Réduction 1:X, grandeur réelle 1:1, agrandissement X:1 (désignation selon ISO 5455). Les cotes indiquent toujours la dimension réelle, quelle que soit l'échelle.

### 2.2 Préréglages par contexte (préréglage)

Ces valeurs sont des points de départ, choisis selon l'étendue du dessin, son niveau de détail et le format de la feuille.

| Contexte | Échelles proposées |
| --- | --- |
| Plan de situation, plan de masse | 1:500, 1:200 |
| Plans d'étage, coupes générales | 1:100, 1:50 |
| Détails intérieurs, calepinage | 1:20, 1:10 |
| Détails de construction | 1:5, 1:2 |
| Ensemble de machine | 1:10, 1:5 |
| Dessin de définition | 1:1 |
| Pièces de précision | 2:1, 5:1, 10:1 |

Remarque : le support pédagogique « Dessin Technique » associe dans un premier tableau les plans de masse au 1:50 – 1:100 ; c'est une erreur, corrigée par son second tableau (1:200 – 1:500), repris ici.

### 2.3 État actuel

L'échelle de représentation (vues, fenêtres de présentation, feuilles, export PDF calibré) n'est pas encore implémentée : c'est l'objet du lot 2.

## 3. Traits

Référence : **ISO 128-2:2022** (conventions de base pour les traits ; remplace ISO 128-2:2020).

| Usage | Trait | Statut |
| --- | --- | --- |
| Contour vu | Continu fort | Règle (lot 3) |
| Cotes, lignes d'attache, hachures | Continu fin | Règle (lot 3) |
| Contour caché | Interrompu fin | Règle (lot 3) |
| Axes, lignes de symétrie | Mixte fin (trait-point) | Règle (lot 3) |
| Plan de coupe | Mixte fin, renforcé aux extrémités | Règle (lot 3) |

Les épaisseurs se définissent **sur la feuille** (en mm papier), pas dans le modèle. Les styles de traits ne sont pas encore implémentés : l'atelier utilise aujourd'hui des traits d'affichage.

## 4. Hachures

### 4.1 Séparer quatre informations (règle)

| Information | Rôle |
| --- | --- |
| Matériau | Identifie la matière de l'objet. |
| Motif | Décrit les traits répétés (angle, pas, origine). |
| Contexte de vue | Coupe, surface vue, ou remplissage générique. |
| Unité du pas | Pas « papier » (lisibilité constante quelle que soit l'échelle) ou pas « modèle » (dimension réelle, par exemple un calepinage de carreaux). |

Un motif ne crée ni ne modifie le matériau d'un objet.

### 4.2 Conventions graphiques (préréglage)

- Hachures en trait continu fin, à 45° par défaut par rapport aux contours principaux ; l'angle est modifiable.
- Le pas tient compte de la taille de la surface et de la lisibilité.
- Dans un assemblage, deux pièces voisines coupées reçoivent des hachures de sens ou de pas différents.
- Une section très mince peut être noircie au lieu d'être hachurée.

Ces règles s'appliquent aux hachures de coupe ; DrawAll gère aussi des motifs de surface et des remplissages génériques, qui ne sont pas réservés aux objets coupés.

### 4.3 Correspondances matériau → motif (à décider)

Les correspondances usuelles (acier en traits simples, aluminium en traits doubles, béton armé avec granulats, isolant en ondulations, bois en cernes…) sont des **usages d'enseignement et d'entreprise**, pas une norme internationale. La norme bâtiment ISO 4069:1977 (représentation des surfaces en coupe), retirée en 2004, ne fixait d'ailleurs aucun motif par matériau.

DrawAll les proposera sous forme de **profils de dessin** modifiables et versionnés, chacun avec sa source et son domaine d'application. Le choix du profil par défaut et de ses sources revient au maître d'ouvrage.

### 4.4 État actuel

L'atelier propose trois motifs (diagonales, croisées, plein) sur les contours fermés. Ils sont exportés en DXF (entités HATCH, motifs ANSI31, ANSI37 et SOLID). Le modèle matériau / motif / contexte est l'objet du lot 3.

## 5. Cotation

Référence : **ISO 129-1:2018** (indication des dimensions et tolérances).

### 5.1 Règles

- Une cote est associative : sa valeur dérive de l'objet coté et se recalcule à chaque modification.
- Cote horizontale = ΔX, cote verticale = ΔY, cote alignée = longueur vraie, cote de cercle = diamètre (préfixe Ø).
- Les styles disponibles dépendent de la cible ; une seule définition commande la création, l'inspecteur, la mesure, le rendu et l'export :

| Cible | Styles proposés |
| --- | --- |
| Ligne | Alignée (défaut), horizontale, verticale |
| Rectangle | Horizontale (défaut), verticale |
| Polyligne | Horizontale (défaut), verticale — sur l'emprise |
| Cercle | Rayon / diamètre |

- La valeur affichée suit la précision affichée (§1.3) ; la valeur mesurée reste à pleine précision.

## 6. Vues, coupes et projection

Référence : **ISO 128-3:2022** (vues, coupes et sections ; remplace ISO 128-3:2020) et ISO 5456-2 (projections orthogonales).

- La disposition des vues dépend de la méthode de projection : **premier dièdre** (usage européen) ou **troisième dièdre** (usage nord-américain, fréquent au Japon). Un même dessin ne s'interprète donc pas « partout de la même manière » sans cette indication ; la méthode figure dans le cartouche.
- Méthode par défaut : **à décider** (proposition : premier dièdre).
- Les vues et coupes automatiques ne sont pas encore implémentées.

## 7. Échanges DXF

### 7.1 Règles

- Export au format **DXF R2000 (AC1015)**, unité déclarée millimètre (`$INSUNITS = 4`), lisible par les lecteurs stricts (vérifié avec ezdxf à chaque intégration continue).
- Import des entités LINE, CIRCLE, ARC, LWPOLYLINE, TEXT et MTEXT, y compris les segments courbes (`bulge`) et les entités en repère symétrique (extrusion 0,0,−1).
- Chaque import et chaque export produit un rapport : **conservé / transformé / perdu**.
- Les caractères hors ASCII (accents, Ø, ±, m², noms de calques) s'écrivent `\U+XXXX` (convention DXF R2000) et sont décodés à l'import.

### 7.2 Matrice actuelle

| Élément | Import | Export |
| --- | --- | --- |
| Ligne | Conservée | Conservée (LINE) |
| Cercle | Conservé | Conservé (CIRCLE) |
| Arc | Conservé (ARC natif : centre, rayon, angles) | Conservé (ARC) |
| Polyligne droite | Conservée | Conservée (LWPOLYLINE, nombre de sommets exact) |
| Segment courbe de polyligne | Approché en polyligne (≤ 0,05 mm) | — |
| Largeur de polyligne | Perdue (signalée) | — |
| Rectangle | — | Transformé en polyligne fermée |
| Hachure | Non lue (signalée) | Conservée (HATCH) |
| Cote | Non lue | Transformée en traits + texte ; association perdue |
| Occurrence de bloc | Non lue (signalée) | Éclatée en entités simples |
| Calques | Nom et couleur conservés | Nom, couleur, visibilité, verrouillage |
| Identifiants, classification, historique | — | Perdus (non représentables en DXF) |
| Texte sur une ligne | Conservé (TEXT : contenu, hauteur, rotation, alignement ; %%c %%d %%p décodés) | Conservé (TEXT) |
| Texte sur plusieurs lignes | Conservé (MTEXT : mise en forme simplifiée en texte brut) | Conservé (MTEXT, point d'attache en haut) |
| Autres entités (SPLINE, INSERT, DIMENSION…) | Ignorées et signalées | — |

### 7.3 À décider

- Version DXF visée par défaut (R2000 retenue pour sa compatibilité ; R2018 possible).

## 8. Références

| Sujet | Référence |
| --- | --- |
| Désignation des échelles | ISO 5455:1979 |
| Conventions de traits | ISO 128-2:2022 |
| Vues, coupes et sections | ISO 128-3:2022 |
| Projections orthogonales | ISO 5456-2:1996 |
| Indication des dimensions et tolérances | ISO 129-1:2018 |
| Tolérances générales | ISO 2768-1:1989 |
| Représentation des surfaces en coupe (bâtiment) | ISO 4069:1977 — retirée en 2004, citée pour mémoire |
| Unités DXF (`$INSUNITS`) et entités | Référence DXF Autodesk |

Ces références identifient les sujets couverts. Toute affirmation de conformité suppose de traduire leurs exigences en comportements vérifiables et testés.
