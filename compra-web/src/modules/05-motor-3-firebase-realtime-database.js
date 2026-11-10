// =============================================================
// MOTOR 3: FIREBASE REALTIME DATABASE
// =============================================================
// Este motor sustituye por completo la conexión WebRTC/PeerJS.
// IndexedDB continúa siendo la copia local; Firebase es la copia compartida.
// La sincronización conserva el enfoque "última modificación gana" que ya
// utilizaba el sistema mediante updatedAt y tombstones.
const STORAGE_PREFIX = 'compra_v2_';

let cloudRoomId = localStorage.getItem(STORAGE_PREFIX + 'cloud_room') || '';
let firebaseConnectionIsUp = false;
let firebaseReconnectInProgress = false;
let firebaseLastReconnectAttempt = 0;

// Variables heredadas conservadas para que el resto del programa no tenga
// que cambiar y para que el reinicio total siga siendo compatible.
let peer = null;
let activeConnection = null;
let connections = [];
let isHost = false;
let heartbeatTimer = null;

