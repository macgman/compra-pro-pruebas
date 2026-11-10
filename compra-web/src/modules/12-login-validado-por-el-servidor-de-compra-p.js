// =============================================================
// LOGIN VALIDADO POR EL SERVIDOR DE COMPRA-PRO
// =============================================================
const COMPRA_PRO_AUTH_API = window.COMPRA_PRO_AUTH_API || 'https://compra-pro-security-test.onrender.com';

async function attemptLoginMulti() {
  const userEl = document.getElementById('login-user');
  const passEl = document.getElementById('login-pass');
  if (!userEl || !passEl) return;

  const username = String(userEl.value || '').trim().toLowerCase();
  // No recortar la contraseña: puede contener espacios válidos.
  const password = String(passEl.value || '');
  const roomId = String(cloudRoomId || localStorage.getItem(STORAGE_PREFIX + 'cloud_room') || '').trim();

  if (!username || !password) {
    showToast('Ingrese su usuario y contraseña', 'error');
    return;
  }
  if (typeof fetch !== 'function') {
    showToast('Este navegador no permite conectar con el servicio de acceso.', 'error');
    return;
  }

  let stage = 'server';
  try {
    showToast('Conectando con el servidor de acceso… Si estaba inactivo, puede tardar hasta un minuto.', 'warning');

    // Render puede tardar en despertar después de un periodo de inactividad.
    // Damos tiempo suficiente a cada intento y reintentamos una sola vez
    // únicamente ante errores de red/tiempo de espera; no repetimos credenciales
    // si el servidor ya respondió con un error HTTP.
    let response = null;
    let lastNetworkError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = setTimeout(() => { if (controller) controller.abort(); }, 90000);
      try {
        response = await fetch(COMPRA_PRO_AUTH_API + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, roomId }),
          signal: controller ? controller.signal : undefined,
          cache: 'no-store'
        });
        clearTimeout(timeoutId);
        break;
      } catch (networkError) {
        clearTimeout(timeoutId);
        lastNetworkError = networkError;
        if (attempt >= 2) throw networkError;
        showToast('El servidor está tardando en responder. Reintentando conexión…', 'warning');
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }
    if (!response) throw lastNetworkError || new Error('No hubo respuesta del servidor');

    let result = {};
    try { result = await response.json(); } catch (_) {}

    if (!response.ok || !result.ok || !result.token || !result.user) {
      const message = result.error || (response.status === 401
        ? 'Usuario o contraseña incorrectos.'
        : `El servidor rechazó el acceso (HTTP ${response.status}).`);
      showToast(message, 'error');
      if (response.status === 401) passEl.select();
      return;
    }

    stage = 'firebase-auth';
    if (typeof firebase === 'undefined' || !firebase.auth || !initFirebase()) {
      showToast('El SDK de Firebase Authentication no se cargó. Comprueba tu conexión a Internet.', 'error');
      return;
    }

    const auth = firebase.auth(firebaseApp);
    await auth.signInWithCustomToken(result.token);

    // No confiar únicamente en el JSON de respuesta: comparar con las claims
    // que Firebase firmó y verificó al aceptar el Custom Token.
    const tokenInfo = await auth.currentUser.getIdTokenResult(true);
    const claims = tokenInfo.claims || {};
    const claimedRoom = String(claims.room || '');
    const claimedRole = String(claims.role || '').toLowerCase();
    if (claims.compraPro !== true || claimedRoom !== String(result.user.room || roomId) || claimedRole !== String(result.user.role || '').toLowerCase()) {
      await auth.signOut();
      throw new Error('Las claims de Firebase no coinciden con la cuenta o sala solicitada.');
    }

    if (!cloudRoomId && result.user.room) {
      cloudRoomId = String(result.user.room);
      localStorage.setItem(STORAGE_PREFIX + 'cloud_room', cloudRoomId);
    }

    const role = ['master', 'admin', 'user', 'folio'].includes(result.user.role)
      ? result.user.role : 'user';
    currentUser = {
      id: result.user.id ?? null,
      role,
      name: String(result.user.name || result.user.username || username),
      username: String(result.user.username || username),
      permissions: Array.isArray(result.user.permissions) ? result.user.permissions : undefined
    };
    normalizeUserPermissions(currentUser);

    sessionStorage.setItem(STORAGE_PREFIX + 'session', JSON.stringify(currentUser));
    applyUserRole();
    if (cloudRoomId) { firebaseConnectRoom().catch(() => {}); }
    passEl.value = '';
    userEl.value = '';
    showToast(`Bienvenido/a, ${currentUser.name}`);
  } catch (error) {
    const code = String(error?.code || '');
    console.error('COMPRA-PRO login failure stage=' + stage + ' code=' + code + ' name=' + String(error?.name || 'Error'));
    let message;
    if (stage === 'server') {
      message = 'No se pudo conectar con el servidor de acceso después de dos intentos. Espera un minuto y vuelve a intentarlo; si persiste, revisa el servicio y los registros de Render.';
    } else if (code === 'auth/invalid-custom-token' || code === 'auth/custom-token-mismatch') {
      message = 'El servidor respondió, pero Firebase rechazó el token. El proyecto de Firebase del servidor no coincide o la credencial no es válida.';
    } else if (code === 'auth/operation-not-allowed') {
      message = 'Firebase rechazó el inicio con token personalizado. Hay que revisar la configuración del proyecto.';
    } else if (code === 'auth/network-request-failed') {
      message = 'El servidor validó la solicitud, pero el navegador no pudo terminar la sesión con Firebase. Revisa Internet o abre la aplicación desde una dirección HTTPS.';
    } else {
      message = 'El servidor respondió, pero Firebase no pudo completar la sesión (' + (code || 'error desconocido') + '). Revisa los registros de Render.';
    }
    showToast(message, 'error');
  }
}

