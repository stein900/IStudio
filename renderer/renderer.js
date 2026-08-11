'use strict';

const stage = document.getElementById('stage');
const image = document.getElementById('image');
const emptyState = document.getElementById('empty-state');
const errorState = document.getElementById('error-state');
const errorName = document.getElementById('error-name');
const filmstrip = document.getElementById('filmstrip');
const stripToggle = document.getElementById('strip-toggle');
const counter = document.getElementById('counter');
const zoomLabel = document.getElementById('zoom-label');
const fileNameEl = document.getElementById('file-name');
const fileMetaEl = document.getElementById('file-meta');
const btnOpen = document.getElementById('btn-open');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnFit = document.getElementById('btn-fit');
const btnRotate = document.getElementById('btn-rotate');
const btnCrop = document.getElementById('btn-crop');
const btnPaint = document.getElementById('btn-paint');
const btnStudio = document.getElementById('btn-studio');
const btnInfo = document.getElementById('btn-info');
const btnPrint = document.getElementById('btn-print');
const btnDelete = document.getElementById('btn-delete');
const btnFilm = document.getElementById('btn-film');
const btnFullscreen = document.getElementById('btn-fullscreen');
const cropLayer = document.getElementById('crop-layer');
const cropArea = document.getElementById('crop-area');
const cropSelection = document.getElementById('crop-selection');
const cropSizeEl = document.getElementById('crop-size');
const cropApply = document.getElementById('crop-apply');
const cropCancel = document.getElementById('crop-cancel');
const infoOverlay = document.getElementById('info-overlay');
const infoBody = document.getElementById('info-body');
const infoClose = document.getElementById('info-close');

// Limites très larges : en pratique on est libre de zoomer/dézoomer sans contrainte.
const ZOOM_MIN = 0.001;
const ZOOM_MAX = 1000;

const state = {
  files: [],
  index: -1,
  fit: true,
  zoom: 1,
  panX: 0,
  panY: 0,
  stat: null, // fs.stat du fichier courant
};

let filmstripVisible = localStorage.getItem('filmstripVisible') !== 'false';
let isFullscreen = false;
let cropMode = false;
let cropSel = { x: 0, y: 0, w: 0, h: 0 }; // en pixels affichés, relatif à #crop-area

/* ---------- Formatage ---------- */

function formatBytes(n) {
  if (n == null) return '';
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  if (i === 0) return `${n.toLocaleString('fr-FR')} octets`;
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`;
}

function formatDate(ms) {
  if (!ms) return '–';
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

function aspectRatio(w, h) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  const a = w / g;
  const b = h / g;
  if (a <= 50 && b <= 50) return `${a}:${b}`;
  return `${(w / h).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}:1`;
}

/* ---------- Affichage ---------- */

function currentFile() {
  return state.index >= 0 ? state.files[state.index] : null;
}

function fitScale() {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  if (!w || !h) return 1;
  const sw = (stage.clientWidth - 16) / w;
  const sh = (stage.clientHeight - 16) / h;
  return Math.min(sw, sh, 1);
}

function applyTransform() {
  image.style.transform =
    `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  zoomLabel.textContent = state.fit ? 'Ajusté' : `${Math.round(state.zoom * 100)} %`;
}

function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/* Zoome en gardant le point (cx, cy) — coordonnées écran — fixe sous le curseur. */
function setZoomAt(newZoom, cx, cy) {
  const rect = stage.getBoundingClientRect();
  const ox = cx - rect.left - rect.width / 2;
  const oy = cy - rect.top - rect.height / 2;
  const z1 = state.zoom;
  const z2 = clampZoom(newZoom);
  state.panX = ox - ((ox - state.panX) / z1) * z2;
  state.panY = oy - ((oy - state.panY) / z1) * z2;
  state.zoom = z2;
  state.fit = false;
  applyTransform();
}

