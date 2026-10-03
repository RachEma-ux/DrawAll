# DrawAll — Concept produit V4

**Application web universelle de dessin, de conception et de documentation**  
**Version 4.1 — 3 octobre 2026 — base de développement**

Les arbitrages techniques normatifs (rendu, noyau, licences, IA, interopérabilité) figurent en annexe D du document Exigences et sources. Le présent document conserve la posture épistémique de la V4 : les objectifs sont à valider par prototype, aucune mesure n'a encore été réalisée.

Ce document définit le produit à développer. Les principes fonctionnels ci-dessous constituent la cible proposée pour DrawAll. Les performances, la facilité d’apprentissage et la couverture professionnelle seront établies par des prototypes et des essais. Le dossier ne décrit pas une application déjà réalisée.

**Documents associés :** [Architecture de référence V4](DrawAll_v4.1_Architecture.md) · [Exigences, comparaison des applications et sources V4](DrawAll_v4.1_Exigences_Sources.md).

## 1. La vision en une page

**DrawAll est le projet d’un atelier web commun au bâtiment et à l’industrie.** Dans un même environnement, l’utilisateur pourra dessiner un bâtiment, concevoir une pièce, assembler une machine, organiser ses raccordements et produire les documents nécessaires à la construction ou à la fabrication.

Le principe fondateur est : **un projet commun, des objets identifiés, plusieurs représentations métier cohérentes.** Nous le nommons **« un objet, deux lectures »** : un même objet du projet peut être lu en vue bâtiment et en vue industrielle sans conversion ni duplication — une modification se propage aux deux lectures et à leurs documents dérivés.

```
                    ┌──────────────────────────────┐
                    │       MODÈLE DRAWALL         │
                    │  Objets identifiés, versionnés│
                    │  + géométrie B-Rep exacte    │
                    │  + paramètres + relations    │
                    └───────────────┬──────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
 ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
 │ VUE BÂTIMENT │          │ VUE INDUSTRIE│          │ VUE DOCUMENT │
 │ Murs, niveaux│          │ Pièces, tôles│          │ Plans, cotes │
 │ zones, P&ID  │          │ assemblages  │          │ tolérances   │
 │ réseaux, IFC │          │ soudures,STEP│          │ nomenclatures│
 └──────────────┘          └──────────────┘          └──────────────┘
```

Une armoire technique pourra être représentée par son encombrement dans un plan de bâtiment, par ses tôles et composants dans une vue de fabrication, et par ses appareils et connexions dans un schéma électrique. Ces représentations partageront les identités et relations nécessaires à leur coordination. Le niveau de détail et les règles propres à chaque discipline seront conservés.

L’utilisateur ne choisira pas une édition « Bâtiment », « Mécanique » ou « Électricité ». DrawAll proposera une seule application, un projet pouvant accueillir tous ces domaines et un langage d’interaction commun. Les préférences d’affichage permettront de travailler confortablement sans retirer l’accès aux autres outils.

La valeur recherchée est concrète : **réduire les ressaisies et les changements de logiciel, rendre les modifications compréhensibles, et maintenir la cohérence entre ce qui est conçu et ce qui est documenté.** L’intégration doit également profiter à un projet exclusivement architectural ou mécanique.

Cinq engagements organisent la conception :

1. **Continuité du projet.** Les objets, documents et résultats conservent leurs liens et leurs versions.
2. **Cohérence des gestes.** Sélectionner, renseigner, prévisualiser, contrôler et valider suivent les mêmes principes.
3. **Profondeur métier.** Les fonctions spécialisées restent disponibles avec leurs règles et paramètres propres.
4. **Maîtrise des modifications.** L’utilisateur comprend les éléments touchés, les conflits et les résultats à recalculer.
5. **Ouverture contrôlée.** Les données sont exportables et les pertes d’un échange sont signalées.

La première preuve de valeur sera un parcours complet reliant bâtiment, équipement industriel et documents, avec une modification suivie jusqu’aux plans et à la nomenclature. Les gains seront comparés à une chaîne d’outils de référence sur ce même parcours.

## 2. Ce que signifie une application universelle

L’universalité de DrawAll porte sur la continuité entre disciplines et sur l’accès aux fonctions dans un même produit. Elle n’impose ni une géométrie unique pour tous les objets, ni une interface affichant simultanément toutes les commandes, ni une compétence immédiate dans tous les métiers.

