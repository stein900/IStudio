'use strict';

// i18n : raccourci de traduction (clé = phrase française, voir i18n/i18n.js)
const tr = (s, p) => window.I18n.t(s, p);

const stage = document.getElementById('stage');
const image = document.getElementById('image');
const imageBackdrop = document.getElementById('image-backdrop');
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
const btnUpscale = document.getElementById('btn-upscale');
const btnPaint = document.getElementById('btn-paint');
const btnStudio = document.getElementById('btn-studio');
const btnOcr = document.getElementById('btn-ocr');
const btnInfo = document.getElementById('btn-info');
const btnPrint = document.getElementById('btn-print');
const btnDelete = document.getElementById('btn-delete');
const btnGrid = document.getElementById('btn-grid');
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
let gridBackdrop = localStorage.getItem('gridBackdrop') !== 'false'; // fond de transparence
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
  ocrSyncTransform(); // la couche de texte OCR suit l'image au pixel près
  updateBackdrop();
  zoomLabel.textContent = state.fit ? tr('Ajusté') : `${Math.round(state.zoom * 100)} %`;
  if (window.Pro && window.Pro.active()) window.Pro.onViewChanged();
}

/* ---------- Fond de transparence (quadrillage) ----------
   Deux éléments complémentaires (styles dans styles.css) :
    - le quadrillage de points, porté par la scène entière (classe
      grid-backdrop sur body) : le pourtour de l'image est texturé, une
      image sombre ou noire ne se fond donc plus dans le fond, et les zones
      transparentes d'un PNG le laissent voir ;
    - #image-backdrop, un bloc vide calé au pixel près sur les bords de
      l'image, qui n'apporte que le filet de contour. Il est dimensionné en
      pixels écran (taille naturelle × zoom) plutôt que mis à l'échelle,
      pour que le filet garde son épaisseur à tous les zooms.
   Rien n'est affiché avant que l'image ne soit décodée (image.complete),
   sinon un changement d'image ferait clignoter un cadre aux dimensions de
   la précédente. */

function updateBackdrop() {
  // le quadrillage ne dépend pas des dimensions : il reste en place pendant
  // le décodage, sans clignoter à chaque changement d'image
  const on = gridBackdrop && !image.hidden;
  document.body.classList.toggle('grid-backdrop', on);
  const show = on && image.complete && image.naturalWidth > 0;
  imageBackdrop.hidden = !show;
  if (!show) return;
  imageBackdrop.style.width = `${image.naturalWidth * state.zoom}px`;
  imageBackdrop.style.height = `${image.naturalHeight * state.zoom}px`;
  imageBackdrop.style.transform =
    `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px)`;
}

function applyGridBackdrop() {
  btnGrid.classList.toggle('active', gridBackdrop);
  updateBackdrop();
}

function setGridBackdrop(on) {
  gridBackdrop = on;
  localStorage.setItem('gridBackdrop', String(on));
  applyGridBackdrop();
}

btnGrid.addEventListener('click', () => setGridBackdrop(!gridBackdrop));
applyGridBackdrop();

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

  // accueil épuré : la barre ne montre que l'essentiel sans image ouverte
  document.body.classList.toggle('at-home', !hasFile);
  syncActiveTab();
  renderTabs();

  emptyState.hidden = hasFile;
  errorState.hidden = true;
  image.hidden = !hasFile;
  updateBackdrop();
  stage.classList.toggle('pannable', hasFile && !cropMode);

  const disable = !hasFile;
  btnPrev.disabled = disable || state.files.length < 2;
  btnNext.disabled = disable || state.files.length < 2;
  // .module-btn : boutons injectés par les modules optionnels (voir la
  // section « Modules optionnels » en fin de fichier) — même cycle de vie
  for (const b of [btnZoomIn, btnZoomOut, btnFit, btnRotate, btnCrop, btnUpscale, btnPaint, btnStudio, btnOcr, btnInfo, btnPrint, btnDelete, btnGallery, ...document.querySelectorAll('#toolbar .module-btn')]) {
    b.disabled = disable;
  }

  // la galerie suit l'état du dossier : reconstruction seulement si la
  // liste a changé (suppression, onglet, tri Pro) — une simple navigation
  // ne fait que déplacer le surlignage
  if (galleryOpen) {
    if (!hasFile) {
      closeGallery();
    } else if (galleryFilesRef !== state.files || galleryTotal !== state.files.length) {
      rebuildGallery();
    } else {
      refreshGalleryCurrent();
    }
  }

  if (!hasFile) {
    ocrDeactivate();
    counter.textContent = '–';
    zoomLabel.textContent = '';
    fileNameEl.textContent = 'IStudio';
    fileMetaEl.textContent = '';
    window.viewer.setTitle('IStudio');
    if (window.Pro && window.Pro.active()) window.Pro.onImageShown();
    return;
  }

  counter.textContent = `${state.index + 1} / ${state.files.length}`;
  fileNameEl.textContent = file.name;
  window.viewer.setTitle(`${file.name} — IStudio`);

  // priorité réseau/décodage à l'image principale : vignettes en pause
  if (image.src !== file.url || image.hidden) holdThumbs();
  if (isPsdFile(file)) {
    showPsd(file);
  } else {
    image.src = file.url;
  }
  updateBackdrop(); // masqué le temps du décodage de la nouvelle image
  refreshFileStat(file);
  updateThumbSelection();
  if (window.Pro && window.Pro.active()) window.Pro.onImageShown();
}

image.addEventListener('load', () => {
  // retour sur un onglet : sa vue (zoom/position) est restaurée telle quelle
  const v = pendingTabView;
  pendingTabView = null;
  if (v && currentFile() && v.path === currentFile().path && !v.fit) {
    state.zoom = v.zoom;
    state.panX = v.panX;
    state.panY = v.panY;
    state.fit = false;
    applyTransform();
  } else if (!(window.Pro && window.Pro.active() && window.Pro.onImageElementLoad())) {
    // le mode Pro peut conserver la vue (verrou zoom/pan, bascule de canal)
    setFit();
  }
  updateBackdrop(); // le mode Pro peut avoir gardé la vue sans applyTransform
  updateFileMeta();
  // l'image principale est là : les vignettes peuvent reprendre, et les
  // voisines se préchargent pour une navigation instantanée
  releaseThumbs();
  schedulePreload();
  // arrivée depuis la carte « Agrandir avec l'IA » de l'accueil
  if (pendingUpscaleOpen) {
    pendingUpscaleOpen = false;
    openUpscale();
  }
});

image.addEventListener('error', () => {
  pendingUpscaleOpen = false; // image illisible : pas d'upscale automatique
  const file = currentFile();
  if (!file) return;
  image.hidden = true;
  updateBackdrop();
  errorState.hidden = false;
  errorName.textContent = file.name;
  updateFileMeta();
  releaseThumbs();
});

/* ---------- Préchargement des images voisines ----------
   Après un court répit (l'affichage et les vignettes d'abord), les images
   précédente et suivante sont demandées : le cache réseau de Chromium les
   garde prêtes, et flèche gauche/droite devient quasi instantané — même
   sur un dossier NAS avec des photos de 25 Mpx. */

let preloadTimer = null;
let preloadImgs = []; // référence vive : garde les octets en cache

function schedulePreload() {
  if (preloadTimer) clearTimeout(preloadTimer);
  preloadTimer = setTimeout(() => {
    preloadTimer = null;
    preloadImgs = [];
    const n = state.files.length;
    if (n < 2) return;
    for (const off of [1, -1]) {
      const f = state.files[(((state.index + off) % n) + n) % n];
      if (!f || isPsdFile(f)) continue;
      if (preloadImgs.some((im) => im.src === f.url)) continue;
      const im = new Image();
      im.decoding = 'async';
      im.src = f.url;
      preloadImgs.push(im);
    }
  }, 300);
}

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

/* ---------- Ordre du bandeau (et de la navigation) ----------
   Par défaut, le dossier est présenté par date de modification, les plus
   récentes en premier — comme un dossier de photos trié par date dans
   l'Explorateur. Le petit bouton à gauche du bandeau permet de passer au
   tri par nom (ordre naturel de l'Explorateur : « img2 » avant « img10 »)
   ou par taille ; re-clic sur le critère actif : ordre inversé. Le choix
   est mémorisé et réappliqué aux prochains dossiers. Le tri réordonne
   state.files : bandeau, flèches ←/→ et compteur restent toujours
   cohérents entre eux. */

const stripSortBtn = document.getElementById('strip-sort');
const stripSortPopup = document.getElementById('strip-sort-popup');

const STRIP_SORTS = [
  { key: 'name', label: 'Nom' },
  { key: 'mtime', label: 'Date de modification' },
  { key: 'size', label: 'Taille' },
];

let stripSort = localStorage.getItem('stripSort') || 'mtime';
if (!STRIP_SORTS.some((s) => s.key === stripSort)) stripSort = 'mtime';
const storedStripAsc = localStorage.getItem('stripSortAsc');
// sens naturel par critère (comme l'Explorateur) : nom A→Z, date/taille décroissantes
let stripAsc = storedStripAsc === null ? stripSort === 'name' : storedStripAsc !== 'false';

