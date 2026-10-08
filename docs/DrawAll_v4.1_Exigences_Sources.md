# DrawAll — Exigences et sources V4

**Version 4.1 — 3 octobre 2026**

**Base de développement.** La v4.1 réintègre la couche technologique vérifiée (annexe D, références S26–S35) issue des vérifications menées depuis la v1.1, et harmonise la numérotation du registre de sources.

Cette annexe conserve intégralement le périmètre fonctionnel fourni, sa répartition proposée et les preuves documentaires. Elle accompagne le [Concept produit V4](DrawAll_v4.1_Concept.md) et l’[Architecture de référence V4](DrawAll_v4.1_Architecture.md).

Les 324 lignes DA proviennent de l’inventaire consolidé du fichier `Applications_Dessin_Technique_Outils_Architecture.md`. Leurs libellés, identifiants, modules et étapes sont conservés par rapport au dossier de recherche joint. La V4 ajoute des exigences transversales T01–T20, distinguées de cet inventaire ; elles ne changent pas le total des 324 entrées d’origine.

**Statut : aucune ligne ne constitue une fonction déjà implémentée.** Une correspondance documentaire n’est ni une équivalence complète avec un produit tiers, ni un indicateur d’avancement. Les noms de fonctions ou produits propriétaires désignent les besoins décrits dans les notes de correspondance.

Le dossier de recherche fourni est conservé comme base documentaire. Le présent document reprend effectivement les annexes de couverture et les liens des sources ; il ne se contente pas d’y renvoyer. Les dates et limites de consultation restent attachées aux sources concernées.

## Méthode de transformation en exigences de développement

Chaque entrée doit recevoir une fiche de capacité avant développement. Les familles larges comme simulation, CAM ou outillage sont décomposées en sous-exigences liées à leur identifiant d’origine. Les doublons apparents peuvent partager une implémentation tout en conservant leur traçabilité.

| Champ | Contenu attendu |
| --- | --- |
| Identité | ID d’origine, titre métier et éventuelles sous-exigences. |
| Situation utilisateur | Objet de départ et résultat recherché. |
| Entrées et unités | Paramètres, références, hypothèses et sources. |
| Comportement | Sélection, préconditions, aperçu, validation et effets. |
| Données et dépendances | Types modifiés, références, modules sollicités et révisions. |
| Résultats | Objets, documents et sorties produits. |
| Cas limites | Entrées invalides, conflits, géométrie impossible et interruption. |
| Compatibilité | Versions, formats ou bibliothèques effectivement couverts. |
| Validation | Cas de test, résultat attendu, tolérances et mesure éventuelle. |
| État | À spécifier, spécifiée, prototype, vérifiée, disponible, avec preuve liée. |

### Exemple de fiche initiale

**DA-07-10 — Stairs / Escaliers — module M05 — étape cible P2.** Exemple de spécification initiale, à approuver par les essais métier ; il ne représente pas tous les types d’escaliers visés à terme.

| Champ | Proposition |
| --- | --- |
| Situation | Relier deux niveaux par un escalier droit paramétrique. |
| Entrées | Niveaux bas/haut, largeur, nombre de contremarches ou hauteur cible, emprise et éventuels paliers ; unités explicites. |
| Comportement | Calculer une proposition compatible avec les paramètres ; afficher les valeurs effectivement retenues et les contradictions. |
| Données | Escalier, relation aux niveaux, géométrie et paramètres ; références de trémie et de garde-corps lorsqu’elles sont créées ou associées. |
| Dépendances | M03 pour contraintes, M02 pour géométrie, M11 pour vues et quantités ; coordination explicite des objets hébergés. |
| Cas de modification | Changer l’altitude du niveau supérieur ; recalculer ou signaler les incompatibilités, sans déplacer silencieusement les objets adjacents. |
| Recette | Vérifier somme des hauteurs, continuité géométrique, largeur, emprise, références des vues et état des documents après modification. |
| Règles métier | Activer les règles applicables selon pays, usage et version identifiés ; ne pas présenter le résultat comme conforme sans les contrôles nécessaires. |
| Extensions à spécifier | Volées multiples, escaliers tournants/hélicoïdaux, détails constructifs, matériaux et méthodes de fabrication. |

## Exigences transversales ajoutées

Elles s’appliquent aux modules concernés dès leur introduction. Elles constituent un complément identifié à l’inventaire, sans prétendre épuiser toutes les exigences non fonctionnelles du produit.

| ID | Exigence | Preuve minimale |
| --- | --- | --- |
| T01 | Produit unique et accès transversal | Ouvrir des outils de plusieurs disciplines dans le même projet sans changer d’édition. |
| T02 | Identités et représentations liées | Modifier un objet et retrouver ses représentations, occurrences et documents. |
| T03 | Unités et propriétés typées | Refuser une grandeur incompatible et conserver les conversions attendues. |
| T04 | Tolérances et géoréférencement | Maintenir la précision déclarée après transformation de repère et échange. |
| T05 | Références topologiques | Préserver une référence ou la signaler à réparer après changement de topologie. |
| T06 | Transactions et idempotence | Une requête répétée ne produit qu’une modification validée. |
| T07 | Dépendances et résultats périmés | Marquer les résultats affectés et empêcher leur utilisation comme résultats actuels. |
| T08 | Conflits et annulation collaborative | Présenter un conflit et préserver les changements non concernés d’autres utilisateurs. |
| T09 | Disponibilité locale et synchronisation | Montrer les opérations possibles hors connexion et leurs états après reprise. |
| T10 | Droits et protection des données | Contrôler les mutations côté autorité du projet ; vérifier accès et périmètres d’extensions. |
| T11 | Sauvegarde et restauration | Restaurer un ensemble cohérent de métadonnées, volumes et publications. |
| T12 | Historique et publication | Retrouver les révisions et dépendances exactes d’un dossier publié. |
| T13 | Fidélité des échanges | Produire une matrice de couverture et un rapport des pertes ou transformations. |
| T14 | Modularité et contrats | Vérifier dépendances autorisées, interfaces publiques et absence d’accès direct aux données internes d’un autre module. |
| T15 | Migrations et versions des catalogues | Migrer un projet de référence et retrouver les versions utilisées par ses publications. |
| T16 | Interface stable et accessible | Réaliser les tâches définies au clavier ; conserver repères, favoris et retours compréhensibles. |
| T17 | Apprentissage mesuré | Mesurer réussite après tutoriel et rétention, séparément des compétences métier. |
| T18 | Performance et diagnostic | Mesurer latences, mémoire, charge graphique et erreurs sur un banc et un corpus déclarés. |
| T19 | Scripts et assistance IA contrôlés | Passer par les mêmes commandes et validations ; exécuter avec permissions et versions explicites. |
| T20 | Validation des analyses et de la fabrication | Relier résultats aux hypothèses, moteurs, machines et cas de référence couverts. |

## Annexe A — Comparaison des 32 applications et enseignements

Les observations concernent le mécanisme documenté dans la source indiquée. La dernière colonne est une proposition pour DrawAll, pas une fonction attribuée à l’application étudiée. « Documentation » désigne une source technique officielle ; « produit », « blog » et « cas client » indiquent une preuve de portée plus limitée. Il ne s’agit pas d’un classement de qualité ou de popularité.

