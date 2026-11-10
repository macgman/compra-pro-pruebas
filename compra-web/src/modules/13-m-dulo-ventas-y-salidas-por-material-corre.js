// =============================================================
// MÓDULO: VENTAS Y SALIDAS POR MATERIAL (CORREGIDO BÚSQUEDA Y AUTO-SELECCIÓN)
// =============================================================
function populateVentasMaterialSelect(filterText = '') {
  const sel = document.getElementById('vm-product-select');
  if (!sel) return;
  const currentVal = sel.value;
  const q = normalizeSearchText(filterText);

  const matched = products.filter(p => {
    if (!q) return true;
    const clave = normalizeSearchText(p.clave);
    const desc = normalizeSearchText(p.descripcion);
    const ref = normalizeSearchText(p.factura);
    return clave.includes(q) || desc.includes(q) || ref.includes(q);
  }).sort((a, b) => normSortText(a.descripcion).localeCompare(normSortText(b.descripcion), 'es'));

  sel.innerHTML = '<option value="all">-- Todos los materiales (Consolidado General) --</option>' +
    matched.map(p => {
      const full = `[${p.clave}] ${p.descripcion || ''} ${p.factura ? '(Ref: ' + p.factura + ')' : ''} (Stock: ${p.cantidad})`;
      const short = full.length > 80 ? full.slice(0, 77) + '…' : full;
      return `<option value="${esc(p.id).replace(/"/g,'&quot;')}" title="${esc(full).replace(/"/g,'&quot;')}">${esc(short)}</option>`;
    }).join('');

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  }
}

function filterVentasMaterialDropdown() {
  const txt = document.getElementById('vm-search').value;
  populateVentasMaterialSelect(txt);
  
  const sel = document.getElementById('vm-product-select');
  if (sel && txt.trim() !== '') {
    const firstValid = Array.from(sel.options).find(o => o.value !== 'all');
    if (firstValid) {
      sel.value = firstValid.value;
    } else {
      sel.value = 'all';
    }
  } else if (sel && txt.trim() === '') {
    sel.value = 'all';
  }
  
  renderVentasMaterial();
}

function onVentasMaterialPeriodChange() {
  const mode = document.getElementById('vm-period-filter').value;
  const fromEl = document.getElementById('vm-date-from');
  const toEl = document.getElementById('vm-date-to');
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  if (mode === 'all') {
    fromEl.value = '';
    toEl.value = '';
  } else if (mode === 'month') {
    fromEl.value = `${y}-${m}-01`;
    toEl.value = `${y}-${m}-${d}`;
  } else if (mode === 'current-year') {
    fromEl.value = `${y}-01-01`;
    toEl.value = `${y}-${m}-${d}`;
  } else if (mode === 'last-12') {
    const past = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const py = past.getFullYear();
    const pm = String(past.getMonth() + 1).padStart(2, '0');
    fromEl.value = `${py}-${pm}-01`;
    toEl.value = `${y}-${m}-${d}`;
  }
  renderVentasMaterial();
}

function getVentasMaterialData() {
  const pid = document.getElementById('vm-product-select')?.value || 'all';
  const fromDate = (document.getElementById('vm-date-from')?.value || '').trim();
  const toDate = (document.getElementById('vm-date-to')?.value || '').trim();

  const lines = [];
  ventas.forEach(v => {
    const vDate = normalizeISODate(v.fecha) || v.fecha || '';
    if (fromDate && vDate < fromDate) return;
    if (toDate && vDate > toDate) return;

    (v.items || []).forEach(item => {
      if (pid !== 'all' && String(item.productId) !== String(pid)) return;
      const qty = Number(item.cantidad) || 0;
      const price = Number(item.precio) || 0;
      lines.push({
        fecha: vDate,
        folio: v.folio || '',
        cliente: v.cliente || 'Sin especificar',
        productId: item.productId,
        clave: item.clave || '',
        descripcion: item.descripcion || '',
        unidad: item.unidad || 'PIEZA',
        cantidad: qty,
        precio: price,
        total: qty * price,
        month: vDate.slice(0, 7) || 'S/F'
      });
    });
  });

  return lines;
}

function updateVmDescBox(prod) {
  const box = document.getElementById('vm-desc-box');
  if (!box) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (!prod) {
    box.classList.add('is-general');
    set('vm-desc-title', 'Todos los materiales');
    set('vm-desc-text', 'Vista consolidada general. Selecciona un material para ver su descripción completa.');
    set('vm-desc-meta', '');
    return;
  }
  box.classList.remove('is-general');
  set('vm-desc-title', 'Material seleccionado · Clave ' + (prod.clave || '—'));
  set('vm-desc-text', prod.descripcion || 'Sin descripción');
  const meta = [];
  if (prod.factura) meta.push('Ref: ' + prod.factura);
  if (prod.unidad) meta.push('Unidad: ' + prod.unidad);
  meta.push('Stock: ' + prod.cantidad);
  set('vm-desc-meta', meta.join('   |   '));
}

function renderVentasMaterial() {
  const pid = document.getElementById('vm-product-select')?.value || 'all';
  const prod = products.find(p => String(p.id) === String(pid));
  updateVmDescBox(prod);
  const badge = document.getElementById('vm-badge-clave');
  if (badge) badge.textContent = prod ? `${prod.clave} | Stock: ${prod.cantidad}` : 'GENERAL';

  const lines = getVentasMaterialData();
  const totalPiezas = lines.reduce((s, l) => s + l.cantidad, 0);
  const totalImporte = lines.reduce((s, l) => s + l.total, 0);
  const totalFolios = new Set(lines.map(l => l.folio)).size;

  const monthMap = new Map();
  lines.forEach(l => {
    const m = l.month;
    const prev = monthMap.get(m) || { month: m, folios: new Set(), piezas: 0, total: 0 };
    prev.folios.add(l.folio);
    prev.piezas += l.cantidad;
    prev.total += l.total;
    monthMap.set(m, prev);
  });
  const monthlyList = Array.from(monthMap.values()).sort((a, b) => String(b.month).localeCompare(String(a.month)));

  const clientMap = new Map();
  lines.forEach(l => {
    const c = l.cliente || 'Sin especificar';
    const prev = clientMap.get(c) || { cliente: c, folios: new Set(), piezas: 0, total: 0 };
    prev.folios.add(l.folio);
    prev.piezas += l.cantidad;
    prev.total += l.total;
    clientMap.set(c, prev);
  });
  const clientsList = Array.from(clientMap.values()).sort((a, b) => b.piezas - a.piezas || b.total - a.total);

  const mesPico = monthlyList.length ? [...monthlyList].sort((a, b) => b.piezas - a.piezas)[0] : null;
  document.getElementById('vm-kpi-grid').innerHTML = `
    <div class="stat-card"><div class="label">Total Piezas Salidas</div><div class="value" style="color:#059669;">${totalPiezas.toLocaleString('es-MX')}</div></div>
    <div class="stat-card"><div class="label">Importe Total Salidas</div><div class="value" style="color:#064e3b;">$${fmt(totalImporte)}</div></div>
    <div class="stat-card"><div class="label">Folios / Compras</div><div class="value">${totalFolios}</div></div>
    <div class="stat-card"><div class="label">Mes con Mayor Salida</div><div class="value" style="font-size:1.45rem; color:#d97706;">${mesPico ? `${mesPico.month} (${mesPico.piezas})` : '—'}</div></div>
  `;

  document.getElementById('vm-monthly-tbody').innerHTML = !monthlyList.length
    ? '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Sin movimientos de venta registrados en el periodo</td></tr>'
    : monthlyList.map(m => `
      <tr>
        <td><strong>${esc(m.month)}</strong></td>
        <td>${m.folios.size}</td>
        <td style="font-weight:700; color:#059669;">${m.piezas.toLocaleString('es-MX')}</td>
        <td style="font-weight:800;">$${fmt(m.total)}</td>
      </tr>
    `).join('');

  document.getElementById('vm-clientes-tbody').innerHTML = !clientsList.length
    ? '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Sin registros de solicitantes</td></tr>'
    : clientsList.slice(0, 50).map(c => `
      <tr>
        <td><strong>${esc(c.cliente)}</strong></td>
        <td>${c.folios.size}</td>
        <td style="font-weight:700; color:#059669;">${c.piezas.toLocaleString('es-MX')}</td>
        <td style="font-weight:800;">$${fmt(c.total)}</td>
      </tr>
    `).join('');

  const detailSorted = [...lines].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.folio).localeCompare(String(a.folio)));
  document.getElementById('vm-detail-tbody').innerHTML = !detailSorted.length
    ? '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Sin salidas registradas</td></tr>'
    : detailSorted.slice(0, 150).map(l => `
      <tr>
        <td><small>${esc(l.fecha)}</small></td>
        <td><strong style="color:#059669;">${esc(l.folio)}</strong></td>
        <td>${esc(l.cliente)}</td>
        <td style="font-weight:700;">${l.cantidad} ${esc(l.unidad)}</td>
        <td>$${fmt(l.precio)}</td>
        <td style="font-weight:800; color:#064e3b;">$${fmt(l.total)}</td>
      </tr>
    `).join('');
}