function stripCompare(a, b) {
  if (stripSort === 'mtime') return (a.mtime || 0) - (b.mtime || 0);
  if (stripSort === 'size') return (a.size || 0) - (b.size || 0);
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/* L'ordre « natif » (nom croissant) est celui dans lequel le process main
   livre déjà le dossier : aucun réordonnancement nécessaire dans ce cas. */
function stripSortIsNativeOrder() {
  return stripSort === 'name' && stripAsc;
}

async function applyStripSort() {
  updateStripSortUi();
  const files = state.files;
  if (!files.length) return;
  if (stripSort !== 'name' && !files._statsLoaded) {
    await ensureFileStats(); // dates/tailles à la demande (voir plus bas)
    if (state.files !== files) return; // le dossier a changé entre-temps
  }
  const file = currentFile();
  const sorted = files.slice().sort(stripCompare);
  if (!stripAsc) sorted.reverse();
  sorted._statsLoaded = files._statsLoaded; // les stats suivent le nouveau tableau
  reorderContext(sorted, file ? sorted.indexOf(file) : 0);
}

function updateStripSortUi() {
  const cur = STRIP_SORTS.find((s) => s.key === stripSort);
  stripSortBtn.title = `${tr('Ordre des miniatures')} — ${tr(cur.label)} ${stripAsc ? '↑' : '↓'}`;
  // signale un ordre différent du défaut (date, récentes en premier)
  stripSortBtn.classList.toggle('is-sorted', stripSort !== 'mtime' || stripAsc);
}

function buildStripSortPopup() {
  stripSortPopup.textContent = '';
  for (const s of STRIP_SORTS) {
    const row = document.createElement('button');
    row.className = 'strip-sort-opt';
    const active = s.key === stripSort;
    row.classList.toggle('is-active', active);
    const label = document.createElement('span');
    label.textContent = tr(s.label);
    row.appendChild(label);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.innerHTML = '<path d="M12 5v14m-6-6 6 6 6-6" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />';
    arrow.classList.add('strip-sort-arrow');
    if (active && stripAsc) arrow.classList.add('asc');
    if (!active) arrow.classList.add('hidden-arrow');
    row.appendChild(arrow);
    row.addEventListener('click', () => {
      if (s.key === stripSort) {
        stripAsc = !stripAsc; // re-clic sur le tri actif : inverse l'ordre
      } else {
        stripSort = s.key;
        // sens naturel du critère : nom A→Z, date/taille décroissantes
        stripAsc = s.key === 'name';
      }
      localStorage.setItem('stripSort', stripSort);
      localStorage.setItem('stripSortAsc', String(stripAsc));
      buildStripSortPopup();
      applyStripSort();
    });
    stripSortPopup.appendChild(row);
  }
}

stripSortBtn.addEventListener('click', () => {
  if (stripSortPopup.hidden) buildStripSortPopup();
  stripSortPopup.hidden = !stripSortPopup.hidden;
});

document.addEventListener('pointerdown', (e) => {
  if (stripSortPopup.hidden) return;
  if (!stripSortPopup.contains(e.target) && e.target !== stripSortBtn && !stripSortBtn.contains(e.target)) {
    stripSortPopup.hidden = true;
  }
});

/* Garde-fou : le bandeau ne montre qu'une FENÊTRE de 30 vignettes centrée
   sur l'image affichée — jamais tout le dossier (ouvrir la 99 000ᵉ image
   d'un dossier n'en crée que 30). Des boutons « +30 » aux deux extrémités
   étendent la fenêtre à la demande ; une navigation qui sort de la fenêtre
   la recentre en repartant de 30 : le DOM reste borné quoi qu'il arrive. */
const THUMB_PAGE = 30;
let stripStart = 0; // fenêtre affichée : [stripStart, stripEnd) dans state.files
let stripEnd = 0;
let thumbMorePrev = null; // bouton « +30 précédentes »
let thumbMoreNext = null; // bouton « +30 suivantes »

/* Vignettes économes : jamais l'image pleine résolution dans une tuile.
   1. cache de miniatures Windows (Explorateur) via nativeImage — instantané
      et sans décodage dans notre processus ;
   2. sinon décodage RÉDUIT (createImageBitmap redimensionné) : ~30 Ko
      retenus par vignette au lieu de dizaines de Mo pour une photo 25 Mpx ;
   3. dernier recours : le fichier lui-même (SVG et formats légers).
   Le tout piloté par un IntersectionObserver + file d'attente bornée. */

const thumbQueue = [];
let thumbActive = 0;

/* Dossier distant (UNC \\serveur\…) : la bande passante est précieuse,
   on réduit le parallélisme des vignettes pour ne pas étouffer le
   chargement de l'image principale. */
function contextIsRemote() {
  const f = state.files[0];
  return Boolean(f && (f.path.startsWith('\\\\') || f.path.startsWith('//')));
}

function thumbParallel() {
  // réseau : UNE seule vignette à la fois — un fichier de 30 Mo en vol ne
  // peut pas être annulé, il ne doit jamais y en avoir deux qui bloquent
  // la navigation
  return contextIsRemote() ? 1 : 4;
}

/* Les vignettes attendent que l'image principale soit RÉELLEMENT affichée
   (événement load/error) : elle a la priorité absolue sur le réseau et le
   décodage. Le garde-fou de 20 s ne sert qu'aux cas dégénérés. */
let thumbGate = false;
let thumbGateTimer = null;

function holdThumbs() {
  if (thumbGateTimer) clearTimeout(thumbGateTimer);
  thumbGate = true;
  thumbGateTimer = setTimeout(releaseThumbs, 20000);
}

function releaseThumbs() {
  if (thumbGateTimer) {
    clearTimeout(thumbGateTimer);
    thumbGateTimer = null;
  }
  if (thumbGate) {
    thumbGate = false;
    pumpThumbs();
  }
}

function pumpThumbs() {
  if (thumbGate) return;
  while (thumbActive < thumbParallel() && thumbQueue.length) {
    const job = thumbQueue.shift();
    thumbActive += 1;
    job().finally(() => {
      thumbActive -= 1;
      pumpThumbs();
    });
  }
}

function queueThumb(job) {
  thumbQueue.push(job);
  pumpThumbs();
}

/* ---------- Worker de vignettes ----------
   Le décodage d'une photo de 25 Mpx pour en tirer une miniature se fait
   dans un Web Worker : le thread d'interface ne décode JAMAIS pour le
   bandeau — fini les gels pendant que le carrousel se remplit. */

let thumbWorker = null;
let thumbWorkerSeq = 0;
const thumbWorkerPending = new Map();

function decodeThumbInWorker(data, type) {
  if (!thumbWorker) {
    thumbWorker = new Worker('thumb-worker.js');
    thumbWorker.onmessage = (e) => {
      const resolve = thumbWorkerPending.get(e.data.id);
      if (!resolve) return;
      thumbWorkerPending.delete(e.data.id);
      resolve(e.data.ok ? e.data.jpeg : null);
    };
  }
  return new Promise((resolve) => {
    const id = ++thumbWorkerSeq;
    thumbWorkerPending.set(id, resolve);
    // transfert sans copie quand le tampon est exact
    const buf =
      data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
        ? data.buffer
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    thumbWorker.postMessage({ id, buf, type }, [buf]);
  });
}

/** Décodage réduit (secours si Windows n'a pas de vignette) — dans le
    worker. La vignette produite est renvoyée au cache disque de
    l'application : la prochaine visite du dossier ne relira pas le fichier. */
async function thumbFromDecode(file) {
  try {
    const data = await window.viewer.readFile(file.path);
    if (!data) return null;
    const jpeg = await decodeThumbInWorker(
      data,
      MIME_BY_EXT[extOf(file.name)] || 'application/octet-stream'
    );
    if (!jpeg) return null;
    window.viewer
      .storeThumbnail({ filePath: file.path, data: new Uint8Array(jpeg) })
      .catch(() => {});
    return URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }));
  } catch {
    return null;
  }
}

/** Miniature d'un fichier (URL prête pour un <img>), partagée entre le
    bandeau et la galerie Global — mise en cache sur l'objet fichier. */
async function ensureThumbUrl(file) {
  if (file.thumbUrl) return file.thumbUrl;
  // Dossier réseau : jamais d'extraction shell (elle rapatrierait le
  // fichier entier dans le processus principal, qui route aussi les
  // entrées souris/clavier) — cache disque, sinon worker de décodage.
  const data = contextIsRemote()
    ? await window.viewer.fileThumbnailCached(file.path)
    : await window.viewer.fileThumbnail(file.path);
  let url = null;
  if (data && data.byteLength) {
    url = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
  } else if (!isPsdFile(file)) {
    url = await thumbFromDecode(file);
    if (!url) url = file.url; // SVG et cas limites : décodage direct
  }
  file.thumbUrl = url;
  return url;
}

async function loadThumb(btn, file) {
  if (btn.dataset.loaded) return;
  btn.dataset.loaded = '1';
  const url = await ensureThumbUrl(file);
  if (!url) return; // PSD sans vignette système : la pastille reste
  const img = document.createElement('img');
  img.alt = file.name;
  img.decoding = 'async';
  img.addEventListener(
    'load',
    () => {
      // la tuile adopte le ratio réel de l'image (hauteur fixe, largeur
      // bornée min/max en CSS — panoramiques et portraits lisibles)
      if (img.naturalWidth && img.naturalHeight) {
        btn.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      }
      const ph = btn.querySelector('.thumb-ph, .thumb-psd');
      if (ph) ph.replaceWith(img);
    },
    { once: true }
  );
  img.src = url;
}

const thumbObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      thumbObserver.unobserve(e.target);
      const file = state.files[Number(e.target.dataset.index)];
      if (file) queueThumb(() => loadThumb(e.target, file));
    }
  },
  { root: null, rootMargin: '600px' }
);

function makeThumb(file, i) {
  const btn = document.createElement('button');
  btn.className = 'thumb';
  btn.title = file.name;
  btn.dataset.index = String(i);

  const label = document.createElement('span');
  label.className = 'thumb-name';
  label.textContent = file.name;

  const ph = document.createElement('span');
  if (isPsdFile(file)) {
    ph.className = 'thumb-psd';
    ph.textContent = 'PSD';
  } else {
    ph.className = 'thumb-ph';
  }
  btn.append(ph, label);
  btn.addEventListener('click', (e) => {
    // mode Pro : Ctrl + clic choisit l'image B de la comparaison
    if (e.ctrlKey && window.Pro && window.Pro.active()) {
      window.Pro.setCompareIndex(i);
      return;
    }
    goTo(i);
  });
  thumbObserver.observe(btn);
  return btn;
}