function setZoomCentered(newZoom) {
  const rect = stage.getBoundingClientRect();
  setZoomAt(newZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function setFit() {
  state.fit = true;
  state.zoom = fitScale();
  state.panX = 0;
  state.panY = 0;
  applyTransform();
}

/* La rotation modifie réellement les pixels du fichier (voir plus bas,
   section Édition sur disque). */

function updateFileMeta() {
  const parts = [];
  if (image.naturalWidth && image.naturalHeight && !image.hidden) {
    parts.push(`${image.naturalWidth} × ${image.naturalHeight} px`);
  }
  if (state.stat) {
    parts.push(formatBytes(state.stat.size));
  }
  fileMetaEl.textContent = parts.join('  ·  ');
}

async function refreshFileStat(file) {
  state.stat = null;
  updateFileMeta();
  const stat = await window.viewer.fileInfo(file.path);
  if (currentFile()?.path !== file.path) return;
  state.stat = stat;
  updateFileMeta();
}

function render() {
  const file = currentFile();
  const hasFile = Boolean(file);

  emptyState.hidden = hasFile;
  errorState.hidden = true;
  image.hidden = !hasFile;
  stage.classList.toggle('pannable', hasFile && !cropMode);

  const disable = !hasFile;
  btnPrev.disabled = disable || state.files.length < 2;
  btnNext.disabled = disable || state.files.length < 2;
  for (const b of [btnZoomIn, btnZoomOut, btnFit, btnRotate, btnCrop, btnPaint, btnStudio, btnInfo, btnPrint, btnDelete]) {
    b.disabled = disable;
  }

  if (!hasFile) {
    counter.textContent = '–';
    zoomLabel.textContent = '';
    fileNameEl.textContent = 'IStudio Viewer';
    fileMetaEl.textContent = '';
    window.viewer.setTitle('IStudio Viewer');
    return;
  }

  counter.textContent = `${state.index + 1} / ${state.files.length}`;
  fileNameEl.textContent = file.name;
  window.viewer.setTitle(`${file.name} — IStudio Viewer`);

  image.src = file.url;
  refreshFileStat(file);
  updateThumbSelection();
}

image.addEventListener('load', () => {
  setFit();
  updateFileMeta();
});

image.addEventListener('error', () => {
  const file = currentFile();
  if (!file) return;
  image.hidden = true;
  errorState.hidden = false;
  errorName.textContent = file.name;
  updateFileMeta();
});

/* ---------- Miniatures ---------- */

function applyFilmstripVisibility() {
  document.body.classList.toggle('no-filmstrip', !filmstripVisible);
  stripToggle.title = filmstripVisible
    ? 'Masquer les miniatures'
    : 'Afficher les miniatures';
  btnFilm.classList.toggle('active', filmstripVisible);
  btnFilm.title = filmstripVisible
    ? 'Masquer le bandeau de miniatures'
    : 'Afficher le bandeau de miniatures';
}

function setFilmstripVisible(visible) {
  filmstripVisible = visible;
  localStorage.setItem('filmstripVisible', String(visible));
  applyFilmstripVisibility();
}

/* Les miniatures sont chargées par pages de 50 pour ne pas décoder
   des centaines d'images d'un coup dans les gros dossiers. */
const THUMB_PAGE = 50;
let thumbsLoaded = 0;
let thumbMoreBtn = null;

function makeThumb(file, i) {
  const btn = document.createElement('button');
  btn.className = 'thumb';
  btn.title = file.name;
  btn.dataset.index = String(i);

  const img = document.createElement('img');
  img.src = file.url;
  img.alt = file.name;
  img.loading = 'lazy';
  img.decoding = 'async';

  const label = document.createElement('span');
  label.className = 'thumb-name';
  label.textContent = file.name;

  btn.append(img, label);
  btn.addEventListener('click', () => goTo(i));
  return btn;
}

function appendThumbs(upTo) {
  const total = state.files.length;
  const end = Math.min(upTo, total);

  if (thumbMoreBtn) {
    thumbMoreBtn.remove();
    thumbMoreBtn = null;
  }

  for (let i = thumbsLoaded; i < end; i += 1) {
    filmstrip.appendChild(makeThumb(state.files[i], i));
  }
  thumbsLoaded = end;

  const remaining = total - thumbsLoaded;
  if (remaining > 0) {
    thumbMoreBtn = document.createElement('button');
    thumbMoreBtn.className = 'thumb-more';
    thumbMoreBtn.title = `${remaining} image${remaining > 1 ? 's' : ''} non affichée${remaining > 1 ? 's' : ''}`;
    thumbMoreBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>' +
      `<span>${Math.min(THUMB_PAGE, remaining)} suivantes</span>`;
    thumbMoreBtn.addEventListener('click', () => appendThumbs(thumbsLoaded + THUMB_PAGE));
    filmstrip.appendChild(thumbMoreBtn);
  }
}

function ensureThumbLoaded(index) {
  if (index >= thumbsLoaded) {
    appendThumbs(Math.ceil((index + 1) / THUMB_PAGE) * THUMB_PAGE);
  }
}

function buildFilmstrip() {
  filmstrip.innerHTML = '';
  thumbsLoaded = 0;
  thumbMoreBtn = null;
  const hasFiles = state.files.length > 0;
  filmstrip.hidden = !hasFiles;
  stripToggle.hidden = !hasFiles;
  if (!hasFiles) return;

  // Charge la première page, étendue si nécessaire jusqu'à l'image courante.
  const needed = Math.max(THUMB_PAGE, state.index + 1);
  appendThumbs(Math.ceil(needed / THUMB_PAGE) * THUMB_PAGE);
  updateThumbSelection();
}

function updateThumbSelection() {
  ensureThumbLoaded(state.index);
  const thumbs = filmstrip.querySelectorAll('.thumb');
  thumbs.forEach((t) => {
    const isCurrent = Number(t.dataset.index) === state.index;
    t.classList.toggle('current', isCurrent);
    if (isCurrent) {
      t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

/* Molette sur le bandeau : défilement horizontal. */
filmstrip.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    filmstrip.scrollLeft += e.deltaY;
  },
  { passive: false }
);

stripToggle.addEventListener('click', () => setFilmstripVisible(!filmstripVisible));
btnFilm.addEventListener('click', () => setFilmstripVisible(!filmstripVisible));

/* ---------- Plein écran ---------- */

window.viewer.onFullscreenChanged((fs) => {
  isFullscreen = fs;
  document.body.classList.toggle('fullscreen', fs);
});

btnFullscreen.addEventListener('click', () => window.viewer.toggleFullscreen());

/* ---------- Navigation ---------- */

function goTo(index) {
  if (state.files.length === 0) return;
  if (cropMode) exitCrop();
  const n = state.files.length;
  state.index = ((index % n) + n) % n;
  render();
}

function next() {
  goTo(state.index + 1);
}

function prev() {
  goTo(state.index - 1);
}

function loadContext(context) {
  if (!context) return;
  if (cropMode) exitCrop();
  state.files = context.files;
  state.index = context.index;
  buildFilmstrip();
  render();
}

/* ---------- Rognage ---------- */

function cropDisplaySize() {
  // Taille affichée de l'image en mode rognage (ajustée, sans rotation).
  return {
    w: image.naturalWidth * state.zoom,
    h: image.naturalHeight * state.zoom,
  };
}

function layoutCropArea() {
  const { w, h } = cropDisplaySize();
  cropArea.style.width = `${w}px`;
  cropArea.style.height = `${h}px`;
  cropArea.style.left = `${(stage.clientWidth - w) / 2}px`;
  cropArea.style.top = `${(stage.clientHeight - h) / 2}px`;
}

function layoutCropSelection() {
  cropSelection.style.left = `${cropSel.x}px`;
  cropSelection.style.top = `${cropSel.y}px`;
  cropSelection.style.width = `${cropSel.w}px`;
  cropSelection.style.height = `${cropSel.h}px`;
  const { w } = cropDisplaySize();
  const scale = w > 0 ? image.naturalWidth / w : 1;
  cropSizeEl.textContent = `${Math.max(1, Math.round(cropSel.w * scale))} × ${Math.max(1, Math.round(cropSel.h * scale))} px`;
}

function enterCrop() {
  if (!currentFile() || image.hidden || cropMode || editBusy) return;
  setFit();
  cropMode = true;
  btnCrop.classList.add('active');
  stage.classList.remove('pannable');
  layoutCropArea();
  const { w, h } = cropDisplaySize();
  cropSel = { x: w * 0.125, y: h * 0.125, w: w * 0.75, h: h * 0.75 };
  layoutCropSelection();
  cropLayer.hidden = false;
}

function exitCrop() {
  cropMode = false;
  cropLayer.hidden = true;
  btnCrop.classList.remove('active');
  stage.classList.toggle('pannable', Boolean(currentFile()) && !image.hidden);
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
};

/* ---------- Édition sur disque (rotation, rognage) ----------
   Les modifications sont appliquées aux pixels du fichier lui-même :
   lecture, transformation via canvas, puis réécriture directe. */

let editBusy = false;

function extOf(name) {
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

// Formats que le canvas sait ré-encoder dans le même fichier ;
// tout le reste est converti en PNG (l'original part à la corbeille).
function encodeTarget(srcExt) {
  if (srcExt === 'jpg' || srcExt === 'jpeg' || srcExt === 'jfif') {
    return { outExt: srcExt, mime: 'image/jpeg' };
  }
  if (srcExt === 'png') return { outExt: 'png', mime: 'image/png' };
  if (srcExt === 'webp') return { outExt: 'webp', mime: 'image/webp' };
  return { outExt: 'png', mime: 'image/png' };
}

async function decodeCurrentFile(file) {
  const data = await window.viewer.readFile(file.path);
  if (!data) return null;
  const srcExt = extOf(file.name);
  const blob = new Blob([data], { type: MIME_BY_EXT[srcExt] || 'application/octet-stream' });
  return loadImageFromBlob(blob);
}

async function saveCanvasInPlace(canvas, file) {
  const target = encodeTarget(extOf(file.name));
  const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, target.mime, 0.95));
  if (!outBlob) return null;
  const outData = new Uint8Array(await outBlob.arrayBuffer());
  return window.viewer.saveInPlace({
    sourcePath: file.path,
    outExt: target.outExt,
    data: outData,
  });
}

/* Recharge l'image et sa miniature après une édition sur disque. */
async function refreshAfterSave(savedPath, file) {
  if (!savedPath) return;
  if (savedPath.toLowerCase() === file.path.toLowerCase()) {
    const busted = `${file.url.split('?')[0]}?t=${Date.now()}`;
    file.url = busted;
    image.src = busted;
    const thumbImg = filmstrip.querySelector(`.thumb[data-index="${state.index}"] img`);
    if (thumbImg) thumbImg.src = busted;
    refreshFileStat(file);
  } else {
    // Le fichier a changé de nom (conversion PNG) : on reconstruit le contexte.
    loadContext(await window.viewer.reloadContext(savedPath));
  }
}

async function rotate(quarterTurns) {
  const file = currentFile();
  if (!file || image.hidden || cropMode || editBusy) return;
  editBusy = true;
  btnRotate.disabled = true;
  try {
    const decoded = await decodeCurrentFile(file);
    if (!decoded) return;
    const { img, url } = decoded;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = h;
    canvas.height = w;
    const ctx = canvas.getContext('2d');
    ctx.translate(h / 2, w / 2);
    ctx.rotate((quarterTurns * Math.PI) / 2);
    ctx.drawImage(img, -w / 2, -h / 2);
    URL.revokeObjectURL(url);
    await refreshAfterSave(await saveCanvasInPlace(canvas, file), file);
  } catch {
    // décodage ou enregistrement impossible : on ne touche pas au fichier
  } finally {
    editBusy = false;
    btnRotate.disabled = !currentFile();
  }
}

async function applyCrop() {
  const file = currentFile();
  if (!file || !cropMode || editBusy) return;

  const { w: dispW, h: dispH } = cropDisplaySize();
  if (dispW <= 0 || dispH <= 0) return;
  const fx = image.naturalWidth / dispW;
  const fy = image.naturalHeight / dispH;
  const rect = {
    x: Math.max(0, Math.round(cropSel.x * fx)),
    y: Math.max(0, Math.round(cropSel.y * fy)),
    w: Math.max(1, Math.round(cropSel.w * fx)),
    h: Math.max(1, Math.round(cropSel.h * fy)),
  };
  rect.w = Math.min(rect.w, image.naturalWidth - rect.x);
  rect.h = Math.min(rect.h, image.naturalHeight - rect.y);

  editBusy = true;
  cropApply.disabled = true;
  try {
    const decoded = await decodeCurrentFile(file);
    if (!decoded) return;
    const { img, url } = decoded;
    const canvas = document.createElement('canvas');
    canvas.width = rect.w;
    canvas.height = rect.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    URL.revokeObjectURL(url);

    const savedPath = await saveCanvasInPlace(canvas, file);
    if (savedPath) {
      exitCrop();
      await refreshAfterSave(savedPath, file);
    }
  } catch {
    // décodage ou enregistrement impossible : on reste en mode rognage
  } finally {
    editBusy = false;
    cropApply.disabled = false;
  }
}

btnCrop.addEventListener('click', () => {
  if (cropMode) {
    exitCrop();
  } else {
    enterCrop();
  }
});
cropApply.addEventListener('click', applyCrop);
cropCancel.addEventListener('click', exitCrop);

/* Interactions de la sélection de rognage. */
let cropDrag = null;

cropLayer.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target.closest('#crop-bar')) return;
  const areaRect = cropArea.getBoundingClientRect();
  const px = e.clientX - areaRect.left;
  const py = e.clientY - areaRect.top;
  const handle = e.target.dataset ? e.target.dataset.handle : null;

  if (handle) {
    cropDrag = { mode: handle, startX: px, startY: py, sel: { ...cropSel } };
  } else if (e.target.closest('#crop-selection')) {
    cropDrag = { mode: 'move', startX: px, startY: py, sel: { ...cropSel } };
  } else {
    cropDrag = { mode: 'new', startX: px, startY: py, sel: { ...cropSel } };
    cropSel = { x: px, y: py, w: 0, h: 0 };
    layoutCropSelection();
  }
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!cropDrag) return;
  const areaRect = cropArea.getBoundingClientRect();
  const aw = areaRect.width;
  const ah = areaRect.height;
  const px = Math.min(Math.max(e.clientX - areaRect.left, 0), aw);
  const py = Math.min(Math.max(e.clientY - areaRect.top, 0), ah);
  const dx = px - cropDrag.startX;
  const dy = py - cropDrag.startY;
  const s = cropDrag.sel;
  const MIN = 8;

  if (cropDrag.mode === 'move') {
    cropSel.x = Math.min(Math.max(s.x + dx, 0), aw - s.w);
    cropSel.y = Math.min(Math.max(s.y + dy, 0), ah - s.h);
  } else if (cropDrag.mode === 'new') {
    cropSel.x = Math.min(cropDrag.startX, px);
    cropSel.y = Math.min(cropDrag.startY, py);
    cropSel.w = Math.abs(px - cropDrag.startX);
    cropSel.h = Math.abs(py - cropDrag.startY);
  } else {
    let { x, y, w, h } = s;
    const m = cropDrag.mode;
    if (m.includes('w')) {
      const nx = Math.min(Math.max(s.x + dx, 0), s.x + s.w - MIN);
      w = s.w + (s.x - nx);
      x = nx;
    }
    if (m.includes('e')) {
      w = Math.min(Math.max(s.w + dx, MIN), aw - s.x);
    }
    if (m.includes('n')) {
      const ny = Math.min(Math.max(s.y + dy, 0), s.y + s.h - MIN);
      h = s.h + (s.y - ny);
      y = ny;
    }
    if (m.includes('s')) {
      h = Math.min(Math.max(s.h + dy, MIN), ah - s.y);
    }
    cropSel = { x, y, w, h };
  }
  layoutCropSelection();
});

