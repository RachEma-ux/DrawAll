# DrawAll — Feuille de route vers une application de dessin universelle

Ce document est la **référence unique** du travail à faire. Chaque modification du code se rattache à un lot ci-dessous ; un lot n'est « fait » que lorsque sa définition de fini est remplie. Le tableau d'avancement (§5) est mis à jour à chaque fusion.

Documents liés : [Concept V4.1](DrawAll_v4.1_Concept.md) · [Architecture V4.1](DrawAll_v4.1_Architecture.md) · [Exigences V4.1](DrawAll_v4.1_Exigences_Sources.md) · [Conventions de dessin](DrawAll_v4.1_Conventions_Dessin.md).

## 1. Objectif

Un dessinateur bâtiment **et** un dessinateur industriel doivent pouvoir, dans DrawAll, sur ordinateur comme sur tablette ou téléphone :

1. **Dessiner du réel** : géométrie précise, texte, arcs, modifications courantes.
2. **Produire un document livrable** : feuille à l'échelle, cartouche, cotes, traits et hachures normalisés, PDF calibré.
3. **Échanger** : reprendre un DXF client et rendre un DXF/PDF fidèles, avec un rapport des pertes.
4. **Travailler en contexte métier** : murs, ouvertures, surfaces, niveaux (bâtiment) ; tolérances, vues, coupes, nomenclature (industrie).
5. **Travailler sur le terrain et en équipe** : mobile, hors ligne, versions, partage.

Le parcours de preuve qui clôt la feuille de route (§6) vérifie ces cinq points sur un projet mixte.

## 2. Règles de découpage

