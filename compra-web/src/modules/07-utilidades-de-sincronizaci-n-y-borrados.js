// =============================================================
// UTILIDADES DE SINCRONIZACIÓN Y BORRADOS
// =============================================================
function markDeleted(tombstoneArr, id) {
  if (!Array.isArray(tombstoneArr) || id === undefined || id === null || id === '') return tombstoneArr;
  const key = String(id);
  const existing = tombstoneArr.find(t => String(t.id) === key);
  if (existing) existing.deletedAt = Date.now();
  else tombstoneArr.push({ id, deletedAt: Date.now() });
  return tombstoneArr;
}

function mergeTombstones(localList, remoteList) {
  const map = new Map();
  (Array.isArray(localList) ? localList : []).forEach(t => map.set(String(t.id), t));
  (Array.isArray(remoteList) ? remoteList : []).forEach(t => {
    const key = String(t.id);
    const existing = map.get(key);
    if (!existing || (Number(t.deletedAt) || 0) > (Number(existing.deletedAt) || 0)) {
      map.set(key, t);
    }
  });
  return Array.from(map.values());
}

function isTombstoned(tombstoneArr, item) {
  if (!item || !Array.isArray(tombstoneArr) || !tombstoneArr.length) return false;
  const t = tombstoneArr.find(x => String(x.id) === String(item.id));
  if (!t) return false;
  const itemTime = Number(item.updatedAt) || 0;
  return (Number(t.deletedAt) || 0) >= itemTime;
}

function applyTombstones(arr, tombstoneArr) {
  if (!Array.isArray(arr) || !Array.isArray(tombstoneArr) || !tombstoneArr.length) return arr;
  return arr.filter(item => !isTombstoned(tombstoneArr, item));
}

function mergeCollections(localArr, remoteArr) {
  if (!Array.isArray(remoteArr)) return Array.isArray(localArr) ? localArr : [];
  const map = new Map();
  (Array.isArray(localArr) ? localArr : []).forEach(item => {
    if (item && item.id !== undefined && item.id !== null) map.set(String(item.id), item);
  });
  remoteArr.forEach(remoteItem => {
    if (!remoteItem || remoteItem.id === undefined || remoteItem.id === null) return;
    const key = String(remoteItem.id);
    if (!map.has(key)) {
      map.set(key, remoteItem);
    } else {
      const localItem = map.get(key);
      const remoteTime = Number(remoteItem.updatedAt) || 0;
      const localTime = Number(localItem.updatedAt) || 0;
      if (remoteTime >= localTime) map.set(key, remoteItem);
    }
  });
  return Array.from(map.values()).filter(item => !item._deleted);
}

