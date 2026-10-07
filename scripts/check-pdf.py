"""Vérifie que des PDF exportés par DrawAll sont lisibles par un lecteur strict (pypdf).

Usage : python scripts/check-pdf.py <dossier-ou-fichiers…>
Échec si un fichier est illisible, n'a pas exactement une page, ou si son texte est vide.
Le format de page est affiché en millimètres pour contrôle.
"""
import sys
from pathlib import Path

from pypdf import PdfReader

paths = []
for arg in sys.argv[1:]:
    p = Path(arg)
    paths.extend(sorted(p.glob("*.pdf")) if p.is_dir() else [p])
if not paths:
    sys.exit("Aucun fichier PDF à vérifier.")

failed = False
for path in paths:
    try:
        reader = PdfReader(path, strict=True)
        page = reader.pages[0]
        w = float(page.mediabox.width) * 25.4 / 72
        h = float(page.mediabox.height) * 25.4 / 72
        text = page.extract_text() or ""
    except Exception as exc:  # noqa: BLE001 — toute erreur de lecture est un échec
        print(f"ÉCHEC {path.name} : {type(exc).__name__}: {exc}")
        failed = True
        continue
    if len(reader.pages) != 1 or not text.strip():
        print(f"ÉCHEC {path.name} : {len(reader.pages)} page(s), texte {'vide' if not text.strip() else 'présent'}")
        failed = True
    else:
        print(f"OK    {path.name} : {w:.2f} × {h:.2f} mm, {len(text.split())} mots")
sys.exit(1 if failed else 0)
