"""Vérifie que des DXF exportés par DrawAll sont lisibles par un lecteur strict (ezdxf).

Usage : python scripts/check-dxf.py <dossier-ou-fichiers…>
Échec si un fichier est illisible ou si l'audit ezdxf relève une erreur.
"""
import sys
from pathlib import Path

import ezdxf

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
    if auditor.has_errors:
        failed = True
        print(f"ÉCHEC {path.name} : {len(auditor.errors)} erreur(s) d'audit")
        for err in auditor.errors:
            print(f"   - {err.message}")
    else:
        print(f"OK    {path.name} : {doc.dxfversion}, $INSUNITS={units}, entités {kinds}, corrections {len(auditor.fixes)}")
sys.exit(1 if failed else 0)
