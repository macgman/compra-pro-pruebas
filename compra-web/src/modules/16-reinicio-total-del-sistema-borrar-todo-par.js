// =============================================================
// REINICIO TOTAL DEL SISTEMA (BORRAR TODO PARA OTRO PROYECTO)
// =============================================================
function openResetSystemModal() {
  if (!isMasterUser()) { showToast('Solo MASTER puede reiniciar el sistema.', 'error'); return; }
  const input = document.getElementById('reset-system-password');
  input.value = '';
  openModal('modal-reset-system');
  setTimeout(() => input.focus(), 50);
}

function closeResetSystemModal() {
  document.getElementById('reset-system-password').value = '';
  closeModal('modal-reset-system');
}

async function confirmResetSystem() {
  if (!isMasterUser()) { showToast('Solo MASTER puede reiniciar el sistema.', 'error'); return; }
  const pass = document.getElementById('reset-system-password').value.trim();
  if (!pass) {
    showToast('Ingrese la contraseña de administrador o la clave maestra', 'error');
    return;
  }

  let authorized = false;

  if (!authorized) {
    const pHash = await hashSHA256(pass);
    authorized = users.some(u => u.role === 'admin' && u.passHash === pHash);
  }

  if (!authorized) {
    showToast('Contraseña incorrecta. No se autorizó el borrado', 'error');
    document.getElementById('reset-system-password').select();
    return;
  }

  closeResetSystemModal();

  const finalCheck = confirm('Última confirmación: se borrarán TODOS los productos, compras, movimientos y usuarios de este sistema, de forma permanente. ¿Desea continuar?');
  if (!finalCheck) {
    showToast('Reinicio cancelado. No se borró ningún dato');
    return;
  }

  await performFullReset();
}

async function performFullReset() {
  showToast('Borrando todos los datos...', 'warning');

  // Guardamos la sala actual antes de limpiar cloudRoomId. El borrado debe
  // afectar únicamente a la sala activa, nunca a la raíz completa de Firebase.
  const roomToReset = cloudRoomId;

  // Se cierra la conexión de red activa para no arrastrar datos viejos
  // ni reenviar el borrado a otros equipos que sigan usando el proyecto anterior.
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (peer) { try { peer.destroy(); } catch (e) {} }

  const freshUsers = DEFAULT_USERS.map(u => ({...u}));
  const defaultRoom = '';

  await idbClearAndPutAll('products', []);
  await idbClearAndPutAll('ventas', []);
  await idbClearAndPutAll('movimientos', []);
  await idbClearAndPutAll('users', freshUsers);
  await idbSetMeta('valesManuales', []);
  await idbSetMeta('valesInventario', []);
  await idbSetMeta('folio', 'F-001');
  await idbSetMeta('folio_manual_override', false);
  folioManualOverrideActive = false;
  await idbSetMeta('cloud_room', defaultRoom);
  await idbSetMeta('deletedProducts', []);
  await idbSetMeta('deletedVentas', []);
  await idbSetMeta('deletedValesManuales', []);
  await idbSetMeta('deletedMovimientos', []);
  await idbSetMeta('deletedUsers', []);

  // También limpiar únicamente la sala compartida de Firebase que estaba
  // activa, para que los datos anteriores no vuelvan a descargarse después
  // del reinicio y no se afecten otras salas.
  try {
    if (roomToReset && initFirebase()) {
      const cleanRoom = String(roomToReset)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      if (cleanRoom) {
        const resetRef = firebaseDB.ref('compraPro/rooms/' + cleanRoom);
        await resetRef.remove();
      }
    }
  } catch (e) {
    console.warn('No se pudo limpiar la sala Firebase durante el reinicio:', e);
  }

  localStorage.removeItem(STORAGE_PREFIX + 'cloud_room');
  localStorage.removeItem(STORAGE_PREFIX + 'folio_updated_at');
  sessionStorage.removeItem(STORAGE_PREFIX + 'session');

  location.reload();
}

