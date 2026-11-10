/**
 * COMPRA-PRO Security API — integración de inicio de sesión y diagnóstico seguro.
 * IMPORTANTE: esto aún NO protege las escrituras/lecturas de la app completa.
 * No publiques el JSON de cuenta de servicio ni cambies reglas RTDB hasta terminar
 * la migración de todas las operaciones de datos.
 */
'use strict';
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT || 10000);
const PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const DATABASE_URL = String(process.env.FIREBASE_DATABASE_URL || '').trim();
const ENV_ROOM_ID = cleanRoomId(process.env.COMPRA_PRO_ROOM_ID || '');
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

// La cuenta MASTER se provisiona exclusivamente mediante secretos de Render.
// Nunca se toma el rol MASTER desde la lista compartida de usuarios de Realtime Database.
const MASTER_USERNAME = String(process.env.MASTER_USERNAME || '').trim().toLowerCase();
const MASTER_PASSWORD = String(process.env.MASTER_PASSWORD || '');
const MASTER_NAME = String(process.env.MASTER_NAME || 'Propietario del sistema').trim();
const MASTER_USER_ID = -1;
const APP_PERMISSIONS = new Set([
  'dashboard.view', 'inventory.view', 'inventory.create', 'inventory.edit',
  'inventory.delete', 'inventory.import', 'physical.manage', 'purchases.create',
  'purchases.view', 'purchases.edit', 'purchases.delete', 'vouchers.manage',
  'movements.view', 'movements.edit', 'kardex.view', 'kardex.adjust',
  'reports.export', 'folios.edit', 'users.manage', 'settings.manage',
  'backup.export', 'backup.restore', 'system.reset'
]);
function cleanRoomId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 120);
}
function safeEqualText(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function cleanPermissions(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(p => typeof p === 'string' && APP_PERMISSIONS.has(p)))];
}
if (!PROJECT_ID || !DATABASE_URL || !ENV_ROOM_ID || !SERVICE_ACCOUNT_JSON) {
  console.error('Faltan variables requeridas: FIREBASE_PROJECT_ID, FIREBASE_DATABASE_URL, COMPRA_PRO_ROOM_ID, FIREBASE_SERVICE_ACCOUNT_JSON');
  process.exit(1);
}
if (Boolean(MASTER_USERNAME) !== Boolean(MASTER_PASSWORD)) {
  console.error('Configura juntas MASTER_USERNAME y MASTER_PASSWORD, o deja ambas vacías.');
  process.exit(1);
}
if (MASTER_PASSWORD && MASTER_PASSWORD.length < 12) {
  console.error('MASTER_PASSWORD debe tener al menos 12 caracteres.');
  process.exit(1);
}
let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON válido.'); process.exit(1); }
if (serviceAccount.project_id && serviceAccount.project_id !== PROJECT_ID) {
  console.error('La credencial de Firebase y FIREBASE_PROJECT_ID pertenecen a proyectos distintos.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: DATABASE_URL, projectId: PROJECT_ID });
const db = admin.database();
const app = express();

async function writeSecurityAudit(roomId, event) {
  try {
    await db.ref(`compraPro/rooms/${roomId}/security/audit`).push({
      ...event,
      at: admin.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    // El registro de auditoría nunca debe impedir el inicio de sesión.
    console.warn('[AUDIT] No se pudo registrar el evento de seguridad:', String(error?.code || 'unknown'));
  }
}

// Render opera detrás de un proxy. Esta configuración evita el error de express-rate-limit.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});
app.use(express.json({ limit: '32kb', strict: true }));

// CORS para app HTTPS y para el origen "null" de un HTML local. CORS no autentica.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'null').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Log de diagnóstico sin contraseñas, tokens, nombres ni ID de sala.
app.use((req, res, next) => {
  if (req.path === '/auth/login') {
    const origin = req.headers.origin || '(sin origin)';
    console.log(`[AUTH-DIAG] request method=${req.method} origin=${origin}`);
    res.on('finish', () => console.log(`[AUTH-DIAG] response status=${res.statusCode}`));
  }
  next();
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Se alcanzó el límite temporal de intentos. Espera antes de volver a probar.' }
});
app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'compra-pro-security',
  stage: 'master-provisioning',
  masterConfigured: Boolean(MASTER_USERNAME && MASTER_PASSWORD)
}));

// Verifica que el token de Firebase siga vigente y que las claims pertenezcan a esta sala.
// El cliente puede usarlo al restaurar sesión; nunca acepta permisos enviados por el navegador.
app.get('/auth/session', async (req, res) => {
  try {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\\s+(.+)$/i);
    if (!match) return res.status(401).json({ ok: false, error: 'Falta el token de sesión.' });
    const decoded = await admin.auth().verifyIdToken(match[1], true);
    const room = cleanRoomId(decoded.room || '');
    if (decoded.compraPro !== true || !room || room !== ENV_ROOM_ID || !['master', 'admin', 'user', 'folio'].includes(decoded.role)) {
      return res.status(403).json({ ok: false, error: 'La sesión no tiene claims válidas de COMPRA PRO.' });
    }
    return res.json({
      ok: true,
      user: {
        id: decoded.uid,
        username: String(decoded.username || ''),
        role: decoded.role,
        room,
        permissions: decoded.role === 'master' ? [...APP_PERMISSIONS] : cleanPermissions(decoded.permissions)
      }
    });
  } catch (_error) {
    return res.status(401).json({ ok: false, error: 'La sesión expiró o no es válida.' });
  }
});
function sha256(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }

