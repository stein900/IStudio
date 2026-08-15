'use strict';

/**
 * Module Convertir — changement de format d'une image (PNG, JPEG, WebP,
 * TIFF, BMP, ICO ; le SVG est relayé au module « Convertir en SVG »).
 *
 * La popup encode réellement l'image à chaque réglage : l'aperçu et le
 * poids affichés sont ceux du fichier final, pas une estimation. PNG,
 * JPEG et WebP passent par l'encodeur natif de Chromium ; TIFF et BMP
 * sont écrits à la main dans convert-worker.js ; l'ICO multi-résolutions
 * est assemblé à partir de PNG réduits par moitiés successives.
 *
 * Autonome et débranchable : construit lui-même son bouton de barre
 * d'outils, sa carte d'accueil et sa popup, et n'attend de l'hôte que les
 * fonctions passées à init(). Voir README.md du dossier pour les points
 * d'intégration exacts (et comment le retirer).
 */

window.ImageConvert = (() => {
  // i18n : cle = phrase francaise (repli automatique)
  const t = (str, params) => (window.I18n ? window.I18n.t(str, params) : str);

  const WORKER_URL = 'convert/convert-worker.js';
  const DEFAULT_QUALITY = 90;
  const ICO_BASE_SIZES = [16, 32, 48, 256];

  /* Formats de sortie. `lossy` affiche le réglage de qualité ; `worker`
     passe par convert-worker.js ; `delegate` relaie au module Export SVG. */
  const FORMATS = [
    { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png' },
    { id: 'jpeg', label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', lossy: true },
    { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', lossy: true },
    { id: 'tiff', label: 'TIFF', ext: 'tif', mime: 'image/tiff', worker: true },
    { id: 'bmp', label: 'BMP', ext: 'bmp', mime: 'image/bmp', worker: true },
    { id: 'ico', label: 'ICO', ext: 'ico', mime: 'image/x-icon' },
    { id: 'svg', label: 'SVG', ext: 'svg', delegate: true },
  ];

  const NOTES = {
    png: 'PNG : compression sans perte, transparence préservée. Idéal pour les captures d’écran, logos et interfaces.',
    jpeg: 'JPEG : léger et universel, idéal pour les photos. Sans transparence : les zones transparentes sont aplaties sur fond blanc.',
    webp: 'WebP : moderne et très compact, transparence préservée. Parfait pour le web.',
    tiff: 'TIFF : non compressé, fidèle au pixel près. Format d’archivage et d’impression (fichier volumineux).',
    bmp: 'BMP : format brut sans compression, lisible partout.',
    ico: 'ICO : icône Windows multi-résolutions ({sizes} px) dans un seul fichier.',
    svg: 'SVG : la vectorisation est assurée par le module dédié « Convertir en SVG ».',
  };

  /* Extensions couvertes par chaque format : évite de proposer par défaut
     une conversion vers le format d'origine du fichier. */
  const EXT_FAMILY = {
    png: ['png'],
    jpeg: ['jpg', 'jpeg', 'jfif'],
    webp: ['webp'],
    tiff: ['tif', 'tiff'],
    bmp: ['bmp'],
    ico: ['ico'],
  };

  /* Fournitures de l'hôte (renderer.js) :
     - getFile()          : fichier affiché ({ name, path }) ou null
     - decodeFile()       : Promise<{ img, url }> — pixels décodés du fichier
     - canOpen()          : l'hôte n'est pas occupé (rognage, édition…)
     - saveCopyBeside()   : écrit « nom copie.ext » à côté de l'original
     - refreshAfterSave() : recharge la visionneuse sur le fichier écrit
     - openFileThen(fn)   : accueil — choisir une image puis rappeler fn */
  let host = null;
  let els = null;
  let worker = null;
  let saving = false;

  /* État d'une session de popup. */
  let source = null; // { canvas, width, height, imageData, hasAlpha, flat, pngUrl }
  let result = null; // { data: Uint8Array, blob }
  let format = 'png';
  let quality = readStoredQuality();
  let previewUrl = null; // URL d'aperçu propre au résultat courant
  let encodeSeq = 0; // jeton : seul le dernier encodage lancé compte

  function readStoredQuality() {
    const stored = Number(localStorage.getItem('convertQuality'));
    return Number.isInteger(stored) && stored >= 40 && stored <= 100 ? stored : DEFAULT_QUALITY;
  }

  function formatById(id) {
    return FORMATS.find((f) => f.id === id);
  }

  /* ---------- Construction de l'interface ---------- */

  const ICON_CONVERT =
    '<path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />' +
    '<path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />';

  function svgIcon(paths, size, strokeWidth) {
    return (
      `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} fill="none" ` +
      `stroke="currentColor" stroke-width="${strokeWidth || 1.8}" stroke-linecap="round" ` +
      `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
    );
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = 'cvt-btn';
    // .module-btn : l'hôte synchronise disabled avec les autres outils
    btn.className = 'icon-btn module-btn';
    btn.title = 'Convertir le format de l’image (PNG, JPEG, WebP, TIFF, BMP, ICO…)';
    btn.innerHTML = svgIcon(ICON_CONVERT);
    btn.disabled = true;
    btn.addEventListener('click', open);
    const anchor =
      document.getElementById('svgx-btn') ||
      document.getElementById('btn-upscale') ||
      document.getElementById('btn-crop');
    anchor.insertAdjacentElement('afterend', btn);
  }

  function buildHomeCard() {
    const actions = document.getElementById('home-actions');
    if (!actions) return;
    const card = document.createElement('button');
    card.id = 'home-convert';
    card.className = 'home-card home-card-wide';
    card.innerHTML = `
      ${svgIcon(ICON_CONVERT, null, 1.6)}
      <span class="home-card-text">
        <span class="home-card-title" data-i18n>Convertir une image</span>
        <span class="home-card-sub" data-i18n>PNG, JPEG, WebP, TIFF, BMP, ICO… : choisir une image, régler la qualité, puis l’enregistrer dans le format voulu</span>
      </span>`;
    card.addEventListener('click', () => host.openFileThen(open));
    const anchor = document.getElementById('home-upscale');
    if (anchor) anchor.insertAdjacentElement('afterend', card);
    else actions.appendChild(card);
  }

  function buildDialog() {
    const withSvg = Boolean(window.SvgExport); // module Export SVG débranché : pas de tuile SVG
    const tiles = FORMATS.filter((f) => !f.delegate || withSvg)
      .map((f) => `<button class="cvt-format" data-id="${f.id}">${f.label}</button>`)
      .join('');

    const backdrop = document.createElement('div');
    backdrop.id = 'cvt-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div id="cvt-dialog" role="dialog" aria-modal="true" aria-labelledby="cvt-title">
        <div id="cvt-header">
          <div id="cvt-title-wrap">
            ${svgIcon(ICON_CONVERT, 20)}
            <h2 id="cvt-title" data-i18n>Convertir le format</h2>
          </div>
          <button id="cvt-close" class="icon-btn" title="Fermer (Échap)">
            ${svgIcon('<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />')}
          </button>
        </div>

        <div id="cvt-progress" hidden>
          <div id="cvt-progress-track"><div id="cvt-progress-bar"></div></div>
          <div id="cvt-progress-label"></div>
          <div class="cvt-buttons">
            <button id="cvt-abort" class="btn-labeled" data-i18n>Annuler</button>
          </div>
        </div>

        <div id="cvt-result" hidden>
          <div class="cvt-row">
            <span class="cvt-label" data-i18n>Format de sortie</span>
            <div id="cvt-formats">${tiles}</div>
          </div>
          <div class="cvt-row" id="cvt-quality-row" hidden>
            <span class="cvt-label" data-i18n>Qualité</span>
            <input id="cvt-quality" type="range" min="40" max="100" step="1" />
            <span id="cvt-quality-val"></span>
          </div>
          <p id="cvt-note"></p>
          <div id="cvt-preview-wrap"><img id="cvt-preview" alt="" draggable="false" /></div>
          <dl id="cvt-stats"></dl>
          <div class="cvt-buttons">
            <button id="cvt-cancel" class="btn-labeled" data-i18n>Annuler</button>
            <button id="cvt-copy" class="btn-labeled" data-i18n>Enregistrer une copie</button>
            <button id="cvt-save" class="btn-labeled np-primary" data-i18n>Enregistrer sous…</button>
            <button id="cvt-open-svg" class="btn-labeled np-primary" hidden data-i18n>Ouvrir le module SVG</button>
          </div>
        </div>

        <div id="cvt-error" hidden>
          <p id="cvt-error-text"></p>
          <div class="cvt-buttons">
            <button id="cvt-error-close" class="btn-labeled" data-i18n>Fermer</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    els = {
      backdrop,
      progress: backdrop.querySelector('#cvt-progress'),
      progressLabel: backdrop.querySelector('#cvt-progress-label'),
      result: backdrop.querySelector('#cvt-result'),
      formatButtons: [...backdrop.querySelectorAll('.cvt-format')],
      qualityRow: backdrop.querySelector('#cvt-quality-row'),
      quality: backdrop.querySelector('#cvt-quality'),
      qualityVal: backdrop.querySelector('#cvt-quality-val'),
      note: backdrop.querySelector('#cvt-note'),
      previewWrap: backdrop.querySelector('#cvt-preview-wrap'),
      preview: backdrop.querySelector('#cvt-preview'),
      stats: backdrop.querySelector('#cvt-stats'),
      copy: backdrop.querySelector('#cvt-copy'),
      save: backdrop.querySelector('#cvt-save'),
      openSvg: backdrop.querySelector('#cvt-open-svg'),
      error: backdrop.querySelector('#cvt-error'),
      errorText: backdrop.querySelector('#cvt-error-text'),
    };
    backdrop.querySelector('#cvt-close').addEventListener('click', close);
    backdrop.querySelector('#cvt-abort').addEventListener('click', close);
    backdrop.querySelector('#cvt-cancel').addEventListener('click', close);
    backdrop.querySelector('#cvt-error-close').addEventListener('click', close);
    els.copy.addEventListener('click', saveCopyBeside);
    els.save.addEventListener('click', saveAs);
    els.openSvg.addEventListener('click', () => {
      close();
      if (window.SvgExport) window.SvgExport.open();
    });
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });

    for (const btn of els.formatButtons) {
      btn.addEventListener('click', () => {
        if (btn.dataset.id === format) return;
        format = btn.dataset.id;
        if (!formatById(format).delegate) localStorage.setItem('convertFormat', format);
        runEncode(false);
      });
    }
    els.quality.addEventListener('input', () => {
      els.qualityVal.textContent = `${els.quality.value} %`;
    });
    els.quality.addEventListener('change', () => {
      quality = Number(els.quality.value);
      localStorage.setItem('convertQuality', String(quality));
      runEncode(false);
    });

    // changement de langue popup ouverte : retraduit note et statistiques
    if (window.I18n) {
      window.I18n.onChange(() => {
        if (isOpen() && source) renderResult();
      });
    }
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

  /* Format proposé à l'ouverture : le dernier utilisé — sauf s'il est
     celui du fichier affiché, auquel cas on bascule sur PNG (ou JPEG). */
  function pickInitialFormat(file) {
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const stored = localStorage.getItem('convertFormat');
    const fmt = formatById(stored);
    const valid = fmt && !fmt.delegate ? stored : 'png';
    if ((EXT_FAMILY[valid] || []).includes(ext)) return valid === 'png' ? 'jpeg' : 'png';
    return valid;
  }

  function open() {
    const file = host.getFile();
    if (!file || isOpen() || !host.canOpen()) return;
    format = pickInitialFormat(file);
    els.backdrop.hidden = false;
    window.addEventListener('keydown', onKeydown, true);
    prepare(file);
  }

  function close() {
    if (!isOpen()) return;
    window.removeEventListener('keydown', onKeydown, true);
    encodeSeq += 1; // invalide tout encodage encore en vol
    stopWorker();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    if (source && source.pngUrl) URL.revokeObjectURL(source.pngUrl);
    els.preview.removeAttribute('src');
    source = null;
    result = null;
    els.backdrop.hidden = true;
  }

  function stopWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  function fail(message) {
    els.errorText.textContent = message;
    setPhase('error');
  }

  function showProgress(label) {
    els.progressLabel.textContent = label;
    setPhase('progress');
  }

  /* ---------- Décodage du fichier affiché ---------- */

  async function prepare(file) {
    showProgress(t('Préparation de l’image…'));
    let decoded = null;
    try {
      decoded = await host.decodeFile(file);
    } catch {
      decoded = null;
    }
    if (!isOpen()) {
      if (decoded) URL.revokeObjectURL(decoded.url);
      return;
    }
    if (!decoded || !decoded.img.naturalWidth) {
      if (decoded) URL.revokeObjectURL(decoded.url);
      fail(t('Impossible de décoder cette image.'));
      return;
    }
    const { img, url } = decoded;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    let imageData = null;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      fail(t('Impossible de décoder cette image.')); // image hors limites du canvas
      return;
    }
    source = {
      canvas,
      width: canvas.width,
      height: canvas.height,
      imageData,
      hasAlpha: detectAlpha(imageData),
      flat: null, // version aplatie sur blanc (JPEG), créée à la demande
      pngUrl: null, // aperçu PNG de la source (TIFF), créé à la demande
    };
    runEncode(true);
  }

  function detectAlpha(imageData) {
    const px = new Uint32Array(imageData.data.buffer);
    for (let i = 0; i < px.length; i += 1) {
      if (px[i] >>> 24 !== 255) return true;
    }
    return false;
  }

  /* ---------- Encodage ---------- */

  async function runEncode(initial) {
    if (!source) return;
    const fmt = formatById(format);
    if (fmt.delegate) {
      result = null;
      renderResult();
      setPhase('result');
      return;
    }
    const seq = ++encodeSeq;
    result = null;
    if (initial) {
      showProgress(t('Encodage en cours…'));
    } else {
      // réglage ajusté : la popup reste en place, l'aperçu s'estompe
      els.result.classList.add('is-busy');
      els.copy.disabled = true;
      els.save.disabled = true;
    }
    try {
      const encoded = await encode(fmt);
      if (seq !== encodeSeq || !isOpen()) return;
      result = encoded;
      await updatePreview(fmt, encoded);
      if (seq !== encodeSeq || !isOpen()) return;
      renderResult();
      setPhase('result');
    } catch (err) {
      if (seq !== encodeSeq || !isOpen()) return;
      fail(t('Conversion impossible : {msg}', { msg: err && err.message ? err.message : String(err) }));
    } finally {
      if (seq === encodeSeq && els) {
        els.result.classList.remove('is-busy');
        els.copy.disabled = false;
        els.save.disabled = false;
      }
    }
  }

  async function encode(fmt) {
    if (fmt.worker) return encodeInWorker(fmt);
    if (fmt.id === 'ico') return encodeIco();
    // PNG, JPEG, WebP : encodeur natif de Chromium
    const canvas = fmt.id === 'jpeg' && source.hasAlpha ? flattenWhite() : source.canvas;
    const blob = await toBlob(canvas, fmt.mime, fmt.lossy ? quality / 100 : undefined);
    return { data: new Uint8Array(await blob.arrayBuffer()), blob };
  }

  function toBlob(canvas, mime, q) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(t('L’encodage a échoué.')));
      }, mime, q);
    });
  }

  /* Le JPEG ignore l'alpha : les zones transparentes sont posées sur blanc. */
  function flattenWhite() {
    if (source.flat) return source.flat;
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source.canvas, 0, 0);
    source.flat = c;
    return c;
  }

  function encodeInWorker(fmt) {
    return new Promise((resolve, reject) => {
      stopWorker();
      worker = new Worker(WORKER_URL);
      worker.onmessage = (event) => {
        stopWorker();
        const msg = event.data;
        if (!msg.ok) {
          reject(new Error(msg.message));
          return;
        }
        resolve({
          data: new Uint8Array(msg.buffer),
          blob: new Blob([msg.buffer], { type: fmt.mime }),
        });
      };
      worker.onerror = () => {
        stopWorker();
        reject(new Error(t('L’encodage a échoué.')));
      };
      // copie des pixels : la source reste disponible pour les réglages suivants
      const pixels = source.imageData.data.slice().buffer;
      worker.postMessage(
        {
          format: fmt.id,
          width: source.width,
          height: source.height,
          pixels,
          hasAlpha: source.hasAlpha,
        },
        [pixels]
      );
    });
  }

  /* ---------- ICO multi-résolutions ---------- */

  function icoSizes() {
    const top = Math.max(1, Math.min(256, Math.max(source.width, source.height)));
    const sizes = ICO_BASE_SIZES.filter((s) => s < top);
    sizes.push(top);
    return sizes;
  }

  async function encodeIco() {
    const sizes = icoSizes();
    const pngs = [];
    for (const size of sizes) {
      const blob = await toBlob(drawIcon(size), 'image/png');
      pngs.push(new Uint8Array(await blob.arrayBuffer()));
    }
    const headerSize = 6 + sizes.length * 16;
    const total = headerSize + pngs.reduce((sum, p) => sum + p.byteLength, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint16(2, 1, true); // type : icône
    view.setUint16(4, sizes.length, true);
    let dataOffset = headerSize;
    sizes.forEach((size, i) => {
      const p = 6 + i * 16;
      out[p] = size === 256 ? 0 : size; // 0 = 256 dans l'en-tête ICO
      out[p + 1] = size === 256 ? 0 : size;
      view.setUint16(p + 4, 1, true); // plans
      view.setUint16(p + 6, 32, true); // bits par pixel
      view.setUint32(p + 8, pngs[i].byteLength, true);
      view.setUint32(p + 12, dataOffset, true);
      out.set(pngs[i], dataOffset);
      dataOffset += pngs[i].byteLength;
    });
    return { data: out, blob: new Blob([out], { type: 'image/x-icon' }) };
  }

  /* Vignette carrée nette : réductions par moitiés successives, image
     centrée (proportions conservées) sur fond transparent. */
  function drawIcon(size) {
    let src = source.canvas;
    while (Math.max(src.width, src.height) > size * 2) {
      const half = document.createElement('canvas');
      half.width = Math.max(1, Math.round(src.width / 2));
      half.height = Math.max(1, Math.round(src.height / 2));
      const hctx = half.getContext('2d');
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(src, 0, 0, half.width, half.height);
      src = half;
    }
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(size / src.width, size / src.height);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    ctx.drawImage(src, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    return c;
  }

  /* ---------- Résultat ---------- */

  async function updatePreview(fmt, encoded) {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    if (fmt.id === 'tiff') {
      // Chromium ne décode pas le TIFF : l'aperçu montre les pixels source
      // (identiques : le TIFF écrit ici est sans perte)
      const src = source;
      if (!src.pngUrl) {
        const blob = await toBlob(src.canvas, 'image/png');
        if (source !== src) return; // popup refermée ou rouverte entre-temps
        src.pngUrl = URL.createObjectURL(blob);
      }
      els.preview.src = src.pngUrl;
      return;
    }
    previewUrl = URL.createObjectURL(encoded.blob);
    els.preview.src = previewUrl;
  }

  function renderResult() {
    const fmt = formatById(format);
    const isDelegate = Boolean(fmt.delegate);
    for (const btn of els.formatButtons) {
      btn.classList.toggle('is-selected', btn.dataset.id === format);
    }
    els.qualityRow.hidden = isDelegate || !fmt.lossy;
    els.quality.value = String(quality);
    els.qualityVal.textContent = `${quality} %`;
    els.note.textContent =
      fmt.id === 'ico' ? t(NOTES.ico, { sizes: icoSizes().join(', ') }) : t(NOTES[fmt.id]);
    els.previewWrap.hidden = isDelegate;
    els.stats.hidden = isDelegate;
    els.copy.hidden = isDelegate;
    els.save.hidden = isDelegate;
    els.openSvg.hidden = !isDelegate;
    if (!isDelegate && result) renderStats(fmt);
  }

  function renderStats(fmt) {
    els.stats.innerHTML = '';
    statRow('Format', fmt.label);
    statRow(
      'Dimensions',
      fmt.id === 'ico' ? `${icoSizes().join(' / ')} px` : `${source.width} × ${source.height} px`
    );
    statRow('Poids', formatBytes(result.data.byteLength));
  }

  function statRow(label, value) {
    const dt = document.createElement('dt');
    dt.textContent = t(label);
    const dd = document.createElement('dd');
    dd.textContent = value;
    els.stats.append(dt, dd);
  }

  function formatBytes(n) {
    const units = [t('octets'), t('Ko'), t('Mo')];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`;
  }

  /* ---------- Enregistrement ---------- */

  function baseName(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  async function saveAs() {
    const file = host.getFile();
    if (!result || !file || saving) return;
    saving = true;
    try {
      const fmt = formatById(format);
      const saved = await window.viewer.convertExport({
        suggestedName: `${baseName(file.name)}.${fmt.ext}`,
        data: result.data,
        format: fmt.id,
      });
      if (saved) close(); // dialogue annulé sinon : la popup reste ouverte
    } finally {
      saving = false;
    }
  }

  async function saveCopyBeside() {
    const file = host.getFile();
    if (!result || !file || saving) return;
    saving = true;
    try {
      const fmt = formatById(format);
      const saved = await host.saveCopyBeside({
        sourcePath: file.path,
        outExt: fmt.ext,
        data: result.data,
      });
      if (!saved) {
        fail(t('Enregistrement impossible (fichier verrouillé ou dossier protégé ?).'));
        return;
      }
      close();
      // la copie s'ouvre dans la visionneuse — sauf TIFF (non affichable ici)
      if (fmt.id !== 'tiff') await host.refreshAfterSave(saved, file);
    } finally {
      saving = false;
    }
  }

  /* ---------- API ---------- */

  function init(hostApi) {
    host = hostApi;
    buildButton();
    buildHomeCard();
    buildDialog();
  }

  return { init, open };
})();