window.addEventListener('mouseup', () => {
  if (cropDrag && cropDrag.mode === 'new' && (cropSel.w < 8 || cropSel.h < 8)) {
    cropSel = cropDrag.sel; // clic sans glisser : on restaure la sélection
    layoutCropSelection();
  }
  cropDrag = null;
});

/* ---------- Popup d'informations ---------- */

function infoRow(label, value) {
  const row = document.createElement('div');
  row.className = 'info-row';
  const dt = document.createElement('div');
  dt.className = 'info-label';
  dt.textContent = label;
  const dd = document.createElement('div');
  dd.className = 'info-value';
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function infoSection(title) {
  const el = document.createElement('div');
  el.className = 'info-section';
  el.textContent = title;
  return el;
}

function showInfo() {
  const file = currentFile();
  if (!file) return;

  const sep = file.path.lastIndexOf('\\') !== -1 ? '\\' : '/';
  const dir = file.path.slice(0, file.path.lastIndexOf(sep)) || file.path;
  const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : '–';
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  infoBody.innerHTML = '';
  infoBody.append(infoSection('Fichier'));
  infoBody.append(infoRow('Nom', file.name));
  infoBody.append(infoRow('Format', ext));
  infoBody.append(infoRow('Taille', state.stat ? `${formatBytes(state.stat.size)} (${state.stat.size.toLocaleString('fr-FR')} octets)` : '–'));
  infoBody.append(infoRow('Dossier', dir));
  infoBody.append(infoRow('Chemin complet', file.path));

  infoBody.append(infoSection('Image'));
  if (w && h && !image.hidden) {
    infoBody.append(infoRow('Dimensions', `${w} × ${h} pixels`));
    infoBody.append(infoRow('Définition', `${((w * h) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mégapixels`));
    infoBody.append(infoRow('Rapport d’aspect', aspectRatio(w, h)));
  } else {
    infoBody.append(infoRow('Dimensions', '–'));
  }

  infoBody.append(infoSection('Dates'));
  infoBody.append(infoRow('Créé le', formatDate(state.stat?.birthtime)));
  infoBody.append(infoRow('Modifié le', formatDate(state.stat?.mtime)));
  infoBody.append(infoRow('Dernier accès', formatDate(state.stat?.atime)));

  infoBody.append(infoSection('Dossier courant'));
  infoBody.append(infoRow('Position', `${state.index + 1} sur ${state.files.length}`));

  infoOverlay.hidden = false;
}

function hideInfo() {
  infoOverlay.hidden = true;
}

btnInfo.addEventListener('click', () => {
  if (infoOverlay.hidden) {
    showInfo();
  } else {
    hideInfo();
  }
});
infoClose.addEventListener('click', hideInfo);
infoOverlay.addEventListener('mousedown', (e) => {
  if (e.target === infoOverlay) hideInfo();
});

/* ---------- Suppression et impression ---------- */

async function deleteCurrent() {
  const file = currentFile();
  if (!file) return;
  if (cropMode) exitCrop();
  const ok = await window.viewer.deleteFile(file.path);
  if (!ok) return;
  state.files.splice(state.index, 1);
  if (state.files.length === 0) {
    state.index = -1;
  } else if (state.index >= state.files.length) {
    state.index = state.files.length - 1;
  }
  buildFilmstrip();
  render();
}

btnDelete.addEventListener('click', deleteCurrent);

btnPrint.addEventListener('click', () => {
  const file = currentFile();
  if (file) window.viewer.printFile(file.url);
});

/* ---------- Contrôles ---------- */

btnOpen.addEventListener('click', async () => {
  const ctx = await window.viewer.pickFile();
  if (ctx) loadContext(ctx);
});

btnPrev.addEventListener('click', prev);
btnNext.addEventListener('click', next);

btnZoomIn.addEventListener('click', () => setZoomCentered(state.zoom * 1.25));
btnZoomOut.addEventListener('click', () => setZoomCentered(state.zoom / 1.25));

btnFit.addEventListener('click', () => {
  if (state.fit) {
    setZoomCentered(1); // bascule Ajusté <-> 100 %
  } else {
    setFit();
  }
});

btnRotate.addEventListener('click', () => rotate(1));

/* ---------- Paint : annotation de l'image courante ---------- */

Paint.init({
  // Aplatit image + annotations dans le fichier, comme les autres éditions.
  onSave: async (canvas, file) => {
    const savedPath = await saveCanvasInPlace(canvas, file);
    if (savedPath) await refreshAfterSave(savedPath, file);
    return Boolean(savedPath);
  },
  onClose: () => {},
});

btnPaint.addEventListener('click', async () => {
  const file = currentFile();
  if (!file || image.hidden || editBusy || Paint.isOpen() || studioIsOpen()) return;
  if (cropMode) exitCrop();
  const decoded = await decodeCurrentFile(file);
  if (!decoded) return;
  Paint.open({ file, img: decoded.img, url: decoded.url });
});

/* ---------- Studio : montage (chargé à la demande) ----------
   Le module (core, outils, coquille, styles) n'est chargé qu'au premier
   clic : par défaut la visionneuse reste légère. */

let studioLoading = null;

function studioIsOpen() {
  return Boolean(window.Studio && window.Studio.isOpen());
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`chargement impossible : ${src}`));
    document.head.appendChild(s);
  });
}

