// =============================================================
// MOTOR 4: ESCÁNER DE CÁMARA (HTML5-QRCODE + WEB AUDIO SYNTH)
// =============================================================
let html5QrScanner = null;
let scannerTargetMode = 'venta';

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch(e) {}
}

function openScannerModal(mode = 'venta') {
  scannerTargetMode = mode;
  openModal('modal-scanner');
  document.getElementById('scanner-feedback').textContent = 'Iniciando camara...';

  if (!html5QrScanner) {
    html5QrScanner = new Html5Qrcode("scanner-reader");
  }

  const config = { fps: 10, qrbox: { width: 250, height: 180 } };
  html5QrScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .then(() => {
      document.getElementById('scanner-feedback').textContent = 'Camara activa. Alinee el codigo.';
    })
    .catch(() => {
      document.getElementById('scanner-feedback').textContent = 'No se pudo acceder a la camara o permiso denegado.';
    });
}

function onScanSuccess(decodedText) {
  playBeep();
  const code = String(decodedText).trim();

  if (scannerTargetMode === 'venta') {
    const match = products.find(p => String(p.clave).toLowerCase() === code.toLowerCase() || normalizeSearchText(p.descripcion).includes(normalizeSearchText(code)));
    if (match) {
      addVentaItem(match.id);
      showToast(`Escaneado: ${match.descripcion}`);
    } else {
      showToast(`Codigo ${code} no encontrado en catalogo`, 'error');
    }
  } else if (scannerTargetMode === 'inv') {
    document.getElementById('inv-search').value = code;
    filterInventario();
    closeScannerModal();
    showToast(`Busqueda: ${code}`);
  } else if (scannerTargetMode === 'inv-fisico') {
    document.getElementById('if-search').value = code;
    filterInvFisico();
    closeScannerModal();
    showToast(`Busqueda fisica: ${code}`);
  } else if (scannerTargetMode === 'vm') {
    const match = products.find(p => String(p.clave).toLowerCase() === code.toLowerCase() || normalizeSearchText(p.descripcion).includes(normalizeSearchText(code)));
    if (match) {
      document.getElementById('vm-product-select').value = match.id;
      renderVentasMaterial();
      closeScannerModal();
      showToast(`Visualizando: ${match.descripcion}`);
    } else {
      showToast(`Codigo ${code} no encontrado`, 'error');
    }
  }
}

function closeScannerModal() {
  if (html5QrScanner) {
    html5QrScanner.stop().then(() => {
      html5QrScanner.clear();
      html5QrScanner = null;
      closeModal('modal-scanner');
    }).catch(() => {
      closeModal('modal-scanner');
    });
  } else {
    closeModal('modal-scanner');
  }
}

