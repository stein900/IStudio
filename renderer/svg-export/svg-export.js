'use strict';

/**
 * Module Export SVG — conversion d'une image (png, jpg…) en SVG vectoriel.
 *
 * Mode « Sans perte » par défaut (rendu identique au pixel près). Si l'image
 * est trop détaillée (photo), bascule automatique en mode « Simplifié » :
 * réduction à N couleurs + consolidation des zones, réglable dans la popup.
 *
 * Autonome et débranchable : construit lui-même son bouton de barre d'outils
 * et sa popup, exécute la vectorisation dans son worker, et n'attend de
 * l'hôte que trois fonctions passées à init(). Voir README.md du dossier
 * pour les points d'intégration exacts (et comment le retirer).
 */

window.SvgExport = (() => {
  const WORKER_URL = 'svg-export/svg-export-worker.js';
  const COLOR_STOPS = [8, 16, 24, 32, 48, 64, 96, 128];
  const DEFAULT_COLORS = 32;
  const SMOOTH_PASSES = 1;

  /* Fournitures de l'hôte (renderer.js) :
     - getFile()    : fichier affiché ({ name, path }) ou null
     - decodeFile() : Promise<{ img, url }> — pixels décodés du fichier
     - canOpen()    : l'hôte n'est pas occupé (rognage, édition en cours…) */
  let host = null;
  let els = null;
  let worker = null;
  let svgText = null;
  let previewUrl = null;
  let saving = false;

  /* État d'une session de popup. */
  let source = null; // { data: Uint8ClampedArray, width, height }
  let mode = 'lossless';
  let colorCount = readStoredColors();
  let losslessBlocked = false; // le sans perte a échoué pour cette image

  function readStoredColors() {
    const stored = Number(localStorage.getItem('svgExportColors'));
    return COLOR_STOPS.includes(stored) ? stored : DEFAULT_COLORS;
  }

  /* ---------- Construction de l'interface ---------- */

  const ICON_SPLINE =
    '<circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" />' +
    '<path d="M5 17A12 12 0 0 1 17 5" />';

  function svgIcon(paths, size) {
    return (
      `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} fill="none" ` +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      `aria-hidden="true">${paths}</svg>`
    );
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = 'svgx-btn';
    // .module-btn : l'hôte synchronise disabled avec les autres outils
    btn.className = 'icon-btn module-btn';
    btn.title = 'Convertir en SVG (vectorisation sans perte ou simplifiée)';
    btn.innerHTML = svgIcon(ICON_SPLINE);
    btn.disabled = true;
    btn.addEventListener('click', open);
    const anchor =
      document.getElementById('btn-upscale') || document.getElementById('btn-crop');
    anchor.insertAdjacentElement('afterend', btn);
    return btn;
  }

  function buildDialog() {
    const backdrop = document.createElement('div');
    backdrop.id = 'svgx-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div id="svgx-dialog" role="dialog" aria-modal="true" aria-labelledby="svgx-title">
        <div id="svgx-header">
          <div id="svgx-title-wrap">
            ${svgIcon(ICON_SPLINE, 20)}
            <h2 id="svgx-title">Convertir en SVG</h2>
          </div>
          <button id="svgx-close" class="icon-btn" title="Fermer (Échap)">
            ${svgIcon('<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />')}
          </button>
        </div>

        <div id="svgx-progress" hidden>
          <div id="svgx-progress-track"><div id="svgx-progress-bar"></div></div>
          <div id="svgx-progress-info">
            <span id="svgx-progress-label">Vectorisation en cours…</span>
            <span id="svgx-progress-pct">0 %</span>
          </div>
          <div class="svgx-buttons">
            <button id="svgx-abort" class="btn-labeled">Annuler</button>
          </div>
        </div>

        <div id="svgx-result" hidden>
          <div id="svgx-controls">
            <div class="svgx-row">
              <span class="svgx-label">Mode</span>
              <div id="svgx-modes">
                <button class="svgx-mode" data-mode="lossless">Sans perte</button>
                <button class="svgx-mode" data-mode="simplified">Simplifié</button>
              </div>
            </div>
            <div class="svgx-row" id="svgx-colors-row" hidden>
              <span class="svgx-label">Couleurs</span>
              <input id="svgx-colors" type="range" min="0" max="${COLOR_STOPS.length - 1}" step="1" />
              <span id="svgx-colors-val"></span>
            </div>
            <p id="svgx-notice" hidden>Cette image est trop détaillée pour une vectorisation
              sans perte : le mode simplifié a été appliqué. Ajustez le nombre de couleurs
              ci-dessus selon le rendu voulu.</p>
          </div>
          <div id="svgx-preview-wrap"><img id="svgx-preview" alt="Aperçu du SVG" draggable="false" /></div>
          <dl id="svgx-stats"></dl>
          <p class="svgx-note" id="svgx-note"></p>
          <div class="svgx-buttons">
            <button id="svgx-cancel" class="btn-labeled">Annuler</button>
            <button id="svgx-save" class="btn-labeled np-primary">Exporter en SVG…</button>
          </div>
        </div>

        <div id="svgx-error" hidden>
          <p id="svgx-error-text"></p>
          <div class="svgx-buttons">
            <button id="svgx-error-close" class="btn-labeled">Fermer</button>
            <button id="svgx-error-retry" class="btn-labeled np-primary" hidden>Réessayer avec moins de couleurs</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    els = {
      backdrop,
      dialog: backdrop.querySelector('#svgx-dialog'),
      progress: backdrop.querySelector('#svgx-progress'),
      progressBar: backdrop.querySelector('#svgx-progress-bar'),
      progressPct: backdrop.querySelector('#svgx-progress-pct'),
      progressLabel: backdrop.querySelector('#svgx-progress-label'),
      result: backdrop.querySelector('#svgx-result'),
      preview: backdrop.querySelector('#svgx-preview'),
      stats: backdrop.querySelector('#svgx-stats'),
      note: backdrop.querySelector('#svgx-note'),
      notice: backdrop.querySelector('#svgx-notice'),
      modeButtons: [...backdrop.querySelectorAll('.svgx-mode')],
      colorsRow: backdrop.querySelector('#svgx-colors-row'),
      colors: backdrop.querySelector('#svgx-colors'),
      colorsVal: backdrop.querySelector('#svgx-colors-val'),
      error: backdrop.querySelector('#svgx-error'),
      errorText: backdrop.querySelector('#svgx-error-text'),
      errorRetry: backdrop.querySelector('#svgx-error-retry'),
    };
    backdrop.querySelector('#svgx-close').addEventListener('click', close);
    backdrop.querySelector('#svgx-abort').addEventListener('click', close);
    backdrop.querySelector('#svgx-cancel').addEventListener('click', close);
    backdrop.querySelector('#svgx-error-close').addEventListener('click', close);
    backdrop.querySelector('#svgx-save').addEventListener('click', exportSvg);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });

    for (const btn of els.modeButtons) {
      btn.addEventListener('click', () => {
        if (btn.dataset.mode === mode || (btn.dataset.mode === 'lossless' && losslessBlocked)) return;
        mode = btn.dataset.mode;
        runVector();
      });
    }
    els.colors.addEventListener('input', () => {
      els.colorsVal.textContent = `${COLOR_STOPS[els.colors.value]} couleurs`;
    });
    els.colors.addEventListener('change', () => {
      colorCount = COLOR_STOPS[els.colors.value];
      localStorage.setItem('svgExportColors', String(colorCount));
      runVector();
    });
    els.errorRetry.addEventListener('click', () => {
      const lower = COLOR_STOPS.filter((c) => c < colorCount);
      if (lower.length > 0) colorCount = lower[lower.length - 1];
      runVector();
    });
  }

  /* ---------- Cycle de vie de la popup ---------- */

  function isOpen() {
    return els !== null && !els.backdrop.hidden;
  }

  function setPhase(phase) {
    els.progress.hidden = phase !== 'progress';
    els.result.hidden = phase !== 'result';
    els.error.hidden = phase !== 'error';
  }

  /* La popup est modale : aucun raccourci de la visionneuse ne doit agir
     derrière elle (flèches, R, Suppr…). Capture au niveau fenêtre. */
  function onKeydown(event) {
    event.stopPropagation();
    if (event.key === 'Escape') close();
  }

  function open() {
    const file = host.getFile();
    if (!file || isOpen() || !host.canOpen()) return;
    mode = 'lossless';
    losslessBlocked = false;
    els.backdrop.hidden = false;
    window.addEventListener('keydown', onKeydown, true);
    prepare(file);
  }

  function close() {
    if (!isOpen()) return;
    window.removeEventListener('keydown', onKeydown, true);
    stopWorker();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    els.preview.removeAttribute('src');
    svgText = null;
    source = null;
    els.backdrop.hidden = true;
  }

  function stopWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  function fail(message, canRetrySimpler) {
    els.errorText.textContent = message;
    els.errorRetry.hidden = !canRetrySimpler;
    setPhase('error');
  }

  /* ---------- Vectorisation ---------- */

  /* Décode le fichier une seule fois par session de popup, puis lance
     la première vectorisation. */
  async function prepare(file) {
    showProgress();
    const decoded = await host.decodeFile(file);
    if (!isOpen()) return;
    if (!decoded) {
      fail('Impossible de décoder cette image.');
      return;
    }
    const { img, url } = decoded;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    source = { data: imageData.data, width: canvas.width, height: canvas.height };
    runVector();
  }

  function showProgress() {
    els.progressBar.style.width = '0%';
    els.progressPct.textContent = '0 %';
    els.progressLabel.textContent =
      mode === 'lossless'
        ? 'Vectorisation sans perte en cours…'
        : `Simplification (${colorCount} couleurs) et vectorisation…`;
    setPhase('progress');
  }

  function runVector() {
    if (!source) return;
    stopWorker();
    showProgress();
    worker = new Worker(WORKER_URL);
    worker.onmessage = (event) => onWorkerMessage(event.data);
    worker.onerror = () => {
      if (isOpen()) fail('La vectorisation a échoué.');
    };
    // copie des pixels : la source reste disponible pour les réglages suivants
    const pixels = source.data.slice().buffer;
    worker.postMessage(
      {
        width: source.width,
        height: source.height,
        pixels,
        mode,
        colors: colorCount,
        smoothPasses: SMOOTH_PASSES,
      },
      [pixels]
    );
  }

  function onWorkerMessage(msg) {
    if (!isOpen()) return;
    if (msg.type === 'progress') {
      const pct = Math.round(msg.pct);
      els.progressBar.style.width = `${pct}%`;
      els.progressPct.textContent = `${pct} %`;
      return;
    }
    if (msg.type === 'error') {
      onWorkerError(msg);
      return;
    }
    stopWorker();
    svgText = msg.svg;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    els.preview.src = previewUrl;
    renderControls();
    renderStats(msg.stats);
    setPhase('result');
  }

  function onWorkerError(msg) {
    stopWorker();
    if (msg.code !== 'limit') {
      fail(`Vectorisation impossible : ${msg.message}`);
      return;
    }
    if (mode === 'lossless') {
      // image photographique : bascule automatique en mode simplifié
      losslessBlocked = true;
      mode = 'simplified';
      runVector();
      return;
    }
    fail(
      `Vectorisation impossible : ${msg.message} ` +
        'Réduisez le nombre de couleurs pour obtenir un fichier exploitable.',
      colorCount > COLOR_STOPS[0]
    );
  }

  /* ---------- Résultat ---------- */

  function renderControls() {
    for (const btn of els.modeButtons) {
      btn.classList.toggle('is-selected', btn.dataset.mode === mode);
      const blocked = btn.dataset.mode === 'lossless' && losslessBlocked;
      btn.disabled = blocked;
      btn.title = blocked ? 'Impossible pour cette image : trop détaillée' : '';
    }
    els.colorsRow.hidden = mode !== 'simplified';
    els.colors.value = String(Math.max(0, COLOR_STOPS.indexOf(colorCount)));
    els.colorsVal.textContent = `${colorCount} couleurs`;
    els.notice.hidden = !(losslessBlocked && mode === 'simplified');
    els.note.textContent =
      mode === 'lossless'
        ? 'Rendu identique au pixel près : chaque zone de couleur est devenue un tracé ' +
          'vectoriel, transparence comprise. Le fichier reste net à n’importe quel zoom.'
        : 'Image réduite à quelques couleurs puis vectorisée : le SVG est exactement ' +
          'fidèle à l’aperçu ci-dessus, et reste net à n’importe quel zoom.';
  }

  function renderStats(stats) {
    els.stats.innerHTML = '';
    statRow('Mode', mode === 'lossless' ? 'Sans perte' : `Simplifié — ${colorCount} couleurs`);
    statRow('Dimensions', `${source.width} × ${source.height} px`);
    statRow('Couleurs', stats.colors.toLocaleString('fr-FR'));
    statRow('Tracés', stats.rects.toLocaleString('fr-FR'));
    statRow('Poids du SVG', formatBytes(stats.bytes));
  }

  function statRow(label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    els.stats.append(dt, dd);
  }

  function formatBytes(n) {
    const units = ['octets', 'Ko', 'Mo'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`;
  }

  /* ---------- Export ---------- */

  async function exportSvg() {
    const file = host.getFile();
    if (!svgText || !file || saving) return;
    saving = true;
    try {
      const dot = file.name.lastIndexOf('.');
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      const saved = await window.viewer.exportSvg({
        suggestedName: `${base}.svg`,
        data: new TextEncoder().encode(svgText),
      });
      if (saved) close(); // dialogue annulé sinon : la popup reste ouverte
    } finally {
      saving = false;
    }
  }

  /* ---------- API ---------- */

  function init(hostApi) {
    host = hostApi;
    buildButton();
    buildDialog();
  }

  return { init, open };
})();
