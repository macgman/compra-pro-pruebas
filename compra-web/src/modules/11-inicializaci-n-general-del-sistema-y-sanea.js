// =============================================================
// INICIALIZACIÓN GENERAL DEL SISTEMA Y SANEAMIENTO
// =============================================================
const INITIAL_DATA = [];

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function cleanCorruptedString(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  
  const replacements = [
    ['Ã¡', 'á'], ['Ã©', 'é'], ['Ã­', 'í'], ['Ã³', 'ó'], ['Ãº', 'ú'], ['Ã±', 'ñ'], ['Ã¼', 'ü'],
    ['Ã\x81', 'Á'], ['Ã\x89', 'É'], ['Ã\x8D', 'Í'], ['Ã\x93', 'Ó'], ['Ã\x9A', 'Ú'], ['Ã\x91', 'Ñ'], ['Ã\x9C', 'Ü'],
    ['Á¡', 'á'], ['Á©', 'é'], ['Á­', 'í'], ['Á³', 'ó'], ['Áº', 'ú'], ['Á±', 'ñ'], ['Á¼', 'ü'],
    ['Â°', '°'], ['Âº', 'º'], ['Âª', 'ª'], ['Â¿', '¿'], ['Â¡', '¡'], ['Â®', '®'],
    ['â€œ', '"'], ['â€\x9d', '"'], ['â€˜', "'"], ['â€™', "'"], ['â€“', '–'], ['â€”', '—'], ['ï»¿', ''],
    ['\uFFFD', '']
  ];

  for (const [bad, good] of replacements) {
    str = str.split(bad).join(good);
  }

  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().normalize('NFC');
}

function sanitizeStoredData() {
  products = products.map(p => ({
    ...p,
    clave: cleanCorruptedString(p.clave),
    factura: cleanCorruptedString(p.factura),
    partida: cleanCorruptedString(p.partida),
    contrato: cleanCorruptedString(p.contrato),
    descripcion: cleanCorruptedString(p.descripcion),
    unidad: cleanCorruptedString(p.unidad)
  }));
  ventas = ventas.map(v => ({
    ...v,
    folio: cleanCorruptedString(v.folio),
    cliente: cleanCorruptedString(v.cliente),
    items: (v.items || []).map(i => ({
      ...i,
      clave: cleanCorruptedString(i.clave),
      descripcion: cleanCorruptedString(i.descripcion),
      unidad: cleanCorruptedString(i.unidad),
      partida: cleanCorruptedString(i.partida),
      contrato: cleanCorruptedString(i.contrato)
    }))
  }));
  valesInventario = (Array.isArray(valesInventario) ? valesInventario : []).map(i => ({
    ...i,
    clave: cleanCorruptedString(i.clave),
    descripcion: cleanCorruptedString(i.descripcion),
    unidad: cleanCorruptedString(i.unidad || 'PIEZA'),
    precio: Number(i.precio) || 0,
    existencia: Number(i.existencia) || 0
  }));
  valesManuales = (Array.isArray(valesManuales) ? valesManuales : []).map(v => ({
    ...v,
    folio: cleanCorruptedString(v.folio),
    trabajador: cleanCorruptedString(v.trabajador),
    departamento: cleanCorruptedString(v.departamento),
    cargo: cleanCorruptedString(v.cargo),
    tipo: cleanCorruptedString(v.tipo || 'COMPRA'),
    items: (v.items || []).map(i => ({
      ...i,
      clave: cleanCorruptedString(i.clave),
      descripcion: cleanCorruptedString(i.descripcion),
      unidad: cleanCorruptedString(i.unidad)
    }))
  }));
  movimientos = movimientos.map(m => ({
    ...m,
    clave: cleanCorruptedString(m.clave),
    desc: cleanCorruptedString(m.desc),
    note: cleanCorruptedString(m.note),
    folio: cleanCorruptedString(m.folio),
    cliente: cleanCorruptedString(m.cliente || getMovimientoCliente(m))
  }));
  users = users.map(u => ({
    ...u,
    name: cleanCorruptedString(u.name),
    username: cleanCorruptedString(u.username)
  }));
}

function handleLoginSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  attemptLoginMulti();
  return false;
}

