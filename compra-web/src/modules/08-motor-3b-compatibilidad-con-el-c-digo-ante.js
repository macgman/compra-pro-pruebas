// =============================================================
// MOTOR 3B: COMPATIBILIDAD CON EL CÓDIGO ANTERIOR
// =============================================================
// Ya no existe una conexión PeerJS. Estas funciones se conservan como
// no-op/compatibilidad para que ninguna parte del programa anterior falle.
function updatePeerCount() {}
function startHeartbeat() {}
function connectAsClient() { return firebaseConnectRoom(); }
function joinHost() { return firebaseConnectRoom(); }
function setupConnEvents() {}
async function handleIncomingData() {}

