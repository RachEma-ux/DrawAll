"""Vérifie que des DXF exportés par DrawAll sont lisibles par un lecteur strict (ezdxf).

Usage : python scripts/check-dxf.py <dossier-ou-fichiers…>
Échec si un fichier est illisible ou si l'audit ezdxf relève une erreur.

Contrôle géométrique facultatif : si `<fichier>.points.json` existe, il liste pour des entités
(type, rang parmi les entités de ce type) des points du repère DXF qui doivent se trouver sur la
courbe telle qu'ezdxf la lit (à 10⁻³ mm), le premier et le dernier étant ses extrémités.
"""
import json
import math
import sys
from pathlib import Path

import ezdxf


def distance_to_polyline(p, pts):
    best = math.inf
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        l2 = dx * dx + dy * dy
        t = 0 if l2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        best = min(best, math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
    return best


def check_points(doc, path):
    side = path.with_name(path.name + ".points.json")
    if not side.exists():
        return []
    errors = []
    for exp in json.loads(side.read_text()):
        entities = [e for e in doc.modelspace() if e.dxftype() == exp["type"]]
        if exp["index"] >= len(entities):
            errors.append(f"{exp['type']} n° {exp['index']} absent")
            continue
        e = entities[exp["index"]]
        pts = [(v.x, v.y) for v in e.flattening(0.0001)]
        for p in exp["points"]:
            d = distance_to_polyline(p, pts)
            if d > 1e-3:
                errors.append(f"{exp['type']} n° {exp['index']} : point {p} à {d:.6f} mm de la courbe")
        ends = [exp["points"][0], exp["points"][-1]]
        for p, q in zip(ends, [pts[0], pts[-1]]):
            if math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3:
                errors.append(f"{exp['type']} n° {exp['index']} : extrémité {p} lue en {q}")
    return errors

paths = []
for arg in sys.argv[1:]:
    p = Path(arg)
    paths.extend(sorted(p.glob("*.dxf")) if p.is_dir() else [p])
if not paths:
    sys.exit("Aucun fichier DXF à vérifier.")

failed = False
for path in paths:
    try:
        doc = ezdxf.readfile(path)
    except Exception as exc:  # noqa: BLE001 — toute erreur de lecture est un échec
        print(f"ÉCHEC {path.name} : {type(exc).__name__}: {exc}")
        failed = True
        continue
    auditor = doc.audit()
    kinds = sorted({e.dxftype() for e in doc.modelspace()})
    units = doc.header.get("$INSUNITS")
    geometry = check_points(doc, path)
    if geometry:
        failed = True
        print(f"ÉCHEC {path.name} : géométrie relue par ezdxf différente")
        for err in geometry:
            print(f"   - {err}")
    elif auditor.has_errors:
        failed = True
        print(f"ÉCHEC {path.name} : {len(auditor.errors)} erreur(s) d'audit")
        for err in auditor.errors:
            print(f"   - {err.message}")
    else:
        print(f"OK    {path.name} : {doc.dxfversion}, $INSUNITS={units}, entités {kinds}, corrections {len(auditor.fixes)}")
sys.exit(1 if failed else 0)