/** Rafraîchit la vignette d'une tuile (après une édition du fichier). */
function refreshThumbAt(index, file) {
  const tile = filmstrip.querySelector(`.thumb[data-index="${index}"]`);
  if (!tile) return;
  if (file.thumbUrl && file.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(file.thumbUrl);
  file.thumbUrl = null;
  delete tile.dataset.loaded;
  const old = tile.querySelector('img');
  if (old) {
    const ph = document.createElement('span');
    ph.className = 'thumb-ph';
    old.replaceWith(ph);
  }
  queueThumb(() => loadThumb(tile, file));
}

function stripMoreBtn(dir, remaining) {
  const btn = document.createElement('button');
  btn.className = 'thumb-more';
  const n = Math.min(THUMB_PAGE, remaining);
  btn.title = tr('{n} images non affichées', { n: remaining });
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>';
  const label = document.createElement('span');
  label.textContent = dir < 0 ? tr('{n} précédentes', { n }) : tr('{n} suivantes', { n });
  btn.appendChild(label);
  btn.addEventListener('click', () => extendStrip(dir));
  return btn;
}

/* (Re)pose les boutons « +30 » aux extrémités selon ce qui reste caché. */
function refreshStripEdges() {
  if (thumbMorePrev) {
    thumbMorePrev.remove();
    thumbMorePrev = null;
  }
  if (thumbMoreNext) {
    thumbMoreNext.remove();
    thumbMoreNext = null;
  }
  if (stripStart > 0) {
    thumbMorePrev = stripMoreBtn(-1, stripStart);
    filmstrip.prepend(thumbMorePrev);
  }
  const after = state.files.length - stripEnd;
  if (after > 0) {
    thumbMoreNext = stripMoreBtn(1, after);
    filmstrip.appendChild(thumbMoreNext);
  }
}

/* Étend la fenêtre de 30 tuiles vers la gauche ou la droite. */
function extendStrip(dir) {
  const frag = document.createDocumentFragment();
  if (dir < 0) {
    const newStart = Math.max(0, stripStart - THUMB_PAGE);
    for (let i = newStart; i < stripStart; i += 1) {
      frag.appendChild(makeThumb(state.files[i], i));
    }
    const prevWidth = filmstrip.scrollWidth;
    filmstrip.insertBefore(frag, thumbMorePrev ? thumbMorePrev.nextSibling : filmstrip.firstChild);
    stripStart = newStart;
    refreshStripEdges();
    // l'insertion à gauche ne doit pas faire sauter la vue
    filmstrip.scrollLeft += filmstrip.scrollWidth - prevWidth;
  } else {
    const newEnd = Math.min(state.files.length, stripEnd + THUMB_PAGE);
    for (let i = stripEnd; i < newEnd; i += 1) {
      frag.appendChild(makeThumb(state.files[i], i));
    }
    filmstrip.insertBefore(frag, thumbMoreNext);
    stripEnd = newEnd;
    refreshStripEdges();
  }
  buildFilmstripDone();
}

/* Une navigation hors de la fenêtre la recentre (30 tuiles autour de la
   nouvelle image — les tuiles lointaines sont libérées). */
function ensureThumbLoaded(index) {
  if (index < stripStart || index >= stripEnd) buildFilmstrip();
}

function buildFilmstripDone() {
  if (window.Pro && window.Pro.active()) window.Pro.onFilmstrip();
}

function buildFilmstrip() {
  filmstrip.innerHTML = '';
  thumbMorePrev = null;
  thumbMoreNext = null;
  const hasFiles = state.files.length > 0;
  filmstrip.hidden = !hasFiles;
  stripToggle.hidden = !hasFiles;
  stripSortBtn.hidden = !hasFiles;
  if (!hasFiles) {
    stripSortPopup.hidden = true;
    return;
  }

  // Fenêtre de 30 tuiles centrée sur l'image courante (bornée aux bords).
  const total = state.files.length;
  stripStart = Math.max(0, Math.min(state.index - Math.floor(THUMB_PAGE / 2), total - THUMB_PAGE));
  stripEnd = Math.min(total, stripStart + THUMB_PAGE);
  for (let i = stripStart; i < stripEnd; i += 1) {
    filmstrip.appendChild(makeThumb(state.files[i], i));
  }
  refreshStripEdges();
  updateThumbSelection(false); // centrage immédiat, sans animation
  buildFilmstripDone();
}

/* L'image affichée doit être visible dans le bandeau immédiatement — et le
   rester : les tuiles adoptent leur vraie largeur au fil du chargement des
   vignettes, ce qui décale la position ; on recentre donc à chaque vignette
   chargée, tant que l'utilisateur n'a pas fait défiler le bandeau lui-même
   (une navigation ré-arme le suivi). */
let stripUserScrolled = false;

function centerCurrentThumb(smooth) {
  const tile = filmstrip.querySelector('.thumb.current');
  if (tile) {
    tile.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest', inline: 'center' });
  }
}

function updateThumbSelection(smooth = true) {
  ensureThumbLoaded(state.index);
  const thumbs = filmstrip.querySelectorAll('.thumb');
  thumbs.forEach((t) => {
    t.classList.toggle('current', Number(t.dataset.index) === state.index);
  });
  stripUserScrolled = false;
  centerCurrentThumb(smooth);
}

/* Molette sur le bandeau : défilement horizontal. */
filmstrip.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    filmstrip.scrollLeft += e.deltaY;
    stripUserScrolled = true; // défilement manuel : ne plus recentrer
  },
  { passive: false }
);
filmstrip.addEventListener('pointerdown', () => {
  stripUserScrolled = true; // idem au glisser / clic dans le bandeau
});

stripToggle.addEventListener('click', () => setFilmstripVisible(!filmstripVisible));
btnFilm.addEventListener('click', () => setFilmstripVisible(!filmstripVisible));

/* ---------- Galerie « Global » ----------
   Vue d'ensemble du dossier courant : grille de miniatures (mêmes caches
   et même worker que le bandeau), recherche, tri (nom, date, taille,
   type), ordre et filtre par format. Clic : afficher l'image.
   Flèches / Entrée : naviguer dedans. Ctrl+G ou Échap : ouvrir/fermer. */

const galleryEl = document.getElementById('gallery');
const galleryGrid = document.getElementById('gallery-grid');
const gallerySearch = document.getElementById('gallery-search');
const gallerySort = document.getElementById('gallery-sort');
const galleryDir = document.getElementById('gallery-dir');
const galleryFormat = document.getElementById('gallery-format');
const galleryCountEl = document.getElementById('gallery-count');
const btnGallery = document.getElementById('btn-gallery');

let galleryOpen = false;
let galleryAsc = true;
let galleryList = []; // entrées affichées : { f, i } (i = index dans state.files)
let galleryCursor = -1;
let galleryShown = 0; // nombre de tuiles réellement présentes dans le DOM
let gallerySentinel = null;
let galleryFilesRef = null; // détecte un changement de dossier / de liste
let galleryTotal = 0;

/* Pagination paresseuse : les tuiles n'existent dans le DOM que par blocs
   de 200, le bloc suivant n'est créé qu'à l'approche du bas — un dossier
   de plusieurs milliers d'images reste léger, même sur un PC modeste. */
const GALLERY_PAGE = 200;

/* Vignette ET métadonnées ne sont chargées que quand la tuile approche de
   la zone visible. */
const galleryObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      galleryObserver.unobserve(e.target);
      const file = state.files[Number(e.target.dataset.index)];
      if (file) queueThumb(() => loadGalleryThumb(e.target, file));
    }
  },
  { root: galleryGrid, rootMargin: '400px' }
);

const gallerySentinelObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      gallerySentinelObserver.unobserve(e.target);
      appendGalleryTiles(galleryShown + GALLERY_PAGE);
    }
  },
  { root: galleryGrid, rootMargin: '800px' }
);

function galleryMetaLabel(f) {
  const parts = [];
  if (f.size) parts.push(formatBytes(f.size));
  if (f.mtime) parts.push(galleryDateLabel(f.mtime));
  return parts.join(' · ');
}

function updateGalleryMeta(tile, file) {
  const meta = tile.querySelector('.gtile-meta');
  if (meta) meta.textContent = galleryMetaLabel(file) || ' ';
}

async function loadGalleryThumb(tile, file) {
  if (tile.dataset.loaded) return;
  tile.dataset.loaded = '1';
  // stat unitaire, uniquement pour les tuiles devenues visibles — le
  // libellé taille · date se remplit dès que l'info arrive
  if (file.mtime === undefined) {
    window.viewer
      .fileInfo(file.path)
      .then((st) => {
        file.size = st ? st.size : file.size;
        file.mtime = st ? st.mtime : 0;
        updateGalleryMeta(tile, file);
      })
      .catch(() => {});
  }
  const url = await ensureThumbUrl(file);
  if (!url) return;
  const img = document.createElement('img');
  img.alt = file.name;
  img.decoding = 'async';
  img.addEventListener(
    'load',
    () => {
      const ph = tile.querySelector('.thumb-ph, .thumb-psd');
      if (ph) ph.replaceWith(img);
      // la tuile vient de prendre sa vraie largeur : l'image courante
      // ne doit pas être poussée hors de vue
      if (!stripUserScrolled) centerCurrentThumb(false);
    },
    { once: true }
  );
  img.src = url;
}

/* Taille et date ne sont lues qu'au premier tri qui en a besoin
   (parallélisme borné côté processus principal — NAS compris). */
async function ensureFileStats() {
  const files = state.files;
  if (!files.length || files._statsLoaded) return;
  const stats = await window.viewer.statMany(files.map((f) => f.path));
  if (state.files !== files) return; // le contexte a changé entre-temps
  stats.forEach((st, i) => {
    if (st) {
      files[i].size = st.size;
      files[i].mtime = st.mtime;
    }
  });
  files._statsLoaded = true;
}

function galleryNameCmp(a, b) {
  return a.f.name.localeCompare(b.f.name, undefined, { numeric: true, sensitivity: 'base' });
}

function computeGalleryList() {
  let list = state.files.map((f, i) => ({ f, i }));
  const q = gallerySearch.value.trim().toLowerCase();
  if (q) list = list.filter(({ f }) => f.name.toLowerCase().includes(q));
  const fmt = galleryFormat.value;
  if (fmt !== 'all') list = list.filter(({ f }) => extOf(f.name) === fmt);
  const sv = gallerySort.value;
  const dir = galleryAsc ? 1 : -1;
  list.sort((a, b) => {
    let r = 0;
    if (sv === 'mtime') r = (a.f.mtime || 0) - (b.f.mtime || 0);
    else if (sv === 'size') r = (a.f.size || 0) - (b.f.size || 0);
    else if (sv === 'type') r = extOf(a.f.name).localeCompare(extOf(b.f.name));
    return dir * (r || galleryNameCmp(a, b));
  });
  return list;
}

