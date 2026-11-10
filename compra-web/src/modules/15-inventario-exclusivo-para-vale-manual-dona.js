// =============================================================
// INVENTARIO EXCLUSIVO PARA VALE MANUAL / DONACION
// =============================================================
function canManageValeInventory() {
  return userHasPermission('vouchers.manage');
}

let editingValeInventoryId = null;

function normalizeValeInventoryItem(raw = {}) {
  return {
    id: raw.id ?? (Date.now() + Math.random()),
    clave: fixTextForExcel(raw.clave || '').trim(),
    descripcion: fixTextForExcel(raw.descripcion || '').trim(),
    unidad: fixTextForExcel(raw.unidad || 'PIEZA').trim().toUpperCase() || 'PIEZA',
    precio: Math.max(0, Number(raw.precio) || 0),
    existencia: Math.max(0, Number(raw.existencia) || 0),
    updatedAt: Number(raw.updatedAt) || Date.now()
  };
}

function openValeInventoryMaterialForm(itemId = null) {
  if (!canManageValeInventory()) {
    showToast('No tienes permiso para gestionar el Inventario Vale / Donación', 'error');
    return;
  }
  editingValeInventoryId = itemId;
  const item = itemId == null ? null : valesInventario.find(x => String(x.id) === String(itemId));
  document.getElementById('vale-inventory-form').style.display = '';
  document.getElementById('vi-clave').value = item?.clave || '';
  document.getElementById('vi-descripcion').value = item?.descripcion || '';
  document.getElementById('vi-unidad').value = item?.unidad || 'PIEZA';
  document.getElementById('vi-precio').value = Number(item?.precio || 0);
  const stockInput = document.getElementById('vi-existencia');
  stockInput.value = Number(item?.existencia || 0);
  stockInput.readOnly = false;
  stockInput.title = item ? 'Puede modificar directamente la existencia. Las salidas también se generan al guardar un Vale Manual.' : 'Existencia inicial del material';
  const oldNote = document.getElementById('vi-stock-note');
  if (oldNote) oldNote.remove();
  if (item) {
    const note = document.createElement('div');
    note.id = 'vi-stock-note';
    note.className = 'stock-readonly-note';
    note.innerHTML = '<i class="fas fa-circle-info"></i> Puede modificar la <strong>Existencia</strong> directamente aquí. Para aumentar mediante un movimiento use <strong>Dar entrada</strong>.';
    stockInput.parentElement.appendChild(note);
  }
  document.getElementById('vi-descripcion').focus();
}

function closeValeInventoryMaterialForm() {
  editingValeInventoryId = null;
  const form = document.getElementById('vale-inventory-form');
  if (form) form.style.display = 'none';
}

async function saveValeInventoryMaterial() {
  if (!canManageValeInventory()) { showToast('No tienes permiso para gestionar el Inventario Vale / Donación', 'error'); return; }
  const existingItem = editingValeInventoryId == null ? null : valesInventario.find(x => String(x.id) === String(editingValeInventoryId));
  const item = normalizeValeInventoryItem({
    id: editingValeInventoryId ?? (Date.now() + Math.random()),
    clave: document.getElementById('vi-clave')?.value,
    descripcion: document.getElementById('vi-descripcion')?.value,
    unidad: document.getElementById('vi-unidad')?.value,
    precio: document.getElementById('vi-precio')?.value,
    existencia: document.getElementById('vi-existencia')?.value
  });
  if (!item.descripcion) { showToast('Ingrese la descripción del material', 'error'); return; }
  const duplicate = valesInventario.find(x => normalizeSearchText(x.clave) === normalizeSearchText(item.clave) && item.clave && String(x.id) !== String(item.id));
  if (duplicate) { showToast(`La clave ${item.clave} ya existe en el inventario de Vale/Donación`, 'error'); return; }
  if (editingValeInventoryId == null) valesInventario.unshift(item);
  else {
    const idx = valesInventario.findIndex(x => String(x.id) === String(editingValeInventoryId));
    if (idx >= 0) valesInventario[idx] = item;
    else valesInventario.unshift(item);
  }
  await idbSetMeta('valesInventario', valesInventario);
  closeValeInventoryMaterialForm();
  await broadcastFullSync(false, true);
  renderValeInventario();
  showToast('Material guardado en Inventario Vale / Donación');
}

function renderValeInventario() {
  const tbody = document.getElementById('vale-inventory-tbody');
  if (!tbody) return;
  const q = normalizeSearchText(document.getElementById('vi-search')?.value || '');
  const sort = document.getElementById('vi-sort')?.value || 'nombre-az';
  let rows = (Array.isArray(valesInventario) ? valesInventario : []).filter(i => !q || normalizeSearchText(i.clave).includes(q) || normalizeSearchText(i.descripcion).includes(q));
  rows.sort((a,b) => {
    if (sort === 'nombre-za') return String(b.descripcion).localeCompare(String(a.descripcion), 'es', {numeric:true, sensitivity:'base'});
    if (sort === 'clave-az') return String(a.clave).localeCompare(String(b.clave), 'es', {numeric:true, sensitivity:'base'});
    if (sort === 'existencia-desc') return (Number(b.existencia)||0) - (Number(a.existencia)||0);
    return String(a.descripcion).localeCompare(String(b.descripcion), 'es', {numeric:true, sensitivity:'base'});
  });
  tbody.innerHTML = rows.length ? rows.map(i => `<tr>
    <td><span class="clave-cell">${esc(i.clave || '—')}</span></td>
    <td>${esc(i.descripcion)}</td><td>${esc(i.unidad || 'PIEZA')}</td>
    <td>$${fmt(i.precio)}</td><td>${Number(i.existencia)||0}</td>
    <td>
      <div style="display:flex; gap:7px; flex-wrap:wrap;">
        <button type="button" class="btn btn-entry btn-sm" data-permission="vouchers.manage" data-vale-entry-id="${esc(i.id)}" onclick="openValeInventoryEntryModal(${JSON.stringify(i.id)})"><i class="fas fa-arrow-down"></i> Dar entrada</button>
        <button type="button" class="btn btn-outline btn-sm" data-permission="vouchers.manage" data-vale-manage-id="${esc(i.id)}" onclick="openValeInventoryMaterialForm(${JSON.stringify(i.id)})"><i class="fas fa-pen"></i> Modificar</button>
        <button type="button" class="btn btn-danger btn-sm" data-permission="vouchers.manage" data-vale-delete-id="${esc(i.id)}"><i class="fas fa-trash"></i> Eliminar</button>
      </div>
    </td>
  </tr>`).join('') : '<tr><td colspan="6" style="text-align:center; padding:28px; color:#94a3b8; font-weight:700;">No hay materiales en este inventario.</td></tr>';
  applyGranularPermissions();
}

