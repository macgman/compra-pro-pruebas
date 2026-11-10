from pathlib import Path
import json, re, sys
root = Path(__file__).resolve().parents[1]
errors = []
for rel in ["database.rules.json", "manifest.webmanifest", "firebase.json", ".firebaserc", "src/modules.json"]:
    try:
        json.loads((root / rel).read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"{rel}: {exc}")
app = (root / "js/app.js").read_text(encoding="utf-8")
if "projectId: \"inventario-compra\"" not in app:
    errors.append("Frontend no apunta al proyecto de pruebas inventario-compra")
if "compra-pro-888c9" in app:
    errors.append("Se detectó el ID de proyecto anterior en app.js")
if "getIdTokenResult(true)" not in app:
    errors.append("Falta verificación de claims firmadas al iniciar sesión")
if "roomRef.child('folioSequence')" not in app:
    errors.append("Falta el contador de folios atómico fuera de data")
if "firebaseRoomRef.update(cleanPayload)" not in app:
    errors.append("El payload aún puede reemplazar la raíz completa de la sala")
rules = json.loads((root / "database.rules.json").read_text(encoding="utf-8"))
room_rules = rules["rules"]["compraPro"]["rooms"]["$room"]
if "auth.token.compraPro === true" not in room_rules.get(".read", ""):
    errors.append("Regla de lectura no valida claim compraPro")
if "auth.token.room === $room" not in room_rules.get(".read", ""):
    errors.append("Regla de lectura no aísla la sala")
if errors:
    print("\\n".join(errors))
    sys.exit(1)
print("Validación estática COMPRA PRO: OK")
print(f"Módulos fuente: {len(json.loads((root/'src/modules.json').read_text(encoding='utf-8')))}")