function mergeFirebaseState(remote) {
  if (!remote || !remote.data) return;

  const d = remote.data;

  // Se usa el mismo motor de combinación que ya protege las modificaciones
  // locales y los borrados mediante updatedAt/tombstones.
  deletedProducts = mergeTombstones(deletedProducts, d.deletedProducts);
  deletedVentas = mergeTombstones(deletedVentas, d.deletedVentas);
  deletedValesManuales = mergeTombstones(deletedValesManuales, d.deletedValesManuales);
  deletedMovimientos = mergeTombstones(deletedMovimientos, d.deletedMovimientos);
  deletedUsers = mergeTombstones(deletedUsers, d.deletedUsers);

  if (Array.isArray(d.products)) {
    products = applyTombstones(mergeCollections(products, d.products), deletedProducts);
  }
  if (Array.isArray(d.ventas)) {
    ventas = applyTombstones(mergeCollections(ventas, d.ventas), deletedVentas);
  }
  if (Array.isArray(d.movimientos)) {
    movimientos = applyTombstones(mergeCollections(movimientos, d.movimientos), deletedMovimientos);
  }
  if (Array.isArray(d.valesManuales)) {
    valesManuales = applyTombstones(mergeCollections(valesManuales, d.valesManuales), deletedValesManuales);
  }
  if (Array.isArray(d.valesInventario)) {
    valesInventario = mergeCollections(valesInventario, d.valesInventario);
  }
  if (Array.isArray(d.users)) {
    users = applyTombstones(mergeUsers(users, d.users), deletedUsers);
  }

  // El folioState es la autoridad para el consecutivo. Si el archivo remoto
  // todavía no tiene folioState, usamos los campos heredados por compatibilidad.
  const remoteFolioValue = remote?.folioState?.value || d.currentFolio || '';
  const remoteFolioTime = Number(remote?.folioState?.updatedAt || d.currentFolioUpdatedAt) || 0;
  if (remoteFolioValue && remoteFolioTime > (Number(currentFolioUpdatedAt) || 0)) {
    // Un folio remoto con marca de tiempo más reciente debe actualizar
    // también equipos que anteriormente hicieron un ajuste manual local.
    currentFolio = String(remoteFolioValue);
    currentFolioUpdatedAt = remoteFolioTime;
    folioManualOverrideActive = false;
    idbSetMeta('folio_manual_override', false).catch(() => {});
  }

  // El sequence nunca puede reemplazar un folio manual más reciente.
  // Solo sirve para avanzar si pertenece a la misma versión remota.
  const remoteSequence = Number(remote?.folioState?.sequence ?? remote?.folioSequence ?? d.folioSequence);
  if (!folioManualOverrideActive && Number.isFinite(remoteSequence) && remoteSequence >= 0 && remoteFolioTime > 0 && remoteFolioTime >= (Number(currentFolioUpdatedAt) || 0)) {
    const remoteNext = remoteSequence + 1;
    const localNext = getFolioNumber(currentFolio);
    if (remoteNext > localNext && remoteFolioValue) {
      currentFolio = buildFolioFromNumber(remoteNext, remoteFolioValue);
      currentFolioUpdatedAt = remoteFolioTime;
    }
  }

  sanitizeStoredData();
  products = applyTombstones(products, deletedProducts);
  ventas = applyTombstones(ventas, deletedVentas);
  valesManuales = applyTombstones(valesManuales, deletedValesManuales);
  movimientos = applyTombstones(movimientos, deletedMovimientos);
  users = applyTombstones(users, deletedUsers);
}

async function applyFirebaseSnapshot(snapshotData, showMessage = false) {
  if (!snapshotData || !snapshotData.data) return;

  const remoteWrite = Number(snapshotData.meta?.writtenAt) || 0;
  if (snapshotData.meta?.clientId === firebaseClientId) {
    firebaseLastRemoteWrite = Math.max(firebaseLastRemoteWrite, remoteWrite);
    return;
  }

  if (remoteWrite && remoteWrite < firebaseLastRemoteWrite) return;

  firebaseLastRemoteWrite = Math.max(firebaseLastRemoteWrite, remoteWrite);
  mergeFirebaseState(snapshotData);
  await saveLocalData();
  refreshCurrentView();

  updateCloudBadge('online', 'En Línea: ' + cloudRoomId + ' · Firebase');
  if (showMessage) showToast('Datos sincronizados en vivo');
}

let firebaseListeningPath = '';
let firebaseConnectPromise = null;

// Evita conexiones simultáneas duplicadas (focus + visibilitychange + online...).
function firebaseConnectRoom() {
  if (firebaseConnectPromise) return firebaseConnectPromise;
  firebaseConnectPromise = firebaseConnectRoomInner().finally(() => { firebaseConnectPromise = null; });
  return firebaseConnectPromise;
}