document.addEventListener('click', function(e) {
  const deleteBtn = e.target.closest('[data-vale-delete-id]');
  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    deleteValeInventoryMaterial(deleteBtn.getAttribute('data-vale-delete-id'));
    return;
  }
  const entryBtn = e.target.closest('[data-vale-entry-id]');
  if (entryBtn) { e.preventDefault(); openValeInventoryEntryModal(entryBtn.getAttribute('data-vale-entry-id')); return; }
  const manageBtn = e.target.closest('[data-vale-manage-id]');
  if (manageBtn) { e.preventDefault(); openValeInventoryMaterialForm(manageBtn.getAttribute('data-vale-manage-id')); }
});

function openValeInventoryEntryModal(id) {
  if (!canManageValeInventory()) {
    showToast('No tienes permiso para registrar entradas de material', 'error');
    return;
  }
  const item = valesInventario.find(x => String(x.id) === String(id));
  if (!item) { showToast('Material no encontrado', 'error'); return; }

  document.getElementById('vale-entrada-inv-id').value = item.id;
  document.getElementById('vale-entrada-inv-clave').textContent = item.clave || 'N/A';
  document.getElementById('vale-entrada-inv-descripcion').value = item.descripcion || '';
  document.getElementById('vale-entrada-inv-actual').textContent = Number(item.existencia) || 0;
  document.getElementById('vale-entrada-inv-resultante').textContent = Number(item.existencia) || 0;
  document.getElementById('vale-entrada-inv-cantidad').value = '';
  document.getElementById('vale-entrada-inv-referencia').value = '';
  document.getElementById('vale-entrada-inv-fecha').value = todayISO();
  document.getElementById('vale-entrada-inv-precio').value = Number(item.precio) || 0;
  document.getElementById('vale-entrada-inv-nota').value = 'Entrada de material / donación';
  openModal('modal-entrada-vale-inventario');
  setTimeout(() => document.getElementById('vale-entrada-inv-cantidad')?.focus(), 50);
}

function updateValeInventoryEntryPreview() {
  const id = document.getElementById('vale-entrada-inv-id')?.value;
  const item = valesInventario.find(x => String(x.id) === String(id));
  if (!item) return;
  const actual = Number(item.existencia) || 0;
  const entrada = Number(document.getElementById('vale-entrada-inv-cantidad')?.value) || 0;
  document.getElementById('vale-entrada-inv-actual').textContent = actual;
  document.getElementById('vale-entrada-inv-resultante').textContent = actual + Math.max(entrada, 0);
}

async function saveValeInventoryEntry() {
  if (!canManageValeInventory()) {
    showToast('No tienes permiso para registrar entradas de material', 'error');
    return;
  }
  const id = document.getElementById('vale-entrada-inv-id')?.value;
  const item = valesInventario.find(x => String(x.id) === String(id));
  if (!item) { showToast('Material no encontrado', 'error'); return; }

  const qty = Number(document.getElementById('vale-entrada-inv-cantidad')?.value);
  const referencia = fixTextForExcel(document.getElementById('vale-entrada-inv-referencia')?.value || '');
  const fecha = document.getElementById('vale-entrada-inv-fecha')?.value || todayISO();
  const priceRaw = document.getElementById('vale-entrada-inv-precio')?.value;
  const precio = priceRaw === '' ? Number(item.precio) || 0 : Number(priceRaw);
  const nota = fixTextForExcel(document.getElementById('vale-entrada-inv-nota')?.value || '') || 'Entrada de material / donación';

  if (!Number.isFinite(qty) || qty <= 0) {
    showToast('Ingrese una cantidad de entrada mayor que cero', 'error');
    return;
  }
  if (!Number.isFinite(precio) || precio < 0) {
    showToast('El precio debe ser un numero valido y no negativo', 'error');
    return;
  }

  item.existencia = (Number(item.existencia) || 0) + qty;
  item.precio = precio;
  item.updatedAt = Date.now();
  item.ultima_entrada = { cantidad: qty, referencia, fecha, nota, usuario: currentUser?.username || currentUser?.name || '' };

  await idbSetMeta('valesInventario', valesInventario);
  closeModal('modal-entrada-vale-inventario');
  await broadcastFullSync(false, true);
  renderValeInventario();
  showToast(`Entrada registrada: +${qty} ${item.unidad || 'unidad(es)'}`);
}

async function deleteValeInventoryMaterial(id) {
  if (!canManageValeInventory()) {
    showToast('No tienes permiso para eliminar materiales del Inventario Vale / Donación', 'error');
    return;
  }

  const item = valesInventario.find(x => String(x.id) === String(id));
  if (!item) {
    showToast('Material no encontrado. Actualice el inventario y vuelva a intentarlo.', 'error');
    return;
  }

  // Detectar referencias en vales históricos. Si se elimina el material,
  // conservamos los datos impresos del vale, pero quitamos la relación con
  // el inventario para que el vale histórico pueda seguir consultándose,
  // modificándose o eliminándose sin bloquearse por un material inexistente.
  const matchesDeletedItem = (line) => {
    if (String(line?.inventarioId ?? '') === String(id)) return true;
    // Compatibilidad con vales antiguos que marcaban el renglón como ligado
    // al inventario, pero no guardaban inventarioId: solo usar la clave en ese caso.
    return line?.inventarioId == null && line?.afectaInventario === true && !!item.clave &&
      normalizeSearchText(line?.clave || '') === normalizeSearchText(item.clave);
  };
  const linkedVales = (Array.isArray(valesManuales) ? valesManuales : []).filter(v =>
    (v.items || []).some(matchesDeletedItem)
  );

  const warning = linkedVales.length
    ? `\n\nEstá relacionado con ${linkedVales.length} Vale(s) Manual(es). Se conservarán esos vales en el historial, pero sus renglones de este material dejarán de modificar existencias del inventario.`
    : '';
  if (!confirm(`¿Eliminar "${item.descripcion}" del Inventario Vale / Donación?${warning}`)) return;

  try {
    if (linkedVales.length) {
      const linkedValeIds = new Set(linkedVales.map(v => String(v.id)));
      valesManuales = valesManuales.map(v => {
        if (!linkedValeIds.has(String(v.id))) return v;
        const updatedItems = (v.items || []).map(line => {
          if (!matchesDeletedItem(line)) return line;
          return { ...line, inventarioId: null, afectaInventario: false };
        });
        return {
          ...v,
          items: updatedItems,
          inventarioAfectado: updatedItems.some(line => line.inventarioId != null && line.afectaInventario === true),
          updatedAt: Date.now()
        };
      });
      await idbSetMeta('valesManuales', valesManuales);
    }

    valesInventario = valesInventario.filter(x => String(x.id) !== String(id));
    await idbSetMeta('valesInventario', valesInventario);
    // Persistir localmente antes de sincronizar para que un fallo de red no
    // revierta visualmente la eliminación en este equipo.
    await saveLocalData();
    renderValeInventario();
    renderHistorialVentas();

    try {
      await broadcastFullSync(false, true);
      showToast(`Material "${item.descripcion}" eliminado del Inventario Vale / Donación`, 'warning');
    } catch (syncError) {
      console.error('Error sincronizando eliminación de material de Vale/Donación:', syncError);
      showToast('Material eliminado localmente, pero no se pudo sincronizar con Firebase. Revise la conexión.', 'warning');
    }
  } catch (error) {
    console.error('Error eliminando material de Vale/Donación:', error);
    showToast('No se pudo guardar la eliminación del material. Revise el almacenamiento y vuelva a intentarlo.', 'error');
  }
}

