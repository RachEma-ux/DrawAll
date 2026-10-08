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

- L'inspecteur donne l'aire et le périmètre des contours fermés (rectangle, cercle, ellipse entière, polyligne fermée), la longueur des objets ouverts ; pour un arc, la longueur, l'aire du secteur et celle du segment (entre l'arc et sa corde).
- L'outil « Aire » mesure un contour désigné par points (souris, doigt ou saisie précise) sans rien créer.
- Un contour qui se recoupe n'a pas d'aire évidente : elle est déclarée « non évaluée » ; le périmètre reste donné.
- Les valeurs suivent l'unité d'affichage (mm², cm², m²) ; le calcul se fait en millimètres à pleine précision. Le référentiel de surfaces métier (SIA 416, loi Carrez…) relève du lot 4.3.

### 1.7 Ellipse (règle, lot 10.1)

- Objet natif : centre, deux demi-axes, direction du premier demi-axe (degrés, repère DXF, sens trigonométrique) ; arc d'ellipse par paramètres de début et de fin (degrés, même sens que les arcs). Aucune approximation n'est stockée.
- Outil « Ellipse » (touche Z) : centre, extrémité du premier axe, puis un point dont la distance au premier axe donne le second demi-axe ; points cliqués, touchés ou saisis.
- Accrochages : centre et extrémités des axes (quadrants) ; pour un arc d'ellipse, extrémités et milieu. Les intersections avec les autres objets passent par une approche à 0,01 mm.
- Périmètre par quadrature (erreur relative < 10⁻⁹) ; aire π·a·b pour une ellipse entière.
- PDF : courbes de Bézier par portions de 45° (écart ≤ 2·10⁻⁵ × demi-axe). Une ellipse n'est pas encore un contour de hachure ; le décalage parallèle d'une ellipse relève du lot 10.4.

### 1.8 Spline (règle, lot 10.2)