| Principe produit | Traduction concrète |
| --- | --- |
| Une application | Même compte, même environnement, même projet et navigation commune. |
| Tous les domaines accessibles | Aucun choix d’édition spécialisée pour ouvrir un outil de bâtiment, mécanique ou électricité. |
| Un projet mixte possible | Un bâtiment, une machine et leurs installations peuvent être conçus et coordonnés ensemble. |
| Des objets cohérents | Définitions, occurrences, représentations et connexions sont reliées explicitement. |
| Une expérience commune | Sélection, unités, paramètres, aperçus, diagnostics et documentation suivent des conventions stables. |
| Des règles métier explicites | Une liaison mécanique, un raccord de tuyauterie et une connexion électrique gardent leur sens propre. |
| Une réalisation progressive | Les étapes de développement enrichissent le même produit ; elles ne créent pas des éditions distinctes. |

Un module métier peut être chargé à la demande pour réduire le temps de démarrage. Son chargement ne crée pas une nouvelle application et ne transforme pas l’activité sélectionnée en restriction fonctionnelle.

### Tableau comparatif — la proposition face aux familles d’architectures existantes

| Critère | Fichiers (AutoCAD…) | BIM partagé (Revit…) | Cloud natif (Onshape) | DrawAll (proposé) |
| --- | --- | --- | --- | --- |
| Apprentissage du 2ᵉ métier | Nouveau logiciel complet | Nouveau logiciel complet | Impossible (mécanique seul) | Nouvelle ontologie seulement (UX1–UX4) |
| Où est ma donnée ? | Fichiers dispersés | Modèle central + copies locales | Cloud, historique complet | Autorité partagée + brouillons locaux explicites |
| Deux personnes modifient ? | Verrou / copies « final_v2 » | Réservation + synchronisation | Temps réel, hors-ligne limité | Traitement par nature de donnée (§8) |
| Bâtiment + machine dans un projet | 2–4 logiciels + conversions | Impossible nativement | Impossible | Un seul modèle, deux lectures |
| Découvrabilité des outils | Menus à parcourir | Ruban métier fixe | Ruban fixe | Recherche + niveaux progressifs |
| Automatisation / IA | Macros opaques | Fonctionnalités ponctuelles | Langage de fonctions ouvert | Copilote à boucle contrôlée (§9, annexe D4) |

Ce tableau est une proposition de positionnement : chaque affirmation est à vérifier par les essais de la section 11.

## 3. Les utilisateurs et leurs parcours

DrawAll vise les professionnels et les équipes qui produisent des objets techniques : architectes, dessinateurs, ingénieurs, concepteurs de produits, bureaux d’études, fabricants et coordinateurs. Les parcours d’apprentissage accompagneront également les utilisateurs qui découvrent la CAO.

| Parcours | Résultat attendu |
| --- | --- |
| Dessiner et documenter un bâtiment | Modèle, plans, coupes, façades, détails et quantités liés à une même révision. |
| Concevoir un produit ou une machine | Pièces, assemblages, configurations, plans et nomenclature cohérents. |
| Concevoir des structures | Objets acier, béton ou bois, connexions, détails et livrables de production. |
| Organiser les installations | Réseaux, équipements, connexions, spécifications et schémas coordonnés. |
| Préparer la fabrication | Données de matière, développés, préparation et sorties adaptées aux processus couverts. |
| Coordonner et publier | Comparaison des modifications, traitement des problèmes et dossier de publication identifié. |

Une petite étude pourra démarrer par un dessin libre. L’ajout progressif de paramètres et de propriétés métier sera possible, avec une conversion explicite lorsque la nature de l’objet change. Une ligne épaisse ne sera pas automatiquement considérée comme un mur structurel.

## 4. Une identité commune et plusieurs représentations

Le projet distingue ce qu’est l’objet, où il est utilisé, comment il est représenté et quelles règles lui sont applicables.

| Représentation d’une armoire technique | Informations utiles | Relations conservées |
| --- | --- | --- |
| Implantation dans le bâtiment | Encombrement, position, zone, dégagement et raccordements | Occurrence, local, interfaces et révision. |
| Conception mécanique | Tôles, plis, fixations, portes et assemblage | Définition de produit, composants et paramètres. |
| Schéma électrique | Appareils, bornes, réseaux et repères | Identités des appareils et connexions. |
| Fabrication | Développés, matière, quantités et instructions | Pièces sources, paramètres de préparation et version. |
| Documentation | Plans, cotations, listes et feuilles | Objets représentés et état de mise à jour. |

