// =============================================================
// MOTOR 5: CARGA MASIVA DESDE EXCEL (.XLSX / .CSV)
// =============================================================
async function importBulkExcel(input) {
  if (!requirePermission('inventory.import')) { if (input) input.value = ''; return; }
  const file = input.files && input.files[0];
  if (!file) return;

  if (typeof ExcelJS === 'undefined') {
    showToast(
      'La importación de Excel no está disponible porque la librería ExcelJS no está cargada.',
      'error'
    );
    input.value = '';
    return;
  }

  try {
    showToast('Leyendo archivo Excel...', 'success');
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('El archivo no contiene hojas legibles');

    const headerRow = worksheet.getRow(1);
    const colMap = {};

    headerRow.eachCell((cell, colNumber) => {
      const txt = normalizeSearchText(cell.value);
      if (txt.includes('clave') || txt.includes('codigo') || txt.includes('sku')) colMap.clave = colNumber;
      else if (txt.includes('descrip') || txt.includes('nombre') || txt.includes('articulo') || txt.includes('material')) colMap.descripcion = colNumber;
      else if (txt.includes('unidad') || txt.includes('medida')) colMap.unidad = colNumber;
      else if (txt.includes('precio') || txt.includes('costo') || txt.includes('importe')) colMap.precio = colNumber;
      else if (txt.includes('stock') || txt.includes('cant') || txt.includes('exist')) colMap.cantidad = colNumber;
      else if (txt.includes('partida')) colMap.partida = colNumber;
      else if (txt.includes('contrato') || txt.includes('contract')) colMap.contrato = colNumber;
      else if (txt.includes('factura') || txt.includes('ref')) colMap.factura = colNumber;
    });

    if (!colMap.descripcion && !colMap.clave) {
      throw new Error('No se detectaron columnas de "Clave" o "Descripcion" en la fila 1');
    }

    let added = 0, updated = 0;
    const now = Date.now();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const clave = fixTextForExcel(colMap.clave ? row.getCell(colMap.clave).value : 'S/C');
      const descripcion = fixTextForExcel(colMap.descripcion ? row.getCell(colMap.descripcion).value : '');
      if (!descripcion && !clave) continue;

      const unidad = fixTextForExcel(colMap.unidad ? row.getCell(colMap.unidad).value : 'PIEZA') || 'PIEZA';
      const precio = Number(colMap.precio ? row.getCell(colMap.precio).value : 0) || 0;
      const cantidad = Number(colMap.cantidad ? row.getCell(colMap.cantidad).value : 0) || 0;
      const partida = fixTextForExcel(colMap.partida ? row.getCell(colMap.partida).value : '');
      const contrato = fixTextForExcel(colMap.contrato ? row.getCell(colMap.contrato).value : '');
      const factura = fixTextForExcel(colMap.factura ? row.getCell(colMap.factura).value : '');

      const existingIndex = products.findIndex(p => (clave && clave !== 'S/C' && String(p.clave).toLowerCase() === clave.toLowerCase()) || normalizeSearchText(p.descripcion) === normalizeSearchText(descripcion));

      if (existingIndex >= 0) {
        products[existingIndex] = {
          ...products[existingIndex],
          precio: precio || products[existingIndex].precio,
          cantidad: colMap.cantidad
            ? cantidad
            : products[existingIndex].cantidad,
          factura: factura || products[existingIndex].factura,
          partida: partida || products[existingIndex].partida || '',
          contrato: contrato || products[existingIndex].contrato || '',
          unidad: unidad || products[existingIndex].unidad,
          updatedAt: now + r
        };
        updated++;
      } else {
        const newProduct = {
          id: now + r,
          clave: clave || 'N/A',
          descripcion: descripcion || 'Material sin nombre',
          unidad,
          precio,
          cantidad,
          factura,
          partida,
          contrato,
          fecha_entrada: todayISO(),
          bloqueado: false,
          updatedAt: now + r
        };
        products.push(newProduct);
        if (cantidad > 0) {
          addMov('ENTRADA', newProduct.id, cantidad, 'Carga masiva Excel', factura);
        }
        added++;
      }
    }

    await broadcastFullSync();
    renderInventario();
    renderDashboard();
    input.value = '';
    showToast(`Importacion exitosa: ${added} nuevos, ${updated} actualizados`);
  } catch(err) {
    showToast(`Error al importar Excel: ${err.message}`, 'error');
    input.value = '';
  }
}