async function firebaseConnectRoomInner() {
  if (!initFirebase()) {
    updateCloudBadge('offline', 'Firebase no disponible');
    return false;
  }

  const roomPath = getFirebaseRoomPath();
  if (!roomPath) {
    // Sin clave de sala válida NO se debe abrir la raíz de la base de datos.
    updateCloudBadge('offline', 'Sin sala compartida · Modo local');
    return false;
  }

  try {
    // Si ya hay un listener activo en esta misma sala, NO se vuelve a descargar
    // todo: el SDK de Firebase se reconecta solo; solo se le pide volver en línea.
    if (firebaseRoomRef && firebaseListeningPath === roomPath) {
      if (!firebaseConnectionIsUp) {
        try { firebaseDB.goOnline(); } catch (_) {}
      }
      return true;
    }

    updateCloudBadge('connecting', 'Conectando a Firebase...');

    if (firebaseRoomRef) {
      try { firebaseRoomRef.off(); } catch (_) {}
    }
    firebaseListeningPath = '';

    // El nodo .info/connected indica la conexión REAL del navegador
    // con el servicio Realtime Database.
    const connectionInfoRef = firebaseDB.ref('.info/connected');
    connectionInfoRef.off();
    connectionInfoRef.on('value', (snapshot) => {
      const connected = snapshot.val() === true;
      firebaseConnectionIsUp = connected;
      if (connected) {
        updateCloudBadge('online', 'En Línea: ' + cloudRoomId + ' · Firebase');
      } else {
        updateCloudBadge('connecting', 'Conectando a Firebase...');
      }
    });

    firebaseRoomRef = firebaseDB.ref(roomPath);
    firebaseLastRemoteWrite = 0;
    firebaseListeningPath = roomPath;
    let firstSnapshot = true;

    // Un solo listener entrega la lectura inicial y los cambios en vivo.
    // Antes además se esperaba un once('value') (segunda descarga completa) que
    // dejaba la app esperando indefinidamente si la conexión tardaba.
    firebaseRoomRef.on('value', async (snapshot) => {
      const isFirst = firstSnapshot;
      firstSnapshot = false;
      const remote = snapshot.val();

      if (!remote) {
        updateCloudBadge('online', 'Sala activa · esperando equipo...');
        // Solo publica datos locales si esta computadora realmente tiene datos.
        // La conexión/cierre de otra computadora nunca modifica las opciones
        // locales de esta instancia.
        if (products.length || ventas.length || movimientos.length || users.length) {
          setTimeout(() => broadcastFullSync(true), 300);
        }
        return;
      }

      const fs = remote?.folioState;
      const fsTime = Number(fs?.updatedAt) || 0;
      if (fs?.value && fsTime > (Number(currentFolioUpdatedAt) || 0)) {
        currentFolio = String(fs.value);
        currentFolioUpdatedAt = fsTime;
        folioManualOverrideActive = false;
        await idbSetMeta('folio_manual_override', false);
        await idbSetMeta('folio', currentFolio);
        localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt));
        const fv = document.getElementById('folio-val');
        if (fv) fv.textContent = currentFolio;
      }
      await applyFirebaseSnapshot(remote, !isFirst);
    }, (error) => {
      // El listener queda cancelado por Firebase: se libera para poder
      // volver a registrarlo (por ejemplo, después de iniciar sesión).
      firebaseListeningPath = '';
      console.error('Firebase Realtime Database:', error);
      let signedIn = true;
      try { signedIn = !!(firebase.auth && firebase.auth(firebaseApp).currentUser); } catch (_) {}
      if (!signedIn) {
        // Todavía no hay sesión: se reintenta solo al iniciar sesión (onAuthStateChanged).
        updateCloudBadge('offline', 'Inicia sesión para sincronizar');
      } else {
        updateCloudBadge('offline', 'Error de Firebase: revisa reglas/red');
        showToast('Firebase rechazó la conexión. Revisa las reglas de Realtime Database.', 'error');
      }
    });

    return true;
  } catch (e) {
    firebaseListeningPath = '';
    console.error('No se pudo conectar a Firebase:', e);
    updateCloudBadge('offline', 'Error de conexión a Firebase');
    showToast('No se pudo conectar con Firebase. Verifica Internet y la configuración de Realtime Database.', 'error');
    return false;
  }
}

// Alias utilizado por el resto del programa y por los botones existentes.
function initPeerNetwork() {
  return firebaseConnectRoom();
}

async function saveCloudRoom() {
  if (!requirePermission('settings.manage')) return;
  const input = document.getElementById('cloud-room-input').value.trim();
  if (!input) {
    showToast('Ingrese una clave de sala', 'error');
    return;
  }

  cloudRoomId = input;
  localStorage.setItem(STORAGE_PREFIX + 'cloud_room', cloudRoomId);
  await idbSetMeta('cloud_room', cloudRoomId);
  updateCloudBadge('connecting', 'Conectando a Firebase...');

  const ok = await firebaseConnectRoom();
  if (ok) {
    showToast(`Sala "${cloudRoomId}" conectada a Firebase`, 'success');
  } else {
    showToast('No fue posible conectar con Firebase', 'error');
  }
}

