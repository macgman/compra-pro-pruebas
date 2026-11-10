#!/usr/bin/env python3
"""Build COMPRA PRO's browser bundle from ordered source modules."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
OUT = ROOT / "js" / "app.js"
order = json.loads((SRC / "modules.json").read_text(encoding="utf-8"))
parts = []
for name in order:
    path = SRC / "modules" / name
    if not path.is_file():
        raise SystemExit(f"Missing source module: {path}")
    parts.append(path.read_text(encoding="utf-8"))
OUT.write_text("".join(parts), encoding="utf-8")
print(f"Built {OUT.relative_to(ROOT)} from {len(order)} ordered modules.")