function setupLoginHandlers() {
  const userInput = document.getElementById('login-user');
  const passInput = document.getElementById('login-pass');
  const form = document.getElementById('login-form');
  if (!userInput || !passInput) return;

  // Enter en Usuario: ir a Contraseña sin enviar todavía.
  if (!userInput.dataset.enterReady) {
    userInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === 'Go' || e.key === 'Done') {
        e.preventDefault();
        e.stopPropagation();
        passInput.focus();
      }
    });
    userInput.dataset.enterReady = '1';
  }

  // En Contraseña, el propio <form> se encarga del Enter/Go/Done.
  // Este respaldo cubre navegadores móviles que no disparan submit.
  if (!passInput.dataset.enterReady) {
    passInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === 'Go' || e.key === 'Done') {
        e.preventDefault();
        e.stopPropagation();
        handleLoginSubmit(e);
      }
    });
    passInput.dataset.enterReady = '1';
  }

  if (form && !form.dataset.submitReady) {
    form.addEventListener('submit', handleLoginSubmit);
    form.dataset.submitReady = '1';
  }

  const resetPassInput = document.getElementById('reset-system-password');
  if (resetPassInput && !resetPassInput.dataset.handlersReady) {
    resetPassInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmResetSystem();
      }
    });
    resetPassInput.dataset.handlersReady = '1';
  }
}

