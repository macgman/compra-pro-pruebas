# COMPRA PRO — Paquete de evolución (ambiente de PRUEBAS)

Este paquete se conecta al proyecto Firebase de pruebas confirmado por el usuario:
`inventario-compra`. No está configurado para producción ni contiene credenciales privadas.

## Qué se implementó en este paquete

### Fase 1 — Seguridad y autenticación
- El frontend apunta al Firebase de pruebas `inventario-compra`.
- El backend emite claims `compraPro`, `claimsVersion`, `role`, `username`, `room` y `permissions`.
- Se añadió `GET /auth/session` para validar ID tokens vigentes.
- Después del login, el frontend compara las claims firmadas por Firebase con la cuenta/sala devuelta por el backend.
- El backend registra los inicios de sesión exitosos en `compraPro/rooms/{room}/security/audit`.
- `database.rules.json` exige tokens emitidos por COMPRA PRO y limita lectura/escritura a la sala indicada en el claim `room`.

**Límite de seguridad que no debe ocultarse:** la aplicación todavía sincroniza el objeto `data` completo en una sola escritura. Por ello las reglas actuales aíslan usuarios autenticados por sala, pero NO aplican permisos individuales distintos para `inventory.delete`, `users.manage`, etc. Esos permisos todavía se comprueban en la interfaz. Para hacerlos cumplir en Firebase hay que migrar cada colección/operación a rutas independientes o mover las escrituras críticas al backend. No usar esta versión como producción con datos sensibles hasta completar esa migración.

La autenticación de usuarios existentes conserva compatibilidad con hashes SHA-256 heredados y, temporalmente, contraseñas antiguas en texto plano si existen. Se debe migrar ese formato a un hash lento y con sal (Argon2id/scrypt/bcrypt) antes de producción; se conserva ahora para no bloquear cuentas de prueba existentes.

### Fase 2 — Modularización
- El código de `app.js` está dividido en 17 fragmentos fuente ordenados bajo `src/modules/`.
- `src/modules.json` define el orden y `src/build.py` reconstruye `js/app.js`.
- Se conserva `js/app.js` como bundle clásico para no romper funciones globales, eventos inline ni integraciones antiguas.
- La modularización es una primera etapa de extracción de fuente, no una conversión completa a ES Modules independientes.

Para reconstruir:
```bash
python src/build.py
```

### Fase 3 — Datos y sincronización
- El contador de folios atómico ahora vive en `rooms/{room}/folioSequence`, separado del objeto de datos.
- La reserva utiliza una transacción Firebase y migra como punto inicial el contador legado `data/folioSequence`.
- La sincronización usa `update()` en la raíz de la sala, de modo que una escritura del payload no borre el contador atómico hermano.
- El backend registra eventos de inicio de sesión exitosos en la auditoría de seguridad.

**Pendiente:** auditoría confiable de cada alta/edición/eliminación, control de concurrencia de todas las colecciones y pruebas multiusuario reales. El merge actual sigue usando `updatedAt` y tombstones; no se ha sustituido todo el modelo de conflictos.

### Fase 4 — Experiencia y PWA
- Iconos PNG de 192 y 512 px.
- Manifest actualizado con iconos instalables.
- Service Worker versionado con precache de shell, CSS, JavaScript e imágenes.
- Se conserva el modo offline/local con IndexedDB.
- Se agregaron encabezados HTTP básicos en `_headers`.

**Pendiente:** pruebas reales en Android/iOS/desktop, estrategia de actualización con usuarios activos y CSP estricta. CSP no se activa todavía porque el HTML contiene scripts inline y dependencias CDN; activarla sin migrar esos scripts rompería el login, Excel o el lector QR.

### Fase 5 — Preparación de producción
- `render.yaml` para desplegar el backend en un servicio de pruebas de Render.
- `netlify.toml` y `_headers` para publicar el frontend.
- `.env.example` con los nombres de variables necesarias, sin secretos.
- `DEPLOY-PRUEBAS.md` con pasos de despliegue y validación.

**No se ha desplegado nada automáticamente.** Para terminar la puesta en marcha se necesitan las credenciales privadas de servicio de Firebase configuradas directamente como secreto en Render, dominio/origen permitido y publicación manual de las reglas en el proyecto de pruebas.

## Configuración Firebase de pruebas
La configuración web está en `js/app.js` y apunta a:
- projectId: `inventario-compra`
- databaseURL: `https://inventario-compra-default-rtdb.firebaseio.com`

La API key web es identificador público del proyecto; nunca compartas el JSON de cuenta de servicio ni una clave privada.

## Variables de Render
Configura las variables indicadas en `.env.example`:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `COMPRA_PRO_ROOM_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (secreto privado, pegar solo en Render)
- `MASTER_USERNAME`
- `MASTER_PASSWORD` (mínimo 12 caracteres, único)
- `MASTER_NAME`
- `ALLOWED_ORIGINS` (origen exacto del frontend de pruebas)

No reutilices la cuenta de servicio ni la contraseña MASTER de producción.

## Verificaciones locales
Ejecutar:
```bash
node --check server.js
node --check compra-web/js/app.js
node --check compra-web/js/pro-ui.js
node --check compra-web/js/capa-web.js
node --check compra-web/js/modulos.js
python compra-web/src/build.py
```

La validación sintáctica no sustituye las pruebas de extremo a extremo contra Firebase/Render. Las reglas deben probarse con cuentas de cada rol desde Firebase Emulator Suite o un proyecto de pruebas, nunca directamente en producción.

## Estado honesto de las cinco fases
- Fase 1: base de autenticación y aislamiento por sala implementada; autorización individual en datos pendiente.
- Fase 2: fuente organizada y bundle reproducible; migración completa a ES Modules pendiente.
- Fase 3: contador atómico de folios protegido frente al reemplazo del payload; auditoría CRUD y conflictos generales pendientes.
- Fase 4: mejoras PWA implementadas; pruebas en dispositivos reales pendientes.
- Fase 5: configuración y guías de despliegue preparadas; despliegue real y monitoreo pendientes.

No se deben publicar las reglas antes de desplegar el backend con el mismo proyecto Firebase y comprobar que el token personalizado contiene las claims requeridas.
