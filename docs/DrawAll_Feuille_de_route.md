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
| J9 — 3D (P2) | Volumes et B-Rep | Hors périmètre immédiat ; décision D1 (occt-wasm) à rouvrir après J8 |

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
| 1.6 → 8.4 | À faire | — |

## 6. Parcours de preuve final

Sur un même projet : dessiner un logement de 2 pièces (murs, portes, surfaces, niveau) et la platine d'un équipement (Ø 12,5 mm, tolérance H7) ; produire une A3 au 1:50 et un détail 1:1 avec cartouche et indice ; exporter PDF et DXF, les relire ; réimporter un DXF client ; reprendre le relevé sur téléphone hors ligne ; partager et commenter ; restaurer depuis le paquet natif. Chaque étape est un scénario de recette automatisé.

## 7. Décisions réservées au maître d'ouvrage

| Décision | Valeur par défaut en attendant | Lots concernés |
| --- | --- | --- |
| Unité d'affichage par défaut (mm partout ou cm/m en bâtiment) | mm | 1.7, 2.4 |
| Méthode de projection par défaut | Premier dièdre | 2.3, 5.2 |
| Profil et sources des correspondances matériau → motif | Profil neutre (diagonales) | 3.1 |
| Référentiel de surfaces (SIA 416, loi Carrez, autre) | SIA 416 | 4.3 |
| Convertisseur DWG (bibliothèque, licence) | Aucun : DWG refusé avec message | 6.3 |
| Hébergement durable et comptes (au-delà du tunnel temporaire) | Tunnel de démonstration | 7.2, 8.4 |
