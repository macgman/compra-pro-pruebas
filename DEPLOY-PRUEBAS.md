# Despliegue del ambiente de pruebas

## 1. Firebase (solo `inventario-compra`)
1. En Firebase Console, abre Authentication y verifica que Firebase Authentication esté habilitado. El backend crea Custom Tokens con Firebase Admin SDK; no necesitas habilitar un proveedor de usuario adicional para `signInWithCustomToken`.
2. En Realtime Database, crea o confirma la base de datos de pruebas.
3. Antes de publicar `database.rules.json`, despliega primero el backend de pruebas con la cuenta de servicio del proyecto `inventario-compra`.
4. Publica las reglas del paquete únicamente en `inventario-compra`.
5. Crea una sala exclusiva, por ejemplo `compra-pro-pruebas`. No uses el identificador de la sala de producción.

## 2. Backend en Render
1. Crea un servicio Web Node con la carpeta raíz que contiene `server.js` y `package.json`.
2. Build command: `npm install`.
3. Start command: `npm start`.
4. Health check path: `/health`.
5. Configura las variables de `.env.example` desde el panel Environment.
6. Genera una cuenta de servicio nueva para el proyecto `inventario-compra`; guarda el JSON completo solo en `FIREBASE_SERVICE_ACCOUNT_JSON` como secreto.
7. Define `MASTER_USERNAME` y una contraseña única de al menos 12 caracteres.
8. Configura `ALLOWED_ORIGINS` con el origen exacto del frontend publicado.

## 3. Frontend
1. Publica el contenido de `compra-web/` como sitio estático en Netlify u otro hosting HTTPS.
2. Actualiza `COMPRA_PRO_AUTH_API` en `js/app.js` para apuntar al servicio Render de pruebas.
3. Ejecuta `python src/build.py` desde `compra-web` si modificas los módulos fuente.
4. Abre el sitio, inicia sesión y confirma que el badge de Firebase quede conectado.

## 4. Pruebas obligatorias
- Login MASTER y usuario normal.
- Token de sala A rechazado al intentar acceder a sala B.
- Sin login, lectura y escritura denegadas.
- Comprobar sincronización de dos navegadores en la misma sala.
- Reservar folios simultáneamente desde dos navegadores y confirmar que no se repitan.
- Crear/editar/eliminar un producto de prueba y verificar que persiste tras recargar.
- Exportar e importar un respaldo de prueba.
- Verificar auditoría de login en `security/audit`.

**No ejecutar pruebas destructivas ni restauraciones sobre la sala de producción.**
