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