async function init() {
  await openDatabase();

  // COMPRA 3.0.6 inicia con catálogo limpio. Este reinicio se ejecuta
  // una sola vez en la base local de cada navegador para eliminar materiales
  // heredados de versiones anteriores. Después de importar un .json, los
  // materiales sí se conservan normalmente entre recargas.
  const FRESH_START_MARKER = 'catalog_reset_3_0_6';
  const freshStartDone = await idbGetMeta(FRESH_START_MARKER, false);
  if (!freshStartDone) {
    await idbClearAndPutAll('products', []);
    await idbSetMeta('db_seeded', true);
    await idbSetMeta(FRESH_START_MARKER, true);
    // Nunca arrastrar una sala compartida anterior a esta instalación nueva.
    await idbSetMeta('cloud_room', '');
    localStorage.removeItem(STORAGE_PREFIX + 'cloud_room');
  }

  // Recuperar la carpeta de folios guardada previamente.
  // La carpeta se restaura sin volver a abrir el selector.
  await f361LoadFolderHandle();

  const idbProds = await idbGetAll('products');
  const idbVentas = await idbGetAll('ventas');
  const idbMovs = await idbGetAll('movimientos');
  const idbUsers = await idbGetAll('users');
  const savedValesManuales = await idbGetMeta('valesManuales', []);
  const savedValesInventario = await idbGetMeta('valesInventario', []);

  // El producto de muestra (INITIAL_DATA) solo debe cargarse en la
  // instalacion original, jamas. La bandera 'db_seeded' distingue
  // "nunca se ha usado este sistema" de "el catalogo quedo vacio a
  // proposito" (por ejemplo, tras un Reinicio Total o al borrar el
  // ultimo producto manualmente); sin ella, ambos casos lucian iguales
  // (0 productos en IndexedDB) y el producto de muestra reaparecia solo.
  const alreadySeeded = await idbGetMeta('db_seeded', false);
  if (idbProds.length > 0) {
    products = idbProds;
  } else if (!alreadySeeded) {
    products = INITIAL_DATA;
    await idbPutAll('products', products);
  } else {
    products = [];
  }
  await idbSetMeta('db_seeded', true);

  ventas = idbVentas;
  movimientos = idbMovs;
  valesManuales = Array.isArray(savedValesManuales) ? savedValesManuales : [];
  valesInventario = Array.isArray(savedValesInventario) ? savedValesInventario : [];

  if (idbUsers.length > 0) {
    users = idbUsers;
  } else {
    // Primera apertura de esta computadora: crear las cuentas base sin
    // simular una modificación reciente. Firebase podrá reemplazarlas por
    // la versión compartida real al conectarse a la sala.
    users = DEFAULT_USERS.map(u => ({...u}));
    await idbPutAll('users', users);
  }
  ensureLoginUsers();

  currentFolio = await idbGetMeta('folio', 'F-001');
  // IMPORTANTE: un folio establecido manualmente debe conservarse aunque
  // el historial contenga folios con números mayores (por ejemplo, F-431).
  // La bandera se guarda en IndexedDB y evita que el arranque vuelva a
  // "reparar" F-016 hacia F-431 después de actualizar la página.
  const folioManualOverride = await idbGetMeta('folio_manual_override', false);
  folioManualOverrideActive = !!folioManualOverride;

  cloudRoomId = await idbGetMeta('cloud_room', '');
  deletedProducts = await idbGetMeta('deletedProducts', []);
  deletedVentas = await idbGetMeta('deletedVentas', []);
  deletedValesManuales = await idbGetMeta('deletedValesManuales', []);
  deletedMovimientos = await idbGetMeta('deletedMovimientos', []);
  deletedUsers = await idbGetMeta('deletedUsers', []);

  // El folio guardado es la fuente de verdad.
  // NO se recalcula al iniciar sesión a partir del folio histórico más alto.
  // Esto evita que un folio válido como F-040 vuelva a F-431 al cambiar de usuario.
  // El historial se utiliza únicamente para validar nuevos registros/duplicados.
  currentFolio = fixTextForExcel(currentFolio || 'F-001').trim() || 'F-001';

  sanitizeStoredData();
  // Saneamiento defensivo: si por alguna razón quedó guardado un registro
  // que ya tiene tombstone (por ejemplo, cierre abrupto antes de guardar),
  // se purga aquí al arrancar.
  products = applyTombstones(products, deletedProducts);
  ventas = applyTombstones(ventas, deletedVentas);
  valesManuales = applyTombstones(valesManuales, deletedValesManuales);
  movimientos = applyTombstones(movimientos, deletedMovimientos);
  users = applyTombstones(users, deletedUsers);
  syncMovimientoClientesFromVentas();

  document.getElementById('folio-val').textContent = currentFolio;
  document.getElementById('cloud-room-input').value = cloudRoomId;

  try {
    if (cloudRoomId) {
      // La conexión a Firebase se hace en segundo plano: la app (botones,
      // búsqueda y sesión guardada) ya no espera a la red para quedar lista.
      updateCloudBadge('connecting', 'Conectando a Firebase...');
      initPeerNetwork().catch(e => {
        console.warn('Firebase no conectó al arrancar; se continúa en modo local.', e);
        updateCloudBadge('offline', 'Modo local - reintentando conexión');
      });
    } else {
      updateCloudBadge('offline', 'Sin sala compartida · Modo local');
    }
  } catch (e) {
    console.warn('La inicialización de red fallo; se continua en modo local.', e);
    updateCloudBadge('offline', 'Modo local - sin conexión de red');
  }

  const ventaSearch = document.getElementById('venta-search-prod');
  ventaSearch.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const firstAvailable = ventaSearchResults.find(p => Number(p.cantidad) > 0 && !p.bloqueado);
    if (firstAvailable) addVentaItem(firstAvailable.id);
    else showToast('No hay un material disponible para agregar', 'error');
  });

  document.addEventListener('click', function(e) {
    const valeContainer = document.querySelector('#section-vale-manual .ac-container');
    const valeList = document.getElementById('vale-inventory-ac-list');
    if (valeContainer && valeList && !valeContainer.contains(e.target)) valeList.style.display = 'none';
    const container = document.querySelector('#section-ventas .ac-container');
    const list = document.getElementById('venta-ac-list');
    if (container && list && !container.contains(e.target)) list.style.display = 'none';
  });

  const sess = safeJsonParse(sessionStorage.getItem(STORAGE_PREFIX + 'session'), null);
  if (sess && ['master', 'admin', 'user', 'folio'].includes(sess.role)) {
    currentUser = sess;
    applyUserRole();
  }
}

function refreshCurrentView() {
  document.getElementById('folio-val').textContent = currentFolio;
  renderDashboard();
  renderInventario();
  renderHistorialVentas();
  if (document.getElementById('section-vale-manual')?.style.display === 'block') renderValeManualItems();
  if (document.getElementById('section-vale-inventario')?.style.display === 'block') renderValeInventario();
  renderMovimientos();
  renderKardex();
  renderUsersTable();
  if (document.getElementById('section-ventas-material').style.display === 'block') {
    populateVentasMaterialSelect();
    renderVentasMaterial();
  }
}

