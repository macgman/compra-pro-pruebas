// =============================================================
// MOTOR MULTIHOJA DE EXCEL ESTILIZADO CON EXCELJS (CORREGIDO)
// =============================================================
function fixTextForExcel(value) {
  if (value === null || value === undefined) return '';
  return cleanCorruptedString(value);
}

function getExcelColName(n) {
  let s = '';
  while (n > 0) {
    let m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

const REPORT_DESCRIPTIONS = {
  full: 'Genera un libro integral con resumen ejecutivo, inventario actual, detalle de compras, ranking de mas adquiridos, resumen por solicitante, stock en cero, stock critico y recepciones.',
  sold: 'Exporta cada producto comprado con fecha, folio, solicitante, clave, unidad, cantidad, precio e importe.',
  top: 'Agrupa las compras por producto y ordena de mayor a menor cantidad e importe.',
  'sales-summary': 'Resume cada compra por folio y solicitante, incluyendo productos distintos, piezas e importe total.',
  zero: 'Exporta unicamente productos cuya existencia actual sea igual o menor que cero.',
  critical: 'Exporta productos con existencia actual entre 1 y 5 unidades.',
  'no-sales': 'Muestra productos que no registraron compras dentro del periodo seleccionado.',
  entries: 'Exporta entradas de inventario, factura, fecha, producto, unidad, cantidad y motivo.'
};

function updateReportPreview() {
  const type = document.getElementById('report-type')?.value || 'full';
  const range = reportDateRange();
  const helpEl = document.getElementById('report-help');
  if (helpEl && REPORT_DESCRIPTIONS[type]) {
    helpEl.textContent = REPORT_DESCRIPTIONS[type];
  }

  const selectedVentas = getReportVentas(range);
  const soldDetail = buildSoldDetail(selectedVentas);
  const totalUnits = soldDetail.reduce((s, r) => s + r.cantidad, 0);
  const totalMoney = soldDetail.reduce((s, r) => s + r.importe, 0);
  const zeroCount = products.filter(p => Number(p.cantidad) <= 0).length;

  const kpiSales = document.getElementById('report-kpi-sales');
  const kpiUnits = document.getElementById('report-kpi-units');
  const kpiTotal = document.getElementById('report-kpi-total');
  const kpiZero = document.getElementById('report-kpi-zero');

  if (kpiSales) kpiSales.textContent = selectedVentas.length;
  if (kpiUnits) kpiUnits.textContent = totalUnits.toLocaleString('es-MX');
  if (kpiTotal) kpiTotal.textContent = '$' + fmt(totalMoney);
  if (kpiZero) kpiZero.textContent = zeroCount;
}

function openReportModal(preselectedType = '') {
  if (!requirePermission('reports.export')) return;
  const typeEl = document.getElementById('report-type');
  if (typeEl && preselectedType && REPORT_DESCRIPTIONS[preselectedType]) typeEl.value = preselectedType;
  updateReportPreview();
  openModal('modal-reportes');
}

function setReportPeriod(mode) {
  const fromEl = document.getElementById('report-date-from');
  const toEl = document.getElementById('report-date-to');
  if (!fromEl || !toEl) return;
  if (mode === 'all') {
    fromEl.value = '';
    toEl.value = '';
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    fromEl.value = mode === 'year' ? `${y}-01-01` : `${y}-${m}-01`;
    toEl.value = `${y}-${m}-${d}`;
  }
  updateReportPreview();
}

function reportDateRange() {
  return {
    from: (document.getElementById('report-date-from')?.value || '').trim(),
    to: (document.getElementById('report-date-to')?.value || '').trim()
  };
}

function normalizeISODate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const latam = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (latam) return `${latam[3]}-${latam[2].padStart(2, '0')}-${latam[1].padStart(2, '0')}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function dateInReportRange(value, range = reportDateRange()) {
  const date = normalizeISODate(value);
  if (!range.from && !range.to) return true;
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function getReportVentas(range = reportDateRange()) {
  return (Array.isArray(ventas) ? ventas : []).filter(v => dateInReportRange(v.fecha, range));
}

function getReportEntradas(range = reportDateRange()) {
  return (Array.isArray(movimientos) ? movimientos : []).filter(m =>
    getMovementTypeLabel(m.type) === 'ENTRADA' && dateInReportRange(m.fecha_factura || m.date, range)
  );
}

function reportProductKey(item) {
  if (item && item.productId !== undefined && item.productId !== null && item.productId !== '') return `id:${item.productId}`;
  return `txt:${normalizeSearchText(item?.clave || '')}|${normalizeSearchText(item?.descripcion || '')}`;
}

function buildSoldDetail(selectedVentas) {
  const rows = [];
  selectedVentas.forEach(v => {
    (Array.isArray(v.items) ? v.items : []).forEach(item => {
      const qty = Number(item.cantidad) || 0;
      const price = Number(item.precio) || 0;
      rows.push({
        fecha: normalizeISODate(v.fecha) || v.fecha || '',
        folio: fixTextForExcel(v.folio || ''),
        cliente: fixTextForExcel(v.cliente || 'Sin especificar'),
        clave: fixTextForExcel(item.clave || ''),
        descripcion: fixTextForExcel(item.descripcion || ''),
        unidad: fixTextForExcel(item.unidad || 'PIEZA'),
        cantidad: qty,
        precio: price,
        importe: qty * price
      });
    });
  });
  return rows.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.folio).localeCompare(String(b.folio), 'es', { numeric:true }));
}

function buildSalesRanking(selectedVentas) {
  const map = new Map();
  selectedVentas.forEach(v => {
    (Array.isArray(v.items) ? v.items : []).forEach(item => {
      const key = reportProductKey(item);
      const product = products.find(p => String(p.id) === String(item.productId)) || {};
      const current = map.get(key) || {
        clave: fixTextForExcel(item.clave || product.clave || ''),
        descripcion: fixTextForExcel(item.descripcion || product.descripcion || ''),
        unidad: fixTextForExcel(item.unidad || product.unidad || 'PIEZA'),
        cantidad: 0, importe: 0, folios: new Set(), clientesSet: new Set(),
        stock: Number(product.cantidad) || 0, ultimaVenta: ''
      };
      const qty = Number(item.cantidad) || 0;
      const price = Number(item.precio) || 0;
      current.cantidad += qty;
      current.importe += qty * price;
      if (v.folio) current.folios.add(String(v.folio));
      if (v.cliente) current.clientesSet.add(String(v.cliente));
      const date = normalizeISODate(v.fecha);
      if (date && date > current.ultimaVenta) current.ultimaVenta = date;
      map.set(key, current);
    });
  });
  return Array.from(map.values()).map(x => ({
    ...x,
    ventas: x.folios.size,
    clientes: x.clientesSet.size,
    precioPromedio: x.cantidad ? x.importe / x.cantidad : 0
  })).sort((a, b) => b.cantidad - a.cantidad || b.importe - a.importe);
}

function buildSalesSummary(selectedVentas) {
  return selectedVentas.map(v => {
    const items = Array.isArray(v.items) ? v.items : [];
    return {
      fecha: normalizeISODate(v.fecha) || v.fecha || '',
      folio: fixTextForExcel(v.folio || ''),
      cliente: fixTextForExcel(v.cliente || 'Sin especificar'),
      productos: items.length,
      unidades: items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0),
      total: Number(v.total) || items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio) || 0), 0)
    };
  }).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.folio).localeCompare(String(b.folio), 'es', { numeric:true }));
}

function getUnsoldProducts(selectedVentas) {
  const soldKeys = new Set();
  selectedVentas.forEach(v => (v.items || []).forEach(item => soldKeys.add(reportProductKey(item))));
  return products.filter(p =>
    !soldKeys.has(`id:${p.id}`) &&
    !soldKeys.has(`txt:${normalizeSearchText(p.clave || '')}|${normalizeSearchText(p.descripcion || '')}`)
  );
}

function exportAsCSVFallback(sheetsConfig, filename) {
  let csvContent = "";
  sheetsConfig.forEach(s => {
    csvContent += `=== ${s.name} ===\r\n`;
    csvContent += s.headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",") + "\r\n";
    s.rows.forEach(r => {
      csvContent += r.map(c => `"${String(c !== null && c !== undefined ? c : '').replace(/"/g, '""')}"`).join(",") + "\r\n";
    });
    csvContent += "\r\n\r\n";
  });

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const csvFileName = filename.replace(/\.xlsx$/i, '.csv');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Exportado en formato CSV compatible con Excel');
}

