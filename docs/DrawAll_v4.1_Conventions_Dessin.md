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

### 1.6 Mesures d'aire et de périmètre (règle)

- L'inspecteur donne l'aire et le périmètre des contours fermés (rectangle, cercle, polyligne fermée), la longueur des objets ouverts ; pour un arc, la longueur, l'aire du secteur et celle du segment (entre l'arc et sa corde).
- L'outil « Aire » mesure un contour désigné par points (souris, doigt ou saisie précise) sans rien créer.
- Un contour qui se recoupe n'a pas d'aire évidente : elle est déclarée « non évaluée » ; le périmètre reste donné.
- Les valeurs suivent l'unité d'affichage (mm², cm², m²) ; le calcul se fait en millimètres à pleine précision. Le référentiel de surfaces métier (SIA 416, loi Carrez…) relève du lot 4.3.

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

### 2.3 Feuilles et fenêtres (règle, lot 2.1)

- Une **feuille** a un format ISO 216 (A4 à A0), une orientation et des marges (par défaut 20 mm à gauche pour la reliure, 10 mm ailleurs, ISO 5457). Ses grandeurs sont en millimètres papier.
- Une **fenêtre** occupe un rectangle de la feuille et montre le modèle à une échelle (rapport papier : réel), centrée sur un point du modèle ; elle peut masquer des calques pour elle seule.
- Passage papier ↔ modèle : longueur papier = longueur réelle × échelle (5 000 mm au 1:50 = 100 mm ; au 1:100 = 50 mm). L'échelle ne modifie jamais le modèle.
- Les feuilles sont versionnées avec le projet (historique, annulation) ; une fenêtre qui déborde de la zone utile est signalée.
- Éditeur (mode « Feuilles », lot 2.2) : feuilles A4 à A0 en portrait ou paysage, cadre de la zone utile, fenêtres ajoutées cadrées sur le dessin à l'échelle normalisée qui le fait tenir, déplacées et redimensionnées au geste (accrochage au millimètre papier) ou par saisie ; échelle, centre et calques propres à chaque fenêtre.
- **Cartouche** (lot 2.3) : 180 × 32 mm au coin inférieur droit de la zone utile (ISO 7200, ISO 5457). Champs saisis : projet, titre, auteur, méthode de projection (premier dièdre par défaut, décision §6). Champs tirés du projet : échelle(s) des fenêtres, date et **indice** de la version affichée. L'indice est émis sur une version (« Émettre l'indice A ») et sa lettre (A, B…, AA) y est enregistrée : nommer plus tard une version plus ancienne ne change aucun indice émis, et une lettre n'est jamais attribuée deux fois. Une modification après le dernier indice émis est signalée « modifié depuis ». Un champ non renseigné s'affiche « — » : rien n'est inventé.
- **Export PDF** (lot 2.5) : PDF 1.4 vectoriel d'une page aux dimensions exactes de la feuille (1 mm = 72 / 25,4 pt) ; fenêtres découpées, traits et motifs à leurs épaisseurs papier, hachures en traits fins à 45° au pas papier de 3 mm, textes en Helvetica (WinAnsi), cartouche. Impression monochrome (noir), usage du dessin technique. « Imprimer » ouvre le PDF : imprimer à 100 % (taille réelle). L'intégration continue relit les PDF avec pypdf en mode strict.

## 3. Traits

Référence : **ISO 128-2:2022** (conventions de base pour les traits ; remplace ISO 128-2:2020).

| Usage | Trait | Statut |
| --- | --- | --- |
| Contour vu | Continu fort | Préréglage (profils, lot 3) |
| Cotes, lignes d'attache, hachures | Continu fin | Préréglage (profils, lot 3) |
| Contour caché | Interrompu fin | Préréglage (profils, lot 3) |
| Axes, lignes de symétrie | Mixte fin (trait-point) | Préréglage (profils, lot 3) |
| Plan de coupe | Mixte fin, renforcé aux extrémités | Préréglage (profils, lot 3) |