function getMovementTypeLabel(type) {
  const t = String(type || '').toUpperCase().trim();
  if (t === 'MODIFICACION' || t === 'MODIFICACIÓN' || t === 'MODIFICADA') return 'MODIFICADA';
  return t || 'N/A';
}

function getMovementBadgeClass(type) {
  const t = getMovementTypeLabel(type);
  if (t === 'ENTRADA') return 'badge-ok';
  if (t === 'MODIFICADA') return 'badge-edit';
  if (t === 'SALIDA') return 'badge-critical';
  return 'badge-zero';
}

function addMov(type, pid, qty, note="", folio="", cliente="", opts={}) {
  const p = products.find(x => x.id == pid) || {};
  const normalizedType = getMovementTypeLabel(type);
  const quantity = Math.abs(Number(qty) || 0);
  const now = Date.now();
  const isLedgerMovement = ['ENTRADA','SALIDA'].includes(normalizedType) && !!p.id && quantity > 0;
  let ledger = {};
  if (isLedgerMovement) {
    const stockAfterMutation = Math.max(0, Number(p.cantidad) || 0);
    const stockBeforeMutation = Number.isFinite(Number(opts.stockBefore))
      ? Math.max(0, Number(opts.stockBefore))
      : (normalizedType === 'SALIDA' ? stockAfterMutation + quantity : Math.max(0, stockAfterMutation - quantity));
    ensureKardexBaseline(p, stockBeforeMutation);
    const stateBefore = calculateKardexProductState(p.id);
    const unitCost = normalizedType === 'ENTRADA'
      ? Math.max(0, Number(opts.unitCost !== undefined ? opts.unitCost : p.precio) || 0)
      : Math.max(0, Number(stateBefore.averageCost) || 0);
    const totalCost = unitCost * quantity;
    const balanceAfter = normalizedType === 'ENTRADA' ? stateBefore.quantity + quantity : stateBefore.quantity - quantity;
    const averageAfter = normalizedType === 'ENTRADA'
      ? ((stateBefore.quantity * stateBefore.averageCost) + totalCost) / Math.max(balanceAfter, 1e-12)
      : stateBefore.averageCost;
    ledger = {
      kardexVersion: 1, kardexTimestamp: now, kardexSource: opts.kardexSource || 'AUTOMATICO',
      unitCost: Number.isFinite(unitCost) ? unitCost : null, totalCost: Number.isFinite(totalCost) ? totalCost : null,
      balanceBefore: stateBefore.quantity, balanceAfter: Math.max(0, balanceAfter),
      averageCostBefore: stateBefore.averageCost, averageCostAfter: Number.isFinite(averageAfter) ? averageAfter : 0,
      inventoryValueAfter: Math.max(0, balanceAfter) * (Number.isFinite(averageAfter) ? averageAfter : 0),
      costStatus: unitCost > 0 || normalizedType === 'ENTRADA' ? 'REGISTRADO' : 'SIN_COSTO',
      stockBeforeAtEntry: stockBeforeMutation
    };
  }
  movimientos.unshift({
    id: Date.now() + Math.random(), date: new Date().toLocaleString(), timestamp: now,
    fecha_factura: opts.fecha_factura || '', type: normalizedType, productId: pid || '',
    clave: fixTextForExcel(opts.clave || p.clave || '—'), desc: fixTextForExcel(opts.desc || p.descripcion || 'Movimiento sin producto'),
    partida: fixTextForExcel(opts.partida || p.partida || ''), contrato: fixTextForExcel(opts.contrato || p.contrato || ''),
    qty: quantity, user: currentUser ? (currentUser.name || currentUser.username) : 'Sistema',
    note: fixTextForExcel(note), folio: fixTextForExcel(folio), cliente: fixTextForExcel(cliente),
    updatedAt: now, ...ledger
  });
  if (movimientos.length > 100000) movimientos.length = 100000;
}

function togglePasswordVisibility() {
  const passInput = document.getElementById('login-pass');
  const toggleIcon = document.getElementById('toggle-icon');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    toggleIcon.className = 'fas fa-eye';
  } else {
    passInput.type = 'password';
    toggleIcon.className = 'fas fa-eye-slash';
  }
  passInput.focus();
}

