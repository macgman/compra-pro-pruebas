// =============================================================
// ESTADO PRINCIPAL Y USUARIOS
// =============================================================
let products = [], ventas = [], movimientos = [], valesManuales = [], valesInventario = [], currentFolio = 'F-001', currentUser = null;
let folioManualOverrideActive = false;

// Usuarios base: el inicio de sesión no depende de IndexedDB ni de la red.
const DEFAULT_USERS = [
  { id: 1, username: 'admin', passHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', name: 'Administrador Principal', role: 'admin', active: true, updatedAt: 0 },
  { id: 2, username: 'operador', passHash: 'e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446', name: 'Operador General', role: 'user', active: true, updatedAt: 0 }
];
// Los usuarios predeterminados no se marcan como modificados al abrir
// una computadora nueva. Esto evita que una copia local con admin123/user123
// pueda competir contra una contraseña que ya fue cambiada en otra PC.
let users = DEFAULT_USERS.map(u => ({...u}));

// =============================================================
// CONTROL DE ACCESO GRANULAR (RBAC)
// La cuenta MASTER debe ser provisionada por el servidor de autenticación.
// Nunca se concede MASTER desde el formulario de usuarios.
// =============================================================
const COMPRA_PERMISSIONS = [
  ['dashboard.view','Dashboard'],
  ['inventory.view','Consultar inventario'],
  ['inventory.create','Agregar materiales'],
  ['inventory.edit','Modificar materiales'],
  ['inventory.delete','Eliminar materiales'],
  ['inventory.import','Carga masiva / importar'],
  ['physical.manage','Inventario físico'],
  ['purchases.create','Registrar compras'],
  ['purchases.view','Consultar historial de compras'],
  ['purchases.edit','Modificar compras'],
  ['purchases.delete','Eliminar compras'],
  ['vouchers.manage','Vales manuales y donaciones'],
  ['movements.view','Consultar movimientos'],
  ['movements.edit','Modificar movimientos'],
  ['kardex.view','Consultar Kardex'],
  ['kardex.adjust','Ajustes de Kardex'],
  ['reports.export','Exportar reportes'],
  ['folios.edit','Modificar folios'],
  ['users.manage','Gestionar usuarios'],
  ['settings.manage','Configuración y conexión'],
  ['backup.export','Crear respaldos'],
  ['backup.restore','Restaurar respaldos'],
  ['system.reset','Borrar todos los datos']
];
const COMPRA_USER_DEFAULTS = [
  'dashboard.view','inventory.view','purchases.create','purchases.view',
  'vouchers.manage','movements.view','kardex.view','reports.export'
];
const COMPRA_ADMIN_DEFAULTS = COMPRA_PERMISSIONS.map(p => p[0])
  .filter(p => !['system.reset'].includes(p));
function isMasterUser(user = currentUser) { return !!user && user.role === 'master'; }
function hasAnyPermission(keys, user = currentUser) { return keys.some(key => userHasPermission(key, user)); }
function defaultPermissionsForRole(role) {
  if (role === 'master') return COMPRA_PERMISSIONS.map(p => p[0]);
  if (role === 'admin') return COMPRA_ADMIN_DEFAULTS.slice();
  if (role === 'folio') return [...COMPRA_USER_DEFAULTS, 'folios.edit'];
  return COMPRA_USER_DEFAULTS.slice();
}
function userHasPermission(permission, user = currentUser) {
  if (!user) return false;
  if (permission === 'system.reset') return user.role === 'master';
  if (user.role === 'master') return true;
  const list = Array.isArray(user.permissions) ? user.permissions : defaultPermissionsForRole(user.role);
  return list.includes(permission);
}
function requirePermission(permission, message = 'No tienes permiso para realizar esta acción.') {
  if (userHasPermission(permission)) return true;
  showToast(message, 'error');
  return false;
}
function normalizeUserPermissions(user) {
  if (!user || user.role === 'master') return user;
  if (!Array.isArray(user.permissions)) user.permissions = defaultPermissionsForRole(user.role);
  user.permissions = [...new Set(user.permissions.filter(p => COMPRA_PERMISSIONS.some(x => x[0] === p)))];
  return user;
}
function renderPermissionEditor(selected = COMPRA_USER_DEFAULTS) {
  const host = document.getElementById('user-permissions');
  if (!host) return;
  const allowed = new Set(Array.isArray(selected) ? selected : []);
  host.innerHTML = COMPRA_PERMISSIONS.map(([key,label]) => {
    const masterOnly = key === 'system.reset';
    const checked = masterOnly ? false : allowed.has(key);
    return `
    <label class="permission-option">
      <input type="checkbox" name="user-permission" value="${key}" ${checked ? 'checked' : ''} ${masterOnly ? 'disabled title="Exclusivo de MASTER"' : ''}>
      <span>${label}${masterOnly ? ' (exclusivo MASTER)' : ''}</span>
    </label>`;
  }).join('');
}
function readPermissionEditor() {
  return [...document.querySelectorAll('#user-permissions input[name="user-permission"]:checked')]
    .map(x => x.value).filter(x => x !== 'system.reset');
}
function applyGranularPermissions() {
  const setVisible = (el, visible, displayValue = '') => {
    if (!el) return;
    el.hidden = !visible;
    el.classList.remove('admin-only');
    if (visible) {
      if (displayValue) el.style.setProperty('display', displayValue, 'important');
      else el.style.removeProperty('display');
    } else {
      el.style.setProperty('display', 'none', 'important');
    }
  };
  document.querySelectorAll('[data-permission]').forEach(el => {
    const navAccess = {
      'nav-config': ['users.manage','settings.manage','backup.export','backup.restore'],
      'nav-ordenes': ['purchases.view','purchases.create','purchases.edit','purchases.delete'],
      'nav-seguridad': ['users.manage'],
      'nav-vale-inventario': ['inventory.view','vouchers.manage'],
      'nav-inventario': ['inventory.view','inventory.create','inventory.edit','inventory.delete','inventory.import'],
      'nav-ventas': ['purchases.create','purchases.edit'],
      'nav-historial-ventas': ['purchases.view','purchases.edit','purchases.delete'],
      'nav-movimientos': ['movements.view','movements.edit'],
      'nav-kardex': ['kardex.view','kardex.adjust']
    }[el.id];
    setVisible(el, navAccess ? hasAnyPermission(navAccess) : (el.dataset.permission === 'inventory.edit-or-delete' ? hasAnyPermission(['inventory.edit','inventory.delete']) : userHasPermission(el.dataset.permission)));
  });
  const config = document.getElementById('section-config');
  if (config) {
    const userCard = config.querySelector(':scope > .net-box');
    const connectionCard = config.querySelector('.net-grid-card > .net-box:first-child');
    setVisible(userCard, userHasPermission('users.manage'));
    setVisible(connectionCard, userHasPermission('settings.manage'));
  }
  document.querySelectorAll('[data-master-only]').forEach(el => setVisible(el, isMasterUser()));
  setVisible(document.getElementById('nav-ordenes'),
    hasAnyPermission(['purchases.view','purchases.create','purchases.edit','purchases.delete']));
  setVisible(document.getElementById('nav-stock-minimo'), userHasPermission('inventory.view'));
  setVisible(document.querySelector('#section-inventario button[onclick*="openProductModal"]'), userHasPermission('inventory.create'), 'inline-flex');
  setVisible(document.querySelector('#section-inventario button[onclick*="bulk-excel-input"]'), userHasPermission('inventory.import'), 'inline-flex');
  setVisible(document.getElementById('btn-delete-prod'), userHasPermission('inventory.delete'), 'inline-flex');
  setVisible(document.querySelector('#section-inventario .inventario-table th.admin-only'),
    ['inventory.edit','inventory.create','inventory.delete'].some(k => userHasPermission(k)), 'table-cell');
  setVisible(document.querySelector('#section-movimientos th.admin-only'), userHasPermission('movements.edit'), 'table-cell');
  setVisible(document.querySelector('#modal-movimiento button[onclick*="saveMovChanges"]'), userHasPermission('movements.edit'), 'inline-flex');
  const valeSection = document.getElementById('section-vale-inventario');
  if (valeSection) {
    const manage = userHasPermission('vouchers.manage');
    const report = userHasPermission('reports.export');
    setVisible(valeSection.querySelector('button[onclick*="openValeInventoryMaterialForm"]'), manage, 'inline-flex');
    setVisible(valeSection.querySelector('button[onclick*="vale-inventory-excel-input"]'), manage, 'inline-flex');
    setVisible(valeSection.querySelector('button[onclick*="vale-inventory-json-input"]'), manage, 'inline-flex');
    setVisible(valeSection.querySelector('button[onclick*="exportValeInventoryExcel"]'), report, 'inline-flex');
    setVisible(valeSection.querySelector('button[onclick*="exportValeInventoryJSON"]'), report, 'inline-flex');
  }
}


function ensureLoginUsers() {
  if (!Array.isArray(users) || users.length === 0) {
    users = DEFAULT_USERS.map(u => ({...u}));
  }
}

function getDefaultUserByIdOrUsername(user) {
  if (!user) return null;
  return DEFAULT_USERS.find(def =>
    String(def.id) === String(user.id) ||
    String(def.username).toLowerCase() === String(user.username || '').toLowerCase()
  ) || null;
}

function isDefaultUserCredential(user) {
  const def = getDefaultUserByIdOrUsername(user);
  if (!def) return false;
  if (user.passHash && def.passHash && user.passHash === def.passHash) return true;
  // Compatibilidad con registros antiguos que todavía conservaran pass.
  if (user.pass && def.id === 1 && user.pass === 'admin123') return true;
  if (user.pass && def.id === 2 && user.pass === 'user123') return true;
  return false;
}

function mergeUsers(localArr, remoteArr) {
  if (!Array.isArray(remoteArr)) return Array.isArray(localArr) ? localArr : [];

  const map = new Map();
  (Array.isArray(localArr) ? localArr : []).forEach(user => {
    if (user && user.id !== undefined && user.id !== null) {
      map.set(String(user.id), user);
    }
  });

  remoteArr.forEach(remoteUser => {
    if (!remoteUser || remoteUser.id === undefined || remoteUser.id === null) return;

    const key = String(remoteUser.id);
    const localUser = map.get(key);
    if (!localUser) {
      map.set(key, remoteUser);
      return;
    }

    // Regla especial para cuentas predeterminadas:
    // una contraseña personalizada siempre vence a la contraseña inicial,
    // sin importar qué PC tenga el updatedAt más reciente.
    const localIsDefault = isDefaultUserCredential(localUser);
    const remoteIsDefault = isDefaultUserCredential(remoteUser);

    if (localIsDefault && !remoteIsDefault) {
      map.set(key, remoteUser);
      return;
    }
    if (!localIsDefault && remoteIsDefault) {
      return;
    }

    const remoteTime = Number(remoteUser.updatedAt) || 0;
    const localTime = Number(localUser.updatedAt) || 0;
    if (remoteTime >= localTime) map.set(key, remoteUser);
  });

  return Array.from(map.values()).filter(user => !user._deleted);
}

// --- CORRECCIÓN SINCRONIZACIÓN DE BORRADOS (TOMBSTONES) ---
let deletedProducts = [], deletedVentas = [], deletedMovimientos = [], deletedUsers = [], deletedValesManuales = [];

let invPage = 1, invPerPage = 25, ifPage = 1, ifPerPage = 50, ifCounts = {};
let ventaItems = [], editingVentaId = null, ventaSearchResults = [];
let editingValeManualId = null;
let currentViewingVenta = null;
let currentViewingValeManual = null;

let firebaseApp = null;
let firebaseDB = null;
let firebaseRoomRef = null;
let firebaseReady = false;
let firebaseClientId = localStorage.getItem(STORAGE_PREFIX + 'firebase_client_id');
let firebaseLastRemoteWrite = 0;
let currentFolioUpdatedAt = Number(localStorage.getItem(STORAGE_PREFIX + 'folio_updated_at') || 0);

if (!firebaseClientId) {
  firebaseClientId = (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('client-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  localStorage.setItem(STORAGE_PREFIX + 'firebase_client_id', firebaseClientId);
}

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAcQj2IO8aQJQ7-vDyY5xFzQCpQCKF53kk",
  authDomain: "inventario-compra.firebaseapp.com",
  databaseURL: "https://inventario-compra-default-rtdb.firebaseio.com",
  projectId: "inventario-compra",
  storageBucket: "inventario-compra.firebasestorage.app",
  messagingSenderId: "472768751163",
  appId: "1:472768751163:web:feac4989c3c8c3900b5e1e"
};

function initFirebase() {
  if (firebaseReady && firebaseDB) return true;
  if (typeof firebase === 'undefined' || !firebase.database) {
    firebaseReady = false;
    console.warn('Firebase SDK no disponible.');
    return false;
  }

  try {
    firebaseApp = firebase.apps && firebase.apps.length
      ? firebase.app()
      : firebase.initializeApp(FIREBASE_CONFIG);

    firebaseDB = firebase.database(firebaseApp);
    firebaseReady = true;
    hookFirebaseAuthReconnect();
    return true;
  } catch (e) {
    firebaseReady = false;
    console.error('No se pudo inicializar Firebase:', e);
    return false;
  }
}

// Si el listener de la sala se registró ANTES de que Firebase Auth terminara de
// restaurar la sesión, la base de datos lo rechaza (PERMISSION_DENIED) y nadie lo
// volvía a registrar: la sincronización en vivo quedaba muerta hasta cerrar sesión.
// Aquí se vuelve a registrar en cuanto hay un usuario autenticado.
let firebaseAuthHooked = false;
function hookFirebaseAuthReconnect() {
  if (firebaseAuthHooked) return;
  try {
    if (!firebase.auth) return;
    firebaseAuthHooked = true;
    firebase.auth(firebaseApp).onAuthStateChanged((user) => {
      if (user && cloudRoomId && !firebaseListeningPath) {
        firebaseConnectRoom().catch(() => {});
      }
    });
  } catch (e) {
    console.warn('No se pudo vigilar el estado de Firebase Auth:', e);
  }
}

// Espera máxima para operaciones de red. Devuelve { __timeout: true } en vez de
// quedarse colgado para siempre (eso congelaba la pantalla al guardar).
function fbWithTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ __timeout: true }), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getFirebaseRoomPath() {
  const clean = String(cloudRoomId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!clean) return '';
  return 'compraPro/rooms/' + clean;
}

function buildFirebasePayload() {
  const folioNumber = getFolioNumber(currentFolio);
  return {
    data: {
      products,
      ventas,
      movimientos,
      valesManuales,
      valesInventario,
      currentFolio,
      currentFolioUpdatedAt,
      users,
      deletedProducts,
      deletedVentas,
      deletedValesManuales,
      deletedMovimientos,
      deletedUsers
    },
    // El folio tiene su propio registro de autoridad. Esto evita que una
    // sincronización vieja de otra computadora vuelva a escribir F-431
    // después de que el usuario haya establecido manualmente F-016.
    folioState: {
      value: currentFolio,
      updatedAt: Number(currentFolioUpdatedAt) || Date.now(),
      sequence: Math.max(0, folioNumber - 1)
    },
    meta: {
      clientId: firebaseClientId,
      writtenAt: Date.now(),
      version: 3
    }
  };
}