- Objet natif : B-spline de degré 1 à 3 (ou plus à l'import) par points de contrôle ; nœuds bornés uniformes par défaut (la courbe passe par le premier et le dernier point) ; nœuds et poids d'un fichier DXF conservés tels quels.
- Outil « Spline » (touche S) : points de contrôle cliqués, touchés ou saisis, puis « Terminer » (Entrée ou double-clic) ; degré 3, ou moins s'il y a moins de quatre points. Aperçu de la courbe et du polygone de contrôle pendant le tracé.
- Les points de contrôle se modifient dans l'inspecteur ; la courbe suit. Déplacer, tourner, symétrie et échelle transforment les points de contrôle : la courbe transformée est exacte.
- Accrochages : extrémités ; plus proche, perpendiculaire et intersections par une approche à 0,01 mm. Longueur par approche à 10⁻⁵ mm.
- Rendu à l'écran et PDF : polyligne à 0,005 mm papier de la courbe. Une spline n'est pas un contour de hachure ; son décalage relève du lot 10.4.

### 1.9 Étirer (règle, lot 10.3)

- Outil « Étirer » (palette et barre d'outils, sans raccourci clavier : toutes les lettres sont prises) : deux coins d'une fenêtre de capture, puis un point de base et un point d'arrivée (cliqués, touchés ou saisis, `@dx;dy` compris). Les sommets capturés sont signalés pendant l'opération.
- Sommets capturés déplacés, les autres fixes : extrémités de ligne, de mur et de repère de coupe ; sommets de polyligne et de cote par points ; points de contrôle de spline.
- Rectangle (il reste aligné sur les axes) : un côté dont les deux coins sont capturés se déplace selon sa normale ; un coin capturé seul entraîne ses deux côtés ; un rectangle qui s'aplatirait n'est pas modifié.
- Cercle, arc, ellipse : déplacés entiers si leur centre est capturé. Texte, bloc, symboles, pièce, note libre : déplacés si leur point d'insertion l'est.
- Les objets associés suivent leur hôte : cotes, ouvertures, vues liées, coupes. Une seule version « Étirer » est créée ; « Annuler » la défait entièrement. Les calques verrouillés et masqués ne sont pas touchés.

### 1.10 Décalage à distance saisie (règle, lot 10.4)

- Outil « Décaler » (palette et barre d'outils) : distance saisie en millimètres dans le panneau de l'outil, puis l'objet, puis un point du côté où poser la copie parallèle. La copie garde le calque, la classification et les propriétés de trait propres de l'objet ; l'outil reste actif pour le décalage suivant.
- Exact : ligne (parallèle à la distance exacte), rectangle et cercle (vers l'extérieur ou l'intérieur selon le point), arc (même ouverture, rayon ± d), polyligne ouverte ou fermée (sommets raccordés en onglet ; côté du segment le plus proche pour une polyligne ouverte, intérieur ou extérieur pour une fermée, quel que soit le sens de parcours).
- Approché : le décalé d'une ellipse ou d'une spline n'est ni une ellipse ni une spline ; il devient une polyligne à 0,01 mm de la courbe décalée, et un message le signale.
- Refusé avec un message : distance nulle, négative ou non numérique ; décalage intérieur plus grand que le rayon ou le demi-côté ; objet non décalable (texte, cote, bloc…). Les recoupements d'une polyligne décalée vers l'intérieur au-delà de ses rayons de courbure ne sont pas nettoyés.
- Les commandes « Décaler la sélection (+10 mm / −10 mm) » de la palette restent disponibles (dilatation rapide).

### 1.11 Groupes (règle, lot 10.5)

- Grouper (Ctrl+G, barre d'édition, palette) : au moins deux objets désignés (et les autres membres de leurs groupes) forment un groupe neuf `GRP-0001`. Dégrouper (Ctrl+Maj+G) dissout les groupes touchés.
- Sur le dessin, désigner un membre désigne tout le groupe (clic, doigt, sélection multiple) : déplacer, copier, tourner, supprimer s'appliquent au groupe. Le navigateur du projet, lui, désigne un membre seul (inspection d'un membre) et affiche le groupe de chaque objet.
- Les copies d'un groupe (dupliquer, coller, réseaux) forment un groupe neuf par copie : elles ne rejoignent jamais le groupe d'origine. Un morceau issu d'« Ajuster » reste dans le groupe de l'objet coupé ; une copie parallèle (« Décaler ») est isolée.
- L'appartenance est enregistrée avec l'objet : historique, paquet natif, annulation. Elle n'est pas exportée en DXF.

### 1.12 Main levée (règle, lot 10.6)

- Outil « Main levée » (niveaux essentiel à complet, palette) : le tracé suit la souris, le stylet ou le doigt tant qu'il est appuyé, sans accrochage ni réticule décalé ; un point est retenu dès que le pointeur a bougé d'un demi-pixel.
- Au relâcher, le tracé est simplifié par l'algorithme de Douglas–Peucker : aucun point du geste ne s'écarte de plus de 1,5 pixel d'écran de la polyligne gardée (tolérance en millimètres = 1,5 px ÷ zoom). Le résultat est une polyligne ordinaire (modifiable, étirable, décalable, exportée en LWPOLYLINE).
- Un geste plus court que 3 pixels ne crée rien ; un calque verrouillé ne reçoit rien.

### 1.13 Contraintes géométriques (règle, lot 12.1)

- Outil « Contrainte » (niveaux contextuel et complet, palette).
  - On choisit le type, puis on désigne les éléments.
  - Un sommet, une extrémité de ligne ou un centre est retenu en priorité. Sinon c'est un segment (ligne ou côté de polyligne), sinon un cercle ou un arc.
  - Types :
    - coïncidence : deux points ;
    - horizontale, verticale : un segment ;
    - parallèle, perpendiculaire, égalité de longueur : deux segments ;
    - distance : deux points ;
    - longueur : un segment ;
    - rayon : un cercle ou un arc ;
    - tangence : un segment puis un cercle ;
    - fixe : un point, tenu à sa position au moment de la contrainte.
  - Les contraintes cotées prennent la valeur saisie, sinon la mesure actuelle. La valeur se modifie ensuite dans la liste du panneau.
- **Solveur** : celui écrit pour DrawAll (note de décision P0, lot 11.5).
  - Toute modification des objets ou des contraintes re-résout.
  - Les points que l'on vient de déplacer sont tenus. Si c'est impossible, la forme est ramenée au plus près de la modification.
- **Conflit** (aucune solution).
  - Le dessin reste tel que l'utilisateur l'a laissé.
  - Le panneau nomme les contraintes en cause : pour chaque conflit, celles dont le retrait le lève, plusieurs conflits indépendants compris. La barre d'état l'indique.
  - Les symboles des contraintes en conflit sont en rouge.
- **Sur-contrainte cohérente** : la contrainte qui n'ajoute rien est signalée « redondante » (symbole gris) ; elle n'empêche rien.
- **Sommets de polyligne.**
  - Contraindre une polyligne donne à chacun de ses sommets un identifiant permanent.
  - Une opération qui change le nombre de sommets (par exemple « Ajuster » sur une polyligne) rend les contraintes qui la visent « à réparer » (symbole orange) : elles ne sont jamais reportées sur un autre sommet.
  - Une contrainte dont un objet est supprimé part avec lui.
- Le panneau affiche les degrés de liberté restants (0 : entièrement contraint).
- Les contraintes sont enregistrées avec la version (historique, annulation, paquet natif). Elles ne sont pas exportées en DXF.
- Non couvert à ce lot : les extrémités d'arc (seuls le centre et le rayon), les ellipses, les splines et les rectangles (convertir en polyligne pour les contraindre).

### 1.14 Paramètres nommés et cotes pilotantes (règle, lot 12.2)

- **Table des paramètres** (palette « Paramètres du projet », ou bouton « Paramètres… » du panneau des contraintes) : nom, expression, unité (mm, °, ou sans unité) et valeur calculée.
  - Nom : une lettre, puis des lettres, des chiffres ou `_`. Les noms de fonctions et `pi` sont exclus, et un nom ne sert qu'une fois.
  - Expressions : nombres (virgule ou point décimal), noms de paramètres, `+ − * / ^`, parenthèses, `racine`, `abs`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan` (en degrés), `min`, `max`, `arrondi`, `pi`. Les arguments sont séparés par `;`.
  - L'évaluateur est écrit pour DrawAll (analyse descendante) : aucun texte n'est exécuté comme du code.
- **Refus.** Une saisie qui créerait une référence circulaire (le cycle est nommé, par exemple « L → H → L »), un nom inconnu, une erreur de syntaxe ou une cote non positive est refusée avec sa raison ; l'ancienne expression reste. Un paramètre cité par un autre paramètre ou par une cote ne se retire pas.
- **Cotes pilotantes.**
  - La valeur d'une contrainte cotée (distance, longueur, rayon) peut être une expression de paramètres, saisie à la création ou dans la liste des contraintes.
  - Le symbole affiche l'expression et sa valeur (par exemple « L L = 1000 »).
  - Changer un paramètre recalcule les cotes qui le citent, puis re-résout la géométrie.
  - Saisir un nombre à la place d'une expression rompt le lien.
- Paramètres et expressions sont enregistrés avec la version (historique, annulation, paquet natif).

### 1.15 Propriétés et classification IFC (règle, lot 12.3)

- **Classe IFC 4.3.**
  - Chaque objet a une classe par défaut selon son type : mur → `IfcWall`, porte → `IfcDoor`, fenêtre → `IfcWindow`, pièce → `IfcSpace`, occurrence de bloc → `IfcBuildingElementProxy`. La géométrie de dessin et les annotations sont des `IfcAnnotation`.
  - L'inspecteur permet d'en choisir une autre parmi les entités proposées, toutes des entités réelles d'IFC 4.3. Une classe inconnue est écartée à la relecture.
- **Jeux de propriétés.**
  - Chaque objet peut porter des jeux nommés. Le nom usuel `Pset_<Classe>Common` est proposé, sans contenu imposé : DrawAll n'invente aucune propriété normalisée.
  - Chaque propriété a un nom, une valeur typée (texte, nombre, vrai/faux) et une unité facultative (mm, m, m², m³, kg, °, %, W/(m²·K), dB, h).
  - Une valeur qui ne correspond pas à son type est refusée avec sa raison. Un nom déjà pris remplace la valeur.
- La classification métier (architecture, structure, mécanique, électrique) reste distincte : elle choisit la lecture et la couleur ; la classe IFC sert aux échanges (export IFC, lot 17.1).
- Classe et propriétés sont enregistrées avec l'objet : historique, paquet natif (aller-retour octet pour octet), annulation.

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
- **Export SVG** (lot 6.4) : SVG autonome aux dimensions exactes de la feuille (largeur et hauteur en mm, viewBox en mm papier), fenêtres découpées à leur échelle et dessinées comme à l'écran (tailles papier des annotations, motifs, murs, symboles), cartouche ; monochrome sur fond blanc comme le PDF ; les fonds de plan ne sont pas exportés. L'intégration continue relit les SVG en XML strict et contrôle leurs dimensions (format ISO 216).

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

### 6.3 Nomenclature et repères (règle, lot 5.4)

- Une pièce est une occurrence de bloc (désignation = nom du bloc, sauf désignation propre) ou un contour fermé qui porte une désignation de pièce. Un objet sans désignation n'est pas une pièce ; rien n'est déduit ni inventé.
- Nomenclature (ISO 7573) : une ligne par couple désignation + matériau, avec repère, désignation, matériau (« — » s'il n'est pas renseigné) et quantité (nombre d'occurrences). Les lignes sont numérotées dans l'ordre d'apparition des pièces : ajouter une pièce ajoute une ligne en fin de tableau et ne renumérote aucune ligne existante.
- Tableau à taille papier fixe (colonnes de 14, 60, 40 et 14 mm, lignes de 7 mm, écriture de 3,5 mm), calculé depuis les pièces du niveau : il se met à jour à chaque modification. L'ordre ISO 7573 (lignes numérotées de bas en haut au-dessus du cartouche) reste à appliquer sur les feuilles.
- Repère (ISO 6433) : bulle de 10 mm de diamètre portant le numéro de la ligne, ligne de repère jusqu'au centre de l'emprise de la pièce, terminée par un point. La bulle se déplace librement ; elle part avec sa pièce.
- Échanges : DXF en traits, cercles, surfaces pleines (SOLID) et textes figés (les numéros et quantités ne sont plus recalculés) ; PDF à la taille papier.

## 7. Échanges DXF

### 7.1 Règles

- Export au format **DXF R2000 (AC1015)**, unité déclarée millimètre (`$INSUNITS = 4`), lisible par les lecteurs stricts (vérifié avec ezdxf à chaque intégration continue).
- Import des entités LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, MTEXT, INSERT (blocs, imbrications comprises), DIMENSION (géométrie), HATCH, SPLINE et ELLIPSE (lot 6.1), y compris les segments courbes (`bulge`) et les entités en repère symétrique (extrusion 0,0,−1). Une entité d'un bloc posée sur le calque 0 prend le calque de l'occurrence.
- Courbes approchées (spline sans points de contrôle, arêtes d'ellipse et de spline de contour de hachure, arcs de contour de hachure, courbures) : écart de corde ≤ 0,05 mm par subdivision adaptative ; l'écart maximal effectif est annoncé dans le rapport.
- Jeu de fichiers de référence de l'import : `src/lib/__fixtures__/dxf/` (écrit par ezdxf, `scripts/make-dxf-fixtures.py`), relu par les tests à chaque intégration.
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
| Hachure | Conservée (HATCH : contour polyligne ou arêtes ligne / arc / ellipse / spline, îlots ; arcs et arcs d'ellipse parcourus dans le sens horaire lus en angles complémentaires (360 − angle), comme AutoCAD ; splines rationnelles avec leurs poids ; aplat SOLID ; traits parallèles ou croisés à l'angle et au pas de la première famille, motif prédéfini simplifié et signalé ; dans un bloc éclaté, angle, pas et origine suivent la transformation) | Conservée (HATCH _USER ou SOLID : angle, pas, origine, îlots) |
| Cote | Transformée (DIMENSION : géométrie de son bloc — traits, flèches, texte ; non associative) | Transformée en traits + texte ; association perdue |
| Occurrence de bloc | Conservée si simple (INSERT sans rotation, échelle uniforme positive, bloc de traits, cercles, arcs, polylignes sans style propre, tous sur le calque de l'occurrence) ; sinon éclatée (rotation, échelle non uniforme, symétrie, imbrication, textes ou hachures dans le bloc, couleur, type ou épaisseur de trait propres, autre calque que celui de l'occurrence) ; MINSERT : première occurrence seulement (signalé) | Éclatée en entités simples |
| Spline | Conservée (SPLINE natif, lot 10.2 : degré, points de contrôle, nœuds et poids, B-spline rationnelle comprise) ; spline définie par ses seuls points d'ajustement : points reliés en polyligne (signalé) | Conservée (SPLINE : degré, nœuds, poids si rationnelle, points de contrôle ; relue par ezdxf, points vérifiés à 10⁻³ mm) |
| Ellipse | Conservée (ELLIPSE natif, lot 10.1 : centre, demi-axes, rotation, arc d'ellipse ; cercle ou arc exacts si circulaire) | Conservée (ELLIPSE : grand axe, rapport, paramètres en radians à 10⁻¹² ; relue par ezdxf, points vérifiés à 10⁻³ mm) |
| Calques | Nom, couleur, type et épaisseur de trait conservés | Nom, couleur, type et épaisseur de trait, visibilité, verrouillage |
| Propriétés de trait d'un objet | Conservées (types usuels reconnus, ACI 1–9) | Conservées (6, 370, 420 ; BYLAYER sinon) |
| Identifiants, classification, historique | — | Perdus (non représentables en DXF) |
| Texte sur une ligne | Conservé (TEXT : contenu, hauteur, rotation, alignement ; %%c %%d %%p décodés) | Conservé (TEXT) |
| Texte sur plusieurs lignes | Conservé (MTEXT : mise en forme simplifiée en texte brut) | Conservé (MTEXT, point d'attache en haut) |
| Autres entités (POINT, SOLID, 3DFACE, ATTRIB, POLYLINE ancienne…) | Ignorées et signalées | — |
| Fichier DWG | Reconnu à sa signature (version AutoCAD) et refusé avec la marche à suivre (enregistrer en DXF) : convertisseur à décider (feuille de route §7, lot 6.3) | — |

### 7.3 Fond de plan (règle, lot 6.2)

- Une image (PNG, JPEG…) ou la première page d'un PDF se place sous le dessin comme fond de plan. L'image est conservée une seule fois dans le projet (hors historique), réduite à 4 096 px de côté et à environ 2 Mo pour le stockage local ; l'ensemble des fonds d'un projet est borné (environ 3,5 Mo) : une image est encore réduite (qualité, puis taille) pour tenir dans la place restante, ou refusée avec un message si elle n'y tient pas. Un enregistrement local impossible (stockage du navigateur plein) est signalé à l'écran. Un fond de plan ne se prend pas par fenêtre de sélection.
- Taille de départ :
  - une page PDF prend sa taille réelle (points PDF → mm) ;
  - une image, celle de ses pixels à 96 ppp, sans échelle connue.
  - Dans les deux cas, l'échelle se fixe par calage.
- Calage par deux points : l'outil « Caler le fond » prend deux points de l'image, sans accrochage, et la distance réelle qui les sépare (dans l'unité d'affichage). Le fond est mis à l'échelle autour du premier point, en gardant ses proportions. Recette : distance mesurée sur le fond = distance réelle ± 0,5 %.
- Le fond est dessiné sous tous les objets, avec une opacité réglable (60 % par défaut). Il ne participe ni à l'accrochage ni aux sélections par fenêtre. Il ne se désigne qu'en l'absence de tout objet au point touché.
- Verrouillé, il n'est ni désignable sur le canevas ni déplaçable ; il se déverrouille depuis le navigateur et l'inspecteur.
- Échanges :
  - le fond de plan est une référence de travail : il n'est exporté ni en PDF ni en DXF, et le rapport DXF le signale ;
  - le paquet du projet contient les images.

### 7.4 À décider

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

### 8.6 Dalles et planchers (règle, lot 13.1)

- **Outil « Dalle »** (niveaux contextuel et complet, palette), deux modes :
  - **Depuis une pièce** : toucher l'intérieur d'une pièce reprend son contour intérieur des murs. Le contour est copié, non associatif, et la pièce d'origine est notée (`roomId`). Hors de toute pièce, rien n'est créé et la raison est donnée.
  - **Contour point par point**, puis Terminer : contour fermé d'au moins trois sommets et d'aire non nulle. Un dernier point qui répète le premier est retiré.
- **Épaisseur** : elle est saisie dans le panneau de l'outil (200 mm proposés) et modifiable dans l'inspecteur. La dalle est rattachée au niveau actif ; son dessus est à l'altitude de ce niveau.
- **Quantités** (inspecteur) : surface du contour (m², deux décimales) et volume = surface × épaisseur (m³, trois décimales). Elles sont calculées sur le contour tel quel, sans déduction de trémies ni de jonctions avec les murs.
- **Représentation.**
  - En plan, la dalle est dessinée par son contour fermé (hachurable). Ses sommets et milieux de côtés sont accrochables. Elle se déplace, s'étire, tourne et se met à l'échelle comme une polyligne.
  - Export DXF : LWPOLYLINE fermée.
  - Classe IFC par défaut : `IfcSlab`.

### 8.7 Toitures (règle, lot 13.2)

- **Outil « Toiture »** (niveaux contextuel et complet, palette) : deux coins opposés du contour rectangulaire (nu extérieur des murs), à la souris, au doigt ou au clavier.
  - Type : un, deux ou quatre pans de même pente.
  - Pente en degrés (0 < pente < 90).
  - Débord sur tout le pourtour (mm, ≥ 0).
  - Axe : faîtage horizontal ou vertical (deux pans) ; rive haute horizontale ou verticale et son côté (un pan). Quatre pans : faîtage selon le grand côté, pyramide sur un carré.
  - Tous ces paramètres restent modifiables dans l'inspecteur. Les valeurs proposées (30°, 0 mm) ne sont qu'un point de départ.
- **Grandeurs de référence** (inspecteur). Elles dérivent du seul contour, de la pente et du débord, sans épaisseur de couverture ni de charpente.
  - Hauteur du faîtage au-dessus de l'égout : demi-portée × tan(pente), débord compris. Pour un pan unique : portée × tan(pente).
  - Même hauteur prise au droit du contour (arase).
  - Longueur du faîtage.
  - Longueur vraie des arêtiers : √(2 × demi-portée² + hauteur²).
  - Surface des pans en vraie grandeur : emprise ÷ cos(pente).
- **Plan.**
  - Rive en trait continu ; faîtage et arêtiers en traits ; flèches de pente du haut vers le bas de chaque pan.
  - Export DXF : LWPOLYLINE pour la rive, LINE pour les autres traits ; même dessin dans le PDF.
  - Coins de rive et extrémités du faîtage accrochables.
  - La toiture se déplace, s'étire par son contour, se met à l'échelle (débord compris) et tourne par quarts de tour ; l'axe et la rive haute suivent, y compris dans une symétrie.
  - Classe IFC par défaut : `IfcRoof`.

### 8.8 Zones (règle, lot 13.3)

- Une zone regroupe des pièces sous un nom et une couleur (#rrggbb). Une pièce appartient à une zone au plus ; l'appartenance est enregistrée avec la pièce.
- **Panneau « Zones »** (palette, ou bouton « Gérer les zones… » de l'inspecteur d'une pièce) :
  - créer une zone, avec les pièces sélectionnées s'il y en a ;
  - renommer, changer la couleur, supprimer une zone (ses pièces restent, sans zone) ;
  - retirer une pièce de la zone.
  - L'inspecteur d'une pièce permet aussi de choisir sa zone.
- **Surface cumulée** : somme exacte des surfaces des pièces de la zone, chacune au contour intérieur des murs (§8.3), affichée au centième de m². Une pièce non fermée est « non évaluée » : elle n'entre pas dans la somme, qui s'affiche alors précédée de « au moins ».
- **Plan** : les pièces d'une zone sont remplies de sa couleur, translucide.
- Zones et appartenances sont enregistrées avec la version (historique, annulation, paquet natif).

## 9. Terrain et mobile

### 9.1 Réticule décalé et loupe (règle, lot 7.1)

- Sur petit écran, les outils fréquents (sélection, ligne, rectangle, cercle, polyligne, « Plus ») sont dans une barre en bas, à portée du pouce.
- Le bouton ⌖ « Réticule décalé » (préférence du navigateur, désactivé par défaut) change le geste au doigt pour tous les outils de dessin et de désignation, sauf sélection et panoramique :
  - au doigt seulement (un stylet pointe directement), le point visé est à 80 px au-dessus du doigt, marqué d’une croix ;
  - une loupe (grossissement 3) le montre agrandi, au-dessus du point ou à côté près du bord, toujours entière dans la zone ;
  - l'accrochage habituel s'applique au point visé ;
  - le point est posé au lever du doigt ; les outils à glisser (ligne, rectangle, cercle, mesure) prennent leurs deux points en deux appuis ;
  - un second doigt annule l'appui en cours et zoome.
- Recette : un sommet pointé au doigt est pris à ±1 px écran.

### 9.2 Hors ligne (règle, lot 7.2)

- L'application construite installe un service worker : dès la première visite, la page et les fichiers qu'elle charge sont mis en cache ensemble ; les pages sont ensuite servies par le réseau d'abord (seule une page réussie remplace la copie) et, sans réseau, par la copie ; l'API n'est jamais mise en cache.
- Le projet est enregistré à chaque modification dans le stockage local du navigateur (copie lue en premier) et dans IndexedDB (plus de place).
- Reprise : au démarrage, la copie IndexedDB remplace l'état lu dans le stockage local quand celui-ci n'a pas de projet, ou quand son dernier enregistrement n'a pas atteint le stockage local (plein) et qu'elle est plus récente que le dernier enregistrement local réussi (daté) : une copie ancienne ne fait jamais revenir en arrière. Rien n'est enregistré avant cette vérification.
- Alertes : « Hors ligne — travail conservé sur l'appareil » tant que le réseau manque ; « Stockage de l'appareil presque plein » au-delà de 90 % du quota estimé ; alerte rouge si aucun des deux stockages n'a pu enregistrer.
- Recette : dessiner hors ligne, recharger, retrouver ; enregistrement manqué par le stockage local repris d'IndexedDB.

### 9.3 Photos et notes (règle, lot 7.3)

- Outil « Note » (U) : toucher un objet y joint la note (le point noté suit l'objet quand il est déplacé, tourné, symétrisé, mis à l'échelle ou copié en réseau ; la note est copiée et supprimée avec lui) ; toucher ailleurs la pose sur le point. Le texte est saisi à la création et modifiable dans l'inspecteur ; la note est datée.
- Photos : jointes depuis l'inspecteur (appareil photo du téléphone ou fichier), réduites à 1 600 px de côté et encodées dans la place restante du stockage du projet (même budget que les fonds de plan, §7.3). Supprimer une photo la retire du projet et de tout son historique (après confirmation) : la place est libérée, l'annulation ne la fait pas revenir.
- Sur le plan : repère à taille d'écran fixe (crayon, ou pastille si une photo est jointe), désignable avant les objets qu'il recouvre.
- Les notes ne sont ni dessinées sur les feuilles ni exportées (PDF, SVG, DXF) ; le rapport DXF les compte ; elles sont conservées dans le projet et son paquet.

## 10. Fiabilité

### 10.1 Historique compact (règle, lot 8.1)

- Chaque modification crée une microversion. En mémoire, les versions partagent les objets inchangés (aucune copie complète).
- Enregistrement (stockage local, IndexedDB, serveur) par différences : la première version et la version courante sont écrites en entier ; chaque autre version ne porte que ce qui change par rapport à la précédente (objets ajoutés ou modifiés, identifiants retirés, ordre s'il change, autres champs remplacés s'ils changent). Un projet enregistré en versions entières (avant ce lot) se relit tel quel.
- Preuve : 1 000 modifications d'un projet de 200 objets tiennent en moins de 2 Mo ; l'aller-retour reconstruit chaque version à l'identique.

### 10.2 Paquet natif (règle, lot 8.2)

- « Exporter le paquet » écrit le projet entier dans un fichier JSON : manifeste (`drawall-package`, version 1.0.0, unités en millimètres), résumé, et le projet (historique par différences §10.1, objets de tous les niveaux, calques, blocs, feuilles et cartouches, profils et règles de chaque version, compteurs, ressources : fonds de plan et photos).
- Le fichier est écrit aux clés triées et ne contient pas de date d'export : exporter, restaurer, réexporter donne le même fichier octet pour octet.
- « Restaurer » relit un paquet 1.x (ou un paquet prototype 0.1, sans historique) et remplace le projet courant après confirmation ; un fichier qui n'est pas un paquet DrawAll, ou d'une version non prise en charge, est refusé avec un message.

### 10.3 Sécurité de la connexion (règle, lot 8.3)

- La connexion part du serveur (`/api/oauth/login`) : il tire un `state` aléatoire (256 bits), le garde dans un cookie httpOnly limité au chemin OAuth et à dix minutes, et redirige vers l'autorisation avec l'adresse de retour qu'il calcule lui-même.
- Au retour (`/api/oauth/callback`), le `state` reçu doit être celui du cookie (comparaison en temps constant, usage unique : le cookie est effacé) ; sinon la connexion est refusée (« Connexion expirée ou non initiée par ce navigateur »). L'adresse de retour n'est jamais lue dans le `state`.
- La vérification du `state` précède aussi le traitement d'une réponse d'erreur du fournisseur (refus, `access_denied`) : une erreur non sollicitée est refusée, et le cookie est effacé dans tous les cas.
- Session de sept jours (cookie et jeton ; un an auparavant), puis nouvelle connexion. Le serveur refuse tout jeton émis depuis plus de sept jours, même s'il porte une expiration plus lointaine : les sessions d'un an déjà ouvertes avant ce lot expirent ainsi au plus tard sept jours après leur émission.

### 10.4 Partage et commentaires (règle, lot 8.4)

- Trois droits sur un projet cloud : **propriétaire** (tout : enregistrer, partager, renommer, supprimer), **écriture** (ouvrir, enregistrer, commenter, résoudre), **lecture** (ouvrir et commenter). Le serveur vérifie le droit à chaque appel ; un projet sans accès est « introuvable » (son existence n'est pas révélée), un droit insuffisant est « interdit ».
- Le propriétaire partage par lien (`/?partage=JETON`) en lecture ou en écriture : jeton aléatoire de 192 bits, valable sept jours, à usage unique (un lien par personne invitée ; consommé à l'acceptation, il ne rend pas l'accès à un membre retiré). L'invité qui l'ouvre devient membre une fois connecté (le jeton est gardé pour l'onglet le temps de la connexion, et tant qu'une panne empêche de l'accepter) ; un lien en écriture relève un droit en lecture, jamais l'inverse. Le propriétaire change ou retire un droit ; un membre peut quitter le projet.
- En lecture, la synchronisation est refusée ; « Enregistrer comme nouveau » crée une copie dont le compte est propriétaire. En écriture, les enregistrements concurrents restent arbitrés par la révision (§ conflits) : rien n'est écrasé.
- Les commentaires sont ancrés sur un objet (identifiant `OBJ-…`), stockés côté serveur (hors du dessin et de ses exports), visibles de tous les membres dans l'inspecteur. Un commentaire est résolu ou rouvert par son auteur ou par un droit d'écriture.

## 11. Références

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