app.post('/auth/login', loginLimiter, async (req, res) => {
  let stage = 'input';
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    // The app's room ID is sent by the HTML; use the server variable only as fallback.
    const requestedRoom = cleanRoomId(req.body?.roomId || '');
    // La sala es una frontera de seguridad: el cliente no puede elegir otra sala.
    // Si envía una sala distinta a la configurada en Render, se rechaza.
    const roomId = ENV_ROOM_ID;
    if (requestedRoom && requestedRoom !== ENV_ROOM_ID) {
      return res.status(403).json({ ok: false, error: 'La sala solicitada no está autorizada para este servidor.' });
    }
    if (!username || !password || username.length > 100 || password.length > 256) {
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña son obligatorios.' });
    }
    if (!roomId) return res.status(400).json({ ok: false, error: 'No hay una sala de sincronización configurada.' });

    // MASTER: identidad y contraseña configuradas en Render; no dependen de datos
    // editables por los usuarios en la base compartida.
    if (MASTER_USERNAME && username === MASTER_USERNAME) {
      if (!safeEqualText(password, MASTER_PASSWORD)) {
        return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
      }
      stage = 'create-master-token';
      const permissions = [...APP_PERMISSIONS];
      const token = await admin.auth().createCustomToken('compra-pro-master-owner', {
        compraPro: true,
        claimsVersion: 1,
        role: 'master',
        username: MASTER_USERNAME,
        room: roomId,
        permissions
      });
      await writeSecurityAudit(roomId, { action: 'LOGIN_SUCCESS', actor: MASTER_USERNAME, role: 'master' });
      return res.json({
        ok: true,
        token,
        user: {
          id: MASTER_USER_ID,
          username: MASTER_USERNAME,
          room: roomId,
          name: MASTER_NAME || MASTER_USERNAME,
          role: 'master',
          permissions
        }
      });
    }

    stage = 'database-read';
    const snap = await db.ref(`compraPro/rooms/${roomId}/data/users`).get();
    const usersValue = snap.val();
    const list = Array.isArray(usersValue) ? usersValue : (usersValue && typeof usersValue === 'object' ? Object.values(usersValue) : []);
    const user = list.find(u => u && String(u.username || '').trim().toLowerCase() === username && u.active !== false);
    console.log(`[AUTH-DIAG] lookup stage=database-read roomProvided=${Boolean(requestedRoom)} userFound=${Boolean(user)} usersCount=${list.length}`);
    if (!user) return res.status(401).json({ ok: false, error: 'No se encontró una cuenta activa con ese usuario en la sala de sincronización de este equipo. Verifica que ambos equipos usen la misma sala.' });

    stage = 'password-check';
    const hash = sha256(password);
    const storedHash = typeof user.passHash === 'string' ? user.passHash.toLowerCase() : '';
    const hashMatches = /^[a-f0-9]{64}$/.test(storedHash) && crypto.timingSafeEqual(Buffer.from(storedHash, 'utf8'), Buffer.from(hash, 'utf8'));
    const valid = hashMatches || (typeof user.pass === 'string' && user.pass === password);
    if (!valid) return res.status(401).json({ ok: false, error: 'La contraseña no coincide con la cuenta guardada en Firebase.' });

    stage = 'create-token';
    // Un registro compartido nunca puede autoproclamarse MASTER.
    const role = ['admin', 'user', 'folio'].includes(user.role) ? user.role : 'user';
    const permissions = cleanPermissions(user.permissions);
    const uid = `compra-pro-${String(user.id ?? user.username).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const token = await admin.auth().createCustomToken(uid, {
      compraPro: true, claimsVersion: 1, role, username: String(user.username), room: roomId, permissions
    });
    await writeSecurityAudit(roomId, { action: 'LOGIN_SUCCESS', actor: String(user.username), role });
    return res.json({
      ok: true,
      token,
      user: {
        id: user.id ?? null,
        username: String(user.username),
        room: roomId,
        name: String(user.name || user.username),
        role,
        permissions
      }
    });
  } catch (err) {
    console.error(`[AUTH-DIAG] failure stage=${stage} code=${String(err?.code || 'unknown')} message=${String(err?.message || 'unknown').slice(0, 240)}`);
    return res.status(500).json({ ok: false, error: stage === 'database-read' ? 'El servidor no pudo consultar los usuarios de Firebase. Revisa las credenciales y el acceso a la base de datos.' : stage === 'create-token' ? 'El servidor encontró la cuenta, pero no pudo crear el token de acceso de Firebase.' : 'No se pudo validar el acceso. Revisa los registros del servidor.' });
  }
});
app.listen(PORT, '0.0.0.0', () => console.log(`COMPRA-PRO Security API escuchando en puerto ${PORT}`));