async function downloadStyledWorkbook(sheetsConfig, filename) {
  if (typeof ExcelJS === 'undefined') {
    exportAsCSVFallback(sheetsConfig, filename);
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'COMPRA Pro';
    workbook.lastModifiedBy = currentUser ? (currentUser.name || currentUser.username) : 'Sistema';
    workbook.created = new Date();
    workbook.modified = new Date();

    const usedSheetNames = new Set();

    sheetsConfig.forEach(s => {
      let cleanName = s.name.replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja';
      let base = cleanName;
      let count = 2;
      while (usedSheetNames.has(cleanName)) {
        cleanName = `${base.slice(0, 27)} ${count++}`.slice(0, 31);
      }
      usedSheetNames.add(cleanName);

      const ws = workbook.addWorksheet(cleanName, {
        views: [{ showGridLines: true }],
        pageSetup: { orientation: 'landscape', fitToPage: true }
      });

      const headerRow = ws.addRow(s.headers);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF059669' }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 10,
          bold: true,
          color: { argb: 'FFFFFFFF' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF047857' } },
          left: { style: 'thin', color: { argb: 'FF047857' } },
          bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
          right: { style: 'thin', color: { argb: 'FF047857' } }
        };
      });

      if (s.widths && Array.isArray(s.widths)) {
        s.widths.forEach((w, colIdx) => {
          ws.getColumn(colIdx + 1).width = Math.max(Number(w) || 14, 12);
        });
      }

      s.rows.forEach((rowData, idx) => {
        const row = ws.addRow(rowData);
        row.height = 22;
        const isEven = idx % 2 === 1;

        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Segoe UI', size: 9.5 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (isEven && s.name !== 'Resumen ejecutivo') {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }

          const headerTitle = String(s.headers[colNumber - 1] || '').toLowerCase();
          const isMoney = headerTitle.includes('$') || headerTitle.includes('precio') || headerTitle.includes('total') || headerTitle.includes('importe');
          
          if (isMoney && typeof cell.value === 'number') {
            cell.numFmt = '"$"#,##0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (typeof cell.value === 'number') {
            cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else {
            if (headerTitle.includes('fecha') || headerTitle.includes('folio') || headerTitle.includes('clave') || headerTitle.includes('unidad') || headerTitle.includes('posicion') || headerTitle.includes('periodo') || headerTitle.includes('mes')) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            }
          }
        });
      });

      if (s.rows.length > 0 && s.name !== 'Resumen ejecutivo') {
        const lastColLetter = getExcelColName(s.headers.length);
        try {
          ws.autoFilter = `A1:${lastColLetter}1`;
        } catch(e) {}
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  } catch (err) {
    console.error('Error al generar XLSX, recurriendo a CSV:', err);
    exportAsCSVFallback(sheetsConfig, filename);
  }
}

