"""Fabrique le jeu de fichiers DXF de référence de l'import (lot 6.1) avec ezdxf.

Usage : python scripts/make-dxf-fixtures.py src/lib/__fixtures__/dxf
Chaque fichier isole une famille d'entités ; les tests d'import (src/lib/dxf-import.test.ts) en
vérifient la lecture. Relancer ce script ne change les fichiers que si ezdxf change d'écriture.
"""
import math
import sys
from pathlib import Path

import ezdxf

out = Path(sys.argv[1] if len(sys.argv) > 1 else "src/lib/__fixtures__/dxf")
out.mkdir(parents=True, exist_ok=True)


def new(setup=False):
    doc = ezdxf.new("R2000", setup=setup)
    doc.header["$INSUNITS"] = 4  # millimètre
    return doc, doc.modelspace()


def save(doc, name):
    doc.saveas(out / name)
    print("écrit", out / name)


# 1. Blocs : occurrence simple (conservée), occurrence tournée et mise à l'échelle (éclatée), bloc imbriqué.
doc, msp = new()
vis = doc.blocks.new("VIS_M8", base_point=(0, 0))
vis.add_circle((0, 0), 4)
vis.add_line((-6, 0), (6, 0))
plaque = doc.blocks.new("PLAQUE", base_point=(0, 0))
plaque.add_lwpolyline([(0, 0), (100, 0), (100, 60), (0, 60)], close=True)
plaque.add_blockref("VIS_M8", (20, 30))
plaque.add_text("P1", dxfattribs={"height": 5}).set_placement((40, 30))
msp.add_blockref("VIS_M8", (10, 10))
msp.add_blockref("VIS_M8", (50, 10), dxfattribs={"xscale": 2, "yscale": 2})
msp.add_blockref("VIS_M8", (100, 10), dxfattribs={"rotation": 90})
msp.add_blockref("PLAQUE", (0, 100))
save(doc, "blocs.dxf")

# 2. Cote linéaire (bloc anonyme de géométrie ; le style EZDXF demande la configuration complète).
doc, msp = new(setup=True)
msp.add_line((0, 0), (100, 0))
dim = msp.add_linear_dim(base=(0, 20), p1=(0, 0), p2=(100, 0), dimstyle="EZDXF")
dim.render()
save(doc, "cotes.dxf")

# 3. Hachures : rectangle avec îlot circulaire (aplat), contour par arêtes (ligne + arc), motif ANSI31.
doc, msp = new()
h = msp.add_hatch(color=1)
h.set_solid_fill()
h.paths.add_polyline_path([(0, 0), (100, 0), (100, 60), (0, 60)], is_closed=True, flags=1)
edge = h.paths.add_edge_path(flags=16)
edge.add_arc((50, 30), 10, 0, 360)
h2 = msp.add_hatch()
h2.set_pattern_fill("ANSI31", scale=2, angle=0)
edge = h2.paths.add_edge_path(flags=1)
edge.add_line((200, 0), (300, 0))
edge.add_arc((300, 30), 30, -90, 90)
edge.add_line((300, 60), (200, 60))
edge.add_line((200, 60), (200, 0))
save(doc, "hachures.dxf")

# 4. Courbes : spline cubique, ellipse complète, arc d'ellipse, ellipse circulaire.
doc, msp = new()
msp.add_open_spline([(0, 0), (10, 20), (20, -20), (30, 0)], degree=3)
msp.add_ellipse((100, 0), major_axis=(20, 0), ratio=0.5)
msp.add_ellipse((150, 0), major_axis=(0, 15), ratio=0.4, start_param=0, end_param=math.pi)
msp.add_ellipse((200, 0), major_axis=(10, 0), ratio=1)
save(doc, "courbes.dxf")

# 5. Textes : TEXT centré, MTEXT sur deux lignes.
doc, msp = new()
msp.add_text("Plan du rez", dxfattribs={"height": 5}).set_placement((0, 0), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)
msp.add_mtext("Ligne 1\\PLigne 2", dxfattribs={"char_height": 3.5, "insert": (0, -20)})
save(doc, "textes.dxf")