function ensureStudioLoaded() {
  if (!studioLoading) {
    studioLoading = (async () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'studio/studio.css';
      document.head.appendChild(link);
      await loadScript('studio/core.js');
      await loadScript('studio/tools.js');
      await loadScript('studio/studio.js');
      window.Studio.init({
        onSave: async (canvas, file) => {
          const savedPath = await saveCanvasInPlace(canvas, file);
          if (savedPath) await refreshAfterSave(savedPath, file);
          return Boolean(savedPath);
        },
        onClose: () => {},
      });
    })().catch((err) => {
      studioLoading = null;
      throw err;
    });
  }
  return studioLoading;
}

btnStudio.addEventListener('click', async () => {
  const file = currentFile();
  if (!file || image.hidden || editBusy || Paint.isOpen() || studioIsOpen()) return;
  if (cropMode) exitCrop();
  await ensureStudioLoaded();
  const decoded = await decodeCurrentFile(file);
  if (!decoded) return;
  window.Studio.open({ file, img: decoded.img, url: decoded.url });
});

image.addEventListener('dblclick', (e) => {
  if (cropMode) return;
  if (state.fit) {
    setZoomAt(1, e.clientX, e.clientY);
  } else {
    setFit();
  }
});

stage.addEventListener(
  'wheel',
  (e) => {
    if (currentFile() === null || cropMode) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoomAt(state.zoom * factor, e.clientX, e.clientY);
  },
  { passive: false }
);