async function exportSelectedReport() {
  if (!requirePermission('reports.export')) return;
  const type = document.getElementById('report-type')?.value || 'full';
  const range = reportDateRange();
  if (range.from && range.to && range.from > range.to) {
    showToast('La fecha inicial no puede ser posterior a la fecha final', 'error');
    return;
  }

  sanitizeStoredData();
  const selectedVentas = getReportVentas(range);
  const selectedEntries = getReportEntradas(range);
  const zeroProducts = products.filter(p => Number(p.cantidad) <= 0).sort((a,b) => normSortText(a.descripcion).localeCompare(normSortText(b.descripcion),'es'));
  const criticalProducts = products.filter(p => Number(p.cantidad) > 0 && Number(p.cantidad) <= 5).sort((a,b) => Number(a.cantidad)-Number(b.cantidad));
  const stamp = todayISO().replace(/-/g, '');
  let sheets = [];
  let filename = `COMPRA_reporte_${stamp}.xlsx`;

  const soldDetail = buildSoldDetail(selectedVentas);
  const ranking = buildSalesRanking(selectedVentas);
  const salesSummary = buildSalesSummary(selectedVentas);
  const unsold = getUnsoldProducts(selectedVentas);
  const total = soldDetail.reduce((s, r) => s + r.importe, 0);
  const units = soldDetail.reduce((s, r) => s + r.cantidad, 0);

  const sheetResumen = {
    name: 'Resumen ejecutivo',
    headers: ['Indicador', 'Resultado'],
    widths: [36, 28],
    rows: [
      ['Fecha de generacion', new Date().toLocaleString('es-MX')],
      ['Periodo desde', range.from || 'Inicio del historial'],
      ['Periodo hasta', range.to || 'Fecha actual'],
      ['Compras registradas', selectedVentas.length],
      ['Unidades adquiridas', units],
      ['Importe total ($)', total],
      ['Materiales distintos comprados', ranking.length],
      ['Material con mayor compra', ranking[0]?.descripcion || 'Sin compras'],
      ['Unidades del mas comprado', ranking[0]?.cantidad || 0],
      ['Materiales con stock en cero', zeroProducts.length],
      ['Materiales con stock critico', criticalProducts.length],
      ['Materiales sin compra en periodo', unsold.length],
      ['Entradas registradas en periodo', selectedEntries.length],
      ['Materiales en catalogo', products.length]
    ]
  };

  const sheetInventario = {
    name: 'Inventario actual',
    headers: ['Clave', 'Partida', 'Contrato', 'Ultima factura', 'Ultima fecha', 'Descripcion', 'Unidad', 'Precio ($)', 'Stock actual'],
    widths: [18, 22, 28, 20, 14, 75, 20, 16, 14],
    rows: products.map(p => [p.clave || '', p.partida || '', p.contrato || '', p.factura || '', p.fecha_entrada || '', p.descripcion || '', p.unidad || '', Number(p.precio) || 0, Number(p.cantidad) || 0])
  };

  const sheetSold = {
    name: 'Materiales comprados',
    headers: ['Fecha', 'Folio', 'Solicitante', 'Clave', 'Descripcion', 'Unidad', 'Cantidad', 'Precio unitario ($)', 'Importe ($)'],
    widths: [14, 14, 26, 18, 72, 18, 12, 16, 17],
    rows: soldDetail.map(r => [r.fecha, r.folio, r.cliente, r.clave, r.descripcion, r.unidad, r.cantidad, r.precio, r.importe])
  };

  const sheetRanking = {
    name: 'Mas comprados',
    headers: ['Posicion', 'Clave', 'Descripcion', 'Unidad', 'Cantidad', 'Compras', 'Solicitantes', 'Precio prom. ($)', 'Importe total ($)', 'Stock actual', 'Ultima compra'],
    widths: [10, 18, 72, 18, 17, 10, 12, 16, 18, 14, 14],
    rows: ranking.map((r, idx) => [idx + 1, r.clave, r.descripcion, r.unidad, r.cantidad, r.ventas, r.clientes, r.precioPromedio, r.importe, r.stock, r.ultimaVenta])
  };

  const sheetSummary = {
    name: 'Compras por folio',
    headers: ['Fecha', 'Folio', 'Solicitante', 'Materiales distintos', 'Unidades', 'Total ($)'],
    widths: [14, 16, 32, 19, 16, 18],
    rows: salesSummary.map(r => [r.fecha, r.folio, r.cliente, r.productos, r.unidades, r.total])
  };

  const sheetZero = {
    name: 'Stock cero',
    headers: ['Clave', 'Partida', 'Contrato', 'Descripcion', 'Unidad', 'Precio ($)', 'Stock actual', 'Ultima factura', 'Ultima fecha'],
    widths: [18, 22, 28, 75, 20, 16, 14, 22, 14],
    rows: zeroProducts.map(p => [p.clave, p.partida || '', p.contrato || '', p.descripcion, p.unidad, Number(p.precio) || 0, Number(p.cantidad) || 0, p.factura, p.fecha_entrada])
  };

  const sheetCritical = {
    name: 'Stock critico',
    headers: ['Clave', 'Partida', 'Contrato', 'Descripcion', 'Unidad', 'Precio ($)', 'Stock actual', 'Ultima factura', 'Ultima fecha'],
    widths: [18, 22, 28, 75, 20, 16, 14, 22, 14],
    rows: criticalProducts.map(p => [p.clave, p.partida || '', p.contrato || '', p.descripcion, p.unidad, Number(p.precio) || 0, Number(p.cantidad) || 0, p.factura, p.fecha_entrada])
  };

  const sheetUnsold = {
    name: 'Sin compras',
    headers: ['Clave', 'Partida', 'Contrato', 'Descripcion', 'Unidad', 'Precio ($)', 'Stock actual', 'Periodo analizado'],
    widths: [18, 22, 28, 75, 20, 16, 14, 28],
    rows: unsold.map(p => [p.clave, p.partida || '', p.contrato || '', p.descripcion, p.unidad, Number(p.precio) || 0, Number(p.cantidad) || 0, range.from || range.to ? `${range.from || 'inicio'} a ${range.to || 'hoy'}` : 'todo el historial'])
  };

  const sheetEntries = {
    name: 'Historial entradas',
    headers: ['Fecha registro/factura', 'Factura/Ref.', 'Clave', 'Descripcion', 'Unidad', 'Cantidad', 'Motivo/Nota', 'Usuario'],
    widths: [22, 18, 18, 72, 18, 14, 30, 18],
    rows: selectedEntries.map(m => {
      const p = products.find(x => String(x.id) === String(m.productId)) || {};
      return [m.fecha_factura || normalizeISODate(m.date) || m.date, m.folio, m.clave, m.desc, p.unidad || 'PIEZA', Number(m.qty) || 0, m.note, m.user];
    })
  };

  if (type === 'full') {
    sheets = [sheetResumen, sheetInventario, sheetSold, sheetRanking, sheetSummary, sheetZero, sheetCritical, sheetUnsold, sheetEntries];
    filename = `COMPRA_reporte_completo_${stamp}.xlsx`;
  } else if (type === 'sold') {
    sheets = [sheetSold, sheetSummary];
    filename = `COMPRA_materiales_adquiridos_${stamp}.xlsx`;
  } else if (type === 'top') {
    sheets = [sheetRanking];
    filename = `COMPRA_mas_comprados_${stamp}.xlsx`;
  } else if (type === 'sales-summary') {
    sheets = [sheetSummary];
    filename = `COMPRA_resumen_folios_${stamp}.xlsx`;
  } else if (type === 'zero') {
    sheets = [sheetZero];
    filename = `COMPRA_stock_cero_${stamp}.xlsx`;
  } else if (type === 'critical') {
    sheets = [sheetCritical];
    filename = `COMPRA_stock_critico_${stamp}.xlsx`;
  } else if (type === 'no-sales') {
    sheets = [sheetUnsold];
    filename = `COMPRA_sin_movimiento_${stamp}.xlsx`;
  } else if (type === 'entries') {
    sheets = [sheetEntries];
    filename = `COMPRA_historial_entradas_${stamp}.xlsx`;
  }

  try {
    await downloadStyledWorkbook(sheets, filename);
    closeModal('modal-reportes');
    showToast(`Reporte generado con diseño: ${sheets.length} hoja(s)`);
  } catch (err) {
    console.error(err);
    exportAsCSVFallback(sheets, filename);
  }
}