# 6. Arêtes de hachure : arc et arc d'ellipse parcourus dans le sens horaire (angles complémentaires
# 360 − angle, comme AutoCAD), spline rationnelle (quart de cercle exact, poids √2/2).
doc, msp = new()
h = msp.add_hatch()
edge = h.paths.add_edge_path(flags=1)
edge.add_line((0, 0), (0, 10))
edge.add_arc((0, 0), 10, 0, 90, ccw=False)
edge.add_line((10, 0), (0, 0))
h = msp.add_hatch()
edge = h.paths.add_edge_path(flags=1)
edge.add_line((100, 0), (100, 10))
edge.add_ellipse((100, 0), major_axis=(20, 0), ratio=0.5, start_angle=0, end_angle=90, ccw=False)
edge.add_line((120, 0), (100, 0))
h = msp.add_hatch()
edge = h.paths.add_edge_path(flags=1)
edge.add_line((200, 0), (230, 0))
edge.add_spline(control_points=[(230, 0), (230, 30), (200, 30)], knot_values=[0, 0, 0, 1, 1, 1], degree=2, weights=[1, math.sqrt(0.5), 1])
edge.add_line((200, 30), (200, 0))
save(doc, "hachures-aretes.dxf")

# 7. Blocs éclatés : hachure ANSI31 d'un bloc inséré tourné de 90° et à l'échelle 2 (le motif suit) ;
# bloc dont un trait a sa propre couleur (éclaté plutôt que conservé : le style est gardé).
doc, msp = new()
hb = doc.blocks.new("HACHURE", base_point=(0, 0))
hh = hb.add_hatch()
hh.set_pattern_fill("ANSI31", scale=1, angle=0)
hh.paths.add_polyline_path([(0, 0), (20, 0), (20, 10), (0, 10)], is_closed=True)
msp.add_blockref("HACHURE", (100, 0), dxfattribs={"rotation": 90, "xscale": 2, "yscale": 2})
sb = doc.blocks.new("STYLE", base_point=(0, 0))
sb.add_line((0, 0), (10, 0), dxfattribs={"color": 1})
sb.add_line((0, 0), (0, 10))
msp.add_blockref("STYLE", (0, 50))
save(doc, "blocs-eclates.dxf")

# 8. Ellipses dans des blocs (lot 10.1) : point de base non nul ; occurrence simple (bloc conservé),
# tournée et à l'échelle, symétrique, à l'échelle non uniforme (éclatées : l'ellipse suit).
doc, msp = new()
ov = doc.blocks.new("OVALE", base_point=(10, 10))
ov.add_ellipse((30, 10), major_axis=(20, 0), ratio=0.5)
ov.add_ellipse((10, 40), major_axis=(0, 8), ratio=0.5, start_param=0, end_param=math.pi / 2)
msp.add_blockref("OVALE", (100, 0))
msp.add_blockref("OVALE", (200, 0), dxfattribs={"rotation": 90, "xscale": 2, "yscale": 2})
msp.add_blockref("OVALE", (300, 0), dxfattribs={"xscale": -1})
msp.add_blockref("OVALE", (400, 0), dxfattribs={"xscale": 2, "yscale": 1})
save(doc, "blocs-ellipses.dxf")
# Référence indépendante pour le test : ellipses transformées par ezdxf (virtual_entities), trois points
# de la courbe puis les extrémités, repère DXF.
import json  # noqa: E402
ref = []
for ins in msp.query("INSERT"):
    for e in ins.virtual_entities():
        if e.dxftype() == "ELLIPSE":
            ref.append([[v.x, v.y] for v in e.vertices([0.3, 1.0, 1.4])] + [[e.start_point.x, e.start_point.y], [e.end_point.x, e.end_point.y]])
(out / "blocs-ellipses.points.json").write_text(json.dumps(ref, indent=0))