function buildGalleryFormats() {
  const counts = new Map();
  for (const f of state.files) {
    const e = extOf(f.name) || '?';
    counts.set(e, (counts.get(e) || 0) + 1);
  }
  const prev = galleryFormat.value;
  galleryFormat.innerHTML = '';
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = `Tous (${state.files.length})`;
  galleryFormat.appendChild(all);
  for (const [e, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const o = document.createElement('option');
    o.value = e;
    o.textContent = `${e.toUpperCase()} (${n})`;
    galleryFormat.appendChild(o);
  }
  galleryFormat.value = counts.has(prev) ? prev : 'all';
}

function galleryDateLabel(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Fabrique une carte : miniature (ratio fixe, jamais de débordement)
    au-dessus d'une légende nom + taille · date. */
function makeGalleryTile(entry, pos) {
  const { f, i } = entry;
  const tile = document.createElement('button');
  tile.className = 'gtile';
  tile.dataset.index = String(i);
  tile.dataset.pos = String(pos);
  if (f === currentFile()) tile.classList.add('current');
  if (pos === galleryCursor) tile.classList.add('selected');
  tile.title = f.name;

  const thumb = document.createElement('span');
  thumb.className = 'gtile-thumb';
  const ph = document.createElement('span');
  if (isPsdFile(f)) {
    ph.className = 'thumb-psd';
    ph.textContent = 'PSD';
  } else {
    ph.className = 'thumb-ph';
  }
  thumb.appendChild(ph);

  const caption = document.createElement('span');
  caption.className = 'gtile-caption';
  const name = document.createElement('span');
  name.className = 'gtile-name';
  name.textContent = f.name;
  const meta = document.createElement('span');
  meta.className = 'gtile-meta';
  meta.textContent = galleryMetaLabel(f) || ' ';
  caption.append(name, meta);

  tile.append(thumb, caption);
  tile.addEventListener('click', () => {
    goTo(i);
    closeGallery();
  });
  galleryObserver.observe(tile);
  return tile;
}

function appendGalleryTiles(upTo) {
  if (gallerySentinel) {
    gallerySentinelObserver.unobserve(gallerySentinel);
    gallerySentinel.remove();
    gallerySentinel = null;
  }
  const end = Math.min(upTo, galleryList.length);
  const frag = document.createDocumentFragment();
  for (let pos = galleryShown; pos < end; pos += 1) {
    frag.appendChild(makeGalleryTile(galleryList[pos], pos));
  }
  galleryGrid.appendChild(frag);
  galleryShown = end;
  if (galleryShown < galleryList.length) {
    gallerySentinel = document.createElement('div');
    gallerySentinel.className = 'gallery-sentinel';
    galleryGrid.appendChild(gallerySentinel);
    gallerySentinelObserver.observe(gallerySentinel);
  }
}

function rebuildGallery() {
  if (!galleryOpen) return;
  const sv = gallerySort.value;
  if ((sv === 'mtime' || sv === 'size') && !state.files._statsLoaded) {
    galleryCountEl.textContent = 'Lecture des informations…';
    ensureFileStats().then(() => rebuildGallery());
    return;
  }
  galleryList = computeGalleryList();
  galleryFilesRef = state.files;
  galleryTotal = state.files.length;
  galleryObserver.disconnect();
  galleryGrid.innerHTML = '';
  galleryShown = 0;
  gallerySentinel = null;
  const cur = currentFile();
  galleryCursor = Math.max(0, galleryList.findIndex(({ f }) => f === cur));
  // au moins la première page, étendue jusqu'à l'image courante si besoin
  appendGalleryTiles(Math.max(GALLERY_PAGE, galleryCursor + 1));
  galleryCountEl.textContent = `${galleryList.length} / ${state.files.length} image${
    state.files.length > 1 ? 's' : ''
  }`;
}

/** Mise à jour légère (navigation sans changement de liste) : seule la
    tuile de l'image courante change — pas de reconstruction du DOM. */
function refreshGalleryCurrent() {
  const cur = currentFile();
  for (const t of galleryGrid.querySelectorAll('.gtile')) {
    t.classList.toggle('current', state.files[Number(t.dataset.index)] === cur);
  }
}

function moveGalleryCursor(delta) {
  if (!galleryList.length) return;
  galleryCursor = Math.max(0, Math.min(galleryList.length - 1, galleryCursor + delta));
  if (galleryCursor >= galleryShown) {
    appendGalleryTiles(Math.ceil((galleryCursor + 1) / GALLERY_PAGE) * GALLERY_PAGE);
  }
  let sel = null;
  for (const t of galleryGrid.querySelectorAll('.gtile')) {
    const isSel = Number(t.dataset.pos) === galleryCursor;
    t.classList.toggle('selected', isSel);
    if (isSel) sel = t;
  }
  if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openGallery() {
  if (galleryOpen || !state.files.length || Paint.isOpen() || studioIsOpen()) return;
  if (cropMode) exitCrop();
  galleryOpen = true;
  galleryEl.hidden = false;
  btnGallery.classList.add('active');
  document.body.classList.add('gallery-open');
  buildGalleryFormats();
  rebuildGallery();
}

function closeGallery() {
  if (!galleryOpen) return;
  galleryOpen = false;
  galleryEl.hidden = true;
  btnGallery.classList.remove('active');
  document.body.classList.remove('gallery-open');
  // nettoyage complet : la visionneuse de base ne garde AUCUN poids
  galleryObserver.disconnect();
  gallerySentinelObserver.disconnect();
  galleryGrid.innerHTML = '';
  galleryList = [];
  galleryShown = 0;
  gallerySentinel = null;
  galleryFilesRef = null;
}

function toggleGallery() {
  if (galleryOpen) closeGallery();
  else openGallery();
}

btnGallery.addEventListener('click', toggleGallery);
gallerySort.addEventListener('change', rebuildGallery);
galleryFormat.addEventListener('change', rebuildGallery);
galleryDir.addEventListener('click', () => {
  galleryAsc = !galleryAsc;
  galleryDir.classList.toggle('is-desc', !galleryAsc);
  galleryDir.title = galleryAsc ? 'Ordre croissant (cliquer : décroissant)' : 'Ordre décroissant (cliquer : croissant)';
  rebuildGallery();
});

let gallerySearchTimer = null;
gallerySearch.addEventListener('input', () => {
  clearTimeout(gallerySearchTimer);
  gallerySearchTimer = setTimeout(rebuildGallery, 150);
});
gallerySearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeGallery();
});

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
  // libère les vignettes et rendus PSD de l'ancien contexte de CET onglet
  // (les autres onglets gardent les leurs)
  disposeFiles(state.files);
  thumbQueue.length = 0;
  state.files = context.files;
  state.index = context.index;
  // le dossier arrive trié par nom ; l'ordre choisi (date par défaut)
  // est appliqué ici — les dates arrivent en asynchrone, l'affichage
  // ne bloque jamais
  if (!stripSortIsNativeOrder()) applyStripSort();
  else updateStripSortUi();
  buildFilmstrip();
  render();
  if (window.Pro && window.Pro.active()) window.Pro.onContext();
}

/* Réordonne / filtre la galerie sans toucher aux vignettes déjà chargées
   (mode Pro : tri et filtres — les objets fichiers restent les mêmes). */
function reorderContext(files, index) {
  state.files = files;
  state.index = Math.max(0, Math.min(index, files.length - 1));
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
  closeGallery();
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
  psd: 'image/vnd.adobe.photoshop',
};

/* ---------- PSD (Photoshop) ----------
   Lecture via ag-psd, chargé à la demande : la visionneuse affiche le
   composite aplati, et Studio ouvre le document avec ses calques séparés
   (position, opacité, mode de fusion, visibilité). */

const PSD_BLEND = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

function isPsdFile(file) {
  return extOf(file.name) === 'psd';
}

let psdLoading = null;

function ensurePsdLoaded() {
  if (!psdLoading) {
    // copie embarquée d'ag-psd, corrigée : lecture des paramètres de masque
    // avant le « real mask » (ordre de la spec Adobe) — sinon certains PSD
    // valides échouent avec « Invalid realMask size »
    psdLoading = loadScript('vendor/ag-psd.js').catch((err) => {
      psdLoading = null;
      throw err;
    });
  }
  return psdLoading;
}

async function decodePsdFile(file) {
  await ensurePsdLoaded();
  const data = await window.viewer.readFile(file.path);
  if (!data) return null;
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  try {
    return window.agPsd.readPsd(buf);
  } catch {
    return null;
  }
}

/** Calque texte PSD → spécification de calque texte éditable Studio
    (contenu, corps, couleur, gras/italique/souligné/barré, police). */
function psdTextSpec(ch) {
  const t = ch.text;
  const style = t.style || (t.styleRuns && t.styleRuns[0] && t.styleRuns[0].style) || {};
  const scaleY = Array.isArray(t.transform) ? Math.abs(t.transform[3]) || 1 : 1;
  const fontSize = Math.max(4, Math.round((style.fontSize || 24) * scaleY));
  const fc = style.fillColor || {};
  const hex = (v) =>
    Math.max(0, Math.min(255, Math.round(v || 0)))
      .toString(16)
      .padStart(2, '0');
  const color = fc.r !== undefined ? `#${hex(fc.r)}${hex(fc.g)}${hex(fc.b)}` : '#000000';
  const rawName = (style.font && style.font.name) || '';
  // « Arial-BoldMT » → famille « Arial » ; « SegoeUI » → « Segoe UI »
  let family = rawName.split('-')[0].replace(/(PSMT|PS|MT)$/, '');
  family = family.replace(/([a-z\d])([A-Z])/g, '$1 $2').trim();
  return {
    kind: 'text',
    name: ch.name || 'Texte',
    text: t.text.replace(/\r\n?/g, '\n').replace(/\s+$/, ''),
    canvas: ch.canvas || null, // rendu d'origine, pour le composite aplati
    x: Math.round(ch.left || 0),
    // le moteur de texte de Studio ajoute un demi-interligne (1,3) au-dessus
    // de la première ligne : on le retranche pour garder la position PSD
    y: Math.round((ch.top || 0) - 0.15 * fontSize),
    fontSize,
    color,
    bold: Boolean(style.fauxBold) || /bold/i.test(rawName),
    italic: Boolean(style.fauxItalic) || /italic|oblique/i.test(rawName),
    underline: Boolean(style.underline),
    strike: Boolean(style.strikethrough),
    font: family ? `"${family}"` : '"Segoe UI"',
    opacity: typeof ch.opacity === 'number' ? ch.opacity : 1,
    blend: PSD_BLEND[ch.blendMode] || 'normal',
    visible: !ch.hidden,
  };
}

/** Aplatie l'arborescence (les groupes sont parcourus, leurs calques gardent
    leur ordre d'empilement) en calques prêts pour Studio — les calques de
    texte PSD restent éditables. */
function collectPsdLayers(node, out) {
  if (!node || !node.children) return;
  for (const ch of node.children) {
    if (ch.children) {
      collectPsdLayers(ch, out);
      continue;
    }
    if (ch.text && typeof ch.text.text === 'string' && ch.text.text.trim()) {
      out.push(psdTextSpec(ch));
      continue;
    }
    if (!ch.canvas) continue;
    out.push({
      name: ch.name || 'Calque',
      canvas: ch.canvas,
      x: Math.round(ch.left || 0),
      y: Math.round(ch.top || 0),
      opacity: typeof ch.opacity === 'number' ? ch.opacity : 1,
      blend: PSD_BLEND[ch.blendMode] || 'normal',
      visible: !ch.hidden,
    });
  }
}