// AUXILIARES
function fmt(n) { return Number(n||0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function stockBadge(q) { return `<span class="badge ${q<=0?'badge-zero':q<=5?'badge-critical':'badge-ok'}">${q}</span>`; }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showToast(m, t='success') { const el = document.getElementById('toast'); el.textContent = m; el.className = 'show toast-'+t; setTimeout(()=>el.className='', 3000); }

function exportBackup() {
  if (!requirePermission('backup.export')) return;

  const data = { products, ventas, valesManuales, valesInventario, movimientos, currentFolio, users, deletedProducts, deletedVentas, deletedValesManuales, deletedMovimientos, deletedUsers, system: 'COMPRA', timestamp: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `backup_compra_${todayISO()}.json`; link.click();
}

function importBackup(input) {
  if (!requirePermission('backup.restore')) return;

  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.products)) throw new Error('Invalido');
      products = data.products;
      ventas = Array.isArray(data.ventas) ? data.ventas : [];
      valesManuales = Array.isArray(data.valesManuales) ? data.valesManuales : [];
      valesInventario = Array.isArray(data.valesInventario) ? data.valesInventario : [];
      movimientos = Array.isArray(data.movimientos) ? data.movimientos : [];
      if (Array.isArray(data.users) && data.users.length) users = data.users;
      currentFolio = data.currentFolio || 'F-001';
      // Compatibilidad: respaldos generados antes de esta corrección no
      // traen tombstones; en ese caso simplemente se parte de listas vacías.
      deletedProducts = Array.isArray(data.deletedProducts) ? data.deletedProducts : [];
      deletedVentas = Array.isArray(data.deletedVentas) ? data.deletedVentas : [];
      deletedValesManuales = Array.isArray(data.deletedValesManuales) ? data.deletedValesManuales : [];
      deletedMovimientos = Array.isArray(data.deletedMovimientos) ? data.deletedMovimientos : [];
      deletedUsers = Array.isArray(data.deletedUsers) ? data.deletedUsers : [];
      sanitizeStoredData();
      products = applyTombstones(products, deletedProducts);
      ventas = applyTombstones(ventas, deletedVentas);
      valesManuales = applyTombstones(valesManuales, deletedValesManuales);
      movimientos = applyTombstones(movimientos, deletedMovimientos);
      users = applyTombstones(users, deletedUsers);
      await idbClearAndPutAll('products', products);
      await idbClearAndPutAll('ventas', ventas);
      await idbClearAndPutAll('movimientos', movimientos);
      await idbClearAndPutAll('users', users);
      await idbSetMeta('valesManuales', valesManuales);
      await idbSetMeta('valesInventario', valesInventario);
      await idbSetMeta('folio', currentFolio);
      await idbSetMeta('db_seeded', true);
      await idbSetMeta('catalog_reset_3_0_6', true);
      await broadcastFullSync();
      refreshCurrentView();
      showToast('Datos restaurados correctamente');
    } catch(err) {
      showToast('Archivo no valido', 'error');
    }
  };
  reader.readAsText(file);
}