Le passage entre les vues natives évitera les exports/imports intermédiaires. Une représentation simplifiée pourra être recalculée depuis un assemblage détaillé. Les conversions géométriques ou exports externes conserveront leur propre contrôle de fidélité.

Une modification d’encombrement pourra affecter l’implantation. Une modification d’appareil pourra affecter un schéma et une nomenclature. Les conséquences seront présentées avant validation lorsque nécessaire ; la coordination n’autorisera pas un redimensionnement structurel ou électrique implicite.

## 5. Une interface commune qui révèle progressivement les outils

**La complexité se découvre progressivement, sans imposer un changement de logiciel.** Quatre mécanismes organisent cette expérience ; leur efficacité sera mesurée auprès des utilisateurs.

### UX1 — Une interface stable avec des niveaux d’affichage

Les cinq repères permanents sont le navigateur du projet, la zone de travail, les commandes, l’inspecteur et le panneau des modifications ou problèmes.

Trois réglages d’affichage sont proposés :

- **Essentiel :** commandes et paramètres utiles aux tâches d’initiation définies ; accès permanent à la recherche complète.
- **Contextuel :** propositions selon la sélection et l’activité en cours, sans réorganisation imprévisible des favoris et commandes communes.
- **Complet :** paramètres détaillés, dépendances, automatisation et diagnostic avancé.

Ces réglages ne changent pas la signification des commandes ni le modèle du projet. L’utilisateur peut épingler des outils et conserver ses raccourcis. Une activité choisie facilite la présentation ; elle n’interdit aucune autre discipline.

### UX2 — Une recherche de commandes commune

La palette recherche les outils, objets, paramètres et aides. Elle accepte les synonymes courants et les termes issus d’autres logiciels. Un résultat indique l’action, les conditions nécessaires et un exemple court.

La recherche est complémentaire aux commandes visibles, au clavier et à la sélection directe. L’utilisateur n’est pas obligé de connaître le nom exact de l’outil ni de recourir à une IA.

### UX3 — Aperçu, diagnostic et récupération

Le cycle commun est **sélection → paramètres → aperçu → contrôle → validation**. Les accrochages, contraintes et objets affectés sont visibles. Un message d’erreur explique l’objet concerné, la cause et une action possible.

Les contrôles légers peuvent accompagner le geste. Les vérifications coûteuses sont lancées en arrière-plan ou à la demande, avec progression et état de fraîcheur. Un aperçu simplifié ne vaut pas validation finale.

L’annulation et la restauration ont une portée documentée. En collaboration, elles prennent en compte les changements des autres participants. L’utilisateur peut revenir à une version sans effacer silencieusement le travail d’autrui.

### UX4 — Des interactions réutilisables et une aide située

Les mêmes conventions servent à esquisser, générer, assembler ou connecter, puis documenter. Les familles de commandes sont **Créer, Modifier, Connecter, Analyser, Documenter, Partager**.

L’aide accompagne la commande et l’objet : exemple court, paramètre expliqué, aperçu ou exercice guidé. L’apprentissage initial, le passage entre domaines et la rétention sont évalués séparément. Les connaissances d’ingénierie restent propres aux métiers. Les travaux sur l’aide contextuelle et l’apprentissage nourrissent cette proposition, sans garantir un gain chiffré pour DrawAll. [S19–S20]

## 6. Le périmètre fonctionnel

Le fichier de référence rassemble **32 lignes d’applications, 22 catégories et 324 entrées**. L’annexe V4 conserve les 324 libellés et identifiants. Ce périmètre inclut des commandes, objets, méthodes et domaines entiers ; il ne représente pas 324 fonctions de même complexité.

| Module | Responsabilité |
| --- | --- |
| M01 — Dessin et esquisse | Primitives, profils, hachures et précision 2D. |
| M02 — Géométrie et modification | Solides, surfaces, maillages, SubD et transformations. |
| M03 — Paramètres et contraintes | Expressions, contraintes, configurations et variantes. |
| M04 — Composants et assemblages | Définitions, occurrences, liaisons et bibliothèques. |
| M05 — Bâtiment et site | Architecture, espaces, niveaux, terrain et phases. |
| M06 — Structure et bois | Acier, béton, armatures, bois et détails constructifs. |
| M07 — Tôlerie et outillage | Plis, développés, moules et outillage. |
| M08 — Réseaux et procédés | MEP, tuyauteries, équipements, P&ID et spécifications. |
| M09 — Électricité et automatismes | Appareils, schémas, câbles, automates et armoires. |
| M10 — Électronique et PCB | Schémas électroniques, réseaux et conception de cartes. |
| M11 — Documentation et quantités | Vues, annotations, feuilles, nomenclatures et rapports. |
| M12 — Analyse et validation | Collisions, règles, cinématique et calculs. |
| M13 — Fabrication | Préparation, parcours, postprocesseurs et sorties de production. |
| M14 — Visualisation et relevé | Rendu, animation, scans et rétroconception. |
| M15 — Automatisation | Scripts, graphes visuels et génération contrôlée. |
| M16 — Collaboration et données | Versions, droits, synchronisation et publications. |
| M17 — Interopérabilité et géospatial | Traductions, contrôles d’échange et référentiels. |