function reconnectCloud() {
  firebaseConnectionIsUp = false;
  try {
    if (firebaseDB) { firebaseDB.goOffline(); firebaseDB.goOnline(); }
  } catch (_) {}
  firebaseListeningPath = ''; // fuerza volver a registrar el listener
  return firebaseConnectRoom();
}

// En móviles, el navegador puede suspender la conexión de Firebase cuando
// la pestaña queda en segundo plano. Al volver, reactivar la sala compartida
// automáticamente sin esperar a que el usuario cierre sesión y entre como admin.
async function recoverFirebaseConnection(force = false) {
  if (!cloudRoomId || !initFirebase() || firebaseReconnectInProgress) return;
  if (!force && firebaseConnectionIsUp) return;
  const now = Date.now();
  if (now - firebaseLastReconnectAttempt < 5000) return;
  firebaseLastReconnectAttempt = now;
  firebaseReconnectInProgress = true;
  try {
    await firebaseConnectRoom();
  } catch (error) {
    console.warn('No se pudo recuperar automáticamente Firebase:', error);
  } finally {
    firebaseReconnectInProgress = false;
  }
}

window.addEventListener('online', () => {
  setTimeout(() => recoverFirebaseConnection(true), 500);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    setTimeout(() => recoverFirebaseConnection(false), 700);
  }
});
window.addEventListener('focus', () => {
  setTimeout(() => recoverFirebaseConnection(false), 700);
});

// Varias llamadas seguidas (clics rápidos, guardados en cadena) se agrupan: solo
// corre una sincronización a la vez y, si llegaron más cambios mientras tanto,
// se hace UNA más al final. Antes cada clic descargaba y subía toda la base.
let _bfsPromise = null;
let _bfsAgain = false;
let _bfsRetryTimer = null;

let _bfsNeedsLocalSave = false;

function broadcastFullSync(fromFirebaseListener = false, localAlreadySaved = false) {
  if (_bfsPromise) {
    // Se anota que hay cambios nuevos; la siguiente ronda los guarda en el
    // dispositivo ANTES de resolver esta promesa (nadie recibe "listo" sin guardar).
    _bfsAgain = true;
    if (!localAlreadySaved) _bfsNeedsLocalSave = true;
    return _bfsPromise;
  }
  _bfsPromise = (async () => {
    try {
      await broadcastFullSyncInner(fromFirebaseListener, localAlreadySaved);
      let guard = 0;
      while (_bfsAgain && guard++ < 5) {
        const needsSave = _bfsNeedsLocalSave;
        _bfsAgain = false;
        _bfsNeedsLocalSave = false;
        await broadcastFullSyncInner(true, !needsSave);
      }
      _bfsAgain = false;
      _bfsNeedsLocalSave = false;
    } finally {
      _bfsPromise = null;
    }
  })();
  return _bfsPromise;
}

function scheduleSyncRetry(ms) {
  if (_bfsRetryTimer) return;
  _bfsRetryTimer = setTimeout(() => {
    _bfsRetryTimer = null;
    broadcastFullSync(true, true).catch(() => {});
  }, ms);
}

