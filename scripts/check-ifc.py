"""Relit les IFC exportés par DrawAll avec IfcOpenShell (lot 17.1) et compare les quantités.

Usage : python scripts/check-ifc.py <dossier>
Pour chaque `<fichier>.ifc` accompagné de `<fichier>.ifc.expected.json` :
- schéma déclaré, nombre d'entités par classe, étages (nom, altitude) ;
- jeux de propriétés attendus ;
- volumes et surfaces : la géométrie lue par IfcOpenShell (baies déduites des murs) doit retrouver
  la quantité exportée (Qto_…), à 10⁻⁶ près en relatif.
Échec au premier écart, avec sa description.
"""
import json
import math
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element as element
import ifcopenshell.util.shape as shape

TOL = 1e-6


def fail(msg):
    print(f"ÉCHEC : {msg}")
    sys.exit(1)


def by_tag(f, tag):
    """Élément par son identifiant DrawAll (attribut Tag)."""
    return next((e for e in f.by_type("IfcElement") if getattr(e, "Tag", None) == tag), None)


def is_circular(e):
    """Le corps de l'élément est-il l'extrusion d'un profil circulaire ?"""
    reps = e.Representation.Representations if e.Representation else []
    return any(i.is_a("IfcExtrudedAreaSolid") and i.SweptArea.is_a("IfcCircleProfileDef") for r in reps for i in r.Items)


def quantity(e, name):
    for qto in element.get_psets(e, qtos_only=True).values():
        if name in qto:
            return qto[name]
    return None


def check(path: Path):
    exp = json.loads(path.with_name(path.name + ".expected.json").read_text(encoding="utf-8"))
    f = ifcopenshell.open(str(path))
    if f.schema_identifier != exp["schema"]:
        fail(f"{path.name} : schéma {f.schema_identifier}, attendu {exp['schema']}")
    for cls, n in exp["counts"].items():
        got = len([e for e in f.by_type(cls) if e.is_a() == cls])
        if got != n:
            fail(f"{path.name} : {got} {cls}, attendu {n}")
    storeys = sorted(((s.Name, float(s.Elevation)) for s in f.by_type("IfcBuildingStorey")), key=lambda x: x[1])
    want = sorted(((s["name"], float(s["elevation"])) for s in exp["storeys"]), key=lambda x: x[1])
    if storeys != want:
        fail(f"{path.name} : étages {storeys}, attendus {want}")
    for tag, sets in exp.get("psets", {}).items():
        e = by_tag(f, tag)
        if e is None:
            fail(f"{path.name} : élément {tag} absent")
        got = element.get_psets(e, psets_only=True)
        for pset, props in sets.items():
            for k, v in props.items():
                if got.get(pset, {}).get(k) != v:
                    fail(f"{path.name} : {tag} {pset}.{k} = {got.get(pset, {}).get(k)!r}, attendu {v!r}")

    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    # Unité du fichier : millimètre ; la géométrie est rendue en mètres (SI).
    for tag, qname in exp.get("volumes", {}).items():
        e = by_tag(f, tag)
        if e is None:
            fail(f"{path.name} : élément {tag} absent")
        q = quantity(e, qname)
        g = ifcopenshell.geom.create_shape(settings, e).geometry
        geo = shape.get_volume(g)
        if q is not None and is_circular(e):
            # Cylindre : IfcOpenShell le lit en prisme inscrit à n côtés. La quantité exportée (volume
            # exact πr²h) doit correspondre à ce prisme : (n/2)·r²·sin(2π/n)·h, à 10⁻⁶ près.
            n = len({(round(x, 9), round(y, 9)) for x, y in zip(g.verts[0::3], g.verts[1::3])})
            h = quantity(e, "Length") / 1000
            r2 = q / (math.pi * h)
            q = (n / 2) * r2 * math.sin(2 * math.pi / n) * h
            qname += f" (prisme inscrit à {n} côtés)"
        if q is None or abs(geo - q) > TOL * max(abs(q), 1e-9):
            fail(f"{path.name} : {tag} volume lu {geo:.9f} m³, quantité {qname} = {q}")
        print(f"  {tag} {e.is_a()} : volume lu {geo:.6f} m³ = {qname} {q:.6f} m³")
    # Espaces (sans attribut Tag) : désignés par leur nom.
    for name, qname in exp.get("areas", {}).items():
        e = next((s for s in f.by_type("IfcSpace") if s.Name == name), None)
        tag = name
        if e is None:
            fail(f"{path.name} : espace {name} absent")
        q = quantity(e, qname)
        geo = shape.get_footprint_area(ifcopenshell.geom.create_shape(settings, e).geometry)
        if q is None or abs(geo - q) > TOL * max(abs(q), 1e-9):
            fail(f"{path.name} : {tag} surface au sol lue {geo:.9f} m², quantité {qname} = {q}")
        print(f"  {tag} IfcSpace : surface au sol lue {geo:.6f} m² = {qname} {q:.6f} m²")
    print(f"{path.name} : relu par IfcOpenShell {ifcopenshell.version}, {len(list(f))} entités, quantités retrouvées")


if __name__ == "__main__":
    root = Path(sys.argv[1])
    files = sorted(root.glob("*.ifc"))
    if not files:
        fail(f"aucun IFC dans {root}")
    for p in files:
        check(p)
