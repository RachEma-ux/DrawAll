# Composants tiers et licences

| Composant | Usage | Licence | Mode d'intégration |
| --- | --- | --- | --- |
| Open CASCADE Technology, via `replicad-opencascadejs` 1.1.0 | Noyau géométrique 3D (lot 11.2) | **LGPL-2.1** | Module WebAssembly **séparé** (`assets/replicad_single-*.wasm`), chargé à la demande dans un Worker, jamais fusionné au code de l'application |
| `replicad` 1.1.0 | API de modélisation au-dessus d'OCCT | MIT | Inclus dans le Worker du noyau |
| `@salusoft89/planegcs` 1.2.0 (solveur de FreeCAD) | Oracle de test du solveur de contraintes (lot 11.1) | LGPL-2.0-or-later | Dépendance de développement : absent de l'application livrée |
| `yjs` 13.6.33 | Essai CRDT de la note de décision P0 (lot 11.5) ; bibliothèque retenue pour la collaboration sur annotations et métadonnées | MIT | Dépendance de développement tant qu'aucun lot ne l'utilise dans l'application |
| `@automerge/automerge` 3.5.0 | Essai CRDT (lot 11.5), candidat non retenu | MIT | Dépendance de développement de l'essai seulement |
| `three` 0.179.1 | Rendu WebGL2 de la vue 3D (lot 15.1) | MIT | Chargé à la demande à l'ouverture de la vue 3D (morceau séparé) |
| IfcOpenShell 0.9.0 (Python) | Relecture de l'IFC exporté en CI (lot 17.1) | LGPL-3.0 | Outil de contrôle en CI seulement : absent de l'application livrée |

## OCCT : conditions de la LGPL (décision du maître d'ouvrage, 8 octobre 2026)

- **Remplaçabilité.** Le module OCCT est un fichier à part, chargé par le Worker du noyau (`src/lib/kernel/kernel.worker.ts`). Pour le remplacer par une version modifiée, il suffit de :
  1. reconstruire `replicad-opencascadejs` depuis ses sources ;
  2. substituer le fichier `.wasm` et son chargeur.

  Aucune autre partie de l'application n'en dépend.
- **Sources.**
  - OCCT : https://github.com/Open-Cascade-SAS/OCCT ;
  - compilation utilisée : https://github.com/sgenoud/replicad (dossier `packages/replicad-opencascadejs`), version 1.1.0.
- **Mention.** L'application doit afficher cette mention et le texte de la LGPL-2.1 avec les autres mentions légales. C'est à faire au moment du déploiement durable (§7, « Hébergement durable »).