function applyUserRole() {
  const role = currentUser?.role || 'user';
  normalizeUserPermissions(currentUser);
  document.body.className = role === 'master' ? 'is-master is-admin' : (role === 'admin' ? 'is-admin' : (role === 'folio' ? 'is-folio' : 'is-user'));
  const roleLabel = role === 'master' ? 'MASTER' : (role === 'admin' ? 'ADMINISTRADOR' : (role === 'folio' ? 'USUARIO + FOLIO' : 'USUARIO'));
  const roleTag = document.getElementById('role-tag');
  if (roleTag) {
    roleTag.textContent = roleLabel;
    roleTag.className = 'role-badge ' + (role === 'master' ? 'role-master' : (role === 'admin' ? 'role-admin' : 'role-user'));
  }
  const display = document.getElementById('user-display');
  if (display) display.textContent = currentUser.name || currentUser.username;
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'none';
  applyGranularPermissions();
  showSection('dashboard');
}

function logout() {
  sessionStorage.removeItem(STORAGE_PREFIX + 'session');
  location.reload();
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = users.map(u => {
    const isCurrent = currentUser && String(currentUser.id) === String(u.id);
    const isActive = u.active !== false;
    return `
      <tr>
        <td><strong>${esc(u.username)}</strong> ${isCurrent ? '<small style="color:#059669;">(T&uacute;)</small>' : ''}</td>
        <td>${esc(u.name)}</td>
        <td><span class="role-badge ${u.role === 'master' ? 'role-master' : (u.role === 'admin' ? 'role-admin' : 'role-user')}">${u.role === 'master' ? 'MASTER' : (u.role === 'admin' ? 'ADMINISTRADOR' : (u.role === 'folio' ? 'USUARIO + FOLIO' : 'USUARIO'))}</span></td>
        <td><span class="badge ${isActive ? 'badge-ok' : 'badge-critical'}">${isActive ? 'ACTIVO' : 'INACTIVO'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="openUserModal(${u.id})" title="Editar datos o clave" ${(u.role === 'master' && !isMasterUser()) || (u.role === 'admin' && !isMasterUser()) ? 'disabled' : ''}><i class="fas fa-edit"></i></button>
            <button class="btn ${isActive ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleUserActive(${u.id})" title="${isActive ? 'Desactivar' : 'Activar'}" ${(u.role === 'master' && !isMasterUser()) ? 'disabled' : ''}><i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteUserAccount(${u.id})" title="Eliminar cuenta" ${(isCurrent || (u.role === 'master' && !isMasterUser()) || (u.role === 'admin' && !isMasterUser())) ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openUserModal(id = null) {
  if (!requirePermission('users.manage')) return;
  const u = id ? users.find(x => Number(x.id) === Number(id)) : null;
  document.getElementById('user-id').value = u ? u.id : '';
  document.getElementById('user-fullname').value = u ? u.name : '';
  document.getElementById('user-username').value = u ? u.username : '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-role').value = u && u.role !== 'master' ? u.role : 'user';
  const roleSelect = document.getElementById('user-role');
  if (roleSelect) {
    const adminOption = roleSelect.querySelector('option[value="admin"]');
    if (adminOption) adminOption.disabled = !isMasterUser();
  }
  renderPermissionEditor(u?.permissions || defaultPermissionsForRole(u?.role || 'user'));
  document.getElementById('modal-user-title').innerHTML = u ? '<i class="fas fa-user-edit" style="color:var(--primary); margin-right:8px;"></i>Editar Usuario' : '<i class="fas fa-user-plus" style="color:var(--primary); margin-right:8px;"></i>Nuevo Usuario';
  openModal('modal-user');
}

async function saveUserData() {
  if (!requirePermission('users.manage')) return;
  const id = document.getElementById('user-id').value;
  const name = fixTextForExcel(document.getElementById('user-fullname').value);
  const username = document.getElementById('user-username').value.trim().toLowerCase();
  const pass = document.getElementById('user-password').value.trim();
  const role = document.getElementById('user-role').value;
  if (role === 'admin' && !isMasterUser()) { showToast('Solo MASTER puede crear o asignar administradores.', 'error'); return; }
  const permissions = readPermissionEditor().filter(permission => permission !== 'system.reset');

  if (!name || !username) {
    showToast('Complete el nombre y el usuario', 'error');
    return;
  }
  if (!id && (!pass || pass.length < 4)) {
    showToast('La contraseña debe tener al menos 4 caracteres', 'error');
    return;
  }
  if (pass && pass.length < 4) {
    showToast('La nueva contraseña debe tener al menos 4 caracteres', 'error');
    return;
  }

  const dup = users.find(u => String(u.username).toLowerCase() === username && String(u.id) !== String(id));
  if (dup) {
    showToast('Ese nombre de usuario ya está registrado', 'error');
    return;
  }

  const now = Date.now();

  if (id) {
    const existingTarget = users.find(u => String(u.id) === String(id));
    if (existingTarget?.role === 'master' && !isMasterUser()) { showToast('La cuenta MASTER está protegida.', 'error'); return; }
    if (existingTarget?.role === 'admin' && !isMasterUser()) { showToast('Solo MASTER puede modificar administradores.', 'error'); return; }
    const idx = users.findIndex(u => String(u.id) === String(id));
    if (idx >= 0) {
      users[idx].name = name;
      users[idx].username = username;
      if (users[idx].role === 'master' && !isMasterUser()) {
        showToast('Solo MASTER puede modificar la cuenta MASTER.', 'error'); return;
      }
      users[idx].role = role;
      users[idx].permissions = role === 'master' ? [] : permissions;
      users[idx].updatedAt = now;
      if (pass) users[idx].passHash = await hashSHA256(pass);
    }
  } else {
    users.push({
      id: now,
      name,
      username,
      passHash: await hashSHA256(pass),
      role,
      permissions: role === 'master' ? [] : permissions,
      active: true,
      updatedAt: now
    });
  }

  if (currentUser && String(currentUser.id) === String(id)) {
    currentUser.role = role;
    currentUser.permissions = permissions;
    sessionStorage.setItem(STORAGE_PREFIX + 'session', JSON.stringify(currentUser));
    applyUserRole();
  }
  await broadcastFullSync();
  renderUsersTable();
  closeModal('modal-user');
  showToast('Usuario guardado con contraseña cifrada');
}

async function toggleUserActive(id) {
  if (!requirePermission('users.manage')) return;
  const u = users.find(x => Number(x.id) === Number(id));
  if (!u) return;
  if (u.role === 'master' && !isMasterUser()) { showToast('La cuenta MASTER está protegida.', 'error'); return; }
  if (currentUser && Number(currentUser.id) === Number(u.id)) {
    showToast('No puedes desactivar tu propia sesión activa', 'error');
    return;
  }
  u.active = !(u.active !== false);
  u.updatedAt = Date.now();
  await broadcastFullSync();
  renderUsersTable();
  showToast(`Usuario ${u.active ? 'activado' : 'desactivado'}`);
}

async function deleteUserAccount(id) {
  if (!requirePermission('users.manage')) return;
  const protectedTarget = users.find(u => Number(u.id) === Number(id));
  if (protectedTarget?.role === 'master' && !isMasterUser()) { showToast('La cuenta MASTER está protegida.', 'error'); return; }
  if (protectedTarget?.role === 'admin' && !isMasterUser()) { showToast('Solo MASTER puede eliminar administradores.', 'error'); return; }
  if (currentUser && Number(currentUser.id) === Number(id)) {
    showToast('No puedes eliminar la cuenta en la que estás conectado', 'error');
    return;
  }
  const adminsCount = users.filter(u => u.role === 'admin' && u.active !== false).length;
  const target = users.find(u => Number(u.id) === Number(id));
  if (target && target.role === 'admin' && adminsCount <= 1) {
    showToast('No puedes eliminar al único Administrador del sistema', 'error');
    return;
  }

  if (confirm(`¿Eliminar permanentemente la cuenta de "${target?.name}"?`)) {
    users = users.filter(u => Number(u.id) !== Number(id));
    markDeleted(deletedUsers, target ? target.id : id);
    await broadcastFullSync();
    renderUsersTable();
    showToast('Usuario eliminado', 'error');
  }
}

