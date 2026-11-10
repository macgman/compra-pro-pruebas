// =============================================================
// ESTADO VISUAL DE CONEXIÓN FIREBASE
// =============================================================
// Esta función debe existir antes de cualquier intento de modificar
// el indicador superior. En versiones anteriores quedó omitida y eso
// provocaba un ReferenceError al cargar el script, dejando la conexión
// en un estado aparente de "Conectando...".
function updateCloudBadge(state, text) {
  const badge = document.getElementById('cloud-status-badge');
  const dot = document.getElementById('cloud-dot');
  const label = document.getElementById('cloud-status-text');
  if (!badge || !dot || !label) return;

  const normalized = String(state || '').toLowerCase();
  dot.classList.remove('connecting', 'offline');
  if (normalized === 'connecting') dot.classList.add('connecting');
  if (normalized === 'offline' || normalized === 'error') dot.classList.add('offline');

  label.textContent = String(text || 'Sin conexión');

  if (normalized === 'online') {
    badge.title = 'Firebase conectado · clic para reconectar';
  } else if (normalized === 'connecting') {
    badge.title = 'Conectando con Firebase...';
  } else {
    badge.title = 'Firebase desconectado · clic para reconectar';
  }
}