async function broadcastFullSyncInner(fromFirebaseListener = false, localAlreadySaved = false) {
  sanitizeStoredData();
  if (!localAlreadySaved) await saveLocalData();

  // Sin una clave de sala, la operación es 100% local. No se inicializa
  // Firebase ni se consulta ninguna sala anterior.
  if (!cloudRoomId) {
    updateCloudBadge('offline', 'Sin sala compartida · Datos locales');
    if (!fromFirebaseListener) showToast('Datos guardados localmente. Conecte una Sala si desea sincronizar.', 'success');
    return;
  }

  if (!initFirebase()) {
    updateCloudBadge('offline', 'Datos guardados localmente');
    showToast('Datos guardados localmente; Firebase no disponible', 'warning');
    return;
  }

  if (!firebaseRoomRef) {
    await firebaseConnectRoom();
  }
  if (!firebaseRoomRef) return;

  try {
    // Antes de publicar, leemos el estado actual y lo fusionamos con el local.
    // Esto evita que una PC borre accidentalmente los cambios recientes de la otra.
    const tStart = Date.now();
    const snapRes = await fbWithTimeout(firebaseRoomRef.once('value'), 8000);
    if (snapRes && snapRes.__timeout) {
      // Sin lectura previa NO se publica: se podrían pisar cambios de otra PC.
      // Los datos ya están guardados localmente; se reintenta solo.
      updateCloudBadge('connecting', 'Conexión lenta · reintentando…');
      if (!fromFirebaseListener) showToast('Conexión lenta con Firebase; guardado local, se reintentará solo.', 'warning');
      scheduleSyncRetry(15000);
      return;
    }
    const remote = snapRes.val();

    if (remote && remote.data && remote.meta?.clientId !== firebaseClientId) {
      mergeFirebaseState(remote);
      await saveLocalData();
    }

    const payload = buildFirebasePayload();
    // Quita valores undefined/NaN (Firebase rechaza undefined y la sincronización fallaba).
    const json = JSON.stringify(payload);
    const cleanPayload = JSON.parse(json);
    // update conserva el contador atómico /folioSequence que vive como hermano de data.\n    const setPromise = firebaseRoomRef.update(cleanPayload);
    setPromise.catch(() => {});
    const setRes = await fbWithTimeout(setPromise, 12000);

    firebaseLastRemoteWrite = payload.meta.writtenAt;
    const kb = Math.round(json.length / 1024);
    const ms = Date.now() - tStart;
    window.__syncStats = { kb, ms, at: new Date().toISOString() };
    console.info('[Firebase] sincronización: ' + kb + ' KB en ' + ms + ' ms');

    if (setRes && setRes.__timeout) {
      // La escritura queda en cola dentro del SDK y se enviará al recuperar la red.
      updateCloudBadge('connecting', 'Pendiente de enviar · sin respuesta de Firebase');
      if (!fromFirebaseListener) showToast('Firebase no respondió a tiempo; los datos se enviarán al recuperar la conexión.', 'warning');
      return;
    }
    if (_bfsRetryTimer) { clearTimeout(_bfsRetryTimer); _bfsRetryTimer = null; }
    updateCloudBadge('online', 'En Línea: ' + cloudRoomId + ' · Firebase');
    const badgeEl = document.getElementById('cloud-status-badge');
    if (badgeEl) badgeEl.title = 'Firebase conectado · última sincronización: ' + kb + ' KB en ' + ms + ' ms';
    if (kb > 4000 && !window.__bigPayloadWarned) {
      window.__bigPayloadWarned = true;
      showToast('La base compartida ya pesa ' + Math.round(kb / 1024) + ' MB; la sincronización será lenta. Conviene archivar compras antiguas.', 'warning');
    }
    if (!fromFirebaseListener) {
      showToast('Datos guardados y sincronizados en Firebase');
    }
  } catch (e) {
    console.error('Error escribiendo en Firebase:', e);
    updateCloudBadge('offline', 'Sin sincronización con Firebase');
    showToast('No se pudo sincronizar con Firebase; datos guardados localmente', 'warning');
  }
}

async function saveLocalData() {
  await Promise.all([
    idbClearAndPutAll('products', products),
    idbClearAndPutAll('ventas', ventas),
    idbClearAndPutAll('movimientos', movimientos),
    idbClearAndPutAll('users', users),
    idbSetMeta('valesManuales', valesManuales),
    idbSetMeta('valesInventario', valesInventario),
    idbSetMeta('folio', currentFolio),
    idbSetMeta('cloud_room', cloudRoomId),
    idbSetMeta('deletedProducts', deletedProducts),
    idbSetMeta('deletedVentas', deletedVentas),
    idbSetMeta('deletedValesManuales', deletedValesManuales),
    idbSetMeta('deletedMovimientos', deletedMovimientos),
    idbSetMeta('deletedUsers', deletedUsers)
  ]);
  localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt || 0));
}

