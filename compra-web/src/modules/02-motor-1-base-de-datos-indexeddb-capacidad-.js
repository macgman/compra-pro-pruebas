// =============================================================
// MOTOR 1: BASE DE DATOS INDEXEDDB (CAPACIDAD MASIVA)
// =============================================================
const DB_NAME = 'CompraProDB_v2';
const DB_VERSION = 1;
let db = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('products')) d.createObjectStore('products', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('ventas')) d.createObjectStore('ventas', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('movimientos')) d.createObjectStore('movimientos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('users')) d.createObjectStore('users', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve([]);
    const tx = db.transaction(storeName, 'readonly');
    const st = tx.objectStore(storeName);
    const req = st.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function idbPutAll(storeName, items) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const tx = db.transaction(storeName, 'readwrite');
    const st = tx.objectStore(storeName);
    items.forEach(item => st.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
    tx.onabort = (e) => reject(e);
  });
}

function idbClearAndPutAll(storeName, items) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const tx = db.transaction(storeName, 'readwrite');
    const st = tx.objectStore(storeName);
    st.clear();
    items.forEach(item => st.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
    tx.onabort = (e) => reject(e);
  });
}

function idbSetMeta(key, value) {
  return new Promise((resolve) => {
    if (!db) return resolve();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    tx.oncomplete = () => resolve();
    // Si IndexedDB falla o aborta, la promesa debe terminar para no congelar la pantalla.
    tx.onerror = () => { console.warn('[IDB] Error guardando meta:', key); resolve(); };
    tx.onabort = () => { console.warn('[IDB] Guardado abortado en meta:', key); resolve(); };
  });
}

function idbGetMeta(key, fallback) {
  return new Promise((resolve) => {
    if (!db) return resolve(fallback);
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror = () => resolve(fallback);
    tx.onabort = () => resolve(fallback);
  });
}