// ===== LÓGICA BANNER MODO OFFLINE =====
function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const isOffline = !navigator.onLine || (document.getElementById('cloud-status-text')?.textContent.includes('Sin conexion') || document.getElementById('cloud-status-text')?.textContent.includes('offline') || document.getElementById('cloud-status-text')?.textContent.includes('Error'));
  
  // Considerar offline si: no hay internet O peer desconectado
  const cloudText = document.getElementById('cloud-status-text')?.textContent || '';
  const isCloudOffline = cloudText.includes('Sin conexion') || cloudText.includes('Sin conexión') || cloudText.includes('offline') || cloudText.includes('Error') || cloudText.includes('Desconectado') || cloudText.includes('Conexión cerrada');
  const shouldShowOffline = !navigator.onLine || isCloudOffline;

  if (shouldShowOffline) {
    banner.classList.add('show');
    document.body.classList.add('is-offline');
    if (!navigator.onLine) {
      banner.innerHTML = '<div class="offline-dot"></div><i class="fas fa-wifi" style="transform: rotate(45deg); text-decoration: line-through;"></i><span>MODO OFFLINE — Sin internet • Todo se guarda local y se sincronizará al volver</span><i class="fas fa-database"></i>';
    } else {
      banner.innerHTML = '<div class="offline-dot"></div><i class="fas fa-broadcast-tower"></i><span>MODO OFFLINE — Sin enlace a otras PCs • Trabajando local, se sincronizará al reconectar</span><i class="fas fa-database"></i>';
    }
  } else {
    // Solo ocultar si realmente está online
    if (navigator.onLine && !isCloudOffline) {
      banner.classList.remove('show');
      document.body.classList.remove('is-offline');
    }
  }
}

