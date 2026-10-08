"""Vérifie que des SVG exportés par DrawAll sont du XML valide aux dimensions d'une feuille.

Usage : python scripts/check-svg.py <dossier-ou-fichiers…>
Échec si un fichier n'est pas du XML bien formé, si la racine n'est pas un <svg> SVG, ou si la largeur
et la hauteur (en mm) ne correspondent pas à la viewBox ni à un format ISO 216 (A4 à A0, portrait ou
paysage).
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ISO = {(210, 297), (297, 420), (420, 594), (594, 841), (841, 1189)}
NS = "{http://www.w3.org/2000/svg}"

paths = []
for arg in sys.argv[1:]:
    p = Path(arg)
    paths.extend(sorted(p.glob("*.svg")) if p.is_dir() else [p])
if not paths:
    sys.exit("Aucun fichier SVG à vérifier.")

failed = False
for path in paths:
    try:
        root = ET.parse(path).getroot()
        if root.tag != NS + "svg":
            raise ValueError(f"racine {root.tag}, <svg> attendu")
        w, h = root.get("width", ""), root.get("height", "")
        if not (w.endswith("mm") and h.endswith("mm")):
            raise ValueError(f"dimensions {w} × {h} : millimètres attendus")
        wv, hv = float(w[:-2]), float(h[:-2])
        vb = [float(v) for v in root.get("viewBox", "").split()]
        if vb != [0, 0, wv, hv]:
            raise ValueError(f"viewBox {vb} ≠ 0 0 {wv} {hv}")
        if (round(min(wv, hv)), round(max(wv, hv))) not in ISO:
            raise ValueError(f"{wv} × {hv} mm : format ISO 216 attendu")
        print(f"OK    {path.name} : {wv:g} × {hv:g} mm, {sum(1 for _ in root.iter())} éléments")
    except Exception as exc:  # noqa: BLE001 — toute erreur est un échec
        failed = True
        print(f"ÉCHEC {path.name} : {type(exc).__name__}: {exc}")
sys.exit(1 if failed else 0)