| Nº | Application du fichier | Structure ou mécanisme documenté | Source officielle et portée | Enseignement pour DrawAll |
| --- | --- | --- | --- | --- |
| 01 | AutoCAD / AutoCAD LT | Document et objets CAO extensibles ; capacités d’extension différentes selon produit. | [ObjectARX](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Customization/files/GUID-3FF72BD0-9863-4739-8A45-B14AF1B67B06.htm) ; [limitations LT](https://help.autodesk.com/cloudhelp/2026/FRA/AutoCAD-Customization/files/GUID-E6429154-36DF-4D84-8ABC-9FCA15B66158.htm), documentation. | Un contrat d’extension commun, sans division fonctionnelle par édition. |
| 02 | Rhinoceros — Rhino | API de géométrie et possibilité d’exposer des calculs par service. | [RhinoCommon](https://developer.rhino3d.com/en/guides/rhinocommon/what-is-rhinocommon/) ; [Compute FAQ](https://developer.rhino3d.com/guides/compute/compute-faq/), documentation ; réserve Linux [S22]. | Séparer opérations de géométrie, interface et autorité des données. |
| 03 | BricsCAD / BricsCAD BIM | Données BIM associées au socle DWG ; bibliothèque de projet intégrée ou partagée. | [BIM data structure](https://helpcenter.bricsys.com/en-us/document/bricscad-bim/building-data/bim-data-structure?version=V26), documentation. | Enrichir les objets par des schémas métier explicites et versionnés. |
| 04 | DraftSight | API et automatisation autour des données et de l’interface CAO. | [DraftSight API](https://blog.draftsight.com/2017/07/19/draftsight-api/), blog technique officiel de 2017. | Un SDK documenté ; aucune hypothèse de compatibilité binaire universelle. |
| 05 | ZWCAD | Interfaces LISP, ZRX, COM et .NET documentées dans son portail développeur. | [Developer documentation](https://www.zwsoft.com/support/zwcad-devdoc), portail officiel. | Privilégier un modèle de commandes cohérent sous plusieurs interfaces d’automatisation. |
| 06 | Autodesk Revit | Modèle partagé, copies de travail, réservation et synchronisation. | [Worksharing overview](https://help.autodesk.com/cloudhelp/2024/ENU/Revit-API/files/Revit_API_Developers_Guide/Advanced_Topics/Worksharing/Revit_API_Revit_API_Developers_Guide_Advanced_Topics_Worksharing_Worksharing_Overview_html.html), documentation API. | Définir précisément unité de modification, réservation et résolution des conflits. |
| 07 | Archicad | BIMcloud distingue notamment gestion, serveur de données et cache de transfert. | [BIMcloud features](https://help.graphisoft.com/BC/INT/Topics/BCWelcome_Topics/r_BIMcloudFeatures.html), documentation. | Distinguer administration, autorité du modèle et accélération des accès. |
| 08 | Allplan | Allplan Share associe stockage partagé et données locales d’édition. | [Allplan Share](https://help.allplan.com/Allplan/2024-0/1033/Allplan/289130.htm), documentation. | Rendre explicites cache, modifications locales et état de synchronisation. |
| 09 | Vectorworks Architect | Fichier de projet et fichiers de travail ; réservation d’objets ou de couches. | [Working files](https://app-help.vectorworks.net/2024/eng/VW2024_Guide/ProjectSharing/Creating_and%20editing%20a_working_file.htm), documentation. | Choisir des périmètres de travail adaptés à la granularité des objets. |
| 10 | SketchUp Pro + LayOut | Modèle et document de présentation liés par une référence à actualiser. | [Managing model references](https://help.sketchup.com/en/layout/managing-model-references), documentation. | Conserver des objets documentaires distincts, avec révision et fraîcheur visibles. |
| 11 | MicroStation | Hiérarchie fichiers DGN, modèles et éléments, avec API de plateforme. | [MicroStation architecture](https://developer.bentley.com/documentation/microstation-python-api/pdf/03-MicroStationPython_MicroStationArchitecture.pdf), documentation PDF. | Organiser les conteneurs et références sans limiter le projet à une vue unique. |
| 12 | OpenBuildings Designer | Conception multidisciplinaire et documentation coordonnée autour d’objets de bâtiment. | [Product documentation overview](https://www.bentley.com/products/openbuildings-designer/), page produit accessible ; détails internes DataGroup non réaudités ici. | Relier objets métier et documents sur un socle partagé. |
| 13 | Tekla Structures | Modèles locaux et échange des modifications via Model Sharing ; travail possible entre synchronisations. | [Model Sharing](https://support.tekla.com/fr/doc/tekla-structures/2026/ms_what_is_model_sharing), documentation. | Prévoir un fonctionnement local contrôlé et des échanges traçables. |
| 14 | Autodesk Advance Steel | Distinction entre objet métier et représentation dans le socle AutoCAD. | [Developer documentation](https://help.autodesk.com/cloudhelp/2023/ENU/AdvSteel-Developers/files/GUID-0AFEFD2B-EED4-4F6A-8F97-BA0814E99643.htm), documentation API. | Séparer identité métier et représentation graphique. |
| 15 | cadwork | API d’éléments et automatisation de fonctions de conception et de production. | [Python API](https://docs.cadwork.com/projects/cwapi3dpython/en/latest/), documentation. | Conserver des liens traçables entre conception, listes et sorties de fabrication. |
| 16 | SOLIDWORKS | PDM associé ajoutant notamment serveur de base de données et serveur d’archives. | [PDM server components](https://help.solidworks.com/2024/english/SolidWorks/Install_Guide/c_pdm_server_components.htm), documentation ; accès dynamique partiel, mécanisme confirmé par extrait indexé officiel. | Intégrer la gestion des révisions tout en séparant métadonnées et volumes de fichiers. |
| 17 | CATIA | Configurations par fichiers et configurations associées à une plateforme ; un cas client décrit une transition V5 vers 3DEXPERIENCE. | [Hirth Engines](https://www.3ds.com/insights/customer-stories/hirth-engines-two-stroke-engines), cas client officiel, pas une description complète des services internes. | Définir tôt les droits, références et cycles de vie des données. |
| 18 | Siemens NX / Designcenter NX | Intégration documentée à Teamcenter pour la gestion des données de conception. | [NX–Teamcenter training](https://training.plm.automation.siemens.com/ilt/iltdescription.cfm?c=tr25910), programme officiel ; portée limitée à l’intégration enseignée. | Garder un contrat clair entre modèle CAO et gestion du produit. |
| 19 | PTC Creo | Dans Windchill, documents CAO et objets de structure produit sont liés mais distincts. | [CAD data management objects](https://support.ptc.com/help/windchill/r13.1.2.0/en/Windchill_Help_Center/cadx/CADxDMOviewTypes.html), documentation. | Ne pas confondre un document, une définition de pièce et son occurrence. |
| 20 | Autodesk Inventor | Assemblages distinguant définitions et occurrences de composants. | [Assembling parts](https://help.autodesk.com/cloudhelp/2018/ENU/Inventor-API/files/AssemblingParts_Overview.htm), documentation API de 2018. | Réutiliser les définitions et gérer placements, variantes et dépendances. |
| 21 | Autodesk Fusion | Gestion cloud et disponibilité locale conditionnée par les données présentes en cache. | [Offline and cached data](https://help.autodesk.com/cloudhelp/ENU/Fusion-Import/files/GUID-D28CA076-F78E-41FC-8F97-98F311B1D01C.htm), documentation. | Annoncer exactement ce qui est disponible sans réseau. |
| 22 | Onshape | Calcul géométrique serveur distinct de l’écriture des données ; fonctions programmables. | [Architecture](https://www.onshape.com/en/blog/cloud-native-architecture-empowers-cad-pdm), blog technique ; [FeatureScript](https://cad.onshape.com/FsDoc/intro.html), documentation. | Isoler calcul, transactions et programmation des fonctions. |
| 23 | Solid Edge / Designcenter Solid Edge | Gestion de données incluse et possibilité d’intégration à Teamcenter. | [Data management](https://solidedge.siemens.com/en/solutions/products/data-management/), page produit officielle. | Prévoir une gestion intégrée et des échanges avec un PLM externe. |
| 24 | AutoCAD Mechanical | Données de nomenclature distinctes de leur présentation sous forme de liste. | [BOM documentation](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Mechanical/files/GUID-91CB97FE-B935-4CEF-8CA7-10D2FCDFBA67.htm), documentation. | Une nomenclature doit être une vue calculée de données identifiées. |
| 25 | AutoCAD Electrical | Projet WDP reliant plusieurs dessins et paramètres. | [Project documentation](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Electrical/files/GUID-D957F2AE-4C9E-4319-B3C9-B5E8B48B94CB.htm), documentation. | Traiter la connectivité et la cohérence à l’échelle du projet. |
| 26 | AutoCAD Plant 3D | Projet comprenant dessins et données métier ; SQLite ou SQL Server selon configuration. | [Project database](https://help.autodesk.com/cloudhelp/2026/FRA/Plant3D-UserGuide/files/GUID-5D9CE5B5-0FD8-45D9-8D5B-B7F7F62C07A6.htm), documentation. | Considérer réseaux et catalogues comme des données métier de premier rang. |
| 27 | BricsCAD Mechanical | Hiérarchies de composants, avec composants locaux ou références externes. | [Mechanical browser](https://helpcenter.bricsys.com/en-us/document/bricscad-mechanical/getting-started/mechanical-browser-panel?version=V26), documentation. | Gérer les assemblages et leurs dépendances sans duplication systématique. |
| 28 | TopSolid’Design | Travail organisé autour d’un PDM, d’un coffre et d’opérations d’extraction/réintégration. | [PDM overview](https://help.topsolid.com/7.18/en/TopSolid%27Design/TopSolid/Pdm/UI/Overview.htm), documentation. | Intégrer le contrôle documentaire au parcours de conception. |
| 29 | EPLAN Electric P8 | API d’objets métier : appareils, fonctions et connexions. | [DataModel namespace](https://www.eplan.help/en-us/infoportal/content/api/2.9/Eplan.EplApi.DataModelu~Eplan.EplApi.DataModel_namespace.html), documentation API 2.9. | Une connexion électrique doit exister indépendamment de sa ligne dessinée. |
| 30 | SEE Electrical | Schémas, données électriques, rapports et fonctions complémentaires. | [SEE Electrical](https://etap.com/en/product/see-electrical), page produit officielle ; architecture interne non déduite de la liste de fonctions. | Relier schéma, matériel, implantation et documentation. |
| 31 | AVEVA E3D Design | Approche centrée sur des composants spécifiés et des données multidisciplinaires ; E3D est présenté dans Unified Engineering. | [E3D Design](https://www.aveva.com/en/products/e3d-design.hexagon/), page officielle actuelle ; ancienne page d’administration limitée par chargement dynamique. | Coordonner des objets métier, leurs spécifications et les changements entre disciplines. |
| 32 | Octave Forte 3D / Intergraph Smart 3D | Produit actuel de conception multidisciplinaire d’installations, fondé sur règles et données de référence. | [Forte 3D](https://www.octave.com/products/schematics-3d-modeling/forte/3d), page produit ; ancienne page détaillant les bases devenue inaccessible. | Administrer catalogues et règles ; ne pas figer une architecture interne ancienne comme vérité actuelle. |

### Comparaison transversale appliquée à DrawAll

| Famille d’architecture observée | Qualité à reprendre | Réponse proposée aux contraintes de DrawAll |
| --- | --- | --- |
| Document CAO extensible | Précision, réutilisation, commandes et SDK | Ajouter identité partagée, relations métier et versions dans le projet. |
| Modèle BIM partagé | Cohérence entre objets et documents | Étendre le modèle aux assemblages, connexions et procédés industriels. |
| CAO avec PDM/PLM | Révisions, dépendances, réutilisation et validation | Intégrer les opérations quotidiennes ; conserver des interfaces vers le PLM d’entreprise. |
| Conception cloud | Accès partagé, historique et calcul centralisé | Compléter par une interaction locale rapide et un périmètre hors connexion explicite. |
| Projet industriel centré sur les données | Catalogues, règles et coordination de disciplines | Relier aussi les objets bâtiment, pièces et schémas dans le projet commun. |


## Annexe B — Traçabilité intégrale des 324 entrées

Chaque libellé anglais ci-dessous est conservé tel qu’il apparaît dans l’inventaire consolidé du fichier fourni. Il désigne une exigence candidate, parfois très large ou redondante. **Toutes les lignes sont des exigences candidates à spécifier, développer et valider** : leur présence n’indique aucune fonction déjà implémentée.

M01–M17 renvoient à la section 6 du Concept V4. P1–P3 renvoient à sa trajectoire de développement, section 12. Le module indiqué est le responsable principal ; les autres modules peuvent contribuer. Les critères par catégorie constituent un premier cadre de recette, à détailler avant développement.

### B.1 Contrôle de couverture

| Catégorie d’origine | Nombre d’entrées | Modules principaux |
| --- | --- | --- |
| 1. Drawing and sketching | 12 | M01, M11 |
| 2. Editing and transformation | 17 | M01, M02 |
| 3. 3D modeling methods | 16 | M02, M05, M06, M08 |
| 4. Shape-generation operations | 11 | M02 |
| 5. Model organization and reusable content | 18 | M04, M05 |
| 6. Parametric controls and configurations | 10 | M03, M05, M12, M15 |
| 7. Architectural and building elements | 23 | M02, M05 |
| 8. Structural modeling and detailing | 19 | M06 |
| 9. Timber construction | 9 | M06, M13 |
| 10. Mechanical parts and assemblies | 16 | M02, M04, M06, M07 |
| 11. Sheet-metal tools | 5 | M07 |
| 12. Mechanical, plumbing and industrial-plant systems | 21 | M08, M09 |
| 13. Electrical and electronic design | 32 | M09, M10 |
| 14. Drawing views and documentation | 22 | M11 |
| 15. Measurement and annotation | 19 | M11 |
| 16. Sheets, schedules, quantities and reports | 17 | M11 |
| 17. Analysis, simulation and checking | 16 | M12 |
| 18. Visualization and animation | 4 | M14 |
| 19. Automation and computational design | 7 | M11, M15 |
| 20. Manufacturing and fabrication | 11 | M13 |
| 21. Collaboration and data management | 9 | M04, M11, M16 |
| 22. Interoperability, surveying and existing conditions | 10 | M14, M17 |
| **Total** | **324** | **17 modules mobilisés** |

### B.2 1. Drawing and sketching

**Critère de recette commun :** Primitives et contraintes mesurables ; accrochages et unités cohérents.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-01-01 | Precision 2D drawing and drafting | M01 | P1 | — |
| DA-01-02 | Lines and polylines | M01 | P1 | — |
| DA-01-03 | Arcs and circles | M01 | P1 | — |
| DA-01-04 | Rectangles | M01 | P1 | — |
| DA-01-05 | Curves and splines | M01 | P1 | — |
| DA-01-06 | Freehand drawing | M01 | P1 | — |
| DA-01-07 | Sketches and constrained sketches | M01 | P1 | — |
| DA-01-08 | Parametric sketching | M01 | P1 | — |
| DA-01-09 | Sketcher | M01 | P1 | Éditeur d’esquisses paramétriques ; équivalent fonctionnel, pas atelier CATIA intégré. |
| DA-01-10 | Centerlines | M01 | P1 | — |
| DA-01-11 | Hatching | M01 | P1 | — |
| DA-01-12 | Hidden-line management | M11 | P1 | — |

### B.3 2. Editing and transformation

**Critère de recette commun :** Transformations réversibles ; sélection, copie et dépendances conservées.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-02-01 | Move | M02 | P1 | — |
| DA-02-02 | Copy | M02 | P1 | — |
| DA-02-03 | Rotate | M02 | P1 | — |
| DA-02-04 | Mirror | M02 | P1 | — |
| DA-02-05 | Scale | M02 | P1 | — |
| DA-02-06 | Stretch | M02 | P1 | — |
| DA-02-07 | Trim | M02 | P1 | — |
| DA-02-08 | Extend | M02 | P1 | — |
| DA-02-09 | Offset | M02 | P1 | — |
| DA-02-10 | Fillet | M02 | P1 | — |
| DA-02-11 | Chamfer | M02 | P1 | — |
| DA-02-12 | Arrays and patterns | M02 | P1 | — |
| DA-02-13 | Explode | M02 | P1 | — |
| DA-02-14 | Control-point editing | M02 | P1 | — |
| DA-02-15 | Snapping | M01 | P1 | — |
| DA-02-16 | AccuDraw | M01 | P1 | Saisie de précision et repères de construction ; pas reprise du produit AccuDraw. |
| DA-02-17 | Gumball manipulation | M02 | P1 | Manipulateur de déplacement, rotation et échelle ; équivalent fonctionnel. |

### B.4 3. 3D modeling methods

**Critère de recette commun :** Représentation identifiée ; géométrie valide dans les tolérances du cas.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-03-01 | Solid modeling | M02 | P1 | — |
| DA-03-02 | Surface modeling | M02 | P2 | — |
| DA-03-03 | Mesh modeling | M02 | P2 | — |
| DA-03-04 | NURBS surfaces | M02 | P2 | — |
| DA-03-05 | SubD / subdivision modeling | M02 | P2 | — |
| DA-03-06 | Freeform modeling | M02 | P2 | — |
| DA-03-07 | Shape design | M02 | P2 | — |
| DA-03-08 | Advanced surfacing | M02 | P2 | — |
| DA-03-09 | Parametric modeling | M02 | P1 | — |
| DA-03-10 | Direct modeling and editing | M02 | P1 | — |
| DA-03-11 | Synchronous modeling | M02 | P2 | Édition directe combinée aux contraintes ; algorithme et comportement à valider. |
| DA-03-12 | Multibody modeling | M02 | P1 | — |
| DA-03-13 | Architectural modeling | M05 | P1 | — |
| DA-03-14 | Structural BIM modeling | M06 | P2 | — |
| DA-03-15 | Construction modeling | M05 | P1 | — |
| DA-03-16 | Multidisciplinary plant modeling | M08 | P2 | Coordination de plusieurs disciplines ; dépend aussi de M06 et M09. |

### B.5 4. Shape-generation operations

**Critère de recette commun :** Résultat géométrique valide ; erreurs et références ambiguës signalées.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-04-01 | Extrusion | M02 | P1 | — |
| DA-04-02 | Revolution | M02 | P1 | — |
| DA-04-03 | Sweep | M02 | P1 | — |
| DA-04-04 | Loft | M02 | P1 | — |
| DA-04-05 | Patch | M02 | P2 | — |
| DA-04-06 | Blend | M02 | P2 | — |
| DA-04-07 | Push/Pull | M02 | P1 | — |
| DA-04-08 | Follow Me | M02 | P1 | Balayage d’un profil le long d’un trajet ; équivalent fonctionnel. |
| DA-04-09 | Holes | M02 | P1 | — |
| DA-04-10 | Shells for mechanical parts | M02 | P1 | — |
| DA-04-11 | Boolean / solid operations | M02 | P1 | — |

### B.6 5. Model organization and reusable content

**Critère de recette commun :** Identités, occurrences et références stables lors de la réutilisation.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-05-01 | Layers | M04 | P1 | — |
| DA-05-02 | Classes | M04 | P1 | — |
| DA-05-03 | Levels | M04 | P1 | Organisation d’affichage ; distinguer un level CAO d’un niveau de bâtiment. |
| DA-05-04 | Stories | M05 | P1 | — |
| DA-05-05 | Groups | M04 | P1 | — |
| DA-05-06 | Blocks | M04 | P1 | — |
| DA-05-07 | Block libraries | M04 | P1 | — |
| DA-05-08 | Flexiblocks | M04 | P2 | Blocs configurables et paramétriques ; aucune compatibilité Flexiblocks présumée. |
| DA-05-09 | Components | M04 | P1 | — |
| DA-05-10 | Cells | M04 | P1 | Contenu réutilisable de type cellule ; traduction DGN gérée par M17. |
| DA-05-11 | External references | M04 | P1 | — |
| DA-05-12 | Objects | M04 | P1 | — |
| DA-05-13 | Part Studios | M04 | P1 | Contexte partagé de conception de plusieurs pièces ; pas format natif Onshape. |
| DA-05-14 | Standard-part libraries | M04 | P1 | — |
| DA-05-15 | Standard-component libraries | M04 | P1 | — |
| DA-05-16 | Intelligent component libraries | M04 | P2 | Bibliothèques avec règles, connecteurs et versions de composants. |
| DA-05-17 | Hardware libraries | M04 | P2 | — |
| DA-05-18 | Component catalogs | M04 | P2 | — |

### B.7 6. Parametric controls and configurations

**Critère de recette commun :** Recalcul reproductible ; incompatibilités de paramètres et contraintes expliquées.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-06-01 | Constraints | M03 | P1 | — |
| DA-06-02 | Parametric constraints | M03 | P1 | — |
| DA-06-03 | Parametric families | M03 | P2 | — |
| DA-06-04 | Family tables | M03 | P2 | — |
| DA-06-05 | Configurations | M03 | P2 | — |
| DA-06-06 | Model states | M03 | P2 | — |
| DA-06-07 | BIM properties | M05 | P1 | — |
| DA-06-08 | Building-element classification | M05 | P1 | — |
| DA-06-09 | Knowledgeware rules | M15 | P2 | Règles et expressions paramétriques ; pas exécution native Knowledgeware. |
| DA-06-10 | Design rules | M12 | P2 | — |

### B.8 7. Architectural and building elements

**Critère de recette commun :** Relations hôte–objet, quantités et vues cohérentes après modification.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-07-01 | Walls | M05 | P1 | — |
| DA-07-02 | Doors | M05 | P1 | — |
| DA-07-03 | Windows | M05 | P1 | — |
| DA-07-04 | Openings | M05 | P1 | — |
| DA-07-05 | Floors | M05 | P1 | — |
| DA-07-06 | Slabs | M05 | P1 | — |
| DA-07-07 | Roofs | M05 | P1 | — |
| DA-07-08 | Ceilings | M05 | P2 | — |
| DA-07-09 | Architectural shells | M05 | P2 | — |
| DA-07-10 | Stairs | M05 | P2 | — |
| DA-07-11 | Ramps | M05 | P2 | — |
| DA-07-12 | Railings | M05 | P2 | — |
| DA-07-13 | Ladders | M05 | P2 | — |
| DA-07-14 | Curtain walls | M05 | P2 | — |
| DA-07-15 | Rooms | M05 | P1 | — |
| DA-07-16 | Spaces | M05 | P1 | — |
| DA-07-17 | Zones | M05 | P1 | — |
| DA-07-18 | Terrain modeling | M05 | P2 | — |
| DA-07-19 | Terrain meshes | M05 | P2 | — |
| DA-07-20 | Morph modeling | M02 | P2 | Édition libre d’objets avec conversion métier explicite ; équivalent fonctionnel. |
| DA-07-21 | Renovation tools | M05 | P2 | — |
| DA-07-22 | Project phases | M05 | P2 | — |
| DA-07-23 | Construction-site planning | M05 | P2 | — |

### B.9 8. Structural modeling and detailing

**Critère de recette commun :** Assemblages, repères et détails cohérents ; calcul structurel séparément validé.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-08-01 | Beams | M06 | P1 | — |
| DA-08-02 | Columns | M06 | P1 | — |
| DA-08-03 | Structural members | M06 | P1 | — |
| DA-08-04 | Structural framing | M06 | P1 | — |
| DA-08-05 | Frame design | M06 | P1 | — |
| DA-08-06 | Steel members | M06 | P2 | — |
| DA-08-07 | Steel modeling | M06 | P2 | — |
| DA-08-08 | Concrete modeling | M06 | P2 | — |
| DA-08-09 | Plates | M06 | P2 | — |
| DA-08-10 | Bolts and fasteners | M06 | P2 | — |
| DA-08-11 | Welds and weld design | M06 | P2 | — |
| DA-08-12 | Connections | M06 | P2 | — |
| DA-08-13 | Parametric steel connections | M06 | P2 | — |
| DA-08-14 | Reinforcement modeling | M06 | P2 | — |
| DA-08-15 | Precast units and detailing | M06 | P2 | — |
| DA-08-16 | Concrete pours | M06 | P2 | — |
| DA-08-17 | Steel detailing | M06 | P2 | — |
| DA-08-18 | Concrete detailing | M06 | P2 | — |
| DA-08-19 | Full fabrication detailing | M06 | P2 | — |

### B.10 9. Timber construction

**Critère de recette commun :** Géométrie, assemblages, listes et sorties d’atelier conformes au cas de référence.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-09-01 | Timber members | M06 | P2 | — |
| DA-09-02 | Timber-frame elements | M06 | P2 | — |
| DA-09-03 | CLT elements | M06 | P2 | — |
| DA-09-04 | Wood-to-wood connections | M06 | P2 | — |
| DA-09-05 | Wood-to-metal connections | M06 | P2 | — |
| DA-09-06 | Connection hardware | M06 | P2 | — |
| DA-09-07 | Automatic wall tools | M06 | P2 | — |
| DA-09-08 | Automatic roof tools | M06 | P2 | — |
| DA-09-09 | Panel optimization | M13 | P3 | Optimisation d’imbrication et de découpe selon panneaux et contraintes. |

### B.11 10. Mechanical parts and assemblies

**Critère de recette commun :** Occurrences et liaisons correctement résolues ; nomenclature cohérente.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-10-01 | Part modeling / Part Design | M02 | P1 | — |
| DA-10-02 | Mechanical components | M04 | P1 | — |
| DA-10-03 | Mechanical features | M02 | P1 | — |
| DA-10-04 | Shafts | M02 | P2 | — |
| DA-10-05 | Standard mechanical parts | M04 | P1 | — |
| DA-10-06 | Assemblies / Assembly Design | M04 | P1 | — |
| DA-10-07 | Assembly modeling | M04 | P1 | — |
| DA-10-08 | Mates | M04 | P1 | — |
| DA-10-09 | Mechanical joints | M04 | P1 | — |
| DA-10-10 | Weldments | M06 | P2 | — |
| DA-10-11 | Mold-design tools | M07 | P3 | Domaine complet à spécifier : dépouilles, séparation et composants d’outillage. |
| DA-10-12 | Tooling design | M07 | P3 | — |
| DA-10-13 | Part references | M04 | P1 | — |
| DA-10-14 | Part numbering | M04 | P1 | — |
| DA-10-15 | Assembly numbering | M04 | P1 | — |
| DA-10-16 | Exploded views, representations and presentations | M04 | P1 | — |

### B.12 11. Sheet-metal tools

**Critère de recette commun :** Cohérence plié–développé selon matériau et paramètres de pliage documentés.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-11-01 | Sheet-metal design and modeling | M07 | P2 | — |
| DA-11-02 | Folded plates | M07 | P2 | — |
| DA-11-03 | Unfolding | M07 | P2 | — |
| DA-11-04 | Flat patterns | M07 | P2 | — |
| DA-11-05 | Bend tables | M07 | P2 | — |

### B.13 12. Mechanical, plumbing and industrial-plant systems

**Critère de recette commun :** Connectivité et spécifications vérifiées ; vues et listes dérivées du réseau.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-12-01 | MEP tools | M08 | P2 | Catégorie englobante ; coopération M08–M09, approfondie en P3 pour l’électricité. |
| DA-12-02 | Mechanical ducts | M08 | P2 | — |
| DA-12-03 | HVAC modeling | M08 | P2 | — |
| DA-12-04 | Pipe modeling | M08 | P2 | — |
| DA-12-05 | Pipe and tube design | M08 | P2 | — |
| DA-12-06 | Piping routing | M08 | P2 | — |
| DA-12-07 | Specification-driven piping | M08 | P2 | — |
| DA-12-08 | Fittings | M08 | P2 | — |
| DA-12-09 | Valves | M08 | P2 | — |
| DA-12-10 | Equipment modeling | M08 | P2 | — |
| DA-12-11 | Equipment placement | M08 | P2 | — |
| DA-12-12 | Supports | M08 | P2 | — |
| DA-12-13 | Cable trays | M08 | P2 | — |
| DA-12-14 | Conduits | M08 | P2 | — |
| DA-12-15 | Electrical building systems | M09 | P3 | — |
| DA-12-16 | Piping and instrumentation diagrams — P&IDs | M08 | P2 | — |
| DA-12-17 | Piping specifications | M08 | P2 | — |
| DA-12-18 | Component specifications | M08 | P2 | — |
| DA-12-19 | Catalogs | M08 | P2 | — |
| DA-12-20 | Specification editing | M08 | P2 | — |
| DA-12-21 | Catalog editing | M08 | P2 | — |

### B.14 13. Electrical and electronic design

**Critère de recette commun :** Repères et connexions cohérents entre schémas, implantations et listes.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-13-01 | Electrical design | M09 | P3 | — |
| DA-13-02 | Electrical schematics | M09 | P3 | — |
| DA-13-03 | Single-line diagrams | M09 | P3 | — |
| DA-13-04 | Multi-line diagrams | M09 | P3 | — |
| DA-13-05 | Schematic circuits | M09 | P3 | — |
| DA-13-06 | Electrical circuits | M09 | P3 | — |
| DA-13-07 | Electrical-symbol libraries | M09 | P3 | — |
| DA-13-08 | Standard electrical symbols | M09 | P3 | — |
| DA-13-09 | Circuit Builder | M09 | P3 | Constructeur de circuits réutilisables ; équivalent fonctionnel. |
| DA-13-10 | Circuit macros | M09 | P3 | — |
| DA-13-11 | Automatic connections | M09 | P3 | — |
| DA-13-12 | Automatic numbering | M09 | P3 | — |
| DA-13-13 | Wire numbering | M09 | P3 | — |
| DA-13-14 | Component tagging | M09 | P3 | — |
| DA-13-15 | Cross-references | M09 | P3 | — |
| DA-13-16 | Device data | M09 | P3 | — |
| DA-13-17 | Electrical equipment catalogs | M09 | P3 | — |
| DA-13-18 | PLC diagrams | M09 | P3 | — |
| DA-13-19 | PLC documentation | M09 | P3 | — |
| DA-13-20 | Terminal documentation | M09 | P3 | — |
| DA-13-21 | Cable documentation | M09 | P3 | — |
| DA-13-22 | Terminals | M09 | P3 | — |
| DA-13-23 | Cables | M09 | P3 | — |
| DA-13-24 | Connectors | M09 | P3 | — |
| DA-13-25 | Electrical routing | M09 | P3 | — |
| DA-13-26 | 2D component placement | M09 | P3 | — |
| DA-13-27 | Panel-layout footprints | M09 | P3 | — |
| DA-13-28 | 2D panel layouts | M09 | P3 | — |
| DA-13-29 | 3D cabinet modeling | M09 | P3 | — |
| DA-13-30 | Electronic schematics | M10 | P3 | — |
| DA-13-31 | PCB layout | M10 | P3 | — |
| DA-13-32 | SEE Electrical 3D Panel | M09 | P3 | Implantation 3D d’armoires et préparation ; pas inclusion du produit tiers. |

### B.15 14. Drawing views and documentation

**Critère de recette commun :** Échelle et visibilité correctes ; état de mise à jour de chaque vue visible.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-14-01 | Drawing views | M11 | P1 | — |
| DA-14-02 | Plans | M11 | P1 | — |
| DA-14-03 | Sections | M11 | P1 | — |
| DA-14-04 | Section planes | M11 | P1 | — |
| DA-14-05 | Elevations | M11 | P1 | — |
| DA-14-06 | Details | M11 | P1 | — |
| DA-14-07 | Assembly details | M11 | P1 | — |
| DA-14-08 | Detail viewports | M11 | P1 | — |
| DA-14-09 | Scaled viewports | M11 | P1 | — |
| DA-14-10 | Orthographic drawings | M11 | P1 | — |
| DA-14-11 | Piping isometric drawings | M11 | P2 | — |
| DA-14-12 | General-arrangement drawings | M11 | P1 | — |
| DA-14-13 | Shop drawings | M11 | P2 | — |
| DA-14-14 | Steel production drawings | M11 | P2 | — |
| DA-14-15 | Concrete production drawings | M11 | P2 | — |
| DA-14-16 | Associative drawings and drawing views | M11 | P1 | — |
| DA-14-17 | Associative drafting | M11 | P1 | — |
| DA-14-18 | Drafting | M11 | P1 | — |
| DA-14-19 | Make2D | M11 | P1 | Projection 2D avec gestion de visibilité ; équivalent fonctionnel. |
| DA-14-20 | Building documentation | M11 | P1 | — |
| DA-14-21 | Coordinated drawings | M11 | P1 | — |
| DA-14-22 | Synchronized model documentation | M11 | P1 | — |

### B.16 15. Measurement and annotation

**Critère de recette commun :** Attachement correct aux objets ; références rompues ou ambiguës signalées.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-15-01 | Measurements | M11 | P1 | — |
| DA-15-02 | Dimensions | M11 | P1 | — |
| DA-15-03 | Mechanical dimensions | M11 | P2 | — |
| DA-15-04 | Text | M11 | P1 | — |
| DA-15-05 | Labels | M11 | P1 | — |
| DA-15-06 | Tags | M11 | P1 | — |
| DA-15-07 | General annotations | M11 | P1 | — |
| DA-15-08 | Intelligent annotations | M11 | P2 | — |
| DA-15-09 | Mechanical annotations | M11 | P2 | — |
| DA-15-10 | Manufacturing annotations | M11 | P2 | — |
| DA-15-11 | 3D manufacturing annotations | M11 | P2 | Annotations attachées au modèle ; relations sémantiques et export à valider. |
| DA-15-12 | Tolerances | M11 | P2 | — |
| DA-15-13 | Geometric tolerances | M11 | P2 | — |
| DA-15-14 | Welding symbols | M11 | P2 | — |
| DA-15-15 | Surface-finish symbols | M11 | P2 | — |
| DA-15-16 | Specialist symbols | M11 | P2 | — |
| DA-15-17 | Balloons | M11 | P1 | — |
| DA-15-18 | Hole charts | M11 | P2 | — |
| DA-15-19 | Drawing frames | M11 | P1 | — |

### B.17 16. Sheets, schedules, quantities and reports

**Critère de recette commun :** Quantités reproductibles à partir d’une révision et de règles identifiées.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-16-01 | Layouts | M11 | P1 | — |
| DA-16-02 | Drawing sheets | M11 | P1 | — |
| DA-16-03 | Sheet layouts | M11 | P1 | — |
| DA-16-04 | Sheet organization | M11 | P1 | — |
| DA-16-05 | Sheet-set management | M11 | P1 | — |
| DA-16-06 | Tables | M11 | P1 | — |
| DA-16-07 | Worksheets | M11 | P1 | — |
| DA-16-08 | Schedules | M11 | P1 | — |
| DA-16-09 | Bending schedules | M11 | P2 | — |
| DA-16-10 | Quantities | M11 | P1 | — |
| DA-16-11 | Reports | M11 | P1 | — |
| DA-16-12 | Automatic reports | M11 | P1 | — |
| DA-16-13 | Material reports | M11 | P1 | — |
| DA-16-14 | Material lists | M11 | P1 | — |
| DA-16-15 | Parts lists | M11 | P1 | — |
| DA-16-16 | Cut lists | M11 | P2 | — |
| DA-16-17 | Bills of materials — BOMs | M11 | P1 | — |

### B.18 17. Analysis, simulation and checking

**Critère de recette commun :** Hypothèses, entrées et solveur tracés ; résultats comparés à des cas de référence.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-17-01 | General analysis | M12 | P3 | Famille d’analyses ; chaque modèle physique exige une spécification séparée. |
| DA-17-02 | Simulation | M12 | P3 | Orchestration de simulations ; présence du module ne prouve pas tous les solveurs. |
| DA-17-03 | Advanced simulation | M12 | P3 | Périmètre à fermer par disciplines et cas validés, avant engagement de livraison. |
| DA-17-04 | Motion analysis | M12 | P2 | — |
| DA-17-05 | Kinematics | M12 | P2 | — |
| DA-17-06 | Kinematic simulation | M12 | P2 | — |
| DA-17-07 | Dynamic simulation | M12 | P3 | — |
| DA-17-08 | Optimization | M12 | P3 | Fonctions objectif, contraintes et convergence à expliciter par cas. |
| DA-17-09 | Shaft analysis | M12 | P3 | — |
| DA-17-10 | Inertia calculations | M12 | P2 | — |
| DA-17-11 | Basic 2D analysis | M12 | P2 | — |
| DA-17-12 | Electrical checks | M12 | P3 | — |
| DA-17-13 | Clash detection | M12 | P2 | — |
| DA-17-14 | Specification checks | M12 | P2 | — |
| DA-17-15 | Design-rule checks | M12 | P2 | — |
| DA-17-16 | Digital mock-up review | M12 | P1 | — |

### B.19 18. Visualization and animation

**Critère de recette commun :** Image ou animation rattachée à la bonne version ; budgets graphiques respectés.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-18-01 | Rendering | M14 | P2 | — |
| DA-18-02 | Model animation | M14 | P2 | — |
| DA-18-03 | Exploded presentations | M14 | P1 | — |
| DA-18-04 | Digital mock-up visualization and review | M14 | P1 | — |

### B.20 19. Automation and computational design

**Critère de recette commun :** Exécution contrôlée et reproductible avec bibliothèques versionnées.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-19-01 | Design automation | M15 | P2 | — |
| DA-19-02 | Computational design | M15 | P2 | — |
| DA-19-03 | Dynamo | M15 | P2 | Programmation visuelle ; import de graphes Dynamo non garanti. |
| DA-19-04 | Grasshopper | M15 | P2 | Programmation visuelle ; import de graphes Grasshopper non garanti. |
| DA-19-05 | Knowledgeware | M15 | P2 | Règles de conception ; équivalent fonctionnel, pas compatibilité native. |
| DA-19-06 | Automatic drawing/report generation | M11 | P2 | — |
| DA-19-07 | Specialist industry toolsets | M15 | P3 | Entrée englobante : fonctions métier distribuées dans tous les modules concernés. |

### B.21 20. Manufacturing and fabrication

**Critère de recette commun :** Unités, machine et postprocesseur identifiés ; vérification avant publication.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-20-01 | CAM | M13 | P3 | Domaine de fabrication ; opérations, machines et postprocesseurs à délimiter. |
| DA-20-02 | Machining | M13 | P3 | — |
| DA-20-03 | Advanced machining | M13 | P3 | Stratégies et cinématiques avancées à valider machine par machine. |
| DA-20-04 | Milling | M13 | P3 | — |
| DA-20-05 | Turning | M13 | P3 | — |
| DA-20-06 | Manufacturing preparation | M13 | P3 | — |
| DA-20-07 | Electrical-cabinet manufacturing preparation | M13 | P3 | — |
| DA-20-08 | Fabrication exports | M13 | P2 | — |
| DA-20-09 | CNC output | M13 | P3 | — |
| DA-20-10 | CNC machine interfaces | M13 | P3 | Interfaces documentées par fabricant ; disponibilité non présumée. |
| DA-20-11 | TopSolid’Cam machining | M13 | P3 | Fonctions de FAO intégrées ; pas incorporation du produit TopSolid’Cam. |

### B.22 21. Collaboration and data management

**Critère de recette commun :** Aucune perte silencieuse de modification validée ; conflits et révisions explicites.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-21-01 | Worksharing | M16 | P1 | — |
| DA-21-02 | Collaborative editing | M16 | P1 | — |
| DA-21-03 | Multidisciplinary coordination | M16 | P1 | — |
| DA-21-04 | Version management | M16 | P1 | — |
| DA-21-05 | Integrated data management | M16 | P1 | — |
| DA-21-06 | Change tracking | M16 | P1 | — |
| DA-21-07 | Revision tracking | M16 | P1 | — |
| DA-21-08 | Drawing comparison | M11 | P2 | — |
| DA-21-09 | Model reuse | M04 | P1 | — |

### B.23 22. Interoperability, surveying and existing conditions

**Critère de recette commun :** Rapport de fidélité ; unités, repères, propriétés et pertes contrôlés.

| ID | Libellé du fichier | Module | Étape cible | Interprétation particulière |
| --- | --- | --- | --- | --- |
| DA-22-01 | IFC exchange | M17 | P1 | — |
| DA-22-02 | DGN interoperability | M17 | P2 | Prise en charge progressive ; matrice de versions et objets couverts. |
| DA-22-03 | DWG interoperability | M17 | P1 | Socle d’échange initial ; objets métier avancés à approfondir ultérieurement. |
| DA-22-04 | PDF tools | M17 | P1 | — |
| DA-22-05 | PDF output | M17 | P1 | — |
| DA-22-06 | Georeferencing | M17 | P1 | — |
| DA-22-07 | Reverse engineering | M14 | P2 | — |
| DA-22-08 | Laser-scan integration | M14 | P2 | — |
| DA-22-09 | Point-cloud tools | M14 | P2 | — |
| DA-22-10 | CloudWorx integration | M14 | P2 | Relevé et nuages de points ; connecteur CloudWorx seulement si intégration possible. |


## Annexe C — Références de recherche et portée des preuves

**Date de consultation : 3 octobre 2026.** Les références S01–S35 étayent les choix transversaux ; les sources propres aux 32 applications sont directement liées dans l’annexe A. Les décisions de produit et d’architecture sont les propositions de ce rapport, et non les recommandations officielles de ces organismes.

| Réf. | Source | Nature, version ou date | Utilisation et limite |
| --- | --- | --- | --- |
| S01 | Onshape — [Cloud-native architecture empowers CAD and PDM](https://www.onshape.com/en/blog/cloud-native-architecture-empowers-cad-pdm) | Blog technique de l’éditeur, page consultée | Séparation du calcul et de l’écriture des données ; pas un benchmark indépendant. |
| S02 | Onshape — [FeatureScript introduction](https://cad.onshape.com/FsDoc/intro.html) | Documentation développeur | Fonctions paramétriques, génération et déterminisme ; aucune compatibilité avec les autres langages n’en découle. |
| S03 | Open CASCADE — [OCCT overview](https://occt3d.com/dev/doc/overview/html/index.html) | Documentation officielle ; redirection du portail historique dev.opencascade.org | Périmètre du noyau et des composants applicatifs. |
| S04 | Open CASCADE — [OCAF user guide](https://occt3d.com/dev/doc/overview/html/occt_user_guides__ocaf.html) | Guide technique officiel | Infrastructure documentaire, références et suivi de l’évolution topologique. Les opérations de l’application doivent alimenter correctement ce mécanisme. |
| S05 | Open CASCADE — [Samples, OCCT 7.8](https://dev.opencascade.org/doc/occt-7.8.0/overview/html/samples.html) | Exemples techniques versionnés | Démonstration de mise en œuvre WebAssembly/WebGL ; aucune mesure extrapolée à DrawAll. |
| S06 | Siemens — [D-Cubed](https://www.siemens.com/en-us/products/plm-components/d-cubed/) | Documentation commerciale et technique officielle ; extrait indexé exploitable, ouverture complète bloquée par le type de contenu | Familles de solveurs de contraintes 2D/3D. Licences, disponibilité et intégration à confirmer avant sélection. |
| S07 | Siemens — [Parasolid](https://www.siemens.com/en-us/products/plm-components/parasolid/) | Page officielle ; extrait indexé exploitable, ouverture complète bloquée par le type de contenu | Candidat de noyau géométrique ; aucune disponibilité WebAssembly supposée. |
| S08 | buildingSMART — [IFC 4.3.2.0, Scope](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/content/scope.htm) | Texte de référence du schéma | Périmètre de l’échange d’informations pour construction et infrastructure. |
| S09 | buildingSMART — [Information Delivery Specification](https://www.buildingsmart.org/standards/bsi-standards/information-delivery-specification-ids/) | Présentation et FAQ officielles | Exigences d’information ; limite explicite concernant les aspects géométriques. |
| S10 | buildingSMART — [BIM Collaboration Format](https://technical.buildingsmart.org/standards/bcf/) | Documentation officielle | Échange de problèmes de coordination et de leurs contextes ; ne remplace pas le modèle. |
| S11 | NIST — [STEP File Analyzer and Viewer](https://www.nist.gov/services-resources/software/step-file-analyzer-and-viewer) | Ressource technique publique | Analyse STEP, informations de fabrication et propriétés de validation ; base pour concevoir une recette d’échange. |
| S12 | IfcOpenShell — [Geometry iterator](https://docs.ifcopenshell.org/ifcopenshell/geometry_iterator.html) | Documentation du projet | Traitement géométrique, réutilisation et parallélisation ; bibliothèque de traitement, pas application BIM complète. |
| S13 | Open Design Alliance — [Drawings](https://www.opendesign.com/products/drawings) et [Product descriptions FAQ](https://www.opendesign.com/faq/product-descriptions) | Documentation officielle de composants | Formats et distinction entre socle et extensions d’objets métier ; fidélité à tester sur les fichiers cibles. |
| S14 | MDN — [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | Documentation web, état de compatibilité consulté | Contraintes de disponibilité et capacités ; prévoir détection et repli. |
| S15 | MDN — [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Documentation web | Quotas, conservation et éviction ; distinguer cache, persistance demandée et sauvegarde. |
| S16 | Emscripten — [Pthreads support](https://emscripten.org/docs/porting/pthreads.html) | Documentation du compilateur | Conditions du multithreading navigateur, notamment mémoire partagée et isolation requise. Ne pas en déduire une accélération automatique. |
| S17 | Kleppmann et al. — [Local-first software](https://www.inkandswitch.com/essay/local-first/) | Publication de recherche, 2019 ; texte intégral consulté | Principes d’autonomie, travail hors connexion et collaboration ; pas validation de fusion des contraintes CAO. |
| S18 | Deng et al. — [Untangling the Timeline](https://arxiv.org/html/2602.09236v1) | Prépublication arXiv, version 1, 2026 ; texte consulté | Analyse de 424 discussions de sept forums, couvrant avril 2005 à juillet 2024. Résultats limités par le corpus et les signalements de problèmes. |
| S19 | Grossman et Fitzmaurice — [ToolClips: An Investigation of Contextual Video Assistance for Functionality Understanding](https://www.research.autodesk.com/publications/toolclips-an-investigation-of-contextual-video-assistance-for-functionality-understanding/) | CHI 2010 ; page et résumé des auteurs consultés | Aide contextuelle et apprentissage. Aucun gain chiffré de l’étude n’est transposé à DrawAll. |
| S20 | Grossman, Fitzmaurice et Attar — [A Survey of Software Learnability: Metrics, Methodologies and Guidelines](https://www.research.autodesk.com/publications/a-survey-of-software-learnability-metrics-methodologies-and-guidelines/) | CHI 2009 ; [PDF consulté](https://www.research.autodesk.com/app/uploads/2023/03/a-survey-of-software.pdf_recqWPTEYd6nsP0r8.pdf) | Méthodes de mesure de l’apprentissage ; ne fournit pas de résultat pour le concept proposé. |
| S21 | Khan et al. — [Text2CAD](https://proceedings.neurips.cc/paper_files/paper/2024/hash/0e5b96f97c1813bb75f6c28532c2ecc7-Abstract-Conference.html) | NeurIPS 2024 ; résumé officiel consulté | Génération de séquences CAO depuis du texte ; pas d’extrapolation à l’ingénierie autonome générale. |
| S22 | McNeel — [Rhino.Compute on Linux](https://developer.rhino3d.com/guides/compute/compute-linux-getting-started/) | Guide officiel consulté | État de développement et limites de la variante Linux. Cette source précise une réserve que la FAQ générale ne suffit pas à lever. |
| S23 | [Hierarchical Naming Method and Mechanism Design for Topological Entities](https://www.jcad.cn/en/article/doi/10.3724/SP.J.1089.2023-00023) | Journal of Computer-Aided Design & Computer Graphics, 2023 ; résumé accessible | Travail sur le nommage topologique et prototype OCCT. La preuve détaillée de portée générale n’a pas été auditée. |
| S24 | KiCad — [PCB Editor manual](https://docs.kicad.org/7.0/en/pcbnew/pcbnew.html) | Documentation officielle, version 7.0 | Exemple de sémantique PCB : réseaux, classes et règles. La référence illustre un mécanisme, pas l’état des dernières fonctions KiCad. |
| S26 | Open CASCADE — [BRep format](https://github.com/Open-Cascade-SAS/OCCT/wiki/brep_format) | Documentation technique historique officielle, consultée le 3 octobre 2026 ; dépôt signalant son déplacement vers le portail documentaire actuel | Distinction entre topologie et géométrie, diversité des surfaces ; aucune conclusion sur les performances d’une version actuelle. |
| S27 | Open CASCADE — [OCCT WASM released](https://open-cascade.com/news/occt-wasm-released/) | Annonce éditeur, 2025 ; page consultée | Bundle WASM ~4,5 MB (brotli), API TypeScript, travailleurs web ; chiffres non audités indépendamment — à mesurer sur le corpus DrawAll. |
| S28 | three.js — [Issue #30560 : performance WebGPURenderer](https://github.com/mrdoob/three.js/issues/30560) | Suivi de défaut public ; scène de référence de 20 000 objets non instanciés | Signalement : chute de 60 à 15 FPS sur WebGPU (système UBO) ; supérieur en instanciation massive et compute shaders ; à reproduire avant tout choix définitif. |
| S29 | Zhou et al. — [CADialogue](https://www.sciencedirect.com/science/article/pii/S0010448525002694) | Article, *Computer-Aided Design*, 2025 ; résumé consulté | Assistant multimodal : 95,71 % de succès, macros en cache > 85× plus rapides ; environnement mécanique (FreeCAD) — non extrapolable au bâtiment. |
| S30 | — [CAD-Assistant](https://arxiv.org/abs/2504.11193) | Prépublication arXiv, ICCV 2025 ; résumé consulté | Autocontrainte d’esquisse en zéro-shot (F1 0,979), code vérifié par les moteurs du logiciel ; pas de conception autonome générale. |
| S31 | Speckle — [Documentation](https://speckle.guide/) | Documentation de projet open source | Flux d’objets versionnés (graphe acyclique dirigé) en remplacement des fichiers, connecteurs multi-logiciels ; modèle de preuve pour l’interopérabilité, pas composant retenu. |
| S32 | buildingSMART — [IFC 4.3 et certification](https://technical.buildingsmart.org/) | Pages officielles consultées | IFC 4.3.2.0 accepté comme ISO 16739-1:2024 ; le programme de certification actuel est un scorecard fondé sur fichiers soumis — viser conformité testée, non « certification produit ». |
| S33 | prostep ivip — [STEP AP242](https://www.prostep.org/en/projects/step-standard/) | Page de projet consultée | Travail technique AP242 Éd.4 achevé en 2024 (stade FDIS à la consultation) : PMI d’assemblage, cinématique ; l’Éd.3 (2022) reste la cible initiale. |
| S34 | Yjs / Automerge — documentations officielles | Bibliothèques CRDT en production | Maturité démontrée pour texte et données structurées légères ; aucune garantie pour la régénération géométrique B-Rep. |
| S35 | Travaux académiques sur CRDT pour CAO feature-based (2023–2026) | Publications et prépublications consultées | Relations de dépendance/conflit entre opérations de modélisation ; stade prototype — veille technologique seulement. |

## Contrôle de cohérence de la V4

- Les 324 libellés de l’inventaire sont présents dans l’annexe B, avec identifiants uniques DA-XX-YY.
- Les 22 catégories et les 17 modules sont conservés.
- Répartition principale maintenue : 146 entrées P1, 124 entrées P2 et 54 entrées P3.
- Les 32 lignes d’applications et leurs sources officielles restent accessibles dans l’annexe A.
- Les 24 références transversales d’origine (S01–S24) sont conservées ; S26 complète la précision sur la BRep ; neuf références vérifiées par recherche indépendante (S27–S35) étayent les décisions techniques de l’annexe D.
- Les 20 exigences T01–T20 sont identifiées séparément et ne sont pas ajoutées artificiellement au décompte de l’inventaire.
- Les conditions de réalisation figurent dans le Concept v4.1 ; les contrats techniques figurent dans l’Architecture v4.1.

### Portée des preuves

La couverture documentaire est vérifiée sur un inventaire fermé. Elle ne démontre ni une couverture exhaustive du marché ni l’équivalence technique avec chaque logiciel cité. Les sources de produits documentent des mécanismes précis ; elles ne prouvent pas les performances de DrawAll. Les essais à venir doivent produire des résultats attachés à des cas, versions et critères explicites.


---

# Annexe D — Décisions technologiques vérifiées par recherche (base de développement)

Cette annexe consolide la vérification de douze affirmations issues d'une évaluation externe du concept (v1.1), chacune confrontée à une recherche indépendante avant intégration. Résultat : cinq acceptées pleinement, cinq avec nuance, une reformulée, une rejetée (approche OT centralisée, contradictoire avec le local-first). **Elle fait foi pour les arbitrages techniques : toute formulation antérieure contradictoire est supplantée.**

## D.1 Verdicts consolidés

| # | Affirmation évaluée | Verdict | Fait vérifié |
| --- | --- | --- | --- |
| 1 | Distribution WASM d'OCCT ~4,5 MB brotli, API TypeScript, Web Workers | ✅ Accepté | Confirmé [S27] ; chiffres d'annonce éditeur, à mesurer indépendamment |
| 2 | Noyau Rust pur (cadcore) comme alternative de noyau | ⚠️ Nuance majeure | cadcore existe mais est très immature (versions 0.1.x, balayages uniquement, pas de booléens généraux ni NURBS complets) ; truck est à surveiller. **Veille technologique seulement, hors chaîne critique** |
| 3 | WebGPU plus lent que WebGL sur scènes d'objets uniques nombreux | ✅ Accepté | Signalement three.js reproduit (20 000 objets : 60 → 15 FPS, système UBO) [S28] ; cas typique BIM |
| 4 | WebGL par défaut, WebGPU optionnel | ✅ Accepté | Devient la décision v4.1 (Architecture, ligne Rendu) |
| 5 | CADara (CRDT temps réel CAO) comme preuve de la collaboration | ⚠️ Nuance | Projet réel mais en développement précoce (« not yet ready for use »), la partie CRDT n'est pas achevée ; direction validée, pas preuve de production |
| 6 | Assistant multimodal à 95,71 % de succès | ✅ Accepté | CADialogue, *Computer-Aided Design* 2025 [S29] ; environnement mécanique uniquement |
| 7 | Références stables avec mise à jour explicite (modèle Onshape) | ✅ Accepté | Présent dans le dossier (Concept §8, Architecture §9) ; confirmé |
| 8 | IFC 4.3 ISO + « certification buildingSMART » | ⚠️ Nuance | IFC 4.3.2.0 bien accepté comme ISO 16739-1:2024 [S32] ; le programme de certification actuel est un scorecard utilisateur — cible : conformité testée |
| 9 | STEP AP242 Éd.4 « publiée août 2025 » | ⚠️ Inexact sur la date | Travail technique achevé en 2024, stade FDIS à la consultation [S33] ; Éd.3 (2022) = cible P2, Éd.4 = feuille de route P3 |
| 10 | Connecteurs bidirectionnels type Speckle | ✅ Accepté | Modèle de preuve pour l'interopérabilité [S31] |
| 11 | Approche hybride OT/CRDT pour la réconciliation | ❌ Rejeté | L'OT exige un coordinateur central, contradictoire avec le local-first ; CRDT éprouvé (Yjs/Automerge) réservé aux données à fusion simple [S34] |
| 12 | CRDT pour modèles CAO feature-based | ⚠️ Reformulé | Travaux académiques réels mais au stade prototype [S35] ; position v4.1 : CRDT = texte/métadonnées légères, géométrie = réservation/branches + fusion validée |

## D.2 Décisions applicables (normatives pour le développement)

**D1 — Noyau.** occt-wasm comme noyau de référence pour le prototype [S27] ; vigilance licence LGPL (substitution possible ou licence commerciale avant engagement produit — voir Architecture §1 et §10). Une seule géométrie canonique par objet : les composants complémentaires (cadcore pour les balayages, truck en veille) ne produisent jamais une géométrie divergente du noyau de référence.

**D2 — Rendu.** WebGL2 par défaut, WebGPU activable (compute shaders, instanciation massive) avec repli automatique [S28]. Les gains WebGPU (instanciation, compute) sont réels mais conditionnés ; l'objectif « 60 images/s » du Concept §11 vaut pour le backend WebGL2, avec budget de trame p95 ≤ 16,7 ms.

**D3 — Collaboration.** CRDT (Yjs/Automerge) pour texte d'annotation et métadonnées légères [S34] ; réservation/branches avec fusion sémantique validée pour la géométrie ; verrous logiques à grain fin pour les opérations structurelles. Position plus prudente que la v1.1 (CRDT au niveau feature), adoptée car la régénération B-Rep après fusion CRDT n'est pas démontrée [S35].

**D4 — Assistant IA.** Copilote à boucle contrôlée : génération d'une séquence d'opérations → validation par les moteurs déterministes → aperçu → exécution après accord, auto-correction bornée à trois itérations, journal des hypothèses, cache sémantique des opérations validées (gain documenté > 85× [S29]). Références : CADialogue [S29], CAD-Assistant [S30]. Transfert bâtiment/réseaux = objet explicite de P0.

**D5 — Interopérabilité.** IFC 4.3 (ISO 16739-1:2024) avec validation en continu, sans promesse de « certification produit » [S32] ; STEP AP242 Éd.3 dès P2, Éd.4 (PMI d'assemblage, cinématique) en feuille de route P3 [S33] ; IFC ne portant pas de paramétricité, les fonctions de conception restent la source maître ; connecteurs inspirés du modèle objet-en-flux [S31].

**D6 — Points transverses à mesurer en P0.** (a) Contraintes du WASM 32 bits : espace d'adressage 4 Go et coût de compilation JIT au démarrage — budget de démarrage à établir sur le corpus. (b) Plafonds de mémoire GPU par onglet navigateur : le streaming LOD devient une exigence, pas une optimisation. (c) Maturité faible de cadcore et CADara : veille seulement, aucun n'entre dans la chaîne critique ni dans la communication produit.

## D.3 Décisions restant ouvertes (à trancher par prototype)

| Décision | État v4.1 | Élément de résolution | État après P0 (note de décision, `docs/p0/11.5-note-decision-P0.md`) |
| --- | --- | --- | --- |
| Licence OCCT (LGPL vs commerciale) | Ouverte, bloquante avant P0 | Arbitrage business ; packaging modulaire du WASM en attente | **Tranchée le 8 octobre 2026** par le maître d'ouvrage : LGPL, module WebAssembly séparé, chargé à la demande, remplaçable |
| Solveur de contraintes (D-Cubed ou autre) | À évaluer | Cas sous-/sur-contraints, diagnostics, conditions d'intégration [S06] | **Solveur écrit pour DrawAll**, planegcs (FreeCAD) en oracle de test (essai 11.1). D-Cubed non évalué (licence commerciale) |
| Bibliothèque CRDT (Yjs vs Automerge) | À évaluer en P0 | Charge mémoire, granularité des mises à jour, observabilité | **Yjs**, sous réserve d'une couche de fusion validée qui relève les écritures concurrentes (note §2) |
| Fidélité des connecteurs (Revit, Rhino, Tekla…) | À contractualiser | Matrice par format/version/type d'objet (Architecture §10) | Inchangé : hors P0 |
| Noyau définitif (OCCT vs Parasolid) | À trancher en P0 | Corpus de cas difficiles, mémoire, licences, déploiement [S03, S07] | **OCCT pour P1** (essais 11.2 à 11.4). Parasolid non évalué : son évaluation exige une licence commerciale, décision du maître d'ouvrage (feuille de route §7) |
| Lecteur STEP avec structure (XCAF) | — (constat de l'essai 11.4) | Module OCCT incluant `STEPCAFControl_Reader` | **Ouvert** : à compiler avant l'import d'assemblages de P1 (lot 16.x) |