### 3.1 Propriétés de trait (règle, lot 1.9)

- Chaque calque porte une couleur, un type et une épaisseur de trait ; chaque objet peut porter les siens. Une propriété absente sur l'objet vaut **« du calque »** (DXF : BYLAYER).
- Types disponibles (ISO 128-2, types de base) : 01 continu, 02 interrompu, 04 mixte (trait-point), 05 mixte double (trait-deux points). Motifs en multiples de l'épaisseur d : 02 = 12 d trait, 3 d espace ; 04 = 24 d, 3 d, point 0,5 d, 3 d ; 05 = 24 d, 3 d, 0,5 d, 3 d, 0,5 d, 3 d.
- Épaisseurs (mm sur la feuille, série ISO de raison √2) : 0,13 · 0,18 · 0,25 · 0,35 · 0,5 · 0,7 · 1 · 1,4 · 2. Par défaut : continu, 0,25 mm.
- À l'écran, la largeur est proportionnelle à l'épaisseur (0,25 mm → 1,5 px) et les motifs gardent les proportions de la norme. Le rendu à l'échelle de la feuille viendra avec les présentations (lot 2).
- Couleurs à l'écran : « du trait » (calque ou objet, usage CAO) par défaut, ou « classification métier » (lecture métier, réglage de la barre d'état).
- DXF : types écrits `CONTINUOUS`, `ACAD_ISO02W100`, `ACAD_ISO04W100`, `ACAD_ISO05W100` (bibliothèque ISO, plume de 1 mm, échelle de type de ligne 1) ; épaisseur en groupe 370 (centièmes de mm) ; couleur en vraie couleur (420). À l'import, les noms usuels (HIDDEN, DASHED, CENTER, PHANTOM…) et les couleurs ACI 1 à 9 sont reconnus.

Les épaisseurs se définissent **sur la feuille** (en mm papier), pas dans le modèle.

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

### 4.4 Matériaux et profils de dessin (règle, lot 3.1)

- Un objet peut porter un **matériau** (béton, béton armé, maçonnerie, bois, terre, acier, aluminium, isolant, verre) : un nom seulement, sans propriété physique ni réglementaire.
- Le **profil de dessin** actif du projet associe à chaque matériau un motif. Changer de profil change l'apparence (écran, feuilles, PDF, DXF) ; le matériau de l'objet ne change jamais.
- Chaque profil a une version, une source et un domaine ; aucun n'est présenté comme une norme. Profils fournis : « Neutre » 1.0 (par défaut, diagonales pour tout matériau — décision §7 en attente), « Enseignement — usages courants » 1.0, « Plans de présentation — aplats » 1.0.
- Un objet sans matériau garde le motif choisi à la main. Avec un matériau, le motif vient du profil ; pour le forcer, on retire le matériau.
- Le profil est versionné avec le projet (historique, annulation).

### 4.6 Contexte coupe / vue et pièces voisines (règle, lot 3.3)

- Chaque fenêtre de feuille, et l'atelier, a un **contexte** : *coupe* (défaut) ou *vue*. En coupe, un objet à matériau est haché selon le profil ; en vue, sa surface n'est pas hachurée, sauf motif de surface prévu par le profil (par exemple le verre en aplat dans le profil « Enseignement »). Le matériau ne change pas.
- **Pièces voisines coupées** : deux objets à matériau, hachés du même motif et qui se touchent (côté commun, croisement, ou à 0,01 mm près), reçoivent des hachures de sens différent (45° puis 135°), puis de pas différent (3 mm puis 4,5 mm papier) si les deux sens sont déjà pris. Un angle choisi à la main n'est jamais modifié. L'alternance est calculée à l'affichage et à l'export ; le modèle n'est pas modifié.

### 4.5 Hachures paramétrées (règle, lot 3.2)