Les modules sont des responsabilités logicielles internes à la même application. Leur couverture est approfondie progressivement. Un domaine comme la simulation doit être décomposé en cas physiques et critères de validation avant d’être annoncé comme disponible.

## 7. Architecture et fonctionnement du projet

L’architecture cible associe un navigateur réactif, une autorité de projet partagée et des moteurs de calcul isolés. Le détail des contrats, transactions et données est donné dans le document d’architecture V4.

- Le navigateur assure l’interaction, les aperçus, le rendu et les calculs locaux adaptés.
- Le service de projet contrôle les droits, versions, relations et modifications partagées.
- Des processus spécialisés exécutent les calculs lourds et les traductions de fichiers.
- Les données structurées, volumes géométriques et documents dérivés sont stockés selon leur rôle.

La répartition local/serveur dépend des capacités de l’appareil, de l’opération et des exigences de cohérence. Le noyau géométrique et les solveurs sont des choix à valider sur un corpus d’essai. Les capacités WebAssembly, WebGPU et de stockage navigateur documentées constituent des pistes techniques ; elles ne prouvent pas les performances de DrawAll. [S03, S05–S07, S14–S16]

## 8. Collaboration, autonomie locale et publication

Les utilisateurs peuvent modifier des objets indépendants lorsque leurs dépendances restent compatibles. Sur une même fonction contrainte, le système traite explicitement réservation, branche ou conflit. Le texte collaboratif et la géométrie n’emploient pas nécessairement le même mécanisme de fusion.

Un périmètre de travail peut être préparé pour un usage hors connexion. Seules les données et opérations disponibles localement sont alors proposées comme exécutables. Les états **local, synchronisé, conflit, à recalculer et publié** restent visibles.

Une publication regroupe des modèles, documents et résultats compatibles avec une révision déterminée. Le reste du projet peut continuer à évoluer. Les dossiers déjà publiés restent identifiables et consultables selon la politique de conservation.

Le versionnement est de type *Git-like* : chaque édition crée une **microversion** ; l’utilisateur désigne des **versions nommées** immuables (jalons, livrables) ; les **branches** permettent des variantes d’essai sans toucher au tronc ; la **fusion** est assistée par une comparaison visuelle des différences géométriques et des objets affectés ; le **release management** est non bloquant — un livrable peut être en validation pendant que la conception continue. Ces mécanismes s’appliquent aux objets, documents dérivés et résultats d’analyse, sous réserve des validations métier de la section 8.

Les données du navigateur constituent un cache ou un espace de travail local. Sauvegardes, restauration et export du projet sont des fonctions distinctes.

## 9. Échanges et automatisation

DrawAll vise des échanges contrôlés avec les formats pertinents : IFC, STEP, DWG/DXF/DGN, BCF, PDF, maillages, relevés et formats métier couverts par les adaptateurs. Une matrice précisera formats, versions, objets reconnus et limites. Chaque transfert pourra produire un rapport des éléments conservés, transformés, omis ou à réparer. [S08–S13]

Le format de paquet natif sera documenté et versionné. Il permettra l’export des données et dépendances redistribuables nécessaires à la récupération d’un projet.

Les scripts, graphes visuels et assistants utiliseront une API de commandes commune. L’assistant opérera en **boucle contrôlée** : génération d'une séquence d'opérations inspectable, validation par les moteurs déterministes, aperçu, puis exécution après accord explicite — avec auto-correction bornée à trois itérations et journal des hypothèses. Cette architecture s'appuie sur des résultats publiés récents [S29, S30] ; son transfert au bâtiment et aux réseaux est un objet explicite de P0 (annexe D4). L’utilisateur conservera les commandes directes et la validation des changements proposés. Les extensions ne disposeront pas d’un accès libre à la base de données.