async function exportVentasMaterialExcel() {
  if (!requirePermission('reports.export')) return;
  const pid = document.getElementById('vm-product-select')?.value || 'all';
  const prod = products.find(p => String(p.id) === String(pid));
  const fromDate = (document.getElementById('vm-date-from')?.value || '').trim();
  const toDate = (document.getElementById('vm-date-to')?.value || '').trim();
  const periodoTexto = (fromDate || toDate) ? `Periodo: ${fromDate || 'Inicio'} al ${toDate || 'Hoy'}` : 'Todo el Historial';

  const lines = getVentasMaterialData();
  if (!lines.length) {
    showToast('No hay datos para exportar en este periodo', 'error');
    return;
  }

  const monthMap = new Map();
  lines.forEach(l => {
    const m = l.month;
    const prev = monthMap.get(m) || { month: m, folios: new Set(), piezas: 0, total: 0 };
    prev.folios.add(l.folio);
    prev.piezas += l.cantidad;
    prev.total += l.total;
    monthMap.set(m, prev);
  });
  const monthlyList = Array.from(monthMap.values()).sort((a, b) => String(b.month).localeCompare(String(a.month)));

  const clientMap = new Map();
  lines.forEach(l => {
    const c = l.cliente || 'Sin especificar';
    const prev = clientMap.get(c) || { cliente: c, folios: new Set(), piezas: 0, total: 0 };
    prev.folios.add(l.folio);
    prev.piezas += l.cantidad;
    prev.total += l.total;
    clientMap.set(c, prev);
  });
  const clientsList = Array.from(clientMap.values()).sort((a, b) => b.piezas - a.piezas);

  const sheets = [
    {
      name: 'Resumen Mensual',
      headers: ['Mes / Periodo', 'No. Folios / Compras', 'Piezas Surtidas', 'Total Importe ($)'],
      widths: [18, 22, 18, 22],
      rows: monthlyList.map(m => [m.month, m.folios.size, m.piezas, m.total])
    },
    {
      name: 'Top Solicitantes',
      headers: ['Solicitante / Area', 'No. Folios', 'Piezas Surtidas', 'Total Importe ($)'],
      widths: [36, 16, 18, 22],
      rows: clientsList.map(c => [c.cliente, c.folios.size, c.piezas, c.total])
    },
    {
      name: 'Detalle de Salidas',
      headers: ['Fecha', 'Folio', 'Solicitante / Destino', 'Clave', 'Material', 'Unidad', 'Cantidad', 'Precio Unit. ($)', 'Total Importe ($)'],
      widths: [14, 14, 32, 16, 60, 14, 14, 18, 20],
      rows: lines.map(l => [l.fecha, l.folio, l.cliente, l.clave, l.descripcion, l.unidad, l.cantidad, l.precio, l.total])
    }
  ];

  const stamp = todayISO().replace(/-/g, '');
  const cleanFileName = `Ventas_${(prod ? prod.clave : 'General').replace(/[^a-zA-Z0-9_-]/g, '_')}_${stamp}.xlsx`;
  await downloadStyledWorkbook(sheets, cleanFileName);
  showToast(`Reporte generado (${periodoTexto}): ${sheets.length} hoja(s)`);
}

function showSection(name) {
  const sectionPermission = {
    dashboard:'dashboard.view', inventario:'inventory.view', 'vale-inventario':'inventory.view',
    'inv-fisico':'physical.manage', ventas:'purchases.create', 'vale-manual':'vouchers.manage',
    'historial-ventas':'purchases.view', 'ventas-material':'reports.export',
    movimientos:'movements.view', kardex:'kardex.view', config:'settings.manage',
    'stock-minimo':'inventory.view', ordenes:'purchases.create', seguridad:'users.manage'
  }[name];
  const sectionAlternatives = {
    inventario: ['inventory.view','inventory.create','inventory.edit','inventory.delete','inventory.import'],
    'vale-inventario': ['inventory.view','vouchers.manage'],
    ventas: ['purchases.create','purchases.edit'],
    'historial-ventas': ['purchases.view','purchases.edit','purchases.delete'],
    ordenes: ['purchases.view','purchases.create','purchases.edit','purchases.delete'],
    movimientos: ['movements.view','movements.edit'],
    kardex: ['kardex.view','kardex.adjust'],
    config: ['users.manage','settings.manage','backup.export','backup.restore']
  };
  if (sectionAlternatives[name]) {
    if (!hasAnyPermission(sectionAlternatives[name])) {
      showToast('No tienes permiso para acceder a esta sección.', 'error'); return;
    }
  } else if (sectionPermission && !userHasPermission(sectionPermission)) {
    showToast('No tienes permiso para acceder a esta sección.', 'error'); return;
  }

  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
  const section = document.getElementById('section-' + name);
  const nav = document.getElementById('nav-' + name) || document.getElementById('nav-ventas');
  if (!section) { showToast('Seccion no disponible', 'error'); return; }
  section.style.display = 'block';
  if (nav) nav.classList.add('active');

  const tabs = document.getElementById('venta-mode-tabs');
  const ventaTab = document.getElementById('venta-mode-tab');
  const valeTab = document.getElementById('vale-mode-tab');
  const isVentaMode = name === 'ventas' || name === 'vale-manual';
  if (tabs) tabs.style.display = isVentaMode ? 'flex' : 'none';
  if (ventaTab) ventaTab.classList.toggle('active', name === 'ventas');
  if (valeTab) valeTab.classList.toggle('active', name === 'vale-manual');

  const titleIcon = nav?.querySelector('i')?.className || (name === 'vale-manual' ? 'fas fa-file-signature' : 'fas fa-chart-pie');
  const titleText = name === 'vale-manual' ? 'Vale Manual' : name.replace(/-/g, ' ').toUpperCase();
  document.getElementById('page-title').innerHTML = `<i class="${titleIcon}"></i> ${titleText}`;
  if (name === 'dashboard') renderDashboard();
  if (name === 'inventario') { invPage = 1; renderInventario(); }
  if (name === 'vale-inventario') renderValeInventario();
  if (name === 'inv-fisico') renderInvFisico();
  if (name === 'historial-ventas') renderHistorialVentas();
  if (name === 'ventas-material') { populateVentasMaterialSelect(); renderVentasMaterial(); }
  if (name === 'movimientos') renderMovimientos();
  if (name === 'kardex') renderKardex();
  if (name === 'config') renderUsersTable();
  if (name === 'ventas') {
    if (!editingVentaId) {
      document.getElementById('venta-folio-input').value = currentFolio;
      document.getElementById('venta-fecha').valueAsDate = new Date();
    }
    const btnVenta = document.getElementById('venta-save-btn');
    if (btnVenta) btnVenta.innerHTML = editingVentaId ? '<i class="fas fa-save"></i> Guardar modificaci&oacute;n' : '<i class="fas fa-shopping-cart"></i> Finalizar Compra';
    renderVentaItems();
  }
  if (name === 'vale-manual') {
    document.getElementById('vale-folio-input').value = currentFolio;
    document.getElementById('vale-fecha').valueAsDate = new Date();
    if (!editingValeManualId) ensureValeFirstRow();
    const valeTipo = document.getElementById('vale-tipo');
    if (valeTipo && !valeTipo.value) valeTipo.value = 'COMPRA';
    toggleValeOtroConcepto();
    renderValeManualItems();
  }
}