function searchValeInventory() {
  const input = document.getElementById('vale-search-inventory');
  const list = document.getElementById('vale-inventory-ac-list');
  const q = normalizeSearchText(input?.value || '');
  if (!list) return;
  if (q.length < 2) { list.style.display = 'none'; list.innerHTML = ''; return; }
  const results = (Array.isArray(valesInventario) ? valesInventario : []).filter(i => normalizeSearchText(i.clave).includes(q) || normalizeSearchText(i.descripcion).includes(q)).slice(0, 20);
  if (!results.length) {
    list.innerHTML = '<div class="ac-item" style="cursor:default; color:#64748b;">Sin resultados en Inventario Vale / Donación.</div>';
  } else {
    list.innerHTML = results.map(i => {
      const stock = Math.max(0, Number(i.existencia) || 0);
      if (stock <= 0) {
        return `<div class="ac-item" style="cursor:not-allowed; opacity:.62;" title="Material agotado">
          <strong>${esc(i.descripcion)}</strong><br><small>${esc(i.clave || 'SIN CLAVE')} | ${esc(i.unidad || 'PIEZA')} | $${fmt(i.precio)} | <strong style="color:#dc2626;">AGOTADO (0)</strong></small>
        </div>`;
      }
      return `<div class="ac-item" data-vale-inventory-select-id="${esc(i.id)}" role="button" tabindex="0">
        <strong>${esc(i.descripcion)}</strong><br><small>${esc(i.clave || 'SIN CLAVE')} | ${esc(i.unidad || 'PIEZA')} | $${fmt(i.precio)} | Existencia: ${stock}</small>
      </div>`;
    }).join('');
  }
  list.style.display = 'block';
}

// Seleccion del material del Inventario Vale/Donacion mediante delegacion de eventos.
// Esto evita depender de onclick inline y asegura que el clic llegue a la funcion aunque
// el contenido de la lista se haya regenerado por una nueva busqueda.
document.addEventListener('click', function(e) {
  const option = e.target.closest('[data-vale-inventory-select-id]');
  if (!option) return;
  const list = document.getElementById('vale-inventory-ac-list');
  if (!list || !list.contains(option)) return;
  e.preventDefault();
  e.stopPropagation();
  const id = option.getAttribute('data-vale-inventory-select-id');
  addValeInventoryItemToDraft(id);
});

document.addEventListener('keydown', function(e) {
  const option = e.target.closest('[data-vale-inventory-select-id]');
  if (!option || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  e.stopPropagation();
  addValeInventoryItemToDraft(option.getAttribute('data-vale-inventory-select-id'));
});

function addValeInventoryItemToDraft(id) {
  const item = valesInventario.find(x => String(x.id) === String(id));
  if (!item) {
    showToast('El material ya no existe en Inventario Vale / Donación.', 'error');
    return false;
  }

  const stock = Math.max(0, Number(item.existencia) || 0);
  if (stock <= 0) {
    showToast(`El material "${item.descripcion || item.clave || 'sin descripción'}" está agotado. No se puede agregar al Vale Manual.`, 'error');
    searchValeInventory();
    return false;
  }

  const items = getValeDraftItems();
  const blankIdx = items.findIndex(i => !String(i.descripcion || '').trim());
  const target = blankIdx >= 0 ? items[blankIdx] : createBlankValeManualItem();
  if (blankIdx < 0) items.push(target);
  target.inventarioId = item.id;
  target.afectaInventario = true;
  target.clave = item.clave || '';
  target.descripcion = item.descripcion || '';
  target.unidad = item.unidad || 'PIEZA';
  target.precio = Number(item.precio) || 0;
  target.cantidad = Number(target.cantidad) > 0 ? Math.min(Number(target.cantidad), stock) : 1;
  target.cantidad = Math.max(1, target.cantidad);
  window._valeDraftItems = items;
  document.getElementById('vale-search-inventory').value = '';
  document.getElementById('vale-inventory-ac-list').style.display = 'none';
  renderValeManualItems();
}

async function importValeInventoryExcel(input) {
  if (!canManageValeInventory()) { if (input) input.value = ''; showToast('No tienes permiso para importar este inventario', 'error'); return; }
  const file = input?.files?.[0];
  if (!file) return;

  if (typeof ExcelJS === 'undefined') {
    showToast('La importación de Excel no está disponible porque la librería ExcelJS no está cargada.', 'error');
    input.value = '';
    return;
  }

  try {
    showToast('Leyendo archivo Excel del Inventario Vale / Donación...', 'success');
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('El archivo no contiene hojas legibles');

    // Se buscan los encabezados por nombre para que el Excel no tenga que seguir
    // una posición de columnas rígida. Ejemplo: Clave | Descripción | Unidad | Precio | Existencia.
    const headerRow = worksheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const txt = normalizeSearchText(cell.value);
      if (txt.includes('clave') || txt.includes('codigo') || txt.includes('sku')) colMap.clave = colNumber;
      else if (txt.includes('descrip') || txt.includes('nombre') || txt.includes('articulo') || txt.includes('material')) colMap.descripcion = colNumber;
      else if (txt.includes('unidad') || txt.includes('medida')) colMap.unidad = colNumber;
      else if (txt.includes('precio') || txt.includes('costo') || txt.includes('importe')) colMap.precio = colNumber;
      else if (txt.includes('exist') || txt.includes('stock') || txt.includes('cantidad') || txt.includes('cant')) colMap.existencia = colNumber;
    });

    if (!colMap.descripcion && !colMap.clave) {
      throw new Error('No se detectaron columnas de "Clave" o "Descripción" en la fila 1');
    }

    let added = 0, updated = 0, ignored = 0;
    const now = Date.now();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const clave = fixTextForExcel(colMap.clave ? row.getCell(colMap.clave).value : '');
      const descripcion = fixTextForExcel(colMap.descripcion ? row.getCell(colMap.descripcion).value : '');
      if (!clave && !descripcion) { ignored++; continue; }

      const unidad = fixTextForExcel(colMap.unidad ? row.getCell(colMap.unidad).value : 'PIEZA').trim().toUpperCase() || 'PIEZA';
      const precio = Math.max(0, Number(colMap.precio ? row.getCell(colMap.precio).value : 0) || 0);
      const existencia = Math.max(0, Number(colMap.existencia ? row.getCell(colMap.existencia).value : 0) || 0);

      const existingIndex = valesInventario.findIndex(i =>
        (clave && String(i.clave || '').toLowerCase() === clave.toLowerCase()) ||
        (descripcion && normalizeSearchText(i.descripcion) === normalizeSearchText(descripcion))
      );

      if (existingIndex >= 0) {
        const current = valesInventario[existingIndex];
        valesInventario[existingIndex] = {
          ...current,
          clave: clave || current.clave || '',
          descripcion: descripcion || current.descripcion || '',
          unidad,
          precio,
          existencia,
          updatedAt: now + r
        };
        updated++;
      } else {
        valesInventario.push(normalizeValeInventoryItem({
          id: `VI-${now}-${r}-${Math.random().toString(36).slice(2, 7)}`,
          clave: clave || `DON-${String(valesInventario.length + 1).padStart(3, '0')}`,
          descripcion: descripcion || 'Material sin nombre',
          unidad,
          precio,
          existencia,
          updatedAt: now + r
        }));
        added++;
      }
    }

    await idbSetMeta('valesInventario', valesInventario);
    await broadcastFullSync(false, true);
    renderValeInventario();
    input.value = '';
    showToast(`Excel cargado: ${added} nuevos, ${updated} actualizados${ignored ? `, ${ignored} filas vacías` : ''}`);
  } catch (err) {
    showToast(`Error al cargar Excel: ${err.message}`, 'error');
    input.value = '';
  }
}

