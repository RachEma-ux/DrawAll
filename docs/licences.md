# Composants tiers et licences

| Composant | Usage | Licence | Mode d'intégration |
| --- | --- | --- | --- |
| Open CASCADE Technology, via `replicad-opencascadejs` 1.1.0 | Noyau géométrique 3D (lot 11.2) | **LGPL-2.1** | Module WebAssembly **séparé** (`assets/replicad_single-*.wasm`), chargé à la demande dans un Worker, jamais fusionné au code de l'application |
| `replicad` 1.1.0 | API de modélisation au-dessus d'OCCT | MIT | Inclus dans le Worker du noyau |
| `@salusoft89/planegcs` 1.2.0 (solveur de FreeCAD) | Oracle de test du solveur de contraintes (lot 11.1) | LGPL-2.0-or-later | Dépendance de développement : absent de l'application livrée |

## OCCT : conditions de la LGPL (décision du maître d'ouvrage, 8 octobre 2026)

- **Remplaçabilité.** Le module OCCT est un fichier à part, chargé par le Worker du noyau (`src/lib/kernel/kernel.worker.ts`). Pour le remplacer par une version modifiée, il suffit de :
  1. reconstruire `replicad-opencascadejs` depuis ses sources ;
  2. substituer le fichier `.wasm` et son chargeur.

  Aucune autre partie de l'application n'en dépend.
- **Sources.**
  - OCCT : https://github.com/Open-Cascade-SAS/OCCT ;
  - compilation utilisée : https://github.com/sgenoud/replicad (dossier `packages/replicad-opencascadejs`), version 1.1.0.
- **Mention.** L'application doit afficher cette mention et le texte de la LGPL-2.1 avec les autres mentions légales. C'est à faire au moment du déploiement durable (§7, « Hébergement durable »).