function renderDashboard() {
  const crit = products.filter(p => p.cantidad <= 5);
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="label">Materiales en Cat&aacute;logo</div><div class="value">${products.length}</div></div>
    <div class="stat-card"><div class="label">Total Compras / Ingresos</div><div class="value" style="color:#059669">$${fmt(ventas.reduce((s,v)=>s+v.total,0))}</div></div>
    <div class="stat-card"><div class="label">Stock Cr&iacute;tico (&le; 5)</div><div class="value" style="color:#ef4444">${crit.length}</div></div>
  `;
  document.getElementById('dash-critical-tbody').innerHTML = crit.slice(0,10).map(p => `<tr><td><span class="clave-cell">${esc(p.clave)}</span></td><td>${esc(p.descripcion)}</td><td>${esc(p.unidad)}</td><td>${stockBadge(p.cantidad)}</td></tr>`).join('');
}

function filterInventario() { invPage = 1; renderInventario(); }

function normSortText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function sortInventarioList(list, sortSelectId = 'inv-sort') {
  const sortEl = document.getElementById(sortSelectId);
  const sortBy = sortEl ? sortEl.value : 'default';
  const sorted = [...list];

  const compareText = (a, b, field) => normSortText(a[field]).localeCompare(normSortText(b[field]), 'es', { numeric: true, sensitivity: 'base' });
  const compareNumber = (a, b, field) => (Number(a[field]) || 0) - (Number(b[field]) || 0);

  if (sortBy === 'nombre-az') sorted.sort((a, b) => compareText(a, b, 'descripcion'));
  if (sortBy === 'nombre-za') sorted.sort((a, b) => compareText(b, a, 'descripcion'));
  if (sortBy === 'clave-az') sorted.sort((a, b) => compareText(a, b, 'clave'));
  if (sortBy === 'clave-za') sorted.sort((a, b) => compareText(b, a, 'clave'));
  if (sortBy === 'stock-asc') sorted.sort((a, b) => compareNumber(a, b, 'cantidad'));
  if (sortBy === 'stock-desc') sorted.sort((a, b) => compareNumber(b, a, 'cantidad'));
  if (sortBy === 'precio-asc') sorted.sort((a, b) => compareNumber(a, b, 'precio'));
  if (sortBy === 'precio-desc') sorted.sort((a, b) => compareNumber(b, a, 'precio'));

  return sorted;
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Obtiene el año-mes de una fecha de compra sin depender de un único formato.
// Soporta YYYY-MM-DD (formato del formulario) y DD/MM/YYYY o DD-MM-YYYY
// para mantener compatibilidad con registros anteriores.
// Si no puede reconocer la fecha con seguridad, devuelve ''.
function getVentaYearMonth(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const local = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (local) {
    const day = Number(local[1]);
    const month = Number(local[2]);
    const year = Number(local[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  return '';
}

function productMatchesSearch(p, rawQuery) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = [p.clave, p.partida, p.contrato, p.factura, p.descripcion, p.unidad].map(normalizeSearchText).join(' ');
  return words.every(word => haystack.includes(word));
}

// Coincidencia EXACTA por número de partida (40 no coincide con 140 ni con 240 ML).
// Acepta varias partidas separadas por coma, espacio o punto y coma. "040" = "40".
function productMatchesPartida(p, rawPartida) {
  const tokens = String(rawPartida || '').split(/[,;\s]+/).map(normalizeSearchText).filter(Boolean);
  if (!tokens.length) return true;
  const value = normalizeSearchText(p.partida);
  if (!value) return false;
  const asNum = v => (/^\d+$/.test(v) ? String(parseInt(v, 10)) : v);
  const vNum = asNum(value);
  return tokens.some(t => t === value || asNum(t) === vNum);
}

function getInventarioFiltradoOrdenado() {
  const q = document.getElementById('inv-search').value.toLowerCase().trim();
  const partidaEl = document.getElementById('inv-partida');
  const partidaQ = partidaEl ? partidaEl.value : '';
  const f = document.getElementById('inv-stock-filter').value;

  const list = products.filter(p => {
    if (!productMatchesPartida(p, partidaQ)) return false;
    if (!productMatchesSearch(p, q)) return false;
    if (f === 'nonzero') return p.cantidad > 0;
    if (f === 'zero') return p.cantidad <= 0;
    if (f === 'lt5') return p.cantidad < 5;
    if (f === 'lt10') return p.cantidad < 10;
    if (f === 'gt10') return p.cantidad > 10;
    if (f === 'gt20') return p.cantidad > 20;
    if (f === 'gt50') return p.cantidad > 50;
    return true;
  });

  return sortInventarioList(list);
}

function renderInventario() {
  const list = getInventarioFiltradoOrdenado();
  const start = (invPage-1)*invPerPage;
  document.getElementById('inv-tbody').innerHTML = list.slice(start, start+invPerPage).map(p => `
    <tr class="${p.bloqueado ? 'product-blocked' : ''}">
      <td>
        <span class="clave-cell">${esc(p.clave || 'N/A')}</span>
        ${p.partida ? `<span class="clave-meta"><strong>Partida:</strong> ${esc(p.partida)}</span>` : ''}
        ${p.contrato ? `<span class="clave-meta"><strong>Contrato:</strong> ${esc(p.contrato)}</span>` : ''}
      </td>
      <td>${esc(p.descripcion)}</td>
      <td>${esc(p.unidad)}</td>
      <td>$${fmt(p.precio)}</td>
      <td>${stockBadge(p.cantidad)}</td>
      <td>${
        p.bloqueado
          ? '<span class="badge badge-blocked"><i class="fas fa-lock"></i> BLOQUEADO</span>'
          : (Number(p.cantidad) <= 0
              ? '<span class="badge badge-critical"><i class="fas fa-box-open"></i> AGOTADO</span>'
              : '<span class="badge badge-unlocked"><i class="fas fa-lock-open"></i> DISPONIBLE</span>')
      }</td>
      <td>
        <div style="display:flex; gap:7px; flex-wrap:wrap;">
          <button class="btn btn-entry btn-sm" data-permission="inventory.edit" onclick="openEntradaModal(${p.id})"><i class="fas fa-arrow-down"></i> Dar entrada</button>
          <button class="btn btn-outline btn-sm" data-permission="inventory.edit-or-delete" onclick="openProductModal(${p.id})">Gestionar</button>
          <button class="btn ${p.bloqueado ? 'btn-success' : 'btn-warning'} btn-sm" data-permission="inventory.edit" onclick="toggleProductLock(${p.id})"><i class="fas ${p.bloqueado ? 'fa-lock-open' : 'fa-lock'}"></i> ${p.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
        </div>
      </td>
    </tr>
  `).join('');
  applyGranularPermissions();
  renderPagination('inv-pagination', invPage, Math.ceil(list.length/invPerPage), 'setInvPage');
}

function setInvPage(p) { invPage = p; renderInventario(); }
function setIfPage(p) { ifPage = p; renderInvFisico(); }

function refreshStock() { renderInventario(); showToast('Stock refrescado'); }

function toggleProductLock(id) {
  if (!requirePermission('inventory.edit')) return;
  const p = products.find(x => String(x.id) === String(id));
  if (!p) { showToast('Producto no encontrado', 'error'); return; }

  const nextState = !p.bloqueado;
  const action = nextState ? 'bloquear' : 'desbloquear';
  const message = nextState
    ? `¿Bloquear "${p.descripcion}"? No podra agregarse a nuevas compras hasta que se desbloquee.`
    : `¿Desbloquear "${p.descripcion}"? Volvera a estar disponible para compra.`;

  if (!confirm(message)) return;
  p.bloqueado = nextState;
  p.updatedAt = Date.now();
  broadcastFullSync();
  renderInventario();
  renderDashboard();
  if (document.getElementById('venta-search-prod')?.value.trim().length >= 2) searchVentaProduct();
  showToast(`Material ${action === 'bloquear' ? 'bloqueado' : 'desbloqueado'} correctamente`);
}

function openProductModal(id) {
  if (id) {
    if (!userHasPermission('inventory.edit') && !userHasPermission('inventory.delete')) {
      showToast('No tienes permiso para gestionar este material.', 'error'); return;
    }
  } else if (!requirePermission('inventory.create')) return;
  
  const p = id ? products.find(x => x.id === id) : null;
  document.getElementById('prod-id').value = p ? p.id : '';
  document.getElementById('prod-clave').value = p ? p.clave : '';
  document.getElementById('prod-partida').value = p && p.partida ? p.partida : '';
  document.getElementById('prod-contrato').value = p && p.contrato ? p.contrato : '';
  document.getElementById('prod-unidad').value = p ? p.unidad : '';
  document.getElementById('prod-descripcion').value = p ? p.descripcion : '';
  document.getElementById('prod-precio').value = p ? p.precio : '';
  const minInput = document.getElementById('prod-stock-minimo');
  if (minInput) minInput.value = p && typeof window.wrMin === 'function' ? window.wrMin(p) : 5;
  const stockInput = document.getElementById('prod-cantidad');
  stockInput.value = p ? p.cantidad : '';
  stockInput.readOnly = !!p;
  stockInput.title = p ? 'Para aumentar existencias use el boton Dar entrada.' : 'Stock inicial del producto';
  const oldNote = document.getElementById('prod-stock-note');
  if (oldNote) oldNote.remove();
  if (p) {
    const note = document.createElement('div');
    note.id = 'prod-stock-note';
    note.className = 'stock-readonly-note';
    note.innerHTML = '<i class="fas fa-circle-info"></i> Para agregar existencias use <strong>Dar entrada</strong> desde Inventario.';
    stockInput.parentElement.appendChild(note);
  }
  document.getElementById('prod-factura').value = p && p.factura ? p.factura : ''; 
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('prod-fecha-entrada').value = p && p.fecha_entrada ? p.fecha_entrada : today;
  
  document.getElementById('btn-delete-prod').style.setProperty('display', p && userHasPermission('inventory.delete') ? 'inline-flex' : 'none', 'important');
  openModal('modal-producto');
}

function saveProduct() {
  const id = document.getElementById('prod-id').value;
  if (!requirePermission(id ? 'inventory.edit' : 'inventory.create')) return;
  const clave = fixTextForExcel(document.getElementById('prod-clave').value);
  const partida = fixTextForExcel(document.getElementById('prod-partida').value);
  const contrato = fixTextForExcel(document.getElementById('prod-contrato').value);
  const unidad = fixTextForExcel(document.getElementById('prod-unidad').value);
  const descripcion = fixTextForExcel(document.getElementById('prod-descripcion').value);
  const factura = fixTextForExcel(document.getElementById('prod-factura').value);
  const fechaEntrada = document.getElementById('prod-fecha-entrada').value || (factura ? todayISO() : '');
  const precio = Number(document.getElementById('prod-precio').value);
  const qty = Number(document.getElementById('prod-cantidad').value);
  const minRaw = document.getElementById('prod-stock-minimo')?.value;
  const stockMinimo = minRaw === '' || minRaw == null ? 5 : Number(minRaw);

  if (!clave || !descripcion || !unidad) {
    showToast('Complete clave, descripcion y unidad', 'error');
    return;
  }
  if (!Number.isFinite(precio) || precio < 0 || !Number.isFinite(qty) || qty < 0) {
    showToast('Precio y stock deben ser numeros validos y no negativos', 'error');
    return;
  }
  if (!Number.isInteger(stockMinimo) || stockMinimo < 0) {
    showToast('El stock mínimo debe ser un número entero igual o mayor que cero', 'error');
    return;
  }

  const now = Date.now();
  const d = { clave, partida, contrato, unidad, descripcion, precio, cantidad: qty, factura, fecha_entrada: fechaEntrada, updatedAt: now };

  if (id) {
    const i = products.findIndex(x => String(x.id) === String(id));
    if (i < 0) { showToast('Material no encontrado', 'error'); return; }
    const currentQty = Number(products[i].cantidad) || 0;
    products[i] = { ...products[i], ...d, cantidad: currentQty };
  } else {
    const newP = { id: now, bloqueado: false, ...d };
    products.push(newP);
    if (qty > 0) addMov('ENTRADA', newP.id, qty, 'Nuevo producto', factura, '', { fecha_factura: fechaEntrada });
  }

  const savedProduct = id ? products.find(x => String(x.id) === String(id)) : products[products.length - 1];
  if (savedProduct && typeof window.wrSetMin === 'function') {
    window.wrSetMin(savedProduct, stockMinimo);
  }

  closeModal('modal-producto');
  broadcastFullSync();
  renderInventario();
  renderDashboard();
  showToast('Material guardado y sincronizado');
}

function openEntradaModal(id) {
  if (!requirePermission('inventory.edit')) return;
  const p = products.find(x => String(x.id) === String(id));
  if (!p) { showToast('Material no encontrado', 'error'); return; }

  document.getElementById('entrada-prod-id').value = p.id;
  document.getElementById('entrada-clave').textContent = p.clave || 'N/A';
  document.getElementById('entrada-descripcion').value = p.descripcion || '';
  document.getElementById('entrada-stock-actual').textContent = Number(p.cantidad) || 0;
  document.getElementById('entrada-stock-resultante').textContent = Number(p.cantidad) || 0;
  document.getElementById('entrada-cantidad').value = '';
  document.getElementById('entrada-factura').value = '';
  document.getElementById('entrada-fecha').value = todayISO();
  document.getElementById('entrada-precio').value = Number(p.precio) || 0;
  document.getElementById('entrada-nota').value = 'Entrada de material / compra';
  openModal('modal-entrada-producto');
  setTimeout(() => document.getElementById('entrada-cantidad')?.focus(), 50);
}

function updateEntradaPreview() {
  const id = document.getElementById('entrada-prod-id').value;
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;
  const actual = Number(p.cantidad) || 0;
  const entrada = Number(document.getElementById('entrada-cantidad').value) || 0;
  document.getElementById('entrada-stock-actual').textContent = actual;
  document.getElementById('entrada-stock-resultante').textContent = actual + Math.max(entrada, 0);
}

function saveProductEntry() {
  if (!requirePermission('inventory.edit')) return;
  const id = document.getElementById('entrada-prod-id').value;
  const p = products.find(x => String(x.id) === String(id));
  if (!p) { showToast('Material no encontrado', 'error'); return; }

  const qty = Number(document.getElementById('entrada-cantidad').value);
  const factura = fixTextForExcel(document.getElementById('entrada-factura').value);
  const fecha = document.getElementById('entrada-fecha').value || todayISO();
  const priceRaw = document.getElementById('entrada-precio').value;
  const precio = priceRaw === '' ? Number(p.precio) || 0 : Number(priceRaw);
  const nota = fixTextForExcel(document.getElementById('entrada-nota').value) || 'Entrada de material';

  if (!Number.isFinite(qty) || qty <= 0) {
    showToast('Ingrese una cantidad de entrada mayor que cero', 'error');
    return;
  }
  if (!Number.isFinite(precio) || precio < 0) {
    showToast('El precio debe ser un numero valido y no negativo', 'error');
    return;
  }

  p.cantidad = (Number(p.cantidad) || 0) + qty;
  p.precio = precio;
  if (factura) p.factura = factura;
  p.fecha_entrada = fecha;
  p.updatedAt = Date.now();

  addMov('ENTRADA', p.id, qty, nota, factura, '', { fecha_factura: fecha });
  closeModal('modal-entrada-producto');
  broadcastFullSync();
  renderInventario();
  renderDashboard();
  renderMovimientos();
  renderKardex();
  showToast(`Entrada registrada: +${qty} ${p.unidad || 'unidad(es)'}`);
}

function deleteProduct() {
  if (!requirePermission('inventory.delete')) return;

  const id = document.getElementById('prod-id').value;
  if (confirm('¿Eliminar este material del catalogo?')) { 
    const target = products.find(x => x.id == id);
    products = products.filter(x => x.id != id); 
    markDeleted(deletedProducts, target ? target.id : id);
    closeModal('modal-producto'); 
    broadcastFullSync();
    renderInventario(); 
    showToast('Material eliminado', 'error'); 
  }
}

// INVENTARIO FÍSICO
function filterInvFisico() { ifPage = 1; renderInvFisico(); }

function getInvFisicoFiltradoOrdenado() {
  const q = document.getElementById('if-search').value.trim();
  const list = products.filter(p => productMatchesSearch(p, q));
  return sortInventarioList(list, 'if-sort');
}

function renderInvFisico() {
  const list = getInvFisicoFiltradoOrdenado();
  const start = (ifPage-1)*ifPerPage;
  document.getElementById('if-tbody').innerHTML = list.slice(start, start+ifPerPage).map(p => {
    const val = ifCounts[p.id] !== undefined ? ifCounts[p.id] : '';
    const diff = val !== '' ? (val - p.cantidad) : 0;
    return `<tr>
      <td><span class="clave-cell">${esc(p.clave)}</span></td>
      <td>${esc(p.descripcion)}</td>
      <td>${p.cantidad}</td>
      <td><input type="number" value="${val}" oninput="ifCounts[${p.id}]=parseFloat(this.value)||0; renderInvFRow(${p.id},${p.cantidad},this)" style="width:80px; padding:5px; border:1px solid #ddd; border-radius:4px; text-align:center;"></td>
      <td id="if-diff-${p.id}" style="font-weight:700; color:${diff>0?'#059669':diff<0?'#ef4444':'#64748b'}">${val !== '' ? (diff > 0 ? '+'+diff : diff) : '—'}</td>
    </tr>`;
  }).join('');
  renderPagination('if-pagination', ifPage, Math.ceil(list.length/ifPerPage), 'setIfPage');
}

function renderInvFRow(id, sys, el) { 
  const d = ifCounts[id] - sys; 
  const c = document.getElementById('if-diff-'+id); 
  if (!c) return;
  c.textContent = d > 0 ? '+'+d : d; 
  c.style.color = d > 0 ? '#059669' : d < 0 ? '#ef4444' : '#64748b'; 
}

function resetInvFisico() { if (!requirePermission('physical.manage')) return; ifCounts = {}; renderInvFisico(); }

function applyInvFisico() {
  if (!requirePermission('physical.manage')) return;
   
  if (confirm('¿Actualizar stock del sistema con el conteo fisico?')) { 
    const now = Date.now();
    Object.keys(ifCounts).forEach(id => { 
      const p = products.find(x => x.id == id); 
      if (p) {
        const diff = ifCounts[id] - p.cantidad;
        if (diff !== 0) addMov(diff > 0 ? 'ENTRADA' : 'SALIDA', id, Math.abs(diff), "Inv. Fisico");
        p.cantidad = ifCounts[id]; 
        p.updatedAt = now;
      }
    }); 
    ifCounts = {}; 
    broadcastFullSync(); 
    renderInvFisico(); 
    renderDashboard();
    showToast('Inventario fisico actualizado'); 
  } 
}

// BÚSQUEDA Y CARRITO DE COMPRAS
function searchVentaProduct() {
  const input = document.getElementById('venta-search-prod');
  const acList = document.getElementById('venta-ac-list');
  const q = input.value.trim();

  if (q.length < 2) {
    ventaSearchResults = [];
    acList.style.display = 'none';
    acList.innerHTML = '';
    return;
  }

  const queryNorm = normalizeSearchText(q);
  const results = products
    .filter(p => productMatchesSearch(p, queryNorm))
    .sort((a, b) => {
      const ad = normalizeSearchText(a.descripcion);
      const bd = normalizeSearchText(b.descripcion);
      const ac = normalizeSearchText(a.clave);
      const bc = normalizeSearchText(b.clave);

      const aStarts = ad.startsWith(queryNorm) || ac.startsWith(queryNorm);
      const bStarts = bd.startsWith(queryNorm) || bc.startsWith(queryNorm);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;

      const aStock = Number(a.cantidad) > 0 && !a.bloqueado;
      const bStock = Number(b.cantidad) > 0 && !b.bloqueado;
      if (aStock !== bStock) return aStock ? -1 : 1;

      return ad.localeCompare(bd, 'es', { numeric: true, sensitivity: 'base' });
    });

  ventaSearchResults = results;

  if (!results.length) {
    acList.innerHTML = '<div class="ac-item" style="cursor:default; color:#64748b;">Sin resultados. Revise la clave o una palabra de la descripcion.</div>';
    acList.style.display = 'block';
    return;
  }

  acList.innerHTML = results.map(p => {
    const out = Number(p.cantidad) <= 0;
    const blocked = p.bloqueado === true;
    return `<div class="ac-item ${(out || blocked) ? 'out-of-stock' : ''}" onclick="addVentaItem(${p.id})">
      <strong>${esc(p.descripcion)}</strong>${p.contrato ? ` <span class="ac-contract">Contrato: ${esc(p.contrato)}</span>` : ''} ${blocked ? '<span style="font-weight:bold; color:#b91c1c;">[BLOQUEADO]</span>' : (out ? '<span style="font-weight:bold; color:#ef4444;">[AGOTADO]</span>' : '')}<br>
      <small>${esc(p.clave)}${p.partida ? ` | Partida: ${esc(p.partida)}` : ''} | Unidad: ${esc(p.unidad || 'PIEZA')} | $${fmt(p.precio)} | Stock: ${p.cantidad}${blocked ? ' | NO DISPONIBLE' : ''}</small>
    </div>`;
  }).join('') + `<div class="ac-item" style="cursor:default; text-align:center; color:#64748b; font-size:0.8rem;">${results.length} resultado(s)</div>`;
  acList.style.display = 'block';
}

function getStockDisponibleParaVenta(productId) {
  const p = products.find(x => x.id == productId) || {};
  let disponible = Number(p.cantidad) || 0;

  if (editingVentaId) {
    const oldVenta = ventas.find(v => v.id === editingVentaId);
    if (oldVenta) {
      disponible += (oldVenta.items || [])
        .filter(i => String(i.productId) === String(productId))
        .reduce((sum, i) => sum + (Number(i.cantidad) || 0), 0);
    }
  }

  return disponible;
}

function addVentaItem(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) { showToast('Material no encontrado', 'error'); return; }
  if (p.bloqueado) { showToast('Este material esta BLOQUEADO y no puede seleccionarse', 'error'); return; }
  const disponible = getStockDisponibleParaVenta(id);
  if (disponible <= 0) { showToast('Material sin existencias', 'error'); return; }

  const ex = ventaItems.find(i => String(i.productId) === String(id));
  if (ex) {
    if ((Number(ex.cantidad) || 0) + 1 > disponible) { showToast('Stock insuficiente', 'error'); return; }
    ex.cantidad = (Number(ex.cantidad) || 0) + 1;
  } else {
    ventaItems.push({
      productId: p.id,
      clave: p.clave,
      partida: p.partida || '',
      contrato: p.contrato || '',
      descripcion: p.descripcion,
      unidad: p.unidad || 'PIEZA',
      precio: Number(p.precio) || 0,
      cantidad: 1
    });
  }

  ventaSearchResults = [];
  document.getElementById('venta-ac-list').style.display = 'none';
  document.getElementById('venta-search-prod').value = '';
  renderVentaItems();
  showToast('Material agregado');
}

function diagnosticarFoliosMes(folio, fecha) {
  const monthKey = getVentaYearMonth(fecha);
  const folioKey = normalizeSearchText(folio).replace(/\s+/g, ' ');
  const encontrados = [
    ...(Array.isArray(ventas) ? ventas.map(v => ({ ...v, _recordType: 'venta' })) : []),
    ...(Array.isArray(valesManuales) ? valesManuales.map(v => ({ ...v, _recordType: 'vale' })) : [])
  ].filter(v => {
    if (!v) return false;
    if (v._recordType === 'venta' && isTombstoned(deletedVentas, v)) return false;
    if (v._recordType === 'vale' && isTombstoned(deletedValesManuales, v)) return false;
    return normalizeSearchText(v.folio).replace(/\s+/g, ' ') === folioKey
      && getVentaYearMonth(v.fecha) === monthKey;
  }).map(v => ({
    id: v.id,
    tipoRegistro: v._recordType,
    folio: v.folio,
    fecha: v.fecha,
    cliente: v.cliente || v.trabajador,
    updatedAt: v.updatedAt
  }));

  console.table(encontrados);
  return encontrados;
}

// Un folio puede volver a utilizarse en meses diferentes (por ejemplo,
// F-010 en enero y nuevamente F-010 en febrero), pero NO puede repetirse
// dentro del mismo mes. La regla aplica por igual a Venta y Vale Manual.
function findDuplicateFolioInSameMonth(folio, fecha, recordType = '', recordId = null) {
  const monthKey = getVentaYearMonth(fecha);
  const folioKey = normalizeSearchText(folio).replace(/\s+/g, ' ');
  if (!monthKey || !folioKey) return null;

  const records = [
    ...(Array.isArray(ventas) ? ventas.map(v => ({ ...v, _recordType: 'venta' })) : []),
    ...(Array.isArray(valesManuales) ? valesManuales.map(v => ({ ...v, _recordType: 'vale' })) : [])
  ];

  return records.find(v => {
    if (!v) return false;
    if (v._recordType === 'venta' && isTombstoned(deletedVentas, v)) return false;
    if (v._recordType === 'vale' && isTombstoned(deletedValesManuales, v)) return false;

    // Al editar, el mismo registro no debe bloquearse a sí mismo.
    if (recordType && v._recordType === recordType && String(v.id) === String(recordId ?? '')) return false;

    const existingFolioKey = normalizeSearchText(v.folio).replace(/\s+/g, ' ');
    return !!existingFolioKey
      && existingFolioKey === folioKey
      && getVentaYearMonth(v.fecha) === monthKey;
  }) || null;
}

// Folio compartido para TODAS las modalidades de salida/venta.
// Cualquier pantalla que registre una operación nueva debe pasar por esta
// misma reserva atómica para que el orden sea único, sin importar qué opción
// se utilizó primero.
async function reserveNextSharedFolio(requestedFolio, token) {
  if (!initFirebase()) return null;
  if (!firebaseRoomRef) await firebaseConnectRoom();
  if (!firebaseRoomRef) return null;
  // Si ya se agotó el tiempo de espera, no se inicia ninguna transacción.
  if (token && token.cancelled) return null;

  const requestedNumber = getFolioNumber(requestedFolio);
  if (!requestedNumber) return null;

  // El folio visible/solicitado es la autoridad del consecutivo. No usar
  // el máximo histórico como referencia: pueden existir registros antiguos
  // (por ejemplo F-431) aunque el consecutivo actual sea F-204. Usar el
  // historial aquí provoca que la reserva salte indebidamente a F-431.
  const localCeiling = requestedNumber;
  const MAX_GAP = 25;

  try {
    const roomRef = firebaseDB.ref(getFirebaseRoomPath());
    const sequenceRef = roomRef.child('folioSequence');
    // Migración compatible: si aún no existe el contador nuevo, tomar el valor
    // heredado de data/folioSequence antes de iniciar la transacción atómica.
    const legacySnap = await roomRef.child('data/folioSequence').once('value');
    const legacyNumber = Number(legacySnap.val()) || 0;
    const result = await sequenceRef.transaction(current => {
      // Si la espera ya se canceló, se aborta: no se consume ningún número.
      if (token && token.cancelled) return;
      let currentNumber = Math.max(Number(current) || 0, legacyNumber);
      if (currentNumber > localCeiling + MAX_GAP) {
        console.warn('[FOLIO] Contador remoto inflado (' + currentNumber + '); se corrige a ' + (localCeiling - 1));
        currentNumber = localCeiling - 1;
      }
      // El número solicitado es el que está mostrando el sistema. Si otro
      // equipo ya lo reservó, el siguiente disponible se toma automáticamente.
      return Math.max(currentNumber, requestedNumber - 1) + 1;
    }, undefined, false);

    if (!result.committed) return null;
    if (token && token.cancelled) return null;
    const reservedNumber = Number(result.snapshot.val()) || 0;
    return reservedNumber > 0 ? buildFolioFromNumber(reservedNumber, requestedFolio) : null;
  } catch (e) {
    console.warn('[FOLIO] No se pudo reservar en Firebase; se usa respaldo local.', e);
    return null;
  }
}

// Reserva con tiempo límite real: al vencer, la transacción pendiente se cancela
// (no queda "viva" subiendo el contador minutos después).
async function reserveSharedFolioWithTimeout(requestedFolio, ms = 5000) {
  const token = { cancelled: false };
  let timer = null;
  try {
    return await Promise.race([
      reserveNextSharedFolio(requestedFolio, token),
      new Promise(resolve => { timer = setTimeout(() => { token.cancelled = true; resolve(null); }, ms); })
    ]);
  } catch (e) {
    token.cancelled = true;
    console.warn('[FOLIO] Falló la reserva remota.', e);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Compatibilidad con llamadas antiguas: siempre apunta al mismo contador.
async function reserveNextFolioFromFirebase(requestedFolio) {
  return reserveNextSharedFolio(requestedFolio);
}

function getFolioNumber(folio) {
  const match = String(folio || '').match(/(\d+)\s*$/);
  return match ? (parseInt(match[1], 10) || 0) : 0;
}

function buildFolioFromNumber(number, referenceFolio = currentFolio) {
  const ref = String(referenceFolio || currentFolio || 'F-001');
  const prefix = ref.replace(/\d+\s*$/, '') || 'F-';
  return prefix + String(Math.max(1, Number(number) || 1)).padStart(3, '0');
}

function getHighestActiveFolioNumber() {
  let max = Math.max(0, getFolioNumber(currentFolio) - 1);
  (Array.isArray(ventas) ? ventas : []).forEach(v => {
    if (!v || isTombstoned(deletedVentas, v)) return;
    max = Math.max(max, getFolioNumber(v.folio));
  });
  (Array.isArray(valesManuales) ? valesManuales : []).forEach(v => {
    if (!v || isTombstoned(deletedValesManuales, v)) return;
    max = Math.max(max, getFolioNumber(v.folio));
  });
  return max;
}

async function prepareFolioForNewVenta(capturedFolio) {
  const normalizedCaptured = fixTextForExcel(capturedFolio || currentFolio);
  const normalizedCurrent = fixTextForExcel(currentFolio);
  const isAutomatic = normalizeSearchText(normalizedCaptured) === normalizeSearchText(normalizedCurrent);

  // Si el usuario estableció manualmente el folio (por ejemplo F-001),
  // ese valor es el que debe guardarse. No debe ser sustituido por la
  // secuencia remota (por ejemplo F-005) al finalizar la Venta.
  if (folioManualOverrideActive) return normalizedCaptured;

  if (!isAutomatic) return normalizedCaptured;

  // En línea: Firebase asigna el consecutivo de forma atómica. Algunas
  // conexiones dejan la transacción pendiente indefinidamente; no debemos
  // bloquear el botón Finalizar Compra por esperar a Firebase.
  const reserved = await reserveSharedFolioWithTimeout(normalizedCurrent, 5000);
  if (reserved) return reserved;

  // Respaldo local cuando Firebase está desconectado o tarda demasiado.
  // Mantiene el consecutivo mostrado; el historial se usa para detectar
  // duplicados, no para saltar el contador a un folio antiguo como F-431.
  const nextNumber = Math.max(1, getFolioNumber(normalizedCurrent));
  return buildFolioFromNumber(nextNumber, normalizedCurrent);
}

let _guardandoVenta = false;
async function saveVenta() {
  const salePermission = (editingVentaId !== null && editingVentaId !== undefined) ? 'purchases.edit' : 'purchases.create';
  if (!requirePermission(salePermission)) return;
  // Candado: evita que varios clics ejecuten varios guardados a la vez.
  if (_guardandoVenta) return;
  _guardandoVenta = true;
  const btn = document.getElementById('venta-save-btn');
  if (btn) btn.disabled = true;
  try {
    await _saveVentaCore();
  } catch (e) {
    console.error('Error al guardar la compra:', e);
    showToast('No se pudo completar el guardado: ' + (e && e.message ? e.message : 'error desconocido'), 'error');
  } finally {
    _guardandoVenta = false;
    if (btn) btn.disabled = false;
  }
}

async function _saveVentaCore() {
  if (!ventaItems.length) { showToast('Agregue materiales', 'error'); return; }

  // Protección defensiva: nunca validar folios contra compras eliminadas.
  ventas = applyTombstones(ventas, deletedVentas);

  const capturedFolio = fixTextForExcel(document.getElementById('venta-folio-input').value || currentFolio);
  const wasManualFolioOverride = !!folioManualOverrideActive;
  const fecha = document.getElementById('venta-fecha').value;
  const cliente = fixTextForExcel(document.getElementById('venta-cliente').value || 'Sin especificar');
  const compra = fixTextForExcel(document.getElementById('venta-compra').value || '');
  if (!capturedFolio) { showToast('Ingrese un folio valido', 'error'); return; }
  if (!fecha) { showToast('Seleccione la fecha', 'error'); return; }

  const isEditing = editingVentaId !== null && editingVentaId !== undefined;
  let folio = capturedFolio;

  // Primero se validan los materiales/stock; así no se gasta un folio si hay un error.
  const cleanVentaItems = [];
  for (const item of ventaItems) {
    const prod = products.find(x => String(x.id) === String(item.productId));
    const cantidad = Number(item.cantidad);
    const precio = Number(item.precio);
    if (!prod) { showToast(`No se encontro el material ${item.clave || ''}`, 'error'); return; }
    if (prod.bloqueado) { showToast(`El material ${prod.descripcion} esta bloqueado`, 'error'); return; }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { showToast('Todas las cantidades deben ser mayores que cero', 'error'); return; }
    if (!Number.isFinite(precio) || precio < 0) { showToast('Se detecto un precio invalido', 'error'); return; }
    const disponible = getStockDisponibleParaVenta(item.productId);
    if (cantidad > disponible) { showToast(`Stock insuficiente para ${prod.descripcion}`, 'error'); return; }
    cleanVentaItems.push({
      ...item,
      clave: fixTextForExcel(item.clave || prod.clave),
      partida: fixTextForExcel(item.partida || prod.partida || ''),
      contrato: fixTextForExcel(item.contrato || prod.contrato || ''),
      descripcion: fixTextForExcel(item.descripcion || prod.descripcion),
      unidad: fixTextForExcel(item.unidad || prod.unidad || 'PIEZA'),
      precio,
      cantidad
    });
  }

  // Para una compra nueva, si el usuario dejó el folio automático, se reserva
  // antes de validar/guardar. Así el consecutivo no depende del reloj de cada PC.
  if (!isEditing) {
    folio = await prepareFolioForNewVenta(capturedFolio);
    const folioInput = document.getElementById('venta-folio-input');
    if (folioInput) folioInput.value = folio;
  }

  const ventaYearMonth = getVentaYearMonth(fecha);
  if (!ventaYearMonth) {
    showToast('La fecha de la compra no tiene un formato valido', 'error');
    return;
  }

  // VALIDACION DEFINITIVA DEL FOLIO.
  // El mismo folio SI puede existir en meses anteriores, pero nunca puede
  // repetirse dentro del mismo mes. La validación incluye Venta y Vale Manual.
  const duplicateFolio = findDuplicateFolioInSameMonth(
    folio,
    fecha,
    'venta',
    editingVentaId
  );

  if (duplicateFolio) {
    console.warn('[FOLIO DUPLICADO EN EL MISMO MES]', {
      folioCapturado: folio,
      fechaCapturada: fecha,
      mesDetectado: ventaYearMonth,
      registroEncontrado: {
        tipo: duplicateFolio._recordType,
        id: duplicateFolio.id,
        folio: duplicateFolio.folio,
        fecha: duplicateFolio.fecha,
        cliente: duplicateFolio.cliente || duplicateFolio.trabajador,
        updatedAt: duplicateFolio.updatedAt
      }
    });

    showToast(
      `El folio ${folio} ya existe en ${ventaYearMonth} (${duplicateFolio.fecha}). En otro mes sí puede repetirse.`,
      'error'
    );
    return;
  }

  const now = Date.now();
  const v = {
    id: isEditing ? editingVentaId : now,
    folio,
    fecha,
    cliente,
    compra,
    items: cleanVentaItems,
    total: cleanVentaItems.reduce((s, i) => s + i.cantidad * i.precio, 0),
    updatedAt: now
  };

  let old = null;
  if (isEditing) {
    const oldIndex = ventas.findIndex(x => String(x.id) === String(editingVentaId));
    if (oldIndex < 0) { showToast('No se encontro la compra a modificar', 'error'); return; }
    old = ventas[oldIndex];
    (old.items || []).forEach(i => {
      const p = products.find(x => String(x.id) === String(i.productId));
      if (p) {
        p.cantidad = (Number(p.cantidad) || 0) + (Number(i.cantidad) || 0);
        p.updatedAt = now;
      }
    });
    ventas[oldIndex] = v;
  } else {
    ventas.unshift(v);
    // El folio siguiente siempre se calcula a partir del folio realmente
    // utilizado, nunca a partir de un valor que pudiera quedar obsoleto.
    currentFolio = buildFolioFromNumber(getFolioNumber(folio) + 1, folio);
    currentFolioUpdatedAt = Date.now();
    // Persistir inmediatamente el siguiente folio evita que otra opción o
    // una recarga vuelva a mostrar el número anterior.
    await idbSetMeta('folio', currentFolio);
    localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt));
    document.getElementById('folio-val').textContent = currentFolio;
  }

  v.items.forEach(i => {
    const p = products.find(x => String(x.id) === String(i.productId));
    if (p) {
      p.cantidad = (Number(p.cantidad) || 0) - i.cantidad;
      p.updatedAt = now;
    }
    if (!isEditing) addMov('SALIDA', i.productId, i.cantidad, 'Entrega / Compra', v.folio, v.cliente);
  });

  if (isEditing) {
    logVentaModificada(old, v);
    const qtyByProduct = new Map();
    (old.items || []).forEach(i => qtyByProduct.set(String(i.productId),(qtyByProduct.get(String(i.productId))||0)+(Number(i.cantidad)||0)));
    (v.items || []).forEach(i => qtyByProduct.set(String(i.productId),(qtyByProduct.get(String(i.productId))||0)-(Number(i.cantidad)||0)));
    qtyByProduct.forEach((delta,pid) => {
      if (Math.abs(delta) < 1e-9) return;
      const prod = products.find(x => String(x.id) === String(pid));
      if (!prod) return;
      const movementType = delta > 0 ? 'ENTRADA' : 'SALIDA';
      const amount = Math.abs(delta);
      addMov(movementType,pid,amount,`Corrección por modificación de compra ${v.folio}`,v.folio,v.cliente,{kardexSource:'CORRECCION_VENTA'});
    });
  }

  clearVenta();
  if (!isEditing && wasManualFolioOverride) {
    folioManualOverrideActive = false;
    await idbSetMeta('folio_manual_override', false);
  }

  // Guardar primero la copia local. La ventana de impresión no debe esperar
  // a que termine la lectura/escritura de Firebase.
  await saveLocalData();

  renderDashboard();
  renderHistorialVentas();
  showToast(isEditing ? 'Registro modificado' : 'Compra registrada y sincronizada');
  viewVenta(v.id);

  // Firebase continúa en segundo plano para que la opción de imprimir aparezca
  // inmediatamente. Si tarda o falla, la copia local ya quedó guardada.
  broadcastFullSync(false, true).catch(e => {
    console.error('Sincronización en segundo plano de la compra:', e);
  });
}

function resumirItemsVenta(items) {
  const map = new Map();
  (items || []).forEach(i => {
    const key = String(i.productId);
    const prev = map.get(key) || { item: i, cantidad: 0 };
    prev.cantidad += parseFloat(i.cantidad) || 0;
    prev.item = { ...prev.item, ...i, cantidad: prev.cantidad };
    map.set(key, prev);
  });
  return map;
}

function logVentaModificada(oldVenta, newVenta) {
  const oldMap = resumirItemsVenta(oldVenta.items);
  const newMap = resumirItemsVenta(newVenta.items);
  const ids = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]));
  let cambiosStock = 0;

  ids.forEach(id => {
    const oldReg = oldMap.get(id);
    const newReg = newMap.get(id);
    const oldQty = oldReg ? oldReg.cantidad : 0;
    const newQty = newReg ? newReg.cantidad : 0;
    const diff = newQty - oldQty;
    if (diff === 0) return;

    const item = (newReg && newReg.item) || (oldReg && oldReg.item) || {};
    const unidad = fixTextForExcel(item.unidad || 'PIEZA');
    let detalle = '';
    if (oldQty === 0) detalle = `Material agregado a compra modificada: ${newQty} ${unidad}. Stock disminuye.`;
    else if (newQty === 0) detalle = `Material retirado de compra modificada: ${oldQty} ${unidad}. Stock aumenta.`;
    else if (diff > 0) detalle = `Compra modificada: aumento de ${oldQty} a ${newQty} ${unidad}. Stock disminuye ${Math.abs(diff)}.`;
    else detalle = `Compra modificada: bajo de ${oldQty} a ${newQty} ${unidad}. Stock aumenta ${Math.abs(diff)}.`;

    addMov('MODIFICADA', item.productId || id, Math.abs(diff), detalle, newVenta.folio, newVenta.cliente);
    cambiosStock++;
  });

  const cambioDatos =
    fixTextForExcel(oldVenta.folio || '') !== fixTextForExcel(newVenta.folio || '') ||
    fixTextForExcel(oldVenta.cliente || '') !== fixTextForExcel(newVenta.cliente || '') ||
    fixTextForExcel(oldVenta.compra || '') !== fixTextForExcel(newVenta.compra || '') ||
    fixTextForExcel(oldVenta.fecha || '') !== fixTextForExcel(newVenta.fecha || '');

  if (!cambiosStock && cambioDatos) {
    addMov('MODIFICADA', '', 0, 'Compra modificada: se actualizaron datos generales.', newVenta.folio, newVenta.cliente, { clave: '—', desc: 'Modificacion sin cambio de stock' });
  }
}

function getMovimientoFolio(m) {
  const direct = String(m && m.folio ? m.folio : '').trim();
  if (direct) return direct;
  const note = String(m && m.note ? m.note : '');
  const match = note.match(/\b(C|F)[-\s]?\d+\b/i);
  return match ? match[0].replace(/\s+/g, '').toUpperCase() : '';
}

function getMovimientoCliente(m) {
  const saved = String(m && m.cliente ? m.cliente : '').trim();
  if (saved) return saved;
  const folio = getMovimientoFolio(m).toLowerCase();
  if (!folio) return '';
  const venta = ventas.find(v => String(v.folio || '').toLowerCase() === folio);
  return venta ? String(venta.cliente || '') : '';
}

function syncMovimientoClientesFromVentas() {
  let changed = false;
  movimientos.forEach(m => {
    const cliente = getMovimientoCliente(m);
    const folio = getMovimientoFolio(m);
    if (cliente && m.cliente !== cliente) { m.cliente = cliente; changed = true; }
    if (folio && m.folio !== folio) { m.folio = folio; changed = true; }
  });
}

function getMovimientoContratoPartida(m) {
  const p = products.find(x => String(x.id) === String(m.productId))
    || products.find(x => normalizeSearchText(x.clave) === normalizeSearchText(m.clave)) || {};
  return {
    contrato: fixTextForExcel(m.contrato || p.contrato || ''),
    partida: fixTextForExcel(m.partida || p.partida || '')
  };
}

function getMovTimestamp(m) {
  if (m.updatedAt) return Number(m.updatedAt);
  if (Number(m.id) && Number(m.id) > 1000000000000) return Number(m.id);
  const p = Date.parse(m.date);
  return !isNaN(p) ? p : 0;
}

function renderMovimientos() {
  const rawQ = document.getElementById('mov-search').value.trim();
  const q = normalizeSearchText(rawQ);
  const words = q.split(/\s+/).filter(Boolean);
  const f = document.getElementById('mov-type-filter').value;
  const sortMode = document.getElementById('mov-sort')?.value || 'reciente';

  const filtered = movimientos.filter(m => {
    const cliente = getMovimientoCliente(m);
    const folio = getMovimientoFolio(m);
    const tipo = getMovementTypeLabel(m.type);
    const cp = getMovimientoContratoPartida(m);
    const haystack = [m.desc, m.clave, m.note, cp.contrato, cp.partida, folio, cliente, tipo, m.user].map(normalizeSearchText).join(' ');
    const matchesQ = !words.length || words.every(word => haystack.includes(word));
    const matchesF = f === 'all' || tipo === f;
    return matchesQ && matchesF;
  });

  filtered.sort((a, b) => {
    if (sortMode === 'qty-desc') return (Number(b.qty) || 0) - (Number(a.qty) || 0);
    if (sortMode === 'qty-asc') return (Number(a.qty) || 0) - (Number(b.qty) || 0);
    const diff = getMovTimestamp(b) - getMovTimestamp(a);
    return sortMode === 'antiguo' ? -diff : diff;
  });

  document.getElementById('mov-tbody').innerHTML = filtered.slice(0, 150).map(m => {
    const cliente = getMovimientoCliente(m);
    const folio = getMovimientoFolio(m);
    const tipo = getMovementTypeLabel(m.type);
    const cp = getMovimientoContratoPartida(m);
    const refLabel = tipo === 'SALIDA' ? 'Folio' : (tipo === 'MODIFICADA' ? 'Folio' : 'Ref.');
    return `
      <tr>
        <td><small>${esc(m.date)}</small></td>
        <td><span class="badge ${getMovementBadgeClass(tipo)}">${esc(tipo)}</span></td>
        <td><span class="clave-cell" style="font-size:0.85rem;">${esc(m.clave)}</span></td>
        <td>${esc(m.desc)}<br>${(cp.contrato || cp.partida) ? `<small class="clave-meta">${cp.contrato ? `Contrato: ${esc(cp.contrato)}` : ''}${cp.contrato && cp.partida ? ' · ' : ''}${cp.partida ? `Partida: ${esc(cp.partida)}` : ''}</small>` : ''}<small style="color:#64748b">${esc(m.note)}</small></td>
        <td><strong>${esc(cliente || '—')}</strong>${folio ? `<br><small style="color:#64748b">${refLabel}: ${esc(folio)}</small>` : ''}</td>
        <td style="font-weight:700;">${Number(m.qty) ? m.qty : '—'}</td>
        <td><small style="font-weight:700; color:#064e3b;">${esc(m.user || 'Sistema')}</small></td>
        <td data-permission="movements.edit"><div style="display:flex; gap:5px;">
          <button class="btn btn-outline btn-sm" onclick="openMovModal('${m.id}')"><i class="fas fa-eye"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteMov('${m.id}')"><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>
    `;
  }).join('');
  applyGranularPermissions();
}

function ensureKardexBaseline(product, stockOverride) {
  if (!product || product.kardexOpeningQty !== undefined) return;
  product.kardexOpeningQty = Math.max(0, Number(stockOverride !== undefined ? stockOverride : product.cantidad) || 0);
  product.kardexOpeningCost = Math.max(0, Number(product.precio) || 0);
  product.kardexOpeningDate = todayISO();
  product.kardexBaselineNote = 'Saldo inicial al activar Kardex; costo tomado del campo Precio del inventario.';
  product.kardexUpdatedAt = Date.now();
}

function calculateKardexProductState(productId) {
  const p = products.find(x => String(x.id) === String(productId));
  if (!p) return {quantity:0, averageCost:0, value:0};
  ensureKardexBaseline(p);
  let quantity = Math.max(0, Number(p.kardexOpeningQty) || 0);
  let averageCost = Math.max(0, Number(p.kardexOpeningCost) || 0);
  const ledger = movimientos.filter(m => String(m.productId) === String(productId) && m.kardexVersion === 1)
    .sort((a,b) => (Number(a.kardexTimestamp || a.timestamp || a.updatedAt) || 0) - (Number(b.kardexTimestamp || b.timestamp || b.updatedAt) || 0));
  ledger.forEach(m => {
    const q = Math.abs(Number(m.qty) || 0);
    if (getMovementTypeLabel(m.type) === 'ENTRADA') {
      const c = Math.max(0, Number(m.unitCost) || 0);
      const nextQty = quantity + q;
      if (nextQty > 0) averageCost = ((quantity * averageCost) + (q * c)) / nextQty;
      quantity = nextQty;
    } else if (getMovementTypeLabel(m.type) === 'SALIDA') {
      quantity = Math.max(0, quantity - q);
    }
  });
  return {quantity, averageCost, value: quantity * averageCost};
}

function ensureAllKardexBaselines() {
  let changed = false;
  products.forEach(p => {
    if (p && p.kardexOpeningQty === undefined) { ensureKardexBaseline(p); changed = true; }
  });
  if (changed && !window.__kardexBaselineSaveQueued) {
    window.__kardexBaselineSaveQueued = true;
    setTimeout(async () => {
      try { await saveLocalData(); await broadcastFullSync(); }
      catch(e) { console.warn('No se pudo guardar el saldo inicial del Kardex:', e); }
      finally { window.__kardexBaselineSaveQueued = false; }
    }, 0);
  }
}

function moneyKardex(value) {
  return '$' + (Number(value) || 0).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function getKardexRows() {
  return movimientos.filter(m => m.kardexVersion === 1).map(m => {
    const p = products.find(x => String(x.id) === String(m.productId));
    return {...m, _product:p || null};
  });
}

function renderKardex() {
  if (!Array.isArray(movimientos)) movimientos = [];
  ensureAllKardexBaselines();
  const searchEl = document.getElementById('kardex-search');
  if (!searchEl) return;
  const q = normalizeSearchText(searchEl.value || '');
  const from = document.getElementById('kardex-from')?.value || '';
  const to = document.getElementById('kardex-to')?.value || '';
  const type = document.getElementById('kardex-type')?.value || '';
  const sortMode = document.getElementById('kardex-sort')?.value || 'reciente';
  const allRows = getKardexRows();
  let filtered = allRows.filter(m => {
    const haystack = normalizeSearchText([m.folio,m.clave,m.desc,m.cliente,m.note,m.user,m.kardexSource].join(' '));
    const day = String(m.fecha_factura || (m.kardexTimestamp ? new Date(m.kardexTimestamp).toISOString().slice(0,10) : '')).slice(0,10);
    const matchText = !q || q.split(/\s+/).every(w => haystack.includes(w));
    return matchText && (!from || day >= from) && (!to || day <= to) && (!type || getMovementTypeLabel(m.type) === type);
  });
  filtered.sort((a,b) => {
    const diff = Number(b.kardexTimestamp || b.timestamp || b.updatedAt) - Number(a.kardexTimestamp || a.timestamp || a.updatedAt);
    return sortMode === 'antiguo' ? -diff : diff;
  });

  const totalUnits = products.reduce((sum,p) => sum + (calculateKardexProductState(p.id).quantity || 0), 0);
  const totalValue = products.reduce((sum,p) => sum + (calculateKardexProductState(p.id).value || 0), 0);
  const entryCount = allRows.filter(m => m.type === 'ENTRADA').length;
  const exitCount = allRows.filter(m => m.type === 'SALIDA').length;
  const summary = document.getElementById('kardex-summary');
  if (summary) summary.innerHTML = [
    ['Materiales', products.length], ['Existencia total', totalUnits.toLocaleString('es-MX',{maximumFractionDigits:3})],
    ['Valor del inventario', moneyKardex(totalValue)], ['Entradas registradas', entryCount], ['Salidas registradas', exitCount]
  ].map(([label,value]) => `<div class="net-box" style="padding:12px 14px;margin:0;"><div style="font-size:.78rem;color:#64748b;">${label}</div><div style="font-size:1.2rem;font-weight:800;color:#064e3b;margin-top:4px;">${value}</div></div>`).join('');

  const tbody = document.getElementById('kardex-tbody');
  if (tbody) tbody.innerHTML = filtered.slice(0,500).map(m => {
    const tipo = getMovementTypeLabel(m.type);
    const entrada = tipo === 'ENTRADA' ? Number(m.qty)||0 : 0;
    const salida = tipo === 'SALIDA' ? Number(m.qty)||0 : 0;
    const status = m.costStatus === 'SIN_COSTO' ? '<small style="color:#b45309;">Sin costo</small>' : moneyKardex(m.unitCost);
    return `<tr>
      <td><small>${esc(m.date || (m.kardexTimestamp ? new Date(m.kardexTimestamp).toLocaleString('es-MX') : ''))}</small></td>
      <td><strong>${esc(getMovimientoFolio(m) || 'S/R')}</strong>${m.cliente ? `<br><small>${esc(m.cliente)}</small>`:''}</td>
      <td><span class="badge ${getMovementBadgeClass(tipo)}">${esc(tipo)}</span></td>
      <td><span class="clave-cell">${esc(m.clave || '')}</span></td>
      <td>${esc(m.desc || '')}<br><small style="color:#64748b;">${esc(m.note || '')}</small></td>
      <td style="color:#047857;font-weight:700;">${entrada || '—'}</td><td style="color:#b91c1c;font-weight:700;">${salida || '—'}</td>
      <td style="font-weight:700;">${Number(m.balanceAfter || 0).toLocaleString('es-MX',{maximumFractionDigits:3})}</td>
      <td>${status}</td><td>${moneyKardex(m.averageCostAfter)}</td><td>${moneyKardex(m.inventoryValueAfter)}</td>
      <td><small>${esc(m.user || 'Sistema')}</small></td></tr>`;
  }).join('');
  const count = document.getElementById('kardex-count');
  if (count) count.textContent = `Mostrando ${Math.min(filtered.length,500)} de ${filtered.length} movimientos con costo y saldo. Los movimientos previos a la activación se conservan en el historial general, pero no se recalculan como Kardex valorizado.`;
  const tools = document.getElementById('kardex-admin-tools');
  if (tools) {
    tools.style.display = userHasPermission('kardex.adjust') || userHasPermission('reports.export') ? 'flex' : 'none';
    const adjustmentButton = tools.querySelector('button[onclick*="openKardexAdjustment"]');
    const exportButton = tools.querySelector('button[onclick*="exportKardexExcel"]');
    const printButton = tools.querySelector('button[onclick*="printKardex"]');
    [adjustmentButton].forEach(el => { if (el) { el.hidden = !userHasPermission('kardex.adjust'); el.style.setProperty('display', userHasPermission('kardex.adjust') ? 'inline-flex' : 'none', 'important'); } });
    [exportButton, printButton].forEach(el => { if (el) { el.hidden = !userHasPermission('reports.export'); el.style.setProperty('display', userHasPermission('reports.export') ? 'inline-flex' : 'none', 'important'); } });
  }
}

function openKardexAdjustment() {
  if (!requirePermission('kardex.adjust')) return;
  
  
  const select = document.getElementById('kardex-ajuste-producto');
  select.innerHTML = products.slice().sort((a,b)=>String(a.clave).localeCompare(String(b.clave))).map(p => `<option value="${esc(p.id)}">${esc(p.clave)} · ${esc(p.descripcion)}</option>`).join('');
  document.getElementById('kardex-ajuste-cantidad').value = '';
  document.getElementById('kardex-ajuste-costo').value = '';
  document.getElementById('kardex-ajuste-motivo').value = '';
  updateKardexAdjustmentCost();
  openModal('modal-kardex-ajuste');
}

function updateKardexAdjustmentCost() {
  const isEntry = document.getElementById('kardex-ajuste-tipo')?.value !== 'SALIDA';
  const wrap = document.getElementById('kardex-ajuste-cost-wrap');
  if (wrap) wrap.style.display = isEntry ? 'block' : 'none';
}

async function saveKardexAdjustment() {
  if (!requirePermission('kardex.adjust')) return;
  
  
  const id = document.getElementById('kardex-ajuste-producto').value;
  const p = products.find(x => String(x.id) === String(id));
  const type = document.getElementById('kardex-ajuste-tipo').value;
  const qty = Number(document.getElementById('kardex-ajuste-cantidad').value);
  const cost = Number(document.getElementById('kardex-ajuste-costo').value);
  const reason = fixTextForExcel(document.getElementById('kardex-ajuste-motivo').value || '').trim();
  if (!p) { showToast('Seleccione un material válido','error'); return; }
  if (!Number.isFinite(qty) || qty <= 0) { showToast('La cantidad debe ser mayor que cero','error'); return; }
  if (!reason) { showToast('Indique el motivo del ajuste','error'); return; }
  if (type === 'ENTRADA' && (!Number.isFinite(cost) || cost < 0)) { showToast('Capture un costo unitario válido para la entrada','error'); return; }
  const before = Math.max(0,Number(p.cantidad)||0);
  if (type === 'SALIDA' && qty > before) { showToast('El ajuste dejaría existencias negativas; operación cancelada','error'); return; }
  if (type === 'ENTRADA') p.cantidad = before + qty; else p.cantidad = before - qty;
  if (type === 'ENTRADA') p.precio = cost;
  p.updatedAt = Date.now();
  addMov(type,p.id,qty,`AJUSTE MANUAL: ${reason}`,'AJUSTE','', {unitCost:cost,stockBefore:before,kardexSource:'AJUSTE_MANUAL'});
  closeModal('modal-kardex-ajuste');
  await saveLocalData(); await broadcastFullSync();
  renderKardex(); renderInventario(); renderDashboard();
  showToast('Ajuste registrado en el Kardex');
}

async function exportKardexExcel() {
  if (!requirePermission('reports.export')) return;
  const rows = getKardexRows().sort((a,b)=>(a.kardexTimestamp||0)-(b.kardexTimestamp||0));
  const detailRows = rows.map(m => [m.date,m.folio,m.type,m.clave,m.desc,m.qty,m.unitCost,m.totalCost,m.balanceAfter,m.averageCostAfter,m.inventoryValueAfter,m.user,m.note]);
  const stockRows = products.map(p => { const st=calculateKardexProductState(p.id); return [p.clave,p.descripcion,p.unidad,st.quantity,st.averageCost,st.value,p.kardexOpeningDate || '']; });
  await downloadStyledWorkbook([
    {name:'Movimientos Kardex',headers:['Fecha','Folio / Ref.','Tipo','Clave','Material','Cantidad','Costo unitario','Costo total','Existencia','Costo promedio','Valor saldo','Usuario','Observaciones'],widths:[20,18,14,16,42,14,16,16,14,16,18,22,40],rows:detailRows},
    {name:'Resumen inventario',headers:['Clave','Material','Unidad','Existencia','Costo promedio','Valor inventario','Fecha saldo inicial'],widths:[18,48,14,14,18,20,20],rows:stockRows}
  ],`Kardex_${todayISO().replace(/-/g,'')}.xlsx`);
}

function printKardex() {
  if (!requirePermission('reports.export')) return;
  const rows = getKardexRows().sort((a,b)=>(a.kardexTimestamp||0)-(b.kardexTimestamp||0));
  const win = window.open('', '_blank');
  if (!win) { showToast('Permita las ventanas emergentes para imprimir el Kardex','error'); return; }
  const body = rows.map(m=>`<tr><td>${esc(m.date)}</td><td>${esc(m.folio||'')}</td><td>${esc(m.type)}</td><td>${esc(m.clave)}</td><td>${esc(m.desc)}</td><td>${m.qty}</td><td>${moneyKardex(m.unitCost)}</td><td>${m.balanceAfter}</td><td>${moneyKardex(m.averageCostAfter)}</td><td>${moneyKardex(m.inventoryValueAfter)}</td></tr>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Kardex COMPRA PRO</title><style>body{font:12px Arial;padding:20px;color:#111}h2{margin:0 0 8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#e8f5ee} @page{size:landscape;margin:12mm}</style></head><body><h2>KARDEX DE ALMACÉN</h2><p>Método: costo promedio ponderado · Fecha de impresión: ${new Date().toLocaleString('es-MX')}</p><table><thead><tr><th>Fecha</th><th>Folio</th><th>Tipo</th><th>Clave</th><th>Material</th><th>Cant.</th><th>Costo unit.</th><th>Existencia</th><th>Promedio</th><th>Valor saldo</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
  win.document.close(); win.focus(); setTimeout(()=>win.print(),300);
}

function openMovModal(id) {
  if (!requirePermission('movements.edit')) return;
  const m = movimientos.find(x => String(x.id) === String(id));
  if (!m) { showToast('Movimiento no encontrado', 'error'); return; }
  document.getElementById('mov-id').value = m.id;
  document.getElementById('mov-fecha').value = m.date;
  document.getElementById('mov-tipo').value = getMovementTypeLabel(m.type);
  document.getElementById('mov-qty').value = m.qty;
  document.getElementById('mov-nota').value = m.note;
  openModal('modal-movimiento');
}

function saveMovChanges() {
  if (!requirePermission('movements.edit')) return;

  const id = document.getElementById('mov-id').value;
  const m = movimientos.find(x => String(x.id) === String(id));
  if (!m) { showToast('Movimiento no encontrado', 'error'); return; }
  m.type = getMovementTypeLabel(document.getElementById('mov-tipo').value);
  m.qty = parseFloat(document.getElementById('mov-qty').value)||0;
  m.note = document.getElementById('mov-nota').value;
  m.updatedAt = Date.now();
  closeModal('modal-movimiento');
  broadcastFullSync();
  renderMovimientos();
  showToast('Movimiento actualizado');
}

function deleteMov(id) {
  if (!requirePermission('movements.edit')) return;
  if (confirm('¿Eliminar este registro de movimiento? No afectara el stock actual.')) {
    const target = movimientos.find(x => String(x.id) === String(id));
    movimientos = movimientos.filter(x => String(x.id) !== String(id)); 
    markDeleted(deletedMovimientos, target ? target.id : id);
    broadcastFullSync();
    renderMovimientos(); 
    showToast('Registro eliminado', 'error');
  }
}

function filterHistorialVentas() { renderHistorialVentas(); }
function normalizeValeForF361(v) {
  if (!v) return null;
  return {
    ...v,
    cliente: v.trabajador || '',
    compra: v.tipo || 'COMPRA',
    items: Array.isArray(v.items) ? v.items : []
  };
}

function renderHistorialVentas() {
  const q = normalizeSearchText(document.getElementById('hv-search').value);
  const sortMode = document.getElementById('hv-sort')?.value || 'reciente';

  const records = [
    ...(Array.isArray(ventas) ? ventas.map(v => ({ ...v, _recordType: 'venta' })) : []),
    ...(Array.isArray(valesManuales) ? valesManuales.map(v => ({ ...v, _recordType: 'vale' })) : [])
  ].filter(v => {
    // Filtro por tipo de registro seleccionado en el historial.
    if (sortMode === 'solo-venta' && v._recordType !== 'venta') return false;
    if (sortMode === 'solo-vale' && v._recordType !== 'vale') return false;
    // No mostrar registros que ya tienen un borrado confirmado. Esto es
    // especialmente importante para Vale Manual, porque su eliminacion usa
    // tombstones para que el borrado se conserve al sincronizar.
    if (v._recordType === 'venta' && isTombstoned(deletedVentas, v)) return false;
    if (v._recordType === 'vale' && isTombstoned(deletedValesManuales, v)) return false;

    const searchable = [v.folio, v.cliente, v.trabajador, v.departamento, v.cargo, v.tipo, v.compra]
      .map(normalizeSearchText).join(' ');
    return searchable.includes(q);
  }).sort((a, b) => {
    if (sortMode === 'total-desc') return (Number(b.total) || 0) - (Number(a.total) || 0);
    if (sortMode === 'total-asc') return (Number(a.total) || 0) - (Number(b.total) || 0);
    const fechaComp = String(b.fecha || '').localeCompare(String(a.fecha || ''));
    if (fechaComp !== 0) return sortMode === 'antiguo' ? -fechaComp : fechaComp;
    const idComp = (Number(b.id) || 0) - (Number(a.id) || 0);
    return sortMode === 'antiguo' ? -idComp : idComp;
  });

  document.getElementById('hv-list').innerHTML = records.slice(0, 100).map(v => {
    const isVale = v._recordType === 'vale';
    const nombre = isVale ? (v.departamento || 'Sin departamento') : (v.cliente || 'Sin solicitante');
    const subtitulo = isVale
      ? `${v.fecha || ''} | ${v.items?.length || 0} material(es) | Vale manual${v.tipo ? ` | ${esc(v.tipo)}` : ''}`
      : `${v.fecha || ''} | ${v.items?.length || 0} material(es) | Venta`;
    const viewFn = isVale ? `viewValeManual(${JSON.stringify(String(v.id))})` : `viewVenta(${JSON.stringify(v.id)})`;
    const recordId = String(v.id);
    return `
    <div class="stat-card" style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
      <div><strong>${esc(v.folio)}</strong> - ${esc(nombre)}<br><small style="color:#64748b;">${esc(subtitulo)}</small></div>
      <div style="text-align:right">
        <div style="font-weight:800; color:#059669; margin-bottom:8px;">$${fmt(v.total)}</div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-outline btn-sm historial-action" data-action="view" data-record-type="${isVale ? 'vale' : 'venta'}" data-record-id="${esc(recordId)}"><i class="fas fa-eye"></i> Ver</button>
          <button type="button" class="btn btn-primary btn-sm admin-inline historial-action" data-permission="purchases.edit" data-action="edit" data-record-type="${isVale ? 'vale' : 'venta'}" data-record-id="${esc(recordId)}"><i class="fas fa-edit"></i> Modificar</button>
          <button type="button" class="btn btn-danger btn-sm admin-inline historial-action" data-permission="purchases.delete" data-action="delete" data-record-type="${isVale ? 'vale' : 'venta'}" data-record-id="${esc(recordId)}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
  applyGranularPermissions();

  // Los botones del historial usan delegación de eventos en lugar de
  // onclick inline. Así no dependen de comillas/IDs incrustados en el HTML
  // generado y funcionan igual para Venta y Vale Manual.
  const historyList = document.getElementById('hv-list');
  if (historyList && !historyList.dataset.actionsReady) {
    historyList.addEventListener('click', function(e) {
      const button = e.target.closest('button.historial-action');
      if (!button || !historyList.contains(button)) return;
      e.preventDefault();
      e.stopPropagation();

      const action = button.dataset.action;
      const type = button.dataset.recordType;
      const id = button.dataset.recordId;
      if (!id) return;

      if (action === 'view') {
        if (type === 'vale') viewValeManual(id);
        else viewVenta(Number.isNaN(Number(id)) ? id : Number(id));
      } else if (action === 'edit') {
        if (!requirePermission(type === 'vale' ? 'vouchers.manage' : 'purchases.edit')) return;
        if (type === 'vale') editValeManual(id);
        else editVenta(id);
      } else if (action === 'delete') {
        if (!requirePermission(type === 'vale' ? 'vouchers.manage' : 'purchases.delete')) return;
        if (type === 'vale') deleteValeManual(id);
        else deleteVenta(id);
      }
    });
    historyList.dataset.actionsReady = '1';
  }
}


// =============================================================
// F-361: EXCEL LISTO PARA IMPRESIÓN + GUARDADO POR CARPETA (SIN MACROS)
// Basado en la plantilla Excel F-361 proporcionada por el usuario.
// =============================================================
const F361_MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const F361_LOGO_DATA = 'data:image/jpeg;base64,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';
let f361FolderHandle = null;
const F361_FOLDER_META_KEY = 'f361_folder_handle';