async function exportValeInventoryExcel() {
  if (!requirePermission('reports.export')) return;
  const items = Array.isArray(valesInventario) ? valesInventario : [];

  if (typeof ExcelJS === 'undefined') {
    showToast('La exportación de Excel no está disponible porque la librería ExcelJS no está cargada.', 'error');
    return;
  }

  if (!items.length) {
    showToast('No hay materiales para exportar en el Inventario Vale / Donación.', 'warning');
    return;
  }

  try {
    const rows = items.map(item => {
      const existencia = Math.max(0, Number(item.existencia) || 0);
      const precio = Math.max(0, Number(item.precio) || 0);
      return [
        fixTextForExcel(item.clave || ''),
        fixTextForExcel(item.descripcion || ''),
        fixTextForExcel(item.unidad || 'PIEZA'),
        precio,
        existencia,
        existencia > 0 ? 'DISPONIBLE' : 'AGOTADO'
      ];
    });

    const sheets = [{
      name: 'Inventario Vale',
      headers: ['Clave', 'Descripción', 'Unidad', 'Precio', 'Existencia', 'Estado'],
      widths: [22, 65, 18, 16, 14, 18],
      rows
    }];

    await downloadStyledWorkbook(
      sheets,
      `inventario_vale_donacion_${todayISO()}.xlsx`
    );

    showToast(`Inventario Vale / Donación exportado: ${items.length} material(es)`);
  } catch (err) {
    console.error('Error al exportar Inventario Vale / Donación a Excel:', err);
    showToast('No fue posible exportar el Inventario Vale / Donación a Excel.', 'error');
  }
}

