"""Relit les STEP exportés par DrawAll avec un lecteur tiers, gmsh (lot 17.2).

Usage : python scripts/check-step.py <dossier>
Pour chaque `<fichier>.step` accompagné de `<fichier>.step.expected.json` :
- le schéma déclaré doit être l'AP242 édition 3 ({ 1 0 10303 442 3 1 4 }) ; une autre édition est refusée ;
- l'en-tête ne contient que de l'ASCII imprimable (ISO 10303-21) ;
- gmsh relit chaque solide ; les volumes lus doivent égaler les volumes du noyau DrawAll à 10⁻⁶ près.
"""
import json
import re
import sys
from pathlib import Path

import gmsh

ED3 = "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 3 1 4 }"
TOL = 1e-6


def fail(msg):
    print(f"ÉCHEC : {msg}")
    sys.exit(1)


def check(path: Path):
    exp = json.loads(path.with_name(path.name + ".expected.json").read_text(encoding="utf-8"))
    raw = path.read_bytes()
    if any(b > 126 or (b < 32 and b not in (9, 10, 13)) for b in raw):
        fail(f"{path.name} : caractère hors ASCII imprimable")
    text = raw.decode("ascii")
    m = re.search(r"FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'", text)
    schema = re.sub(r"\s+", " ", m.group(1)).strip() if m else None
    if schema != ED3 or schema != exp["schema"]:
        fail(f"{path.name} : schéma déclaré {schema!r}, attendu {ED3!r} (une édition antérieure n'est pas acceptée)")
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.model.occ.importShapes(str(path))
        gmsh.model.occ.synchronize()
        vols = sorted(gmsh.model.occ.getMass(3, t) for _, t in gmsh.model.getEntities(3))
    finally:
        gmsh.finalize()
    want = sorted(exp["volumes"])
    if len(vols) != len(want):
        fail(f"{path.name} : {len(vols)} solide(s) lu(s), attendu {len(want)}")
    for got, w in zip(vols, want):
        if abs(got - w) > TOL * abs(w):
            fail(f"{path.name} : volume lu {got:.9f} mm³, attendu {w:.9f} mm³")
        print(f"  volume lu par gmsh {got:.6f} mm³ = noyau DrawAll {w:.6f} mm³")
    print(f"{path.name} : AP242 éd. 3 déclarée, relu par gmsh {gmsh.__version__}, {len(vols)} solide(s), volumes identiques à 10⁻⁶ près")


if __name__ == "__main__":
    files = sorted(Path(sys.argv[1]).glob("*.step"))
    if not files:
        fail(f"aucun STEP dans {sys.argv[1]}")
    for p in files:
        check(p)