// Escuchar eventos del navegador
window.addEventListener('online', () => {
  console.log('Internet volvió');
  showToast('✅ Internet de vuelta — Sincronizando...', 'success');
  updateOfflineBanner();
  if (cloudRoomId) setTimeout(() => initPeerNetwork(), 800);
});

window.addEventListener('offline', () => {
  console.log('Sin internet');
  showToast('📴 Sin internet — MODO OFFLINE activado, todo se guarda local', 'warning');
  updateOfflineBanner();
});

// Interceptar updateCloudBadge para también actualizar banner offline
const originalUpdateCloudBadge = updateCloudBadge;
updateCloudBadge = function(state, text) {
  originalUpdateCloudBadge(state, text);
  setTimeout(updateOfflineBanner, 100);
};

// Revisar cada 3 segundos
setInterval(updateOfflineBanner, 3000);
// Revisar al cargar
document.addEventListener('DOMContentLoaded', () => setTimeout(updateOfflineBanner, 1500));


// Despertar Render en cuanto se abre COMPRA-PRO, no hasta que el usuario
// presione Iniciar sesión. En planes que suspenden el servicio, esto permite
// que el servidor empiece a arrancar mientras el usuario captura sus datos.
let compraProAuthLastWarmup = 0;
function warmupCompraProAuthServer(force) {
  if (typeof fetch !== 'function' || !navigator.onLine) return;
  const now = Date.now();
  // Render (plan gratis) se duerme tras ~15 min sin tráfico: se repite cada ~8 min.
  if (!force && now - compraProAuthLastWarmup < 8 * 60 * 1000) return;
  compraProAuthLastWarmup = now;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => { if (controller) controller.abort(); }, 60000);
  fetch(COMPRA_PRO_AUTH_API + '/health', {
    method: 'GET',
    cache: 'no-store',
    signal: controller ? controller.signal : undefined
  }).catch(() => {
    // Solo precalentamiento: nunca bloquear ni mostrar errores al usuario.
  }).finally(() => clearTimeout(timer));
}

// Mantener despierto el servidor mientras la app esté abierta y visible,
// y despertarlo al volver a la pestaña después de un rato.
setInterval(() => {
  if (document.visibilityState === 'visible') warmupCompraProAuthServer(false);
}, 10 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') warmupCompraProAuthServer(false);
});

window.addEventListener('DOMContentLoaded', () => {
  // El login queda operativo inmediatamente; precalentamos Render en paralelo.
  warmupCompraProAuthServer();
  setupLoginHandlers();
  ensureLoginUsers();

  init().catch(err => {
    console.error('Error de inicialización; se mantiene el acceso local.', err);
    ensureLoginUsers();
    try { updateCloudBadge('offline', 'Modo local - datos locales disponibles'); } catch (_) {}
    setupLoginHandlers();
  });
});

// Actualiza permisos sugeridos al cambiar el nivel en el formulario.
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'user-role') {
    renderPermissionEditor(defaultPermissionsForRole(e.target.value));
  }
});