function exportValeInventoryJSON() {
  if (!requirePermission('reports.export')) return;
  const data = { system: 'VALE_MANUAL_DONACION_INVENTARIO', version: 1, timestamp: new Date().toISOString(), valesInventario: Array.isArray(valesInventario) ? valesInventario : [] };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `inventario_vale_donacion_${todayISO()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function importValeInventoryJSON(input) {
  if (!canManageValeInventory()) { if (input) input.value = ''; showToast('No tienes permiso para importar este inventario', 'error'); return; }
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.valesInventario)) throw new Error('Formato inválido');
      const incoming = data.valesInventario.map(normalizeValeInventoryItem).filter(i => i.descripcion);
      const map = new Map(valesInventario.map(i => [String(i.id), i]));
      incoming.forEach(i => map.set(String(i.id), i));
      valesInventario = Array.from(map.values());
      await idbSetMeta('valesInventario', valesInventario);
      await broadcastFullSync(false, true);
      renderValeInventario();
      showToast(`Inventario Vale/Donación importado: ${incoming.length} material(es)`);
    } catch (err) { showToast('El JSON no corresponde al Inventario Vale / Donación', 'error'); }
    input.value = '';
  };
  reader.readAsText(file);
}

function renderValeManualItems() {
  const list = document.getElementById('vale-items-list');
  if (!list) return;
  const items = getValeDraftItems();
  if (!items.length) {
    list.innerHTML = '<div class="venta-empty" style="min-height:120px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-box-open" style="font-size:1.5rem; margin-right:8px; color:#2563eb;"></i>Sin materiales capturados</div>';
  } else {
    list.innerHTML = `
      <div class="vale-items-head">
        <div>Clave</div><div>Descripción / Material</div><div>Unidad</div><div>Cantidad</div><div>Precio unit.</div><div>Importe</div><div></div>
      </div>` + items.map((i, idx) => `
      <div class="vale-item-row">
        <input value="${esc(i.clave)}" placeholder="Clave" onchange="updateValeManualItem(${idx}, 'clave', this.value)">
        <input value="${esc(i.descripcion)}" placeholder="Ej. Guantes, jeringas..." onchange="updateValeManualItem(${idx}, 'descripcion', this.value)">
        <input value="${esc(i.unidad || 'PIEZA')}" placeholder="PIEZA" onchange="updateValeManualItem(${idx}, 'unidad', this.value)">
        <input type="number" min="1" step="1" value="${Number(i.cantidad) || 1}" onchange="updateValeManualItem(${idx}, 'cantidad', this.value)">
        <input type="number" min="0" step="0.01" value="${Number(i.precio) || 0}" onchange="updateValeManualItem(${idx}, 'precio', this.value)" onkeydown="handleValeItemTab(event, ${idx})">
        <strong class="vale-item-amount" style="text-align:right; white-space:nowrap;">$${fmt((Number(i.cantidad)||0)*(Number(i.precio)||0))}</strong>
        <button class="btn btn-danger btn-sm" type="button" tabindex="-1" onclick="removeValeManualItem(${idx})" title="Eliminar material"><i class="fas fa-trash"></i></button>
      </div>`).join('');
  }
  const total = items.reduce((sum, i) => sum + (Number(i.cantidad)||0) * (Number(i.precio)||0), 0);
  const piezas = items.reduce((sum, i) => sum + (Number(i.cantidad)||0), 0);
  const totalEl = document.getElementById('vale-manual-total');
  const countEl = document.getElementById('vale-manual-count');
  if (totalEl) totalEl.textContent = '$' + fmt(total);
  if (countEl) countEl.textContent = `${items.length} material(es) | ${piezas} pieza(s)`;
}

function updateValeManualTotals() {
  const items = getValeDraftItems();
  const total = items.reduce((sum, i) => sum + (Number(i.cantidad) || 0) * (Number(i.precio) || 0), 0);
  const piezas = items.reduce((sum, i) => sum + (Number(i.cantidad) || 0), 0);
  const totalEl = document.getElementById('vale-manual-total');
  const countEl = document.getElementById('vale-manual-count');
  if (totalEl) totalEl.textContent = '$' + fmt(total);
  if (countEl) countEl.textContent = `${items.length} material(es) | ${piezas} pieza(s)`;

  // Actualiza únicamente el importe de la fila modificada sin reconstruir
  // el formulario. Así el elemento que tiene el foco no se reemplaza y la
  // navegación con TAB/clic conserva el cursor correctamente.
  items.forEach((item, idx) => {
    const row = document.querySelectorAll('#vale-items-list .vale-item-row')[idx];
    const amount = row?.querySelector('.vale-item-amount');
    if (amount) amount.textContent = '$' + fmt((Number(item.cantidad) || 0) * (Number(item.precio) || 0));
  });
}

function updateValeManualItem(idx, field, value) {
  const items = getValeDraftItems();
  const item = items[idx];
  if (!item) return;
  if (field === 'cantidad') {
    let qty = Math.max(0.01, Number(value) || 0.01);
    if (item.inventarioId != null) {
      const inv = valesInventario.find(x => String(x.id) === String(item.inventarioId));
      const stock = Math.max(0, Number(inv?.existencia) || 0);
      if (!inv || stock <= 0) {
        showToast('Este material ya no tiene existencia disponible.', 'error');
        return;
      }
      if (qty > stock) {
        qty = stock;
        showToast(`La cantidad no puede superar la existencia disponible (${stock}).`, 'warning');
      }
    }
    item[field] = qty;
  }
  else if (field === 'precio') item[field] = Math.max(0, Number(value) || 0);
  else {
    item[field] = fixTextForExcel(value || '');
    if (field === 'clave' || field === 'descripcion' || field === 'unidad') { item.inventarioId = null; item.afectaInventario = false; }
  }
  window._valeDraftItems = items;

  // IMPORTANTE: no llamar a renderValeManualItems() aquí. Ese render
  // reemplazaba todos los <input> al salir de cada campo, provocando que
  // TAB perdiera el foco y que el siguiente TAB regresara al primer campo.
  updateValeManualTotals();
}

function removeValeManualItem(idx) {
  const items = getValeDraftItems();
  items.splice(idx, 1);
  window._valeDraftItems = items;
  renderValeManualItems();
}

function editValeManual(id) {
  if (!requirePermission('vouchers.manage')) return;
  const v = (Array.isArray(valesManuales) ? valesManuales : []).find(x => String(x.id) === String(id));
  if (!v) { showToast('Vale manual no encontrado', 'error'); return; }
  editingValeManualId = v.id;
  document.getElementById('vale-folio-input').value = v.folio || '';
  document.getElementById('vale-fecha').value = v.fecha || '';
  document.getElementById('vale-trabajador').value = v.trabajador || '';
  document.getElementById('vale-departamento').value = v.departamento || '';
  document.getElementById('vale-cargo').value = v.cargo || '';

  const tipoEl = document.getElementById('vale-tipo');
  const otroEl = document.getElementById('vale-otro-concepto');
  const tipoRaw = String(v.tipo || 'COMPRA');
  const otroMatch = tipoRaw.match(/^OTRO\s+CONCEPTO\s*:\s*(.*)$/i);
  if (otroMatch) {
    if (tipoEl) tipoEl.value = 'OTRO CONCEPTO';
    if (otroEl) otroEl.value = otroMatch[1] || '';
  } else if (tipoEl) {
    const allowed = ['COMPRA','DONACION','FUERA DE SIAM','OTRO CONCEPTO'];
    if (allowed.includes(tipoRaw.toUpperCase())) {
      tipoEl.value = tipoRaw.toUpperCase();
      if (otroEl) otroEl.value = '';
    } else {
      tipoEl.value = 'OTRO CONCEPTO';
      if (otroEl) otroEl.value = tipoRaw;
    }
  }
  toggleValeOtroConcepto();
  window._valeDraftItems = JSON.parse(JSON.stringify(v.items || []));
  ensureValeFirstRow();
  renderValeManualItems();
  const btn = document.getElementById('vale-manual-save-btn');
  if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Guardar modificaci&oacute;n';
  showSection('vale-manual');
}

async function deleteValeManual(id) {
  if (!requirePermission('vouchers.manage')) return;
  const v = (Array.isArray(valesManuales) ? valesManuales : []).find(x => String(x.id) === String(id));
  if (!v) { showToast('Vale manual no encontrado', 'error'); return; }
  if (!confirm(`¿Eliminar el vale manual ${v.folio}?`)) return;

  // Si el vale afectó inventario, devolver sus cantidades antes de eliminarlo.
  if (v.inventarioAfectado === true) {
    const restore = aggregateValeInventoryItems(v.items || []);
    if (!restore.ok) {
      showToast(`No se puede eliminar el vale porque falta en Inventario Vale / Donación el material "${restore.missing?.descripcion || restore.missing?.clave || 'sin descripción'}".`, 'error');
      return;
    }
    for (const [invId, qty] of restore.quantities) {
      const inv = valesInventario.find(x => String(x.id) === String(invId));
      if (!inv) {
        showToast('No se puede eliminar el vale porque uno de sus materiales ya no existe en Inventario Vale / Donación.', 'error');
        return;
      }
      inv.existencia = (Number(inv.existencia) || 0) + qty;
      inv.updatedAt = Date.now();
      inv.ultima_entrada = { cantidad: qty, fecha: todayISO(), motivo: `Devolución por eliminación del Vale Manual ${v.folio}` };
    }
  }

  // El borrado debe quedar guardado localmente ANTES de sincronizar.
  // De lo contrario, otra lectura de Firebase puede volver a presentar
  // temporalmente el vale que acabamos de eliminar.
  valesManuales = valesManuales.filter(x => String(x.id) !== String(id));
  markDeleted(deletedValesManuales, v.id);
  valesManuales = applyTombstones(valesManuales, deletedValesManuales);

  try {
    await saveLocalData();
    await broadcastFullSync();
  } catch (e) {
    console.error('Error al guardar la eliminacion del Vale Manual:', e);
    showToast('El vale se elimino en pantalla, pero hubo un problema al sincronizarlo', 'warning');
  }

  if (currentViewingValeManual && String(currentViewingValeManual.id) === String(id)) {
    currentViewingValeManual = null;
    currentViewingVenta = null;
  }

  renderHistorialVentas();
  showToast(`Vale manual ${v.folio} eliminado`, 'error');
}

function toggleValeOtroConcepto() {
  const tipo = document.getElementById('vale-tipo')?.value || 'COMPRA';
  const group = document.getElementById('vale-otro-concepto-group');
  const input = document.getElementById('vale-otro-concepto');
  const show = tipo === 'OTRO CONCEPTO';
  if (group) group.style.display = show ? '' : 'none';
  if (input) {
    input.disabled = !show;
    if (!show) input.value = '';
  }
}

function getValeTipo() {
  const tipo = fixTextForExcel(document.getElementById('vale-tipo')?.value || 'COMPRA').trim().toUpperCase();
  if (tipo !== 'OTRO CONCEPTO') return tipo || 'COMPRA';
  const otro = fixTextForExcel(document.getElementById('vale-otro-concepto')?.value || '').trim();
  return otro ? `OTRO CONCEPTO: ${otro}` : 'OTRO CONCEPTO';
}

function clearValeManual() {
  window._valeDraftItems = [createBlankValeManualItem()];
  editingValeManualId = null;
  const fields = ['vale-trabajador', 'vale-departamento', 'vale-cargo', 'vale-otro-concepto'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const btn = document.getElementById('vale-manual-save-btn');
  if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Guardar Vale Manual';
  const tipo = document.getElementById('vale-tipo');
  if (tipo) tipo.value = 'COMPRA';
  toggleValeOtroConcepto();
  const folio = document.getElementById('vale-folio-input');
  if (folio) folio.value = currentFolio;
  const fecha = document.getElementById('vale-fecha');
  if (fecha) fecha.valueAsDate = new Date();
  renderValeManualItems();
}

function findValeInventoryItemForValeItem(item) {
  if (!item) return null;
  // Solo los renglones seleccionados explícitamente desde el Inventario Vale/Donación
  // pueden afectar existencias. Los materiales capturados manualmente no deben
  // relacionarse por coincidencia de clave o descripción.
  const linked = item.afectaInventario === true || item.inventarioId != null;
  if (!linked || item.inventarioId == null) return null;
  return valesInventario.find(x => String(x.id) === String(item.inventarioId)) || null;
}

function aggregateValeInventoryItems(items) {
  const result = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    const linked = item && (item.afectaInventario === true || item.inventarioId != null);
    // Material capturado manualmente: se conserva en el vale, pero no mueve stock.
    if (!linked) continue;
    const inv = findValeInventoryItemForValeItem(item);
    if (!inv) return { ok: false, missing: item };
    const key = String(inv.id);
    const qty = Number(item.cantidad) || 0;
    result.set(key, (result.get(key) || 0) + qty);
  }
  return { ok: true, quantities: result };
}

function prepareValeInventoryStockChange(oldItems, newItems, oldInventoryApplied) {
  const oldAgg = oldInventoryApplied ? aggregateValeInventoryItems(oldItems) : { ok: true, quantities: new Map() };
  const newAgg = aggregateValeInventoryItems(newItems);
  if (!oldAgg.ok) return { ok: false, message: `No se encontró en Inventario Vale / Donación el material del vale anterior: ${oldAgg.missing?.descripcion || oldAgg.missing?.clave || 'sin descripción'}. No se modificó el vale.` };
  if (!newAgg.ok) return { ok: false, message: `El material "${newAgg.missing?.descripcion || newAgg.missing?.clave || 'sin descripción'}" no existe en Inventario Vale / Donación. Agréguelo al inventario antes de emitir el vale.` };

  const deltas = new Map();
  for (const [id, qty] of oldAgg.quantities) deltas.set(id, (deltas.get(id) || 0) - qty);
  for (const [id, qty] of newAgg.quantities) deltas.set(id, (deltas.get(id) || 0) + qty);

  for (const [id, delta] of deltas) {
    const inv = valesInventario.find(x => String(x.id) === String(id));
    if (!inv) return { ok: false, message: 'Uno de los materiales del vale ya no existe en Inventario Vale / Donación.' };
    const stock = Number(inv.existencia) || 0;
    if (delta > 0 && stock < delta) {
      return { ok: false, message: `Existencia insuficiente para "${inv.descripcion || inv.clave || 'material'}". Disponible: ${stock}. Necesario: ${delta}.` };
    }
  }
  return { ok: true, deltas, quantities: newAgg.quantities };
}

function commitValeInventoryStockChange(plan) {
  if (!plan?.ok) return false;
  for (const [id, delta] of plan.deltas) {
    const inv = valesInventario.find(x => String(x.id) === String(id));
    if (!inv) return false;
    inv.existencia = Math.max(0, (Number(inv.existencia) || 0) - delta);
    inv.updatedAt = Date.now();
    if (delta > 0) inv.ultima_salida = { cantidad: delta, fecha: todayISO(), motivo: 'Vale Manual' };
    if (delta < 0) inv.ultima_entrada = { cantidad: Math.abs(delta), fecha: todayISO(), motivo: 'Ajuste por modificación de Vale Manual' };
  }
  return true;
}

let _guardandoVale = false;
async function saveValeManual() {
  if (_guardandoVale) return;
  _guardandoVale = true;
  const btn = document.getElementById('vale-manual-save-btn');
  if (btn) btn.disabled = true;
  try {
    await _saveValeManualCore();
  } catch (e) {
    console.error('Error al guardar el vale manual:', e);
    showToast('No se pudo completar el guardado: ' + (e && e.message ? e.message : 'error desconocido'), 'error');
  } finally {
    _guardandoVale = false;
    if (btn) btn.disabled = false;
  }
}

async function _saveValeManualCore() {
  const trabajador = fixTextForExcel(document.getElementById('vale-trabajador')?.value || '').trim();
  const departamento = fixTextForExcel(document.getElementById('vale-departamento')?.value || '').trim();
  const cargo = fixTextForExcel(document.getElementById('vale-cargo')?.value || '').trim();
  const fecha = document.getElementById('vale-fecha')?.value || '';
  const tipo = getValeTipo();
  const items = getValeDraftItems().map(i => ({
    clave: fixTextForExcel(i.clave || '').trim(),
    descripcion: fixTextForExcel(i.descripcion || '').trim(),
    unidad: fixTextForExcel(i.unidad || 'PIEZA').trim().toUpperCase() || 'PIEZA',
    cantidad: Number(i.cantidad) || 0,
    precio: Number(i.precio) || 0,
    inventarioId: i.inventarioId ?? null,
    afectaInventario: i.afectaInventario === true || i.inventarioId != null
  }));

  if (!trabajador) { showToast('Ingrese el nombre del trabajador', 'error'); return; }
  if (!departamento) { showToast('Ingrese el departamento', 'error'); return; }
  if (!cargo) { showToast('Ingrese el cargo', 'error'); return; }
  if (!tipo || tipo === 'OTRO CONCEPTO') { showToast('Seleccione o escriba el tipo / leyenda del vale', 'error'); return; }
  if (!fecha) { showToast('Seleccione la fecha', 'error'); return; }
  if (!items.length) { showToast('Agregue al menos un material', 'error'); return; }
  if (items.some(i => !i.descripcion)) { showToast('Cada material debe tener una descripción', 'error'); return; }
  if (items.some(i => !Number.isFinite(i.cantidad) || i.cantidad <= 0)) { showToast('Las cantidades deben ser mayores que cero', 'error'); return; }
  if (items.some(i => !Number.isFinite(i.precio) || i.precio < 0)) { showToast('Hay un precio inválido', 'error'); return; }

  const now = Date.now();
  const total = items.reduce((sum, i) => sum + i.cantidad * i.precio, 0);
  const wasManualFolioOverride = !!folioManualOverrideActive;
  const isEditing = editingValeManualId !== null && editingValeManualId !== undefined;
  const oldValeForInventory = isEditing ? valesManuales.find(x => String(x.id) === String(editingValeManualId)) : null;
  const oldValeItemsForInventory = oldValeForInventory?.items || [];
  const oldInventoryApplied = oldValeForInventory?.inventarioAfectado === true;

  // Primero se valida la salida contra Inventario Vale / Donación. Esto evita
  // reservar un folio si no hay existencia suficiente.
  const stockPlan = prepareValeInventoryStockChange(oldValeItemsForInventory, items, oldInventoryApplied);
  if (!stockPlan.ok) {
    showToast(stockPlan.message, 'error');
    return;
  }

  let vale;
  let folio;
  if (isEditing) {
    const old = valesManuales.find(x => String(x.id) === String(editingValeManualId));
    if (!old) { showToast('Vale manual no encontrado', 'error'); return; }
    folio = old.folio;
    vale = { ...old, folio, fecha, trabajador, departamento, cargo, tipo, items, total, updatedAt: now };

    const duplicateVale = findDuplicateFolioInSameMonth(
      folio,
      fecha,
      'vale',
      editingValeManualId
    );
    if (duplicateVale) {
      showToast(
        `El folio ${folio} ya existe en ${getVentaYearMonth(fecha)} (${duplicateVale.fecha}). En otro mes sí puede repetirse.`,
        'error'
      );
      return;
    }
  } else {
    const reservedValeFolio = wasManualFolioOverride
      ? fixTextForExcel(currentFolio)
      : await reserveSharedFolioWithTimeout(currentFolio, 5000);
    folio = reservedValeFolio || buildFolioFromNumber(
      Math.max(1, getFolioNumber(currentFolio)),
      currentFolio
    );

    const duplicateVale = findDuplicateFolioInSameMonth(folio, fecha, 'vale', null);
    if (duplicateVale) {
      showToast(
        `El folio ${folio} ya existe en ${getVentaYearMonth(fecha)} (${duplicateVale.fecha}). En otro mes sí puede repetirse.`,
        'error'
      );
      return;
    }

    vale = {
      id: now,
      folio,
      fecha,
      trabajador,
      departamento,
      cargo,
      tipo,
      items,
      total,
      updatedAt: now
    };
  }

  // Confirmadas todas las validaciones, ahora sí se aplica el movimiento de stock.
  if (!commitValeInventoryStockChange(stockPlan)) {
    showToast('No se pudo actualizar el Inventario Vale / Donación. El vale no fue guardado.', 'error');
    return;
  }

  const afectaInventario = items.some(i => i.afectaInventario === true || i.inventarioId != null);
  vale.inventarioAfectado = afectaInventario;
  vale.inventarioMovimientoAt = afectaInventario ? Date.now() : null;

  if (isEditing) {
    const idx = valesManuales.findIndex(x => String(x.id) === String(editingValeManualId));
    if (idx >= 0) valesManuales[idx] = vale;
    else { showToast('Vale manual no encontrado', 'error'); return; }
    editingValeManualId = null;
  } else {
    valesManuales.unshift(vale);
    currentFolio = buildFolioFromNumber(getFolioNumber(folio) + 1, folio);
    currentFolioUpdatedAt = Date.now();
    await idbSetMeta('folio', currentFolio);
  }

  await idbSetMeta('valesManuales', valesManuales);
  await idbSetMeta('valesInventario', valesInventario);
  localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt));
  const folioVal = document.getElementById('folio-val');
  if (folioVal) folioVal.textContent = currentFolio;

  window._valeDraftItems = [];
  if (!isEditing && wasManualFolioOverride) {
    folioManualOverrideActive = false;
    await idbSetMeta('folio_manual_override', false);
  }

  // La copia local queda guardada antes de mostrar las acciones de impresión.
  // La sincronización con Firebase se realiza en segundo plano para no hacer
  // esperar al usuario después de finalizar el vale.
  await saveLocalData();

  clearValeManual();
  renderHistorialVentas();
  showToast(isEditing ? `Vale manual ${folio} modificado correctamente` : `Vale manual ${folio} guardado. Siguiente folio: ${currentFolio}`);

  // Igual que en Venta normal: después de guardar, el usuario decide si
  // quiere abrir o guardar el Excel del folio recién creado.
  currentViewingValeManual = vale;
  currentViewingVenta = normalizeValeForF361(vale);

  // No bloqueamos la ventana de impresión mientras Firebase sincroniza.
  broadcastFullSync(false, true).catch(e => {
    console.error('Sincronización en segundo plano del Vale Manual:', e);
  });

  try {
    const action = await askFolioAction();
    if (action === 'cancel') return;
    const printable = normalizeValeForF361(vale);
    showToast('Generando el formato de salida...', 'warning');
    if (action === 'open') {
      await openFolioXlsm(printable);
      showToast(`Folio ${folio} preparado para abrir. Si tu navegador no lo visualiza, utiliza "Guardar archivo".`, 'success');
    } else {
      const mode = await saveF361ExactXlsm(printable, f361FolderHandle);
      showToast(
        mode === 'folder' ? `Folio ${folio} guardado en la carpeta seleccionada` :
        mode === 'picker' ? `Folio ${folio} guardado como Excel.` :
        `Folio ${folio} descargado como Excel. Ábrelo desde Descargas.`,
        'success'
      );

      // Solo en Vale Manual: después de guardar, vuelve a mostrar la ventana
      // de acciones para permitir seleccionar "Abrir archivo".
      const nextAction = await askFolioAction();
      if (nextAction === 'open') {
        await openFolioXlsm(printable);
        showToast(`Folio ${folio} preparado para abrir.`, 'success');
      }
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error('Exportación automática del Vale Manual:', e);
    showToast(e?.message || 'El vale se guardó, pero no se pudo generar el archivo', 'error');
  }
}

function renderVentaItems() {
  const list = document.getElementById('venta-items-list');
  if (!ventaItems.length) {
    list.innerHTML = '<div class="venta-empty"><i class="fas fa-cart-plus" style="font-size:1.6rem; color:#059669; margin-bottom:8px; display:block;"></i>Sin materiales agregados a la compra</div>';
  } else {
    const header = `
      <div class="venta-row venta-head">
        <div>Material / Producto</div>
        <div>Unidad</div>
        <div>Cantidad</div>
        <div>Precio</div>
        <div>Importe</div>
        <div></div>
      </div>`;

    // Mantener el orden de captura: el primer material arriba y cada nuevo material al final.
    list.innerHTML = header + [...ventaItems.keys()].map(idx => {
      const i = ventaItems[idx];
      const prod = products.find(x => x.id === i.productId) || {};
      const unidadBase = fixTextForExcel(i.unidad || prod.unidad || 'PIEZA');
      const unidad = formatUnitByQuantity(i.cantidad, unidadBase);
      i.unidad = unidadBase;
      return `
        <div class="venta-row">
          <div>
            <div class="venta-product-titleline">
              <span class="venta-product-name">${esc(i.descripcion)}</span>
              ${(i.contrato || prod.contrato || i.partida || prod.partida) ? `<strong class="venta-product-contract">${(i.contrato || prod.contrato) ? `Contrato: ${esc(i.contrato || prod.contrato)}` : ''}${(i.contrato || prod.contrato) && (i.partida || prod.partida) ? ' · ' : ''}${(i.partida || prod.partida) ? `Partida: ${esc(i.partida || prod.partida)}` : ''}</strong>` : ''}
            </div>
            <small class="venta-product-key">${esc(i.clave)}</small>
          </div>
          <div><span class="venta-unit-badge">${esc(unidad)}</span></div>
          <div class="venta-qty-control">
            <button type="button" class="venta-qty-btn" aria-label="Disminuir cantidad" title="Disminuir en uno" onclick="adjustVentaQty(${idx}, -1)">−</button>
            <input class="venta-qty-input" type="number" value="${i.cantidad}" min="1" step="1" aria-label="Cantidad" onchange="updateVentaQty(${idx}, this.value)">
            <button type="button" class="venta-qty-btn" aria-label="Aumentar cantidad" title="Aumentar en uno" onclick="adjustVentaQty(${idx}, 1)">+</button>
          </div>
          <div class="venta-money">$${fmt(i.precio)}</div>
          <div class="venta-money">$${fmt(i.cantidad*i.precio)}</div>
          <button class="btn btn-danger btn-sm" onclick="ventaItems.splice(${idx},1); renderVentaItems();"><i class="fas fa-trash"></i></button>
        </div>`;
    }).join('');
  }
  const total = ventaItems.reduce((s,i)=>s+i.cantidad*i.precio, 0);
  const piezas = ventaItems.reduce((s,i)=>s+(parseFloat(i.cantidad)||0), 0);
  document.getElementById('venta-total-val').textContent = '$' + fmt(total);
  const countEl = document.getElementById('venta-count-val');
  if (countEl) countEl.innerHTML = `${ventaItems.length} material(es) <span style="margin:0 6px;">|</span> ${piezas} pieza(s)`;
  // Al agregar materiales, dejar visible el más reciente al final de la lista.
  if (list) list.scrollTop = list.scrollHeight;
}

const _ventaQtyLastClick = Object.create(null);
function adjustVentaQty(idx, delta) {
  // Evita que un mismo toque/clic generado dos veces por el navegador
  // se aplique por duplicado al volver a dibujar los controles.
  const clickKey = String(idx) + ':' + String(delta);
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (_ventaQtyLastClick[clickKey] !== undefined && now - _ventaQtyLastClick[clickKey] < 80) return;
  _ventaQtyLastClick[clickKey] = now;

  const item = ventaItems[idx];
  if (!item) return;
  const cantidadActual = Number(item.cantidad) || 1;
  const nuevaCantidad = cantidadActual + delta;
  if (nuevaCantidad < 1) return;
  const disponible = getStockDisponibleParaVenta(item.productId);
  if (nuevaCantidad > disponible) {
    showToast('Stock insuficiente', 'error');
    return;
  }
  updateVentaQty(idx, nuevaCantidad);
}

function updateVentaQty(idx, val) {
  const i = ventaItems[idx];
  if (!i) return;
  let q = Number(val);
  if (!Number.isFinite(q) || q <= 0) {
    showToast('La cantidad debe ser mayor que cero', 'error');
    q = 1;
  }
  const disponible = getStockDisponibleParaVenta(i.productId);
  if (q > disponible) {
    showToast('Stock insuficiente', 'error');
    i.cantidad = Math.max(disponible, 1);
  } else {
    i.cantidad = q;
  }
  renderVentaItems();
}

function clearVenta() {
  ventaItems = [];
  editingVentaId = null;
  document.getElementById('venta-cliente').value = '';
  document.getElementById('venta-compra').value = '';
  document.getElementById('venta-search-prod').value = '';
  document.getElementById('venta-ac-list').style.display = 'none';
  ventaSearchResults = [];
  document.getElementById('venta-folio-input').value = currentFolio;
  document.getElementById('venta-fecha').valueAsDate = new Date();
  const btnVenta = document.getElementById('venta-save-btn');
  if (btnVenta) btnVenta.innerHTML = '<i class="fas fa-shopping-cart"></i> Finalizar Compra';
  renderVentaItems();
}

function canEditFolio() {
  return userHasPermission('folios.edit');
}

function openFolioModal() {
  if (!canEditFolio()) {
    showToast('No tienes permiso para modificar el folio', 'error');
    return;
  }
  document.getElementById('folio-input').value = currentFolio;
  openModal('modal-folio');
}

async function saveFolio() {
  if (!canEditFolio()) {
    showToast('No tienes permiso para modificar el folio', 'error');
    return;
  }
  const input = document.getElementById('folio-input');
  const newFolio = fixTextForExcel(input ? input.value : '').trim();
  if (!newFolio) {
    showToast('Ingrese un folio valido', 'error');
    return;
  }

  const newNumber = getFolioNumber(newFolio);
  if (!newNumber) {
    showToast('El folio debe contener un numero valido', 'error');
    return;
  }

  // Este cambio es MANUAL y se convierte en la versión autoritativa.
  currentFolio = newFolio;
  currentFolioUpdatedAt = Date.now();
  const sequence = Math.max(0, newNumber - 1);

  await idbSetMeta('folio', currentFolio);
  // Marca persistente: este folio fue elegido manualmente y no debe ser
  // reemplazado por una "reparación" basada en folios históricos mayores.
  await idbSetMeta('folio_manual_override', true);
  folioManualOverrideActive = true;
  localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt));

  const folioVal = document.getElementById('folio-val');
  if (folioVal) folioVal.textContent = currentFolio;
  const ventaFolioInput = document.getElementById('venta-folio-input');
  if (ventaFolioInput && !editingVentaId) ventaFolioInput.value = currentFolio;

  try {
    if (!initFirebase()) throw new Error('Firebase no disponible');
    if (!firebaseRoomRef) await firebaseConnectRoom();
    if (!firebaseRoomRef) throw new Error('Sala Firebase no disponible');

    // Escritura directa y atómica del estado del folio. No pasa por
    // broadcastFullSync(), porque una sincronización general antigua podría
    // volver a introducir el folio anterior.
    const roomRef = firebaseDB.ref(getFirebaseRoomPath());
    const now = Date.now();

    // Publicar folio, secuencia y marca de tiempo en una sola operación:
    // ningún equipo podrá leer un estado intermedio con datos contradictorios.
    await roomRef.update({
      'data/currentFolio': currentFolio,
      'data/currentFolioUpdatedAt': currentFolioUpdatedAt,
      'data/folioSequence': sequence,
      'folioState': {
        value: currentFolio,
        updatedAt: currentFolioUpdatedAt,
        sequence: sequence,
        clientId: firebaseClientId,
        writtenAt: now
      }
    });

    firebaseLastRemoteWrite = Math.max(firebaseLastRemoteWrite, now);
    updateCloudBadge('online', 'En Línea: ' + cloudRoomId + ' · Firebase');
  } catch (e) {
    console.warn('[FOLIO] No se pudo guardar el folio autoritativo en Firebase:', e);
    showToast('Folio guardado localmente; Firebase se actualizará al reconectar', 'warning');
  }

  closeModal('modal-folio');
  showToast('Folio actualizado: ' + currentFolio);
}