- Motifs : diagonales (une famille de traits), croisées (deux familles à 90°), plein ; sur les contours fermés (rectangle, cercle, polyligne fermée).
- Paramètres : **angle** (degrés, antihoraire depuis +X), **pas** entre traits, **unité du pas** — papier (constant sur la feuille quelle que soit l'échelle ; préréglage 3 mm) ou modèle (dimension réelle, par exemple un calepinage) — et **origine** (décalage depuis le coin de l'emprise, le motif suit l'objet).
- **Îlots** : contours fermés contenus dans l'objet, laissés vides (règle pair-impair). « Évider les contours contenus » les désigne d'un geste ; ils suivent les copies de leur contour.
- Les transformations font suivre le motif : rotation et symétrie changent l'angle, l'échelle change un pas modèle (un pas papier reste constant).
- Rendu : atelier (pas papier ramené à l'écran), feuilles et PDF au pas papier exact, traits de 0,18 mm.
- DXF : HATCH défini par l'utilisateur (`_USER`, simple ou double) à l'angle, au pas et à l'origine de l'objet, îlots en boucles intérieures (cercle par arête d'arc) ; aplat en SOLID. Un pas papier est converti en pas réel à l'échelle de la première fenêtre de feuille (1:1 sans feuille), et le rapport d'export l'indique.

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

### 5.1 Cotes avancées (règle, lot 2.6)

| Cote | Désignation | Valeur |
| --- | --- | --- |
| Rayon / diamètre | Cote associative d'un cercle ou d'un arc | « R » ou « Ø », au choix (défaut : Ø pour un cercle, R pour un arc) ; une seule flèche pour un rayon |
| En série (chaînée) | Points successifs, horizontale, verticale ou alignée | Distance projetée entre deux points voisins |
| Cumulée | Depuis le premier point (origine marquée d'un petit cercle) | Distance projetée depuis l'origine |
| Angulaire | Sommet puis deux branches | Angle entre les branches, de 0 à 180°, arc du plus petit côté |
| Niveau | Un point et le niveau ±0,00 (Y du modèle) | En mètres, signée, deux décimales : +2,50 · −0,30 · ±0,00 |

Les cotes par points ne sont pas associatives : leur valeur vient de leurs points (elles suivent les déplacements, rotations par quart de tour, symétries et mises à l'échelle). En DXF, elles sont transformées en traits, arcs et textes.

### 5.2 Styles d'annotation papier (règle, lot 2.4)

- Sur une feuille, une cote se dessine avec des tailles **papier** identiques quelle que soit l'échelle de la fenêtre : chiffres de 2,5 mm, flèches fermées remplies de 2,5 mm (ouverture 30°), lignes de cote et d'attache de 0,18 mm, texte à 1 mm de la ligne de cote.
- Les traits des objets sont tracés à leur épaisseur papier exacte et leurs motifs ISO 128-2 en multiples de cette épaisseur (02 à 0,25 mm : trait 3 mm, espace 0,75 mm).
- Conversion : taille dans le modèle = taille papier ÷ échelle (2,5 mm au 1:50 → 125 mm ; au 1:5 → 12,5 mm).
- Dans l'atelier, les annotations gardent une taille constante à l'écran. Un objet texte garde sa hauteur réelle (modèle) ; les textes annotatifs (hauteur papier) restent à décider avec les profils de dessin.

### 5.3 Tolérances et états de surface (règle, lot 5.1)

- Une cote associative peut porter une tolérance :
  - symétrique (« 25 ±0,1 ») ;
  - par écarts saisis (« 25 +0,1/−0,05 », l'écart supérieur au-dessus de l'inférieur) ;
  - par classe ISO 286 (« Ø 25 H7 (+0,021/0) ») ;
  - par ajustement (« Ø 25 H7/g6 »).
- Classes ISO 286-1:2010 :
  - écarts tirés des tableaux de la norme (degrés IT3 à IT14, tailles de 0 à 500 mm, paliers « au-delà de … jusqu'à … inclus »), jamais recalculés par formule ;
  - positions couvertes : arbres d, e, f, g, h, js, k, m, n, p ; alésages D, E, F, G, H, JS, K, M, N (jusqu'à IT8), P (jusqu'à IT7) ;
  - règle Δ pour K, M, N, P, cas particulier M6 de 250 à 315 mm, js7 à js11 arrondis au µm pair ;
  - hors de ce domaine, la classe est affichée « (non évalué) » avec la raison dans l'inspecteur.
- Un ajustement donne les écarts de l'alésage et de l'arbre, le jeu minimal et maximal (négatif = serrage) et sa nature : avec jeu, incertain ou avec serrage.
- État de surface (ISO 21920-1, ex-ISO 1302) :
  - symbole pointe sur la surface, deux traits à 60° (H1 = 5 mm, H2 = 10,5 mm pour une écriture de 3,5 mm) ;
  - barre si l'enlèvement de matière est exigé, cercle s'il est interdit ;
  - rugosité saisie (« Ra 3,2 ») sous le trait d'appui.
  - La rugosité n'est jamais proposée par défaut : sans valeur saisie, seul le symbole est dessiné.
- Échanges :
  - la tolérance fait partie du texte de la cote (DXF et PDF) ;
  - l'état de surface s'exporte comme les symboles (§8.5) ;
  - le signe moins s'écrit en tiret demi-cadratin dans le PDF (WinAnsi).

## 6. Vues, coupes et projection

Référence : **ISO 128-3:2022** (vues, coupes et sections ; remplace ISO 128-3:2020) et ISO 5456-2 (projections orthogonales).

- La disposition des vues dépend de la méthode de projection : **premier dièdre** (usage européen) ou **troisième dièdre** (usage nord-américain, fréquent au Japon). Un même dessin ne s'interprète donc pas « partout de la même manière » sans cette indication ; la méthode figure dans le cartouche.
- Méthode par défaut : **à décider** (proposition : premier dièdre, appliquée en attendant la décision §7 de la feuille de route).

### 6.1 Vues liées (règle, lot 5.2)

- Une pièce prismatique est décrite par sa vue de face (contour fermé : rectangle, cercle ou polyligne fermée) et son épaisseur ; ses îlots sont des perçages débouchants. Ses vues de dessus et de côté sont calculées à partir de la face et recalculées à chaque modification de celle-ci.
- Disposition (ISO 5456-2) :
  - premier dièdre (ISO E) : vue de dessus sous la face, vue de gauche à droite de la face ;
  - troisième dièdre (ISO A) : vue de dessus au-dessus de la face, vue de droite à droite de la face.
  - L'écart entre les vues est réglable ; les vues restent alignées sur la face (rappels horizontaux et verticaux).
- Traits (ISO 128-2) :
  - arêtes vues en trait continu fort (0,5 mm) ;
  - arêtes cachées en trait interrompu fin (0,25 mm) ;
  - axes des perçages circulaires en trait mixte fin (0,18 mm), dépassant la vue.
  - Une arête de la face parallèle à l'épaisseur est vue si elle est sur le bord de la face du côté de l'observateur, cachée sinon.
- Les vues suivent leur face : elles ne se déplacent pas seules, partent avec elle à la suppression et sont copiées avec elle (comme les cotes et les ouvertures, qui suivent toujours leur parent).
- Échanges :
  - DXF : traits LINE aux types ACAD_ISO02W100 (caché) et ACAD_ISO04W100 (axe) ; le lien à la face est perdu ;
  - PDF : traits à leurs épaisseurs et motifs papier.

### 6.2 Coupes (règle, lot 5.3)

- Une vue en coupe est définie par une face (pièce prismatique : contour fermé + épaisseur, îlots = perçages) et un repère de coupe (§8.5) dont la trace traverse la face. Le plan de coupe est perpendiculaire à la face et passe par la trace ; seules les traces horizontales ou verticales sont prises en charge. Une trace oblique, qui ne traverse pas la matière, ou qui ne traverse pas toute la face (trace raccourcie ou déplacée après coup), est signalée « non évaluée » : il n'y a pas de coupe partielle implicite.
- La vue montre :
  - les surfaces coupées (intervalles de matière le long de la trace, règle pair-impair avec les perçages, cercles calculés exactement) en contour fort (0,5 mm), hachurées à 45° en trait fin au pas papier de 3 mm ;
  - les perçages comme des vides ;
  - la désignation « A–A » (5 mm), reprise du repère.
  - Les arêtes au-delà du plan ne sont pas représentées (pièce prismatique coupée perpendiculairement à sa face).
- Placement : comme la vue projetée dans le sens des flèches du repère (ISO 128-3), selon la méthode de projection. La coupe remplace la vue liée qui occuperait le même emplacement (une coupe vue du dessus remplace la vue de dessus).
- La coupe suit la face et la trace. Elle part avec la face ; sans son repère, elle est signalée orpheline.
- Échanges :
  - DXF : contours (LINE, continu 0,5 mm), hachures (HATCH 0,18 mm au pas converti à l’échelle) et désignation (TEXT) ;
  - PDF : hachures par découpe au pas papier.

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
| Hachure | Non lue (signalée) | Conservée (HATCH _USER ou SOLID : angle, pas, origine, îlots) |
| Cote | Non lue | Transformée en traits + texte ; association perdue |
| Occurrence de bloc | Non lue (signalée) | Éclatée en entités simples |
| Calques | Nom, couleur, type et épaisseur de trait conservés | Nom, couleur, type et épaisseur de trait, visibilité, verrouillage |
| Propriétés de trait d'un objet | Conservées (types usuels reconnus, ACI 1–9) | Conservées (6, 370, 420 ; BYLAYER sinon) |
| Identifiants, classification, historique | — | Perdus (non représentables en DXF) |
| Texte sur une ligne | Conservé (TEXT : contenu, hauteur, rotation, alignement ; %%c %%d %%p décodés) | Conservé (TEXT) |
| Texte sur plusieurs lignes | Conservé (MTEXT : mise en forme simplifiée en texte brut) | Conservé (MTEXT, point d'attache en haut) |
| Autres entités (SPLINE, INSERT, DIMENSION…) | Ignorées et signalées | — |

### 7.3 À décider

- Version DXF visée par défaut (R2000 retenue pour sa compatibilité ; R2018 possible).

## 8. Métier bâtiment

### 8.1 Murs (règle, lot 4.1)

- Un mur est un trait de référence, une épaisseur et une justification : le trait est l'**axe** du mur, ou son **nu gauche** / **nu droit** (côté vu à l'écran en parcourant le trait).
- Outil « Mur » : points successifs, un mur par segment (souris, doigt ou saisie précise).
- Jonctions nettoyées automatiquement : **L** (extrémités communes : faces prolongées jusqu'à leur intersection, sans about), **T** (extrémité sur un autre mur : prolongée jusqu'à son axe), **croix** ; continuation dans l'alignement sans about ; nœud de trois murs ou plus sans onglet. Toute portion de face strictement à l'intérieur d'un autre mur est retirée.
- Contour vu fort par défaut (0,5 mm), matériau et hachures comme tout contour fermé ; les faces servent d'arêtes pour Ajuster / Prolonger et d'accrochages (coins).
- DXF : traits visibles (LINE) et hachures ; le mur n'est plus éditable comme tel (rapport « transformé »).

### 8.2 Ouvertures (règle, lot 4.2)

- Une porte ou une fenêtre est **hébergée** par un mur : sa position est la distance du centre de la baie au début du mur, sa largeur est saisie ; elle suit le mur (déplacement, rotation, étirement) et disparaît avec lui.
- Outil « Ouverture » : toucher un mur à l'endroit du centre ; une baie qui dépasse du mur est refusée avec un message.
- Porte : charnière au début ou à la fin de la baie, ouverture à gauche ou à droite du mur ; vantail (trait 0,35 mm) et débattement en quart de cercle. Fenêtre : appuis sur les faces et vitrage au milieu.
- Les faces du mur sont coupées sur la largeur de la baie et des tableaux ferment l'épaisseur.
- DXF : traits et arc ; le lien au mur est perdu (rapport « transformé »).

### 8.3 Pièces et surfaces (règle, lot 4.3)

- Une pièce est désignée par un point intérieur et nommée ; son contour est la face fermée par les faces des murs qui contient ce point (les ouvertures ne l'ouvrent pas). Il est recalculé à chaque modification des murs : la surface suit.
- Un point qui n'est dans aucune pièce fermée est refusé avec un message ; une pièce qui cesse d'être fermée affiche « pièce non fermée » et sa surface est « non évaluée ».
- Surface affichée en m² au centième (contour intérieur des murs, piliers et gaines non déduits). La règle de surface du projet (SIA 416 par défaut, ou loi Carrez — décision §7) est rappelée avec ses réserves : ce qui dépend des hauteurs, gaines ou marches n'est pas évalué en 2D.
- Étiquette : nom (3,5 mm papier) et surface (2,5 mm) au centre de gravité. DXF : contour (LWPOLYLINE) et étiquette (TEXT) ; la surface n'est plus recalculée.

### 8.4 Niveaux (règle, lot 4.4)

- Un niveau (identifiant NIV-, jamais réutilisé) a un nom et l'altitude de son plancher en mm par rapport au ±0,00 du projet, affichée en mètres signés (« +2,80 m »). Les niveaux sont versionnés avec le projet ; un projet antérieur a un seul niveau, « Rez-de-chaussée » à ±0,00.
- Chaque objet appartient à un niveau ; les calques sont communs à tous les niveaux. L'atelier montre et édite le niveau actif seulement (sélection, accrochage, pièces, murs et ouvertures) ; le niveau immédiatement inférieur peut s'afficher en fond de plan estompé, ni sélectionnable ni accrochable.
- Copier un niveau crée un niveau neuf avec des copies de tous ses objets (identifiants neufs, ouvertures, cotes et îlots rattachés aux copies) ; les deux niveaux s'éditent ensuite séparément. Supprimer un niveau supprime ses objets ; le dernier niveau ne se supprime pas.
- Feuilles : chaque fenêtre désigne le niveau qu'elle montre (PDF compris). DXF : un fichier par niveau — l'export porte sur le niveau actif et le rapport d'échange nomme les niveaux non exportés.

### 8.5 Symboles et bibliothèque bâtiment (règle, lot 4.5)

- Les symboles ont une taille fixe sur le papier, quelle que soit l'échelle de la fenêtre ; à l'écran, une taille constante en pixels :
  - nord : cercle de 6 mm de rayon, flèche pleine et lettre N (3,5 mm), orienté par un angle antihoraire depuis le haut de la feuille ;
  - repère de coupe : trace du plan en trait mixte fin, traits forts (0,7 mm) de 6 mm aux extrémités, flèches pleines vers le sens de la vue (à gauche du trait parcouru, inversable) et repère (A, B… proposé dans l'ordre) de 5 mm à chaque extrémité ;
  - cote de niveau en plan : triangle plein pointe sur le point, trait d'appui et altitude saisie en mètres signés (« +0,15 ») ; la valeur proposée est l'altitude du niveau actif. Elle est saisie, jamais calculée.
- Rotation et symétrie : le nord tourne avec le dessin ; une symétrie inverse le sens de vue d'une coupe. Une homothétie déplace les symboles sans changer leur taille.
- DXF : traits (LINE), cercle (CIRCLE), surfaces pleines (SOLID) et textes (TEXT) à la taille papier de l'échelle de la première fenêtre (1:1 sans feuille) ; le rapport d'échange l'indique.
- Bibliothèque bâtiment : lits, table, WC, lavabo, évier, douche, baignoire, en blocs ordinaires du projet. Leurs dimensions sont des gabarits courants indicatifs, non normatifs, à remplacer par celles du fabricant ; la définition le rappelle.

## 9. Références

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