function canvasHasInk(canvas) {
  const s = document.createElement('canvas');
  s.width = 8;
  s.height = 8;
  const ctx = s.getContext('2d');
  ctx.drawImage(canvas, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  return false;
}

/** Rendu aplati : le composite embarqué s'il existe, sinon l'empilement
    des calques. */
function psdComposite(psd) {
  if (psd.canvas && canvasHasInk(psd.canvas)) return psd.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = psd.width;
  canvas.height = psd.height;
  const ctx = canvas.getContext('2d');
  const layers = [];
  collectPsdLayers(psd, layers);
  for (const l of layers) {
    if (!l.visible || !l.canvas) continue;
    ctx.globalAlpha = l.opacity;
    ctx.drawImage(l.canvas, l.x, l.y);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

let psdShowToken = 0;

/** Affiche un .psd dans la visionneuse (composite décodé, mis en cache). */
async function showPsd(file) {
  const token = ++psdShowToken;
  try {
    if (!file.psdUrl) {
      const psd = await decodePsdFile(file);
      if (!psd) throw new Error('psd illisible');
      const blob = await new Promise((res) => psdComposite(psd).toBlob(res, 'image/png'));
      if (!blob) throw new Error('rendu impossible');
      file.psdUrl = URL.createObjectURL(blob);
    }
    if (token === psdShowToken && currentFile() === file) image.src = file.psdUrl;
  } catch {
    if (token === psdShowToken && currentFile() === file) {
      image.dispatchEvent(new Event('error'));
    }
  }
}

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
  if (isPsdFile(file)) {
    // PSD : décodage via ag-psd, l'édition part du composite aplati
    const psd = await decodePsdFile(file);
    if (!psd) return null;
    const blob = await new Promise((res) => psdComposite(psd).toBlob(res, 'image/png'));
    if (!blob) return null;
    return loadImageFromBlob(blob);
  }
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

/* Enregistrement depuis les éditeurs (Paint, Studio) : l'utilisateur choisit
   entre écraser le fichier d'origine et créer une copie à côté. La copie
   s'ouvre ensuite dans la visionneuse. */
async function saveEditedCanvas(canvas, file) {
  if (!file || !file.path) {
    // document créé depuis l'accueil (sans fichier) : « Enregistrer sous »
    // en PNG, puis on ouvre le fichier créé dans la visionneuse
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const saved = await window.viewer.exportImage({
      suggestedName: `${(file && file.name) || 'projet'}.png`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
    if (saved) loadContext(await window.viewer.reloadContext(saved));
    return Boolean(saved);
  }
  const mode = await window.viewer.askSaveMode(file.name);
  if (!mode) return false; // annulé : l'éditeur reste ouvert
  const target = encodeTarget(extOf(file.name));
  const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, target.mime, 0.95));
  if (!outBlob) return false;
  const payload = {
    sourcePath: file.path,
    outExt: target.outExt,
    data: new Uint8Array(await outBlob.arrayBuffer()),
  };
  const savedPath =
    mode === 'copy' ? await window.viewer.saveCopy(payload) : await window.viewer.saveInPlace(payload);
  if (savedPath) await refreshAfterSave(savedPath, file);
  return Boolean(savedPath);
}

/* Recharge l'image et sa miniature après une édition sur disque. */
async function refreshAfterSave(savedPath, file) {
  if (!savedPath) return;
  if (savedPath.toLowerCase() === file.path.toLowerCase()) {
    const busted = `${file.url.split('?')[0]}?t=${Date.now()}`;
    file.url = busted;
    image.src = busted;
    refreshThumbAt(state.index, file);
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

function infoRow(labelFr, value) {
  const label = tr(labelFr);
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
  el.textContent = tr(title);
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
    infoBody.append(infoRow('Dimensions', tr('{w} × {h} pixels', { w, h })));
    infoBody.append(infoRow('Définition', tr('{n} mégapixels', { n: ((w * h) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) })));
    infoBody.append(infoRow('Rapport d’aspect', aspectRatio(w, h)));
  } else {
    infoBody.append(infoRow('Dimensions', '–'));
  }

  infoBody.append(infoSection('Dates'));
  infoBody.append(infoRow('Créé le', formatDate(state.stat?.birthtime)));
  infoBody.append(infoRow('Modifié le', formatDate(state.stat?.mtime)));
  infoBody.append(infoRow('Dernier accès', formatDate(state.stat?.atime)));

  infoBody.append(infoSection('Dossier courant'));
  infoBody.append(infoRow('Position', tr('{a} sur {b}', { a: state.index + 1, b: state.files.length })));

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

/* ---------- Upscale IA ----------
   Agrandissement par Real-ESRGAN (moteur upscayl-bin, exécuté côté main).
   Le moteur ne connaît que ×2/×3/×4 : un facteur personnalisé est obtenu
   en upscalant au palier supérieur puis en redimensionnant précisément. */

const upBackdrop = document.getElementById('up-backdrop');
const upDialog = document.getElementById('up-dialog');
const upClose = document.getElementById('up-close');
const upSetup = document.getElementById('up-setup');
const upScalesWrap = document.getElementById('up-scales');
const upCustom = document.getElementById('up-custom');
const upModel = document.getElementById('up-model');
const upDimsFrom = document.getElementById('up-dims-from');
const upDimsTo = document.getElementById('up-dims-to');
const upError = document.getElementById('up-error');
const upCancel = document.getElementById('up-cancel');
const upRun = document.getElementById('up-run');
const upProgress = document.getElementById('up-progress');
const upProgressBar = document.getElementById('up-progress-bar');
const upProgressPct = document.getElementById('up-progress-pct');
const upAbort = document.getElementById('up-abort');
const upResult = document.getElementById('up-result');
const upCompare = document.getElementById('up-compare');
const upImgBefore = document.getElementById('up-img-before');
const upImgAfter = document.getElementById('up-img-after');
const upAfterClip = document.getElementById('up-after-clip');
const upDivider = document.getElementById('up-divider');
const upResultDims = document.getElementById('up-result-dims');
const upDiscard = document.getElementById('up-discard');
const upSaveCopy = document.getElementById('up-save-copy');
const upSave = document.getElementById('up-save');

// Formats que le moteur lit directement ; le reste (PSD, BMP, TIFF…) est
// d'abord décodé par la visionneuse et transmis en PNG.
const UP_DIRECT_EXTS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp']);

const UP_MODEL_LABELS = {
  'upscayl-standard-4x': 'Standard — meilleure qualité',
  'upscayl-lite-4x': 'Léger — plus rapide',
};

const up = {
  phase: 'setup', // setup | progress | result
  scale: localStorage.getItem('upscaleScale') || '2',
  running: false,
  saving: false,
  resultData: null, // PNG brut produit par le moteur (secours si canvas impossible)
  resultCanvas: null,
  afterUrl: null,
  targetW: 0,
  targetH: 0,
  // vue de comparaison
  zoom: 1,
  minZoom: 1,
  panX: 0,
  panY: 0,
  divider: 0.5,
};

function upIsOpen() {
  return !upBackdrop.hidden;
}

function upFactor() {
  if (up.scale === 'custom') {
    const v = Number(String(upCustom.value).replace(',', '.'));
    if (!Number.isFinite(v)) return 0;
    return Math.min(8, Math.max(1.1, v));
  }
  return Number(up.scale);
}

function upShowError(message) {
  upError.textContent = message;
  upError.hidden = false;
}

function upSetPhase(phase) {
  up.phase = phase;
  upSetup.hidden = phase !== 'setup';
  upProgress.hidden = phase !== 'progress';
  upResult.hidden = phase !== 'result';
  upDialog.classList.toggle('has-result', phase === 'result');
}

function upUpdateDims() {
  const f = upFactor();
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  upDimsFrom.textContent = w && h ? `${w} × ${h} px` : '–';
  upDimsTo.textContent =
    w && h && f ? `${Math.round(w * f)} × ${Math.round(h * f)} px  (×${f.toLocaleString('fr-FR')})` : '–';
}

function upSelectScale(value) {
  up.scale = value;
  localStorage.setItem('upscaleScale', value);
  for (const b of upScalesWrap.querySelectorAll('.up-scale')) {
    b.classList.toggle('is-selected', b.dataset.scale === value);
  }
  upCustom.hidden = value !== 'custom';
  upUpdateDims();
}

async function upLoadModels() {
  upModel.innerHTML = '';
  const names = await window.viewer.upscaleModels();
  if (!names || names.length === 0) {
    upRun.disabled = true;
    upShowError(
      tr('Moteur d’upscale introuvable : le dossier code_source_upscale (bin + models) doit accompagner l’application.')
    );
    return;
  }
  const remembered = localStorage.getItem('upscaleModel');
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = tr(UP_MODEL_LABELS[name] || name);
    upModel.append(opt);
  }
  upModel.value = names.includes(remembered) ? remembered : names[0];
  upRun.disabled = false;
}

function openUpscale() {
  const file = currentFile();
  if (!file || image.hidden || cropMode || editBusy || upIsOpen()) return;
  up.resultData = null;
  up.resultCanvas = null;
  upError.hidden = true;
  upSetPhase('setup');
  upSelectScale(up.scale);
  upBackdrop.hidden = false;
  upLoadModels();
}

function closeUpscale() {
  if (!upIsOpen()) return;
  if (up.running) window.viewer.upscaleCancel();
  if (up.afterUrl) URL.revokeObjectURL(up.afterUrl);
  up.afterUrl = null;
  up.resultData = null;
  up.resultCanvas = null;
  upImgBefore.removeAttribute('src');
  upImgAfter.removeAttribute('src');
  upBackdrop.hidden = true;
  upDialog.classList.remove('has-result');
}

async function runUpscale() {
  const file = currentFile();
  if (!file || up.running) return;
  const f = upFactor();
  if (!f || f <= 1) {
    upShowError(tr('Le facteur doit être supérieur à 1 (entre 1,1 et 8).'));
    return;
  }
  localStorage.setItem('upscaleModel', upModel.value);
  if (up.scale === 'custom') localStorage.setItem('upscaleCustom', String(f));

  // palier moteur : l'entier supérieur, borné à [2, 4] ; l'ajustement exact
  // (×1,5, ×2,7, ×6…) est fait ensuite sur canvas
  const engineScale = Math.min(4, Math.max(2, Math.ceil(f)));
  upError.hidden = true;
  upProgressBar.style.width = '0%';
  upProgressPct.textContent = '0 %';
  upSetPhase('progress');
  up.running = true;
  try {
    let payload;
    const ext = extOf(file.name);
    if (UP_DIRECT_EXTS.has(ext)) {
      payload = { sourcePath: file.path, scale: engineScale, model: upModel.value };
    } else {
      const decoded = await decodeCurrentFile(file);
      if (!decoded) throw new Error(tr('Impossible de décoder cette image.'));
      const { img, url } = decoded;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Impossible de préparer cette image.');
      payload = {
        data: new Uint8Array(await blob.arrayBuffer()),
        ext: 'png',
        scale: engineScale,
        model: upModel.value,
      };
    }
    const res = await window.viewer.upscaleRun(payload);
    if (!upIsOpen()) return; // popup fermée pendant le traitement
    if (res.cancelled) {
      upSetPhase('setup');
      return;
    }
    if (res.error || !res.data) throw new Error(res.error || tr('Le moteur n’a produit aucun résultat.'));
    await upShowResult(res.data, f);
  } catch (err) {
    if (upIsOpen()) {
      upSetPhase('setup');
      upShowError(tr('Échec de l’agrandissement : {msg}', { msg: err.message }));
    }
  } finally {
    up.running = false;
  }
}

window.viewer.onUpscaleProgress((pct) => {
  if (!upIsOpen() || up.phase !== 'progress') return;
  const v = Math.max(0, Math.min(100, pct));
  upProgressBar.style.width = `${v}%`;
  upProgressPct.textContent = `${Math.round(v)} %`;
});

async function upShowResult(data, factor) {
  up.resultData = new Uint8Array(data);
  const srcW = image.naturalWidth;
  const srcH = image.naturalHeight;
  up.targetW = Math.max(1, Math.round(srcW * factor));
  up.targetH = Math.max(1, Math.round(srcH * factor));

  const { img, url } = await loadImageFromBlob(new Blob([up.resultData], { type: 'image/png' }));
  let afterUrl = url;
  try {
    // canvas du résultat : sert à l'enregistrement (ré-encodage au format
    // d'origine) et au redimensionnement exact d'un facteur personnalisé
    const canvas = document.createElement('canvas');
    canvas.width = up.targetW;
    canvas.height = up.targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, up.targetW, up.targetH);
    up.resultCanvas = canvas;
    if (img.naturalWidth !== up.targetW || img.naturalHeight !== up.targetH) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (blob) {
        URL.revokeObjectURL(url);
        afterUrl = URL.createObjectURL(blob);
      }
    }
  } catch {
    // image trop grande pour un canvas : on garde le PNG brut du moteur
    up.resultCanvas = null;
    up.targetW = img.naturalWidth;
    up.targetH = img.naturalHeight;
  }

  if (!upIsOpen()) {
    URL.revokeObjectURL(afterUrl);
    return;
  }
  up.afterUrl = afterUrl;
  upImgBefore.src = image.src;
  upImgAfter.src = up.afterUrl;
  upResultDims.textContent = `${srcW} × ${srcH} px  →  ${up.targetW} × ${up.targetH} px`;
  upSetPhase('result');
  requestAnimationFrame(() => upLayoutCompare(true));
}

/* --- Vue de comparaison : les deux images partagent la même vue
       (zoom molette, déplacement au glisser), la poignée révèle l'après. --- */

function upApplyCompare() {
  const w = up.targetW * up.zoom;
  const h = up.targetH * up.zoom;
  for (const el of [upImgBefore, upImgAfter]) {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate(${up.panX}px, ${up.panY}px)`;
  }
  const x = upCompare.clientWidth * up.divider;
  upAfterClip.style.clipPath = `inset(0 0 0 ${x}px)`;
  upDivider.style.left = `${x}px`;
}

function upClampPan() {
  const rect = upCompare.getBoundingClientRect();
  const w = up.targetW * up.zoom;
  const h = up.targetH * up.zoom;
  up.panX = w <= rect.width ? (rect.width - w) / 2 : Math.min(0, Math.max(rect.width - w, up.panX));
  up.panY = h <= rect.height ? (rect.height - h) / 2 : Math.min(0, Math.max(rect.height - h, up.panY));
}

function upLayoutCompare(reset) {
  const rect = upCompare.getBoundingClientRect();
  if (!rect.width || !up.targetW) return;
  up.minZoom = Math.min(rect.width / up.targetW, rect.height / up.targetH, 1);
  if (reset) {
    up.zoom = up.minZoom;
    up.divider = 0.5;
  }
  up.zoom = Math.max(up.minZoom, up.zoom);
  upClampPan();
  upApplyCompare();
}

upCompare.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = upCompare.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const z1 = up.zoom;
  const z2 = Math.min(8, Math.max(up.minZoom, z1 * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
  up.panX = cx - ((cx - up.panX) / z1) * z2;
  up.panY = cy - ((cy - up.panY) / z1) * z2;
  up.zoom = z2;
  upClampPan();
  upApplyCompare();
}, { passive: false });

let upDrag = null; // { mode: 'divider' | 'pan', x, y }

upCompare.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const mode = e.target.closest('#up-divider') ? 'divider' : 'pan';
  upDrag = { mode, x: e.clientX, y: e.clientY };
  upCompare.setPointerCapture(e.pointerId);
  if (mode === 'pan') upCompare.classList.add('is-panning');
  if (mode === 'divider') upMoveDivider(e);
});

function upMoveDivider(e) {
  const rect = upCompare.getBoundingClientRect();
  up.divider = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  upApplyCompare();
}

upCompare.addEventListener('pointermove', (e) => {
  if (!upDrag) return;
  if (upDrag.mode === 'divider') {
    upMoveDivider(e);
    return;
  }
  up.panX += e.clientX - upDrag.x;
  up.panY += e.clientY - upDrag.y;
  upDrag.x = e.clientX;
  upDrag.y = e.clientY;
  upClampPan();
  upApplyCompare();
});

const upEndDrag = () => {
  upDrag = null;
  upCompare.classList.remove('is-panning');
};
upCompare.addEventListener('pointerup', upEndDrag);
upCompare.addEventListener('pointercancel', upEndDrag);

/* --- Enregistrement du résultat --- */

async function upSaveResult(mode) {
  const file = currentFile();
  if (!file || up.saving || (!up.resultCanvas && !up.resultData)) return;
  up.saving = true;
  upSave.disabled = true;
  upSaveCopy.disabled = true;
  try {
    let savedPath = null;
    if (up.resultCanvas) {
      if (mode === 'copy') {
        const target = encodeTarget(extOf(file.name));
        const blob = await new Promise((res) => up.resultCanvas.toBlob(res, target.mime, 0.95));
        if (!blob) throw new Error('encodage impossible');
        savedPath = await window.viewer.saveCopy({
          sourcePath: file.path,
          outExt: target.outExt,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      } else {
        savedPath = await saveCanvasInPlace(up.resultCanvas, file);
      }
    } else {
      // secours sans canvas : le PNG du moteur est écrit tel quel
      const payload = { sourcePath: file.path, outExt: 'png', data: up.resultData };
      savedPath =
        mode === 'copy'
          ? await window.viewer.saveCopy(payload)
          : await window.viewer.saveInPlace(payload);
    }
    if (!savedPath) {
      upShowError(tr('Enregistrement impossible (fichier verrouillé ou dossier protégé ?).'));
      upSetPhase('setup');
      return;
    }
    closeUpscale();
    await refreshAfterSave(savedPath, file);
  } finally {
    up.saving = false;
    upSave.disabled = false;
    upSaveCopy.disabled = false;
  }
}

/* Accueil : « Agrandir avec l'IA » — choisir une image, puis la popup
   d'upscale s'ouvre d'elle-même dès que l'image est affichée. */
let pendingUpscaleOpen = false;

document.getElementById('home-upscale').addEventListener('click', async () => {
  const ctx = await window.viewer.pickFile();
  if (!ctx) return;
  pendingUpscaleOpen = true;
  loadContext(ctx);
});

btnUpscale.addEventListener('click', openUpscale);
upClose.addEventListener('click', closeUpscale);
upCancel.addEventListener('click', closeUpscale);
upDiscard.addEventListener('click', closeUpscale);
upAbort.addEventListener('click', () => window.viewer.upscaleCancel());
upRun.addEventListener('click', runUpscale);
upSave.addEventListener('click', () => upSaveResult('overwrite'));
upSaveCopy.addEventListener('click', () => upSaveResult('copy'));

for (const b of upScalesWrap.querySelectorAll('.up-scale')) {
  b.addEventListener('click', () => upSelectScale(b.dataset.scale));
}
upCustom.value = localStorage.getItem('upscaleCustom') || '2.5';
upCustom.addEventListener('input', upUpdateDims);

upBackdrop.addEventListener('mousedown', (e) => {
  // clic hors du dialogue : ferme seulement à l'étape des réglages
  // (pas question de perdre un résultat ou un traitement en cours)
  if (e.target === upBackdrop && up.phase === 'setup') closeUpscale();
});

// Échap ferme aussi quand la saisie a le focus (champ facteur, liste modèle)
upBackdrop.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUpscale();
  e.stopPropagation();
});

window.addEventListener('resize', () => {
  if (upIsOpen() && up.phase === 'result') upLayoutCompare(up.zoom === up.minZoom);
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

/* ---------- Onglets ----------
   Chaque onglet porte son propre contexte (dossier + image courante + vue).
   Le « + » ouvre un onglet sur l'accueil ; un onglet peut être détaché
   dans une nouvelle fenêtre. Les objets fichiers (et leurs vignettes déjà
   chargées) restent vivants tant que l'onglet existe. */

const tabsEl = document.getElementById('tabs');
const tabAddBtn = document.getElementById('tab-add');
const tabs = [];
let tabSeq = 0;
let activeTab = null;
let pendingTabView = null; // vue à restaurer au retour sur un onglet

const TAB_ICONS = {
  close: '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
  detach:
    '<path d="M14 5h5v5" /><path d="m19 5-7 7" /><path d="M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />',
};

function tabIcon(name) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    TAB_ICONS[name] +
    '</svg>'
  );
}

function createTab() {
  const t = { id: ++tabSeq, files: [], index: -1, view: null };
  tabs.push(t);
  return t;
}

function syncActiveTab() {
  if (!activeTab) return;
  activeTab.files = state.files;
  activeTab.index = state.index;
}

function tabTitle(t) {
  const f = t.index >= 0 ? t.files[t.index] : null;
  return f ? f.name : tr('Accueil');
}

function renderTabs() {
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  for (const t of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (t === activeTab ? ' is-active' : '');
    el.title = tabTitle(t);
    el.addEventListener('click', () => switchTab(t));

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tabTitle(t);

    const actions = document.createElement('span');
    actions.className = 'tab-actions';
    const detach = document.createElement('button');
    detach.title = 'Détacher dans une nouvelle fenêtre';
    detach.innerHTML = tabIcon('detach');
    detach.addEventListener('click', (e) => {
      e.stopPropagation();
      detachTab(t);
    });
    const close = document.createElement('button');
    close.title = 'Fermer l’onglet';
    close.innerHTML = tabIcon('close');
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(t);
    });
    actions.append(detach, close);

    el.append(title, actions);
    tabsEl.appendChild(el);
  }
}

function disposeFiles(files) {
  for (const f of files) {
    if (f.thumbUrl && f.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(f.thumbUrl);
    if (f.psdUrl) URL.revokeObjectURL(f.psdUrl);
  }
}

function saveTabView() {
  if (!activeTab) return;
  syncActiveTab();
  const f = currentFile();
  activeTab.view = f
    ? { path: f.path, zoom: state.zoom, panX: state.panX, panY: state.panY, fit: state.fit }
    : null;
}

function activateTab(t) {
  if (cropMode) exitCrop();
  activeTab = t;
  state.files = t.files;
  state.index = t.index;
  state.stat = null;
  pendingTabView = t.view;
  thumbQueue.length = 0;
  buildFilmstrip();
  render();
  if (window.Pro && window.Pro.active()) window.Pro.onContext();
}

function switchTab(t) {
  if (t === activeTab) return;
  saveTabView();
  activateTab(t);
}

function newTab() {
  if (Paint.isOpen() || studioIsOpen()) return;
  saveTabView();
  activateTab(createTab());
}

function closeTab(t) {
  const i = tabs.indexOf(t);
  if (i < 0) return;
  tabs.splice(i, 1);
  disposeFiles(t.files);
  if (t === activeTab) {
    activeTab = null;
    activateTab(tabs[Math.min(i, tabs.length - 1)] || createTab());
  } else {
    renderTabs();
  }
}

function detachTab(t) {
  const f = t.index >= 0 ? t.files[t.index] : null;
  window.viewer.openNewWindow(f ? f.path : null);
  closeTab(t);
}

tabAddBtn.addEventListener('click', newTab);

/* ---------- Thème clair / sombre (persisté) ---------- */

const btnTheme = document.getElementById('btn-theme');

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  btnTheme.title = theme === 'light'
    ? 'Passer au thème sombre (T)'
    : 'Passer au thème clair (T)';
  // les canvas du mode Pro (histogramme, profil) se redessinent avec le thème
  if (window.Pro && window.Pro.active()) window.Pro.onTheme();
}

function toggleTheme() {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
}

btnTheme.addEventListener('click', toggleTheme);
applyTheme(localStorage.getItem('theme') || 'dark');

/* ---------- Contrôles ---------- */

btnOpen.addEventListener('click', async () => {
  const ctx = await window.viewer.pickFile();
  if (ctx) loadContext(ctx);
});

/* Accueil : referme le dossier courant et revient à l'écran de départ. */
const btnHome = document.getElementById('btn-home');

function goHome() {
  if (cropMode) exitCrop();
  loadContext({ files: [], index: -1 });
}

btnHome.addEventListener('click', goHome);

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
  // Aplatit image + annotations : écraser l'original ou créer une copie.
  onSave: saveEditedCanvas,
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
        onSave: saveEditedCanvas,
        onClose: () => {},
        ensurePsd: () => ensurePsdLoaded(),
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
  if (isPsdFile(file)) {
    // PSD : le document s'ouvre avec ses calques séparés
    const psd = await decodePsdFile(file);
    if (!psd) return;
    const layers = [];
    collectPsdLayers(psd, layers);
    window.Studio.open({ file, layers, width: psd.width, height: psd.height });
    return;
  }
  const decoded = await decodeCurrentFile(file);
  if (!decoded) return;
  window.Studio.open({ file, img: decoded.img, url: decoded.url });
});

/* ---------- Accueil : nouveau projet, nouveau dessin, ouvrir un projet ---------- */

const homeOpen = document.getElementById('home-open');
const homePaint = document.getElementById('home-paint');
const homeStudio = document.getElementById('home-studio');
const homeProject = document.getElementById('home-project');
const npBackdrop = document.getElementById('newproj-backdrop');
const npName = document.getElementById('np-name');
const npTemplates = document.getElementById('np-templates');
const npW = document.getElementById('np-w');
const npH = document.getElementById('np-h');
const npDpi = document.getElementById('np-dpi');
const npBg = document.getElementById('np-bg');
const npBgColor = document.getElementById('np-bg-color');
const npMode = document.getElementById('np-mode');
const npNote = document.getElementById('np-note');

const NP_TEMPLATES = [
  { name: 'Full HD', sub: '1920 × 1080 · 16:9', w: 1920, h: 1080 },
  { name: 'Carré', sub: '1080 × 1080 · 1:1', w: 1080, h: 1080 },
  { name: 'Portrait', sub: '1080 × 1350 · 4:5', w: 1080, h: 1350 },
  { name: 'Story', sub: '1080 × 1920 · 9:16', w: 1080, h: 1920 },
  { name: '4K', sub: '3840 × 2160 · 16:9', w: 3840, h: 2160 },
  { name: 'A4', sub: '2480 × 3508 · 300 DPI', w: 2480, h: 3508, dpi: 300 },
  { name: 'A4 paysage', sub: '3508 × 2480 · 300 DPI', w: 3508, h: 2480, dpi: 300 },
  { name: 'Bannière', sub: '1500 × 500 · 3:1', w: 1500, h: 500 },
];

for (const t of NP_TEMPLATES) {
  const b = document.createElement('button');
  b.className = 'np-template';
  b.title = `${t.name} — ${t.sub}`;
  const ratio = document.createElement('span');
  ratio.className = 'np-template-ratio';
  const k = Math.min(34 / t.w, 24 / t.h);
  ratio.style.width = `${Math.max(8, Math.round(t.w * k))}px`;
  ratio.style.height = `${Math.max(8, Math.round(t.h * k))}px`;
  const nm = document.createElement('span');
  nm.className = 'np-template-name';
  nm.textContent = t.name;
  const sub = document.createElement('span');
  sub.className = 'np-template-sub';
  sub.textContent = t.sub;
  b.append(ratio, nm, sub);
  b.addEventListener('click', () => {
    npW.value = String(t.w);
    npH.value = String(t.h);
    npDpi.value = String(t.dpi || 72);
    for (const o of npTemplates.children) o.classList.toggle('is-selected', o === b);
  });
  npTemplates.appendChild(b);
}
for (const inp of [npW, npH]) {
  inp.addEventListener('input', () => {
    for (const o of npTemplates.children) o.classList.remove('is-selected');
  });
}

npBg.addEventListener('change', () => {
  npBgColor.hidden = npBg.value !== 'custom';
});
npMode.addEventListener('change', () => {
  npNote.hidden = npMode.value !== 'cmyk';
});

homeOpen.addEventListener('click', () => btnOpen.click());

homeStudio.addEventListener('click', () => {
  npBackdrop.hidden = false;
  npName.focus();
  npName.select();
});
document.getElementById('np-cancel').addEventListener('click', () => {
  npBackdrop.hidden = true;
});
npBackdrop.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') npBackdrop.hidden = true;
  e.stopPropagation();
});

document.getElementById('np-create').addEventListener('click', async () => {
  const width = Math.max(1, Math.min(20000, Math.round(Number(npW.value) || 0)));
  const height = Math.max(1, Math.min(20000, Math.round(Number(npH.value) || 0)));
  if (!width || !height) return;
  const background =
    npBg.value === 'transparent' ? null : npBg.value === 'custom' ? npBgColor.value : npBg.value;
  npBackdrop.hidden = true;
  await ensureStudioLoaded();
  window.Studio.open({
    file: { name: npName.value.trim() || 'Sans titre', path: null, url: null },
    blank: {
      width,
      height,
      background,
      dpi: Math.max(18, Math.min(1200, Math.round(Number(npDpi.value) || 72))),
      mode: npMode.value,
    },
  });
});

homePaint.addEventListener('click', () => {
  if (Paint.isOpen() || studioIsOpen()) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const decoded = await loadImageFromBlob(blob);
    Paint.open({ file: { name: 'Nouveau dessin', path: null, url: null }, img: decoded.img, url: decoded.url });
  }, 'image/png');
});

homeProject.addEventListener('click', async () => {
  if (Paint.isOpen() || studioIsOpen()) return;
  await ensureStudioLoaded();
  await window.Studio.openProjectFromHome();
});

/* ---------- Mode Basic / Pro (persisté) ----------
   Basic : la visionneuse épurée. Pro : panneau d'analyse (histogramme,
   inspecteur de pixels, canaux, métadonnées EXIF, notes/drapeaux, tri,
   comparaison, mesure, grille) — module chargé à la demande. */

const modeBasicBtn = document.getElementById('mode-basic');
const modeProBtn = document.getElementById('mode-pro');
let proLoading = null;

function ensureProLoaded() {
  if (!proLoading) {
    proLoading = (async () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'pro.css';
      document.head.appendChild(link);
      await loadScript('pro.js');
    })().catch((err) => {
      proLoading = null;
      throw err;
    });
  }
  return proLoading;
}

async function setViewerMode(mode, persist = true) {
  if (persist) localStorage.setItem('viewerMode', mode);
  modeBasicBtn.classList.toggle('is-active', mode !== 'pro');
  modeProBtn.classList.toggle('is-active', mode === 'pro');
  if (mode === 'pro') {
    await ensureProLoaded();
    document.body.classList.add('pro');
    window.Pro.enable();
  } else {
    document.body.classList.remove('pro');
    if (window.Pro) window.Pro.disable();
  }
}

modeBasicBtn.addEventListener('click', () => setViewerMode('basic'));
modeProBtn.addEventListener('click', () => setViewerMode('pro'));
setViewerMode(localStorage.getItem('viewerMode') || 'basic', false);

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
    // galerie ouverte : la molette doit faire défiler la grille, pas
    // zoomer l'image cachée derrière
    if (currentFile() === null || cropMode || galleryOpen) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoomAt(state.zoom * factor, e.clientX, e.clientY);
  },
  { passive: false }
);

/* Déplacement (pan) libre à la souris — clic gauche ou clic molette,
   sans aucune contrainte de bord. */
let panStart = null;
stage.addEventListener('mousedown', (e) => {
  if ((e.button !== 0 && e.button !== 1) || currentFile() === null || cropMode || galleryOpen) {
    return;
  }
  // OCR actif : le clic sur un mot démarre une sélection de texte, pas un pan
  if (e.button === 0 && e.target.classList.contains('ocr-word')) return;
  if (e.button === 1) e.preventDefault(); // neutralise l'auto-défilement natif
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
  // saisie en cours (champ, liste déroulante) : aucun raccourci global
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.target instanceof HTMLSelectElement
  ) {
    return;
  }
  // galerie Global ouverte : elle capte le clavier
  if (galleryOpen) {
    if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'g')) {
      e.preventDefault();
      closeGallery();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      moveGalleryCursor(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key === 'Enter') {
      const it = galleryList[galleryCursor];
      if (it) {
        goTo(it.i);
        closeGallery();
      }
      return;
    }
    return;
  }
  if (!infoOverlay.hidden) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'i') hideInfo();
    return;
  }
  if (upIsOpen()) {
    if (e.key === 'Escape') closeUpscale();
    return;
  }
  if (cropMode) {
    if (e.key === 'Escape') exitCrop();
    if (e.key === 'Enter') applyCrop();
    return;
  }
  // mode Pro : notes (1-5, 0), drapeaux (P/X/U), grille (G), verrou (K), mesure (M)
  if (
    window.Pro &&
    window.Pro.active() &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    window.Pro.handleKey(e)
  ) {
    e.preventDefault();
    return;
  }
  // OCR actif : Ctrl+A sélectionne tout le texte reconnu (Ctrl+C natif ensuite)
  if (ocrActive && e.ctrlKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    ocrSelectAll();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    btnOpen.click();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 't') {
    e.preventDefault();
    newTab();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    openGallery();
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
    case 't':
    case 'T':
      toggleTheme();
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
      if (ocrActive) setOcrActive(false);
      else if (isFullscreen) window.viewer.toggleFullscreen();
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

/* ---------- OCR : sélection du texte de l'image ----------
   Bouton bascule, coût nul tant qu'il n'est pas activé. À l'activation, le
   moteur OCR natif de Windows (Windows.Media.Ocr, invoqué par le process
   main — aucune dépendance) analyse l'image affichée, puis une couche de
   texte transparent est posée mot à mot exactement sur les pixels : le
   texte se sélectionne et se copie comme dans un PDF. La couche suit le
   zoom et le pan de l'image (voir applyTransform) et disparaît dès que
   l'image change ou que le bouton est désactivé. */

const OCR_MAX_DIM = 2400; // le moteur Windows plafonne vers 2600 px de côté

let ocrLayer = null; // créé à la première activation
let ocrActive = false;
let ocrBusy = false;
let ocrForSrc = ''; // image.src au moment de l'analyse
let ocrCache = null; // { key, data } — dernière analyse, pour une bascule instantanée
let ocrNoteEl = null;
let ocrNoteTimer = 0;

function ocrSyncTransform() {
  if (ocrLayer && ocrActive) ocrLayer.style.transform = image.style.transform;
}

/* Petit message transitoire (« Aucun texte détecté »…), discret et auto-effacé. */
function ocrNote(text) {
  if (!ocrNoteEl) {
    ocrNoteEl = document.createElement('div');
    ocrNoteEl.id = 'ocr-note';
    stage.appendChild(ocrNoteEl);
  }
  ocrNoteEl.textContent = text;
  ocrNoteEl.classList.add('show');
  clearTimeout(ocrNoteTimer);
  ocrNoteTimer = setTimeout(() => ocrNoteEl.classList.remove('show'), 2600);
}

function ocrDeactivate() {
  if (!ocrActive) return;
  ocrActive = false;
  btnOcr.classList.remove('active');
  if (ocrLayer) {
    const sel = window.getSelection();
    if (sel && sel.anchorNode && ocrLayer.contains(sel.anchorNode)) sel.removeAllRanges();
    ocrLayer.hidden = true;
    ocrLayer.textContent = '';
  }
}

function ocrSelectAll() {
  if (!ocrLayer || ocrLayer.hidden) return;
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(ocrLayer);
  sel.removeAllRanges();
  sel.addRange(range);
}

/* Envoie au moteur un PNG de l'image affichée, plafonné à OCR_MAX_DIM
   (les coordonnées sont remises à l'échelle naturelle au retour). */
async function ocrAnalyze() {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const k = Math.min(1, OCR_MAX_DIM / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return { error: 'fail' };
  const res = await window.viewer.ocrRun(new Uint8Array(await blob.arrayBuffer()));
  if (!res || res.error) return { error: res ? res.error : 'fail' };
  const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const lines = asArray(res.lines)
    .map((l) => asArray(l.words))
    .filter((words) => words.length > 0);
  return { lines, width: canvas.width };
}

/* Pose les mots reconnus : chaque mot est un span de texte transparent
   positionné sur sa boîte englobante, puis étiré (scaleX) pour la couvrir
   exactement — la sélection épouse ainsi les mots de l'image. Les lignes
   sont des blocs séparés : la copie restitue espaces et retours à la ligne. */
function ocrBuildLayer(data) {
  if (!ocrLayer) {
    ocrLayer = document.createElement('div');
    ocrLayer.id = 'ocr-layer';
    image.insertAdjacentElement('afterend', ocrLayer);
  }
  ocrLayer.textContent = '';
  const factor = image.naturalWidth / data.width;
  ocrLayer.style.width = `${image.naturalWidth}px`;
  ocrLayer.style.height = `${image.naturalHeight}px`;
  const spans = [];
  for (const words of data.lines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'ocr-line';
    for (const wd of words) {
      const span = document.createElement('span');
      span.className = 'ocr-word';
      span.textContent = wd.t;
      span.style.left = `${wd.x * factor}px`;
      span.style.top = `${wd.y * factor}px`;
      span.style.fontSize = `${Math.max(4, wd.h * factor)}px`;
      lineEl.appendChild(span);
      // séparateur rendu (1 px, invisible) : un nœud en font-size 0 serait
      // exclu de la sélection copiée, les mots seraient collés
      const sep = document.createElement('span');
      sep.className = 'ocr-sep';
      sep.textContent = ' ';
      lineEl.appendChild(sep);
      spans.push([span, wd.w * factor]);
    }
    lineEl.lastChild.textContent = '\n'; // fin de ligne : la copie garde les retours
    ocrLayer.appendChild(lineEl);
  }
  ocrLayer.hidden = false;
  // lectures groupées avant écritures : une seule passe de layout
  const widths = spans.map(([s]) => s.offsetWidth || 1);
  spans.forEach(([s, target], i) => {
    s.style.transform = `scaleX(${target / widths[i]})`;
  });
}

async function setOcrActive(on) {
  if (!on || ocrActive) {
    ocrDeactivate();
    return;
  }
  const file = currentFile();
  if (!file || image.hidden || !image.complete || !image.naturalWidth || ocrBusy) return;
  ocrBusy = true;
  btnOcr.classList.add('is-busy');
  try {
    const key = `${file.path}|${image.naturalWidth}x${image.naturalHeight}`;
    const src = image.src;
    let data = ocrCache && ocrCache.key === key ? ocrCache.data : null;
    if (!data) {
      data = await ocrAnalyze();
      if (currentFile() !== file || image.src !== src) return; // image changée entre-temps
      if (data.error) {
        ocrNote(
          data.error === 'nolang'
            ? tr('Aucune langue de reconnaissance de texte n’est installée dans Windows')
            : tr('Reconnaissance de texte impossible sur cette image')
        );
        return;
      }
      ocrCache = { key, data };
    }
    if (!data.lines.length) {
      ocrNote(tr('Aucun texte détecté'));
      return;
    }
    ocrBuildLayer(data);
    ocrForSrc = src;
    ocrActive = true;
    btnOcr.classList.add('active');
    ocrSyncTransform();
  } finally {
    ocrBusy = false;
    btnOcr.classList.remove('is-busy');
  }
}

btnOcr.addEventListener('click', () => setOcrActive(!ocrActive));

// toute nouvelle image (navigation, rotation, rognage…) retire la couche
image.addEventListener('load', () => {
  if (ocrActive && image.src !== ocrForSrc) ocrDeactivate();
});
image.addEventListener('error', ocrDeactivate);

/* ---------- Langue de l'interface (i18n) ----------
   Liste simple des 11 langues (noms natifs) sous le bouton globe ;
   le choix est mémorisé et poussé au process main pour les dialogues. */

const btnLang = document.getElementById('btn-lang');
const langPopup = document.getElementById('lang-popup');

function buildLangPopup() {
  langPopup.innerHTML = '';
  for (const { code, name } of window.I18n.languages()) {
    const b = document.createElement('button');
    b.className = 'lang-item';
    b.textContent = name;
    b.lang = code;
    b.classList.toggle('is-active', code === window.I18n.locale());
    b.addEventListener('click', async () => {
      await window.I18n.setLocale(code);
      langPopup.hidden = true;
      render(); // rafraîchit les textes dynamiques (zoom, onglets…)
      renderTabs();
    });
    langPopup.appendChild(b);
  }
}

btnLang.addEventListener('click', () => {
  if (!langPopup.hidden) {
    langPopup.hidden = true;
    return;
  }
  buildLangPopup();
  const r = btnLang.getBoundingClientRect();
  langPopup.style.top = `${r.bottom + 6}px`;
  langPopup.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  langPopup.hidden = false;
});

document.addEventListener('pointerdown', (e) => {
  if (langPopup.hidden) return;
  if (langPopup.contains(e.target) || btnLang.contains(e.target)) return;
  langPopup.hidden = true;
});

/* ---------- Modules optionnels (débranchables) ----------
   Chaque module construit son bouton (.module-btn, suivi par render())
   et sa popup ; l'hôte ne lui fournit que quelques accès. Retirer le
   bloc d'un module suffit à le débrancher (voir son README). */

// Module Export SVG (renderer/svg-export)
if (window.SvgExport) {
  window.SvgExport.init({
    getFile: currentFile,
    decodeFile: decodeCurrentFile,
    canOpen: () => !cropMode && !editBusy && !image.hidden,
  });
}

/* ---------- Démarrage ---------- */

applyFilmstripVisibility();

window.viewer.onOpenContext(loadContext);

window.viewer.ready().then((context) => {
  activeTab = createTab();
  if (context) {
    loadContext(context);
  } else {
    render();
  }
});