/* Déplacement (pan) libre à la souris, sans aucune contrainte de bord. */
let panStart = null;
stage.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || currentFile() === null || cropMode) return;
  panStart = {
    x: e.clientX,
    y: e.clientY,
    panX: state.panX,
    panY: state.panY,
  };
  stage.classList.add('panning');
});
window.addEventListener('mousemove', (e) => {
  if (!panStart) return;
  state.panX = panStart.panX + (e.clientX - panStart.x);
  state.panY = panStart.panY + (e.clientY - panStart.y);
  applyTransform();
});
window.addEventListener('mouseup', () => {
  panStart = null;
  stage.classList.remove('panning');
});

window.addEventListener('keydown', (e) => {
  if (Paint.isOpen() || studioIsOpen()) return; // ces modules gèrent leur clavier
  if (!infoOverlay.hidden) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'i') hideInfo();
    return;
  }
  if (cropMode) {
    if (e.key === 'Escape') exitCrop();
    if (e.key === 'Enter') applyCrop();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    btnOpen.click();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    btnPrint.click();
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':
      prev();
      break;
    case 'ArrowRight':
      next();
      break;
    case 'Home':
      goTo(0);
      break;
    case 'End':
      goTo(state.files.length - 1);
      break;
    case '+':
    case '=':
      btnZoomIn.click();
      break;
    case '-':
      btnZoomOut.click();
      break;
    case '0':
      if (currentFile()) setFit();
      break;
    case '1':
      if (currentFile()) setZoomCentered(1);
      break;
    case 'r':
    case 'R':
      rotate(e.shiftKey ? -1 : 1);
      break;
    case 'i':
    case 'I':
      if (currentFile()) showInfo();
      break;
    case 'Delete':
      deleteCurrent();
      break;
    case 'f':
    case 'F':
    case 'F11':
      window.viewer.toggleFullscreen();
      break;
    case 'Escape':
      if (isFullscreen) window.viewer.toggleFullscreen();
      break;
  }
});

window.addEventListener('resize', () => {
  if (cropMode) {
    const before = cropArea.getBoundingClientRect();
    setFit();
    layoutCropArea();
    const after = cropDisplaySize();
    if (before.width > 0 && before.height > 0) {
      const rx = after.w / before.width;
      const ry = after.h / before.height;
      cropSel = { x: cropSel.x * rx, y: cropSel.y * ry, w: cropSel.w * rx, h: cropSel.h * ry };
    }
    layoutCropSelection();
    return;
  }
  if (state.fit) setFit();
});

/* Empêche Electron de « naviguer » vers un fichier déposé sur la fenêtre ;
   Studio gère ses propres dépôts sur sa scène (avant que l'événement
   n'atteigne window). */
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/* ---------- Démarrage ---------- */

applyFilmstripVisibility();

window.viewer.onOpenContext(loadContext);

window.viewer.ready().then((context) => {
  if (context) {
    loadContext(context);
  } else {
    render();
  }
});