- **Un lot = une demande de fusion**, petite, livrable seule, sans casser l'existant.
- Chaque lot a une **définition de fini** :
  1. critères d'acceptation chiffrés ou observables, écrits avant le code ;
  2. tests unitaires (Vitest) pour la logique pure ;
  3. recette navigateur automatisée (Playwright) pour le geste utilisateur, sur ordinateur et téléphone, dès le lot 1.0 ;
  4. contrôle continu vert (types, lint, tests, recette, build, lecture DXF par ezdxf) ;
  5. documentation mise à jour (conventions, matrice d'échange, README si besoin) ;
  6. déploiement de démonstration après fusion.
- Ordre : on termine un jalon avant d'ouvrir le suivant, sauf correctifs.
- Les **décisions du maître d'ouvrage** (§7) bloquent seulement les lots qui en dépendent ; une valeur par défaut documentée est utilisée en attendant et signalée.

## 3. Jalons

| Jalon | But | Résultat vérifiable |
| --- | --- | --- |
| J0 — Fondations | Mesures justes, échanges fiables, interface mobile | Fait (PR #3, #4, #5) |
| J1 — Socle d'édition 2D | Pouvoir dessiner du réel | Un plan de pièce et une platine percée se dessinent sans contournement |
| J2 — Production de documents | Pouvoir livrer | Une feuille A3 au 1:50 et un détail 1:1 sortent en PDF aux bonnes dimensions |
| J3 — Matériaux et conventions graphiques | Lisibilité normalisée | Traits ISO 128-2, hachures paramétrées par matériau, coupe ≠ surface |
| J4 — Métier bâtiment | Plans d'architecture | Logement 2 pièces avec murs, ouvertures, surfaces et niveau |
| J5 — Métier industrie | Plans de définition | Platine avec tolérances, 3 vues alignées, coupe et nomenclature |
| J6 — Échanges étendus | Reprendre l'existant | DXF client complet (textes, blocs, cotes, hachures), fond de plan PDF/image calé |
| J7 — Terrain et mobile | Relevé sur chantier | Relevé au doigt hors ligne avec photos jointes |
| J8 — Collaboration et fiabilité | Travail d'équipe | Projet partagé, commenté, versionné, restaurable depuis le paquet natif |
| J9 — 3D (P2) | Volumes et B-Rep | Remplacé par J11 (faisabilité) puis J15–J17 (seconde feuille de route, §4 bis) |
| J10 — Compléments 2D | Finir le socle 2D (indépendant de P0) | Ellipse, spline, étirer, décalage saisi, groupes, main levée |
| J11 — Faisabilité (P0) | Valider les choix techniques avant P1 | Solveur, noyau, références topologiques, import, mémoire : note de décision |
| J12 — Contraintes et paramètres | Dessin piloté | Un rectangle contraint suit son paramètre nommé ; sur-contrainte signalée |
| J13 — Bâtiment complété | Plans d'architecture complets | Dalles, toitures, zones, poteaux et poutres, tableaux de quantités |
| J14 — Versions et coordination | Maîtrise des modifications | Branche, fusion avec conflits, analyse d'impact, publication figée |
| J15 — Solides et vue 3D | Modélisation volumique P1 | Extrusion, révolution, balayage, lissage, coque, pousser/tirer, booléens, vue WebGL2 |
| J16 — Vues, pièces et assemblages | Une géométrie, plusieurs lectures | Vues projetées, façades générées, assemblage et nomenclature |
| J17 — Échanges 3D et BIM | Ouverture contrôlée | IFC 4.3 et STEP AP242 Éd. 3 relus par des outils tiers, géoréférencement |
| J18 — Automatisation | Commandes communes | API de commandes journalisée, scripts isolés, assistant à boucle contrôlée |
| J19 — Démonstrateur réduit | Preuve bâtiment–mécanique | Modification suivie jusqu'au dossier publié (sans le volet électrique du Concept §10) |

## 4. Lots

Format : **identifiant — titre** · *critères d'acceptation* · *preuve*.

### J1 — Socle d'édition 2D

- **1.0 — Recette navigateur automatisée.** Playwright dans le dépôt et le contrôle continu ; scénarios ordinateur (1 440 px) et téléphone (Pixel 7) : chargement sans erreur, tracé à la souris et au doigt, pincement, navigateur pliable. *Preuve : `npm run e2e` vert localement et en CI.*
- **1.1 — Cadrage et ergonomie mobile.** « Cadrer » (anciennement « Ajuster ») ne cadre que les objets visibles ; sur téléphone, le navigateur déplié passe par-dessus le canevas au lieu de l'écraser ; outils fréquents toujours visibles, les autres dans « Plus ». *Preuve : recette — zoom initial ≥ 25 % sur le projet de démonstration avec un calque masqué ; canevas ≥ 90 % de la largeur avec le navigateur déplié.*
- **1.2 — Texte.** Objet texte (contenu, hauteur, rotation, alignement), outil de pose, édition dans l'inspecteur, accrochage au point d'insertion, export DXF `TEXT`, import `TEXT`/`MTEXT`. *Preuve : tests unitaires DXF aller-retour ; recette — poser « Séjour 24,5 m² » et le relire après rechargement.*
- **1.3 — Arc.** Objet arc natif (centre, rayon, angles) ; outils 3 points et centre-début-fin ; accrochages extrémités/milieu/centre ; DXF `ARC` natif à l'import et à l'export (plus d'approximation pour les arcs simples). *Preuve : tests géométriques (longueur, milieu, boîte englobante) ; DXF relu par ezdxf.*
- **1.4 — Ajuster et prolonger.** Couper une ligne/polyligne/arc à une arête, prolonger jusqu'à une arête. *Preuve : tests d'intersection (cas parallèles, hors segment, multiples) ; recette au doigt et à la souris.*
- **1.5 — Congé et chanfrein.** Entre deux lignes sécantes, rayon ou distances saisis. *Preuve : tests (tangence à 10⁻⁶ mm, rayon trop grand refusé avec message).*
- **1.6 — Copier, coller, réseaux.** Presse-papiers interne, copie multiple, réseau rectangulaire (n × m, pas) et polaire (n, angle). *Preuve : tests d'identifiants (aucun doublon) et de positions.*
- **1.7 — Saisie précise.** Coordonnées relatives `@dx;dy` et polaires `@L<angle`, grille réglable, unité d'affichage (mm, cm, m) sans changer l'unité interne. *Preuve : tests du parseur de saisie ; recette « mur de 5 m puis 3 m à 90° ».*
- **1.8 — Accrochages complémentaires.** Perpendiculaire, tangent, le plus proche ; activation par type. *Preuve : tests unitaires par type d'accrochage.*
- **1.9 — Propriétés de trait.** Couleur, épaisseur et type de trait par calque et par objet (« du calque » par défaut), types ISO 128-2 (continu, interrompu, mixte, mixte double). *Preuve : rendu vérifié en recette ; export DXF des types de ligne relu par ezdxf.*
- **1.10 — Mesure d'aire et de périmètre.** Sur contours fermés et par points. *Preuve : tests (polygone concave, cercle, arc).*

### J2 — Production de documents

- **2.1 — Modèle feuille / fenêtre.** Données : feuille (format, orientation, marges), fenêtre (vue source, échelle, cadrage, calques visibles). Le modèle n'est jamais modifié par l'échelle. *Preuve : tests — 5 000 mm au 1:50 = 100 mm papier ; au 1:100 = 50 mm.*
- **2.2 — Éditeur de feuille.** Mode « Feuille » : A4–A0 portrait/paysage, cadre, placement et redimensionnement des fenêtres. *Preuve : recette — deux fenêtres 1:50 et 1:5 sur une A3.*
- **2.3 — Cartouche.** Modèle de cartouche (projet, titre, échelle, date, indice, auteur, méthode de projection), champs liés au projet et à la version. *Preuve : l'indice suit la version nommée.*
- **2.4 — Styles d'annotation papier.** Hauteur de texte, flèches et épaisseurs exprimées en mm papier et identiques quelle que soit l'échelle de la fenêtre. *Preuve : tests de conversion papier ↔ modèle.*
- **2.5 — Export PDF calibré et impression.** PDF vectoriel aux dimensions exactes de la feuille. *Preuve : un trait de 100 mm papier mesure 100 ± 0,1 mm dans le PDF (lecture du PDF en test).*
- **2.6 — Cotes avancées.** Chaînée, cumulée, angulaire, rayon/diamètre, niveau. *Preuve : tests de valeurs et de géométrie.*

### J3 — Matériaux et conventions graphiques

- **3.1 — Bibliothèque de matériaux et profils de dessin.** Matériau ≠ motif ; profils versionnés et sourcés (décision §7). *Preuve : changer de profil change l'apparence, jamais le matériau.*
- **3.2 — Hachures paramétrées.** Angle, pas, origine, pas papier ou modèle, contours avec trous, export `HATCH` fidèle. *Preuve : tests de génération ; ezdxf.*
- **3.3 — Contexte coupe / surface.** Un même objet se hache en coupe et s'affiche autrement en vue ; pièces voisines alternées. *Preuve : recette sur un assemblage de deux pièces.*

### J4 — Métier bâtiment

- **4.1 — Murs.** Épaisseur, axe/nu, jonctions en L, T et croix nettoyées. *Preuve : tests de jonction.*
- **4.2 — Ouvertures.** Portes et fenêtres hébergées par un mur (largeur, sens d'ouverture), déplacées avec lui. *Preuve : déplacer le mur déplace la porte.*
- **4.3 — Pièces et surfaces.** Détection des pièces, étiquette nom + surface (SIA 416 / loi Carrez selon le profil). *Preuve : surfaces de référence à 0,01 m².*
- **4.4 — Niveaux.** Étages avec altitude, calques par niveau, copie de niveau. *Preuve : recette deux niveaux.*
- **4.5 — Symboles.** Nord, repères de coupe, cotes de niveau, bibliothèque de blocs bâtiment. *Preuve : export DXF.*

### J5 — Métier industrie

- **5.1 — Tolérances.** Tolérances ±, ajustements ISO 286 (H7/g6…), état de surface. *Preuve : tests des écarts ISO 286 sur un échantillon de cotes.*
- **5.2 — Vues alignées.** Face/dessus/côté liées, méthode de projection (premier/troisième dièdre). *Preuve : modifier la face met à jour les autres vues.*
- **5.3 — Coupes.** Plan de coupe, vue en coupe hachurée automatiquement. *Preuve : recette sur la platine percée.*
- **5.4 — Nomenclature.** Repères et tableau (repère, désignation, matériau, quantité) liés aux objets. *Preuve : ajouter une pièce met à jour la nomenclature.*

### J6 — Échanges étendus

- **6.1 — DXF complet à l'import.** `TEXT`/`MTEXT`, `INSERT`/`BLOCKS`, `DIMENSION` (géométrie), `HATCH`, `SPLINE` (approchée), `ELLIPSE`. *Preuve : jeu de fichiers de référence, matrice d'échange à jour.*
- **6.2 — Fond de plan.** Image ou PDF importé, calé par deux points et une distance connue, verrouillable. *Preuve : distance mesurée sur le fond = distance réelle ± 0,5 %.*
- **6.3 — DWG.** Lecture via un convertisseur (décision §7). *Preuve : fichier DWG de référence ouvert.*
- **6.4 — Export SVG.** *Preuve : SVG valide aux dimensions de la feuille.*

### J7 — Terrain et mobile

- **7.1 — Loupe et réticule décalé** au doigt, outils fréquents en barre basse. *Preuve : recette téléphone — pointer un sommet à ±1 px écran.*
- **7.2 — Hors ligne.** Service worker, stockage IndexedDB, alerte de quota, reprise. *Preuve : recette — dessiner hors ligne, recharger, retrouver.*
- **7.3 — Photos et notes.** Joindre photo ou note à un objet ou un point. *Preuve : recette.*

### J8 — Collaboration et fiabilité

- **8.1 — Historique compact.** Versions par différences, plus de copie complète à chaque modification. *Preuve : 1 000 modifications < 2 Mo.*
- **8.2 — Paquet natif.** Export/import aller-retour complet (objets, versions, feuilles, styles). *Preuve : test aller-retour octet pour octet sur le modèle.*
- **8.3 — Sécurité de la connexion.** `state` OAuth aléatoire vérifié, durée de session réduite. *Preuve : tests du gestionnaire de rappel.*
- **8.4 — Partage et commentaires.** Projet partagé en lecture/écriture, commentaires ancrés sur un objet. *Preuve : recette à deux comptes.*

## 4 bis. Seconde feuille de route — vers le socle universel (P0–P1 du Concept)

Établie après la clôture de J0–J8. Elle couvre la faisabilité (P0) et ce qui manque à l'étape P1 du Concept (§12). Les modules des étapes P2 et P3 (structure détaillée, bois, tôlerie, réseaux, électricité, électronique, simulation, fabrication, relevés 3D) **n'en font pas partie** : ils feront l'objet d'une feuille de route propre. Mêmes règles de découpage (§2) : un lot = une demande de fusion, tests unitaires, recette navigateur, documentation.

**Ordre et porte P0.** Conformément au Concept (§12 : P0 valide les choix techniques avant P1), aucun lot P1 qui dépend d'un choix de P0 (solveur de contraintes, noyau 3D, références topologiques) ne commence avant la clôture de J11. Seul J10 précède P0 : il complète le dessin 2D existant sans dépendre d'aucun de ces choix. Les lots de J11 qui exigent le noyau OCCT attendent en outre la décision de licence, **bloquante avant P0** (Exigences, annexe D.3) : aucune valeur par défaut ne s'y substitue.

### J10 — Compléments 2D (indépendant de P0)

- **10.1 — Ellipse native.** Objet ellipse (centre, demi-axes, rotation, arc partiel), outil centre–axe–axe, accrochages centre et quadrants, `ELLIPSE` natif à l'export et à l'import. *Preuve : tests (périmètre, point paramétrique, boîte) ; DXF relu par ezdxf.*
- **10.2 — Spline native.** B-spline cubique par points de contrôle, outil, édition des points, `SPLINE` natif à l'export et à l'import (plus d'approximation par polyligne). *Preuve : tests d'évaluation (De Boor) ; DXF relu par ezdxf.*
- **10.3 — Étirer.** Fenêtre de capture : les sommets intérieurs se déplacent, les autres restent ; les cotes associées suivent. *Preuve : tests par type d'objet ; recette.*
- **10.4 — Décalage à distance saisie.** Outil « Décaler » : distance saisie, côté désigné, copie parallèle (ligne, polyligne, arc, cercle, rectangle, ellipse). *Preuve : tests (distance exacte à 10⁻⁶ mm, côté) ; recette.*
- **10.5 — Groupes.** Grouper, dégrouper ; désigner un membre désigne le groupe ; groupes dans le navigateur et le paquet. *Preuve : tests ; recette.*
- **10.6 — Main levée.** Tracé continu simplifié (Douglas–Peucker, tolérance en pixels écran) en polyligne. *Preuve : tests de simplification ; recette au doigt.*

### J11 — Faisabilité (P0)

Les essais suivent l'Architecture §12 : moteurs comparés sur des géométries difficiles, références topologiques, import, contraintes, mémoire et interaction. Chaque essai produit un compte rendu versionné ; J11 se clôt par une note de décision qui fixe les choix ou les déclare non tranchés.

- **11.1 — Solveur de contraintes.** Au moins deux candidats (un solveur écrit pour DrawAll et un solveur existant libre) sur un corpus de cas bien, sous- et sur-contraints : convergence, diagnostics, temps, intégration. *Preuve : corpus et résultats versionnés ; choix motivé.*
- **11.2 — Noyau : chargement, mémoire, cas difficiles.** OCCT en WebAssembly (D1) chargé à la demande hors du fil principal : budget de démarrage et mémoire mesurés (D6a), corpus de cas difficiles (congés, booléens à faces coplanaires, parois minces, tangences). Parasolid ne peut être évalué sans licence : l'essai le déclare. *Preuve : compte rendu de mesure ; volumes de référence à 10⁻⁶ près.*
- **11.3 — Références topologiques.** Une opération qui vise une arête ou une face (congé, perçage) est rejouée après une modification amont : la référence est conservée ou signalée « à réparer », jamais réattribuée silencieusement. *Preuve : tests sur le corpus.*
- **11.4 — Import de référence.** Lecture d'un corpus STEP par le noyau : solides, assemblages, unités, pertes signalées. *Preuve : compte rendu d'import.*
- **11.5 — Note de décision P0.** Solveur, noyau, licence, CRDT (D3), budgets d'interaction : décision, preuve, risques résiduels ; met à jour les annexes. *Preuve : note fusionnée.*

### J12 — Contraintes et paramètres

- **12.1 — Contraintes dans l'atelier.** Avec le solveur retenu en 11.1 : coïncidence, horizontale, verticale, parallèle, perpendiculaire, distance, longueur, rayon, égalité, tangence, fixe ; symboles sur le canevas ; une modification re-résout ; un conflit est expliqué. *Preuve : recette sur un rectangle contraint ; sur-contrainte signalée.*
- **12.2 — Paramètres nommés et cotes pilotantes.** Table des paramètres (nom, expression, unité), évaluateur d'expressions sans `eval`, cotes pilotantes liées. *Preuve : changer `L` redimensionne la pièce ; expression circulaire refusée.*
- **12.3 — Propriétés et classification.** Jeux de propriétés par objet (valeur, unité), classe IFC par type d'objet, éditables dans l'inspecteur. *Preuve : tests ; paquet aller-retour.*

### J13 — Bâtiment complété

- **13.1 — Dalles et planchers.** Contour, épaisseur, niveau ; création depuis une pièce. *Preuve : surface et volume de référence.*
- **13.2 — Toitures.** Contour, pente, débord ; un, deux ou quatre pans sur contour rectangulaire ; faîtage, arêtiers et flèches de pente en plan. *Preuve : hauteur de faîtage et longueurs d'arêtiers de référence.*
- **13.3 — Zones.** Regroupement de pièces, surface cumulée, couleur. *Preuve : somme exacte des surfaces.*
- **13.4 — Poteaux et poutres.** Sections rectangulaires ou circulaires saisies (aucun catalogue inventé), poutre en traits interrompus au-dessus du plan de coupe. *Preuve : tests ; DXF.*
- **13.5 — Tableaux de quantités.** Tableaux des pièces, ouvertures et murs, calculés depuis le modèle, posés sur une feuille, exportés en PDF et DXF. *Preuve : modifier un mur met à jour le tableau.*

### J14 — Versions et coordination

- **14.1 — Branches.** Variante créée depuis une version, bascule, historique par branche, conservées par le paquet. *Preuve : tests ; recette.*
- **14.2 — Comparaison et fusion.** Différences (ajouté, supprimé, modifié) en surimpression, fusion à trois voies, conflits listés et tranchés. *Preuve : tests de fusion.*
- **14.3 — Analyse d'impact.** Avant une suppression ou une modification : objets dépendants, vues et feuilles touchés ; feuilles « à recalculer » signalées. *Preuve : tests du graphe de dépendances ; recette.*
- **14.4 — Publication.** Dossier figé (version nommée + PDF des feuilles), consultable, état « publié » / « modifié depuis ». *Preuve : le dossier publié ne change pas quand le projet évolue.*

### J15 — Solides et vue 3D

- **15.1 — Vue 3D.** Rendu WebGL2 (D2) : orbite, cadrage, murs, dalles, poteaux, poutres et toitures dérivés du plan. *Preuve : recette ; temps de trame mesuré.*
- **15.2 — Extrusion, révolution, booléens, perçage.** Depuis un contour fermé ; union, différence, intersection ; perçage. *Preuve : volumes de référence.*
- **15.3 — Balayage et Follow Me.** Profil le long d'un trajet (ligne, arc, polyligne, spline). *Preuve : volume et longueur de trajet de référence.*
- **15.4 — Lissage.** Solide passant par plusieurs sections. *Preuve : sections retrouvées à 10⁻⁶ mm.*
- **15.5 — Coque.** Évidement d'un solide à épaisseur donnée, faces ouvertes désignées. *Preuve : volume de matière de référence.*
- **15.6 — Pousser / tirer.** Modification directe d'une face plane. *Preuve : volume après modification ; références suivies (11.3).*

### J16 — Vues, pièces et assemblages

- **16.1 — Vues projetées.** Vues 2D (dessus, face, côté) calculées depuis les solides, arêtes cachées en interrompu, associatives. *Preuve : modifier le solide met à jour la vue.*
- **16.2 — Façades et coupes de bâtiment générées.** Depuis le modèle 3D, posées sur les feuilles. *Preuve : recette.*
- **16.3 — Pièces et occurrences.** Définition de pièce, occurrences placées, numérotation. *Preuve : modifier la définition met à jour toutes les occurrences.*
- **16.4 — Liaisons et nomenclature d'assemblage.** Liaisons fixe, coaxiale et appui plan ; nomenclature calculée depuis les occurrences ; vue éclatée. *Preuve : tests de placement ; quantités.*

### J17 — Échanges 3D et BIM

- **17.1 — Export IFC 4.3.** Étages, murs, dalles, ouvertures, portes, fenêtres, espaces, toitures, poteaux, poutres, propriétés (D5). *Preuve : fichier relu par IfcOpenShell ; quantités comparées.*
- **17.2 — STEP AP242 édition 3.** Export et import des solides selon D5 (AP242 Éd. 3). *Preuve : schéma déclaré, fichier relu par un lecteur tiers, volume identique à 10⁻⁶ près. Une édition antérieure n'est pas acceptée.*
- **17.3 — Géoréférencement.** Point de base (E, N, altitude), système de coordonnées déclaré, rotation vers le nord ; transmis à l'IFC. *Preuve : tests de conversion ; IFC relu.*

### J18 — Automatisation

- **18.1 — API de commandes.** Chaque opération est une commande typée validée et journalisée ; la palette, l'interface et les scripts passent par elle. *Preuve : rejouer le journal reproduit le projet.*
- **18.2 — Scripts isolés.** Console de scripts exécutés dans un Worker, sans accès direct au stockage, via l'API seule. *Preuve : un script trace une grille de poteaux ; un script fautif n'abîme rien.*
- **18.3 — Assistant à boucle contrôlée.** Séquence d'opérations proposée, validée par les moteurs, aperçue, exécutée après accord ; trois corrections au plus ; journal des hypothèses (D4). Le fournisseur du modèle de langage est une décision §7. *Preuve : tests avec un générateur simulé.*

### J19 — Démonstrateur réduit bâtiment–mécanique

- **19.1 — Parcours réduit.** Atelier et mezzanine, support de machine et ancrages, armoire implantée comme équipement mécanique ; modification d'une dimension déterminante suivie jusqu'aux feuilles, nomenclature et dossier publié ; conflit entre variantes, coupure réseau, échange IFC. **Ce n'est pas le démonstrateur complet du Concept §10** : la représentation électrique de l'armoire et ses raccordements relèvent du module électricité (P3), hors de cette feuille de route ; le démonstrateur complet sera la preuve de clôture de la feuille de route suivante. *Preuve : scénario de recette automatisé.*
- **19.2 — Banc de mesure.** Temps de retour p95 et temps de trame sur un projet de référence déclaré (Concept §11). *Preuve : rapport de mesure versionné.*

## 5. Avancement

| Lot | État | Demande de fusion |
| --- | --- | --- |
| J0 — Mesures et échanges (lot 1 historique) | Fait | #3 |
| J0 — Interface mobile | Fait | #4, #5 |
| 1.0 Recette navigateur automatisée | Fait | #6 |
| 1.1 Cadrage et ergonomie mobile | Fait | #7 |
| 1.2 Texte | Fait | #8 |
| 1.3 Arc | Fait | #9 |
| 1.4 Ajuster et prolonger | Fait | #10 |
| 1.5 Congé et chanfrein | Fait | #11 |
| 1.6 Copier, coller, réseaux | Fait | #12 |
| 1.7 Saisie précise | Fait | #13 |
| 1.8 Accrochages complémentaires | Fait | #14 |
| 1.9 Propriétés de trait | Fait | #15 |
| 1.10 Mesure d'aire et de périmètre | Fait | #16 |
| 2.1 Modèle feuille / fenêtre | Fait | #17 |
| 2.2 Éditeur de feuille | Fait | #18 |
| 2.3 Cartouche | Fait | #19 |
| 2.4 Styles d'annotation papier | Fait | #20 |
| 2.5 Export PDF calibré et impression | Fait | #21 |
| 2.6 Cotes avancées | Fait | #22 |
| 3.1 Matériaux et profils de dessin | Fait | #23 |
| 3.2 Hachures paramétrées | Fait | #24 |
| 3.3 Contexte coupe / surface | Fait | #25 |
| 4.1 Murs | Fait | #26 |
| 4.2 Ouvertures | Fait | #27 |
| 4.3 Pièces et surfaces | Fait | #28 |
| 4.4 Niveaux | Fait | #29 |
| 4.5 Symboles | Fait | #30 |
| 5.1 Tolérances | Fait | #31 |
| 5.2 Vues alignées | Fait | #32 |
| 5.3 Coupes | Fait | #33 |
| 5.4 Nomenclature | Fait | #34 |
| 6.1 DXF complet à l'import | Fait | #35 |
| 6.2 Fond de plan | Fait | #36 |
| 6.3 DWG | Partiel : valeur par défaut §7 appliquée (DWG reconnu et refusé avec la marche à suivre) ; lecture en attente du choix du convertisseur | #37 |
| 6.4 Export SVG | Fait | #38 |
| 7.1 Loupe et réticule | Fait | #39 |
| 7.2 Hors ligne | Fait | #40 |
| 7.3 Photos et notes | Fait | #41 |
| 8.1 Historique compact | Fait | #42 |
| 8.2 Paquet natif | Fait | #43 |
| 8.3 Sécurité de la connexion | Fait | #44 |
| 8.4 Partage et commentaires | Fait (recette à deux comptes au niveau de l'API, base simulée ; essai avec deux vrais comptes dépendant de l'hébergement, §7 « Tunnel de démonstration ») | #45 |
| Parcours de preuve final (§6) | Fait (partage et commentaires prouvés au niveau de l'API) | #46 |
| 10.1 Ellipse native | Fait | #48 |
| 10.2 Spline native | Fait | #49 |
| 10.3 Étirer | À faire | — |
| 10.4 Décalage à distance saisie | À faire | — |
| 10.5 Groupes | À faire | — |
| 10.6 Main levée | À faire | — |
| 11.1 Solveur de contraintes (essai P0) | À faire | — |
| 11.2 Noyau : chargement, mémoire, cas difficiles | À faire | — |
| 11.3 Références topologiques | À faire | — |
| 11.4 Import de référence | À faire | — |
| 11.5 Note de décision P0 | À faire | — |
| 12.1 Contraintes dans l'atelier | À faire | — |
| 12.2 Paramètres nommés et cotes pilotantes | À faire | — |
| 12.3 Propriétés et classification | À faire | — |
| 13.1 Dalles et planchers | À faire | — |
| 13.2 Toitures | À faire | — |
| 13.3 Zones | À faire | — |
| 13.4 Poteaux et poutres | À faire | — |
| 13.5 Tableaux de quantités | À faire | — |
| 14.1 Branches | À faire | — |
| 14.2 Comparaison et fusion | À faire | — |
| 14.3 Analyse d'impact | À faire | — |
| 14.4 Publication | À faire | — |
| 15.1 Vue 3D | À faire | — |
| 15.2 Extrusion, révolution, booléens, perçage | À faire | — |
| 15.3 Balayage et Follow Me | À faire | — |
| 15.4 Lissage | À faire | — |
| 15.5 Coque | À faire | — |
| 15.6 Pousser / tirer | À faire | — |
| 16.1 Vues projetées | À faire | — |
| 16.2 Façades et coupes générées | À faire | — |
| 16.3 Pièces et occurrences | À faire | — |
| 16.4 Liaisons et nomenclature d'assemblage | À faire | — |
| 17.1 Export IFC 4.3 | À faire | — |
| 17.2 STEP AP242 édition 3 | À faire | — |
| 17.3 Géoréférencement | À faire | — |
| 18.1 API de commandes | À faire | — |
| 18.2 Scripts isolés | À faire | — |
| 18.3 Assistant à boucle contrôlée | À faire | — |
| 19.1 Démonstrateur réduit bâtiment–mécanique | À faire | — |
| 19.2 Banc de mesure | À faire | — |

## 6. Parcours de preuve final

Sur un même projet : dessiner un logement de 2 pièces (murs, portes, surfaces, niveau) et la platine d'un équipement (Ø 12,5 mm, tolérance H7) ; produire une A3 au 1:50 et un détail 1:1 avec cartouche et indice ; exporter PDF et DXF, les relire ; réimporter un DXF client ; reprendre le relevé sur téléphone hors ligne ; partager et commenter ; restaurer depuis le paquet natif. Chaque étape est un scénario de recette automatisé.

**État : fait** (#46). Le parcours tourne d'un seul tenant dans `e2e/parcours.spec.ts`, sur un même projet :
- logement de deux pièces (5 murs, 2 portes, 2 pièces de 18,24 m² en SIA 416, étage copié à +2,80 m) ;
- platine avec alésage Ø 12,5 H7 (écarts +0,018 / 0 mm, IT7) ;
- A3 au 1:50 et détail au 1:1 avec cartouche et indice A ;
- PDF relu : A3 exacte, façade de 8,20 m = 164 mm au 1:50, cote Ø 12,5 = 12,5 mm au 1:1 ;
- DXF relu : alésage R 6,25, étiquettes des pièces ;
- DXF client réimporté sans rien perdre du dessin ;
- passage au téléphone par le paquet natif, note de relevé posée hors ligne et retrouvée après rechargement ;
- retour au bureau par restauration du paquet du terrain, puis réexport identique octet pour octet.

Une étape échappe à la recette navigateur : le partage et les commentaires, faute de serveur et de compte. Ils sont prouvés au niveau de l'API par la recette à deux comptes (`api/projects-router.test.ts`, lot 8.4). L'essai avec de vrais comptes dépend de la décision d'hébergement (§7).

## 7. Décisions réservées au maître d'ouvrage

| Décision | Valeur par défaut en attendant | Lots concernés |
| --- | --- | --- |
| Unité d'affichage par défaut (mm partout ou cm/m en bâtiment) | mm | 1.7, 2.4 |
| Couleur des objets à l'écran par défaut (trait du calque, usage CAO, ou classification métier) | Trait du calque | 1.9 |
| Méthode de projection par défaut | Premier dièdre | 2.3, 5.2 |
| Profil et sources des correspondances matériau → motif | Profil neutre (diagonales) | 3.1 |
| Référentiel de surfaces (SIA 416, loi Carrez, autre) | SIA 416 | 4.3 |
| Convertisseur DWG (bibliothèque, licence) | Aucun : DWG refusé avec message | 6.3 |
| Hébergement durable et comptes (au-delà du tunnel temporaire) | Tunnel de démonstration | 7.2, 8.4 |
| Licence du noyau OCCT (LGPL avec paquet séparé substituable, ou licence commerciale) — **bloquante avant P0** (Exigences D.3) | Aucune : les lots qui exigent OCCT attendent la décision | 11.2–11.5, J15–J17 |
| Système de coordonnées de référence par défaut | Aucun : origine locale, système à déclarer par projet | 17.3 |
| Fournisseur du modèle de langage de l'assistant (coût, données envoyées) | Aucun : l'assistant fonctionne avec un générateur local de démonstration, aucun envoi externe | 18.3 |