## 10. Un parcours de preuve concret

Le démonstrateur de référence associe un atelier industriel, une mezzanine, un support de machine, une armoire électrique et leurs raccordements. Il s’agit d’un scénario d’essai, avec hypothèses à renseigner avant réalisation.

| Étape | Action | Preuve recherchée |
| --- | --- | --- |
| 1 | Créer le bâtiment et les niveaux | Plans et vues cohérents. |
| 2 | Concevoir le support et ses ancrages | Paramètres, assemblage et cotations correctement liés. |
| 3 | Implanter l’ensemble | Identité de l’équipement conservée entre produit et implantation. |
| 4 | Concevoir l’armoire et les raccordements | Représentations mécaniques et électriques coordonnées. |
| 5 | Modifier une dimension déterminante | Dépendances affectées identifiées ; résultats périmés signalés. |
| 6 | Régénérer et contrôler les livrables | Plans et nomenclatures issus de la bonne révision. |
| 7 | Publier le dossier | Ensemble cohérent, reproductible et traçable. |

La recette inclura un conflit entre utilisateurs, une interruption de connexion et un échange externe. La réussite du dessin seul ne suffira pas : les données et livrables doivent rester cohérents après modification.

## 11. Démontrer les cinq améliorations recherchées

Les valeurs ci-dessous sont des **objectifs initiaux proposés**, sans mesure réalisée sur DrawAll.

| Ambition | Preuve attendue | Cible initiale |
| --- | --- | --- |
| Plus puissant | Parcours transversal et cas métier réussis | Capacités validées cas par cas, avec précision et dépendances contrôlées. |
| Plus pratique | Moins de ressaisies et de manipulations entre outils | Réduction visée d’au moins 30 % sur le scénario et la chaîne de référence définis avant essai. |
| Plus fluide | Retour perceptible rapide et navigation stable | Retour simple p95 < 100 ms ; viser 60 images/s sur le banc déclaré. Pour un objectif strict de 60 images/s, budget de trame p95 ≤ 16,7 ms. |
| Plus facile à apprendre | Tâches de base réussies et connaissances retenues | Au moins 80 % de réussite après tutoriel sur les tâches retenues ; contrôle après sept jours. |
| Plus facile à utiliser | Réussite, temps, erreurs et récupération mesurés | Comparaison de tâches identiques, avec ordre des outils contrebalancé. |

Le protocole fixe appareil, navigateur, GPU, mémoire, réseau, taille du modèle, triangles visibles et état du cache. Les objectifs mobiles et les projets très volumineux ont leurs propres bancs d’essai. Les gains d’affichage ne doivent pas masquer des résultats incorrects ou périmés.

## 12. Développer un produit unique par étapes

| Étape | Périmètre | Condition de passage |
| --- | --- | --- |
| P0 — Faisabilité | Géométrie, contraintes, dépendances, import et interface | Choix techniques justifiés sur les cas représentatifs. |
| P1 — Socle universel | Dessin, pièces, assemblages simples, bâtiment essentiel, documents et versions | Premier parcours bâtiment–mécanique complet et cohérent. |
| P2 — Approfondissement | Structure, bois, tôlerie, réseaux, surfaces et coordination | Cas métier validés avec utilisateurs. |
| P3 — Ingénierie avancée | Électricité complète, PCB, calculs, FAO et production | Résultats et sorties validés pour les domaines et machines couverts. |
| P4 — Échelle et exploitation | Grands projets, concurrence, migrations et compatibilité étendue | Performances, restauration et exploitation éprouvées. |

La collaboration, les droits et la sauvegarde commencent au socle ; leur montée en charge se poursuit ensuite. L’inventaire répartit 146 entrées principalement en P1, 124 en P2 et 54 en P3. Ces nombres ne mesurent ni charge de travail ni avancement.

Le produit pourra être présenté comme plus performant ou plus simple sur les tâches où les essais l’établissent. La couverture et ses limites resteront publiées. Le premier engagement de DrawAll est une conception continue entre métiers, vérifiable dans le fonctionnement du projet et dans les documents produits.

## Références du dossier

Les identifiants S01–S35 renvoient au registre lié de [l’annexe V4](DrawAll_v4.1_Exigences_Sources.md). Ce registre conserve les liens, dates et limites de la recherche. Les 32 applications servent de références fonctionnelles et architecturales ; aucune supériorité générale de DrawAll n’est déduite de leurs descriptions.
