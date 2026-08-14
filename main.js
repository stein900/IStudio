const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.jfif', '.png', '.gif', '.bmp',
  '.webp', '.ico', '.svg', '.tif', '.tiff', '.avif', '.psd',
]);

/* Vidéos lues par la balise <video> de Chromium (décodeur ffmpeg déjà
   embarqué dans Electron : AUCUNE dépendance ni surpoids). MP4/MOV en
   H.264 et MKV en H.264/VP9/AV1 couvrent l'immense majorité des fichiers. */
const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.mkv', '.mov', '.webm']);

const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

const SMOKE = process.argv.includes('--smoke');

// --smoke-psd : fabrique un PSD de test (2 calques + texte) avant
// l'ouverture — sauf si un .psd existant est passé en argument.
let smokePsdGenerated = false;
if (process.argv.includes('--smoke-psd') && !fileFromArgv(process.argv)) {
  smokePsdGenerated = true;
  try {
    const ag = require('ag-psd');
    const os = require('os');
    const mkData = (w, h, r, g, b) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i += 1) {
        d[i * 4] = r;
        d[i * 4 + 1] = g;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = 255;
      }
      return { width: w, height: h, data: d };
    };
    const out = ag.writePsd({
      width: 200,
      height: 150,
      children: [
        { name: 'Fond', left: 0, top: 0, imageData: mkData(200, 150, 220, 40, 40) },
        { name: 'Carré', left: 30, top: 30, opacity: 1, imageData: mkData(60, 60, 40, 80, 220) },
        {
          name: 'Titre',
          left: 20,
          top: 100,
          text: {
            text: 'Salut',
            transform: [1, 0, 0, 1, 20, 120],
            style: { font: { name: 'ArialMT' }, fontSize: 24, fillColor: { r: 10, g: 200, b: 60 } },
          },
        },
      ],
    });
    const psdPath = path.join(os.tmpdir(), 'istudio-smoke.psd');
    fssync.writeFileSync(psdPath, Buffer.from(out));
    process.argv.push(psdPath);
  } catch (err) {
    console.log(`SMOKE PSD SETUP ERROR: ${err.message}`);
  }
}

/* Plusieurs fenêtres : ouvrir une image alors qu'une instance tourne déjà
   (même occupée dans Studio ou Paint) crée une NOUVELLE fenêtre.
   mainWindow reste la première fenêtre (référence des tests smoke). */
let mainWindow = null;
let pendingFile = fileFromArgv(process.argv);
const pendingContexts = new Map(); // webContents.id -> Promise<contexte>

function senderWindow(e) {
  return BrowserWindow.fromWebContents(e.sender);
}

/* ---------- i18n des dialogues natifs ----------
   Même principe gettext que le renderer : la phrase française est la clé,
   les catalogues JSON de renderer/i18n/locales sont partagés. Le renderer
   pousse la langue via « set-locale ». */
let dialogDict = {};

function tr(fr, params) {
  let out = Object.prototype.hasOwnProperty.call(dialogDict, fr) ? dialogDict[fr] : fr;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}

ipcMain.handle('set-locale', (_e, code) => {
  const safe = String(code || 'fr').slice(0, 8);
  if (safe === 'fr') {
    dialogDict = {};
    return true;
  }
  try {
    dialogDict = JSON.parse(
      fssync.readFileSync(path.join(__dirname, 'renderer', 'i18n', 'locales', `${safe}.json`), 'utf8')
    );
  } catch {
    dialogDict = {};
  }
  return true;
});

function fileFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (typeof arg !== 'string' || arg.startsWith('-')) continue;
    try {
      const p = path.resolve(arg);
      if (fssync.existsSync(p) && MEDIA_EXTS.has(path.extname(p).toLowerCase())) {
        return p;
      }
    } catch {
      // argument invalide : on ignore
    }
  }
  return null;
}

async function buildContext(filePath) {
  const dir = path.dirname(filePath);
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const names = entries
    .filter((e) => e.isFile() && MEDIA_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  // AUCUN stat ici : sur un partage réseau (NAS), des centaines de stat en
  // parallèle retardaient l'affichage de plusieurs secondes. Les tailles
  // sont récupérées à la demande (tri par taille du mode Pro : stat-sizes).
  const files = names.map((name) => {
    const p = path.join(dir, name);
    return { name, path: p, url: pathToFileURL(p).href, size: 0 };
  });

  const wanted = filePath.toLowerCase();
  let index = files.findIndex((f) => f.path.toLowerCase() === wanted);
  if (index === -1) {
    // Le fichier demandé n'est plus listé (supprimé ?) : on l'affiche quand même seul.
    files.unshift({
      name: path.basename(filePath),
      path: filePath,
      url: pathToFileURL(filePath).href,
    });
    index = 0;
  }
  return { files, index };
}

// Nom affiché partout (barre des tâches, notifications) : « IStudio » —
// jamais le nom du binaire ni le suffixe « (Electron) » du mode dev.
app.setName('IStudio');
app.setAppUserModelId('fr.ahg.istudio.viewer');

function createWindow(contextPromise = null) {
  // icône de fenêtre en dev (l'application installée reprend l'icône de
  // l'exécutable) : l'ICO multi-résolutions évite tout flou de mise à l'échelle
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  const win = new BrowserWindow({
    title: 'IStudio',
    ...(fssync.existsSync(iconPath) ? { icon: iconPath } : {}),
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 480,
    backgroundColor: '#0e0e11',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const wcId = win.webContents.id;
  if (contextPromise) pendingContexts.set(wcId, contextPromise);
  const isFirst = mainWindow === null;
  if (isFirst) mainWindow = win;

  win.once('ready-to-show', () => win.show());
  win.on('enter-full-screen', () => {
    win.webContents.send('fullscreen-changed', true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('fullscreen-changed', false);
  });
  win.on('closed', () => {
    pendingContexts.delete(wcId);
    if (mainWindow === win) mainWindow = null;
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE && isFirst) {
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      console.log(`[renderer:${level}] ${message}`);
    });
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('SMOKE: did-finish-load OK');
      if (process.argv.includes('--smoke-rotate')) {
        // Vérifie qu'une rotation modifie réellement le fichier.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 document.getElementById('btn-rotate').click();
                 await new Promise((res) => setTimeout(res, 2000));
                 const img = document.getElementById('image');
                 return { w: img.naturalWidth, h: img.naturalHeight };
               })()`
            );
            console.log(`SMOKE ROTATE: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE ROTATE ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-paint')) {
        // Vérifie que Paint s'ouvre, dessine et enregistre dans le fichier.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 document.getElementById('btn-paint').click();
                 await new Promise((res) => setTimeout(res, 1500));
                 const paintOpen = !document.getElementById('paint').hidden;
                 const c = document.getElementById('paint-canvas');
                 const rect = c.getBoundingClientRect();
                 const mk = (type, x, y) => new PointerEvent(type, {
                   bubbles: true, cancelable: true, button: 0, buttons: 1,
                   pointerId: 1, pointerType: 'mouse',
                   clientX: rect.left + x, clientY: rect.top + y,
                 });
                 c.dispatchEvent(mk('pointerdown', 20, 20));
                 c.dispatchEvent(mk('pointermove', 60, 40));
                 c.dispatchEvent(mk('pointermove', 100, 30));
                 c.dispatchEvent(mk('pointerup', 100, 30));
                 await new Promise((res) => setTimeout(res, 300));
                 const saveBtn = document.getElementById('paint-save');
                 const saveEnabled = !saveBtn.disabled;
                 saveBtn.click();
                 await new Promise((res) => setTimeout(res, 2500));
                 return {
                   paintOpen,
                   saveEnabled,
                   closedAfterSave: document.getElementById('paint').hidden,
                 };
               })()`
            );
            console.log(`SMOKE PAINT: ${JSON.stringify(r)}`);
            // Mode copie : vérifie qu'un « nom copie.ext » a été créé, puis le retire.
            if (process.argv.includes('--smoke-save-copy')) {
              const src = fileFromArgv(process.argv);
              if (src) {
                const dir = path.dirname(src);
                const base = path.basename(src, path.extname(src));
                const copies = fssync.readdirSync(dir).filter((f) => f.startsWith(`${base} copie`));
                console.log(`SMOKE SAVE-COPY: ${JSON.stringify(copies)}`);
                for (const f of copies) fssync.unlinkSync(path.join(dir, f));
              }
            }
          } catch (err) {
            console.log(`SMOKE PAINT ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-pro')) {
        // Mode Pro : panneau d'analyse, histogramme, inspecteur, canaux,
        // notes/drapeaux, tri/filtre, comparaison, retour au mode Basic.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 await new Promise((res) => setTimeout(res, 1200));
                 document.getElementById('mode-pro').click();
                 await new Promise((res) => setTimeout(res, 2800));
                 const panel = document.getElementById('pro-panel');
                 const panelOpen = Boolean(panel) && !panel.hidden;
                 // la ligne « Vue » : grille + pas + 1:1 + verrou côte à côte
                 const vueTops = ['pro-grid', 'pro-grid-step', 'pro-100', 'pro-lock']
                   .map((id) => document.getElementById(id).getBoundingClientRect().top);
                 const vueOneLine = Math.max(...vueTops) - Math.min(...vueTops) < 4;
                 const histInk = (() => {
                   const c = document.getElementById('pro-hist');
                   const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                   for (let i = 0; i < d.length; i += 4) if (d[i] > 30) return true;
                   return false;
                 })();
                 const infoText = document.getElementById('pro-info').textContent;
                 // inspecteur : survol du centre de la scène
                 const st = document.getElementById('stage');
                 const sr = st.getBoundingClientRect();
                 st.dispatchEvent(new PointerEvent('pointermove', {
                   bubbles: true, clientX: sr.left + sr.width / 2, clientY: sr.top + sr.height / 2,
                 }));
                 await new Promise((res) => setTimeout(res, 200));
                 const inspector = document.getElementById('pro-rgba').textContent !== '—';
                 // canal rouge : l'image bascule sur un rendu blob
                 document.querySelector('#pro-chan [data-ch="r"]').click();
                 await new Promise((res) => setTimeout(res, 1500));
                 const channelSwapped = document.getElementById('image').src.startsWith('blob:');
                 document.querySelector('#pro-chan [data-ch="rgb"]').click();
                 await new Promise((res) => setTimeout(res, 600));
                 // note 3 étoiles + drapeau retenir (clavier)
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 300));
                 const stars = document.querySelectorAll('#pro-stars .pro-star.is-active').length;
                 const badge = Boolean(document.querySelector('.thumb .pro-badge'));
                 const picked = document.querySelector('.thumb.pro-pick') !== null;
                 // filtre ≥ 3 étoiles : seule l'image notée reste
                 document.getElementById('pro-filter').value = 'r3';
                 document.getElementById('pro-filter').dispatchEvent(new Event('change', { bubbles: true }));
                 await new Promise((res) => setTimeout(res, 500));
                 const filtered = document.querySelectorAll('.thumb').length;
                 document.getElementById('pro-filter').value = 'all';
                 document.getElementById('pro-filter').dispatchEvent(new Event('change', { bubbles: true }));
                 await new Promise((res) => setTimeout(res, 500));
                 const unfiltered = document.querySelectorAll('.thumb').length;
                 // comparaison côte à côte avec la précédente
                 document.getElementById('pro-cmp-side').click();
                 await new Promise((res) => setTimeout(res, 800));
                 const compareCells = document.querySelectorAll('.pro-cmp-cell').length;
                 document.getElementById('pro-cmp-side').click();
                 await new Promise((res) => setTimeout(res, 300));
                 // grille
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 200));
                 const ov = document.getElementById('pro-overlay');
                 const od = ov.getContext('2d').getImageData(0, 0, ov.width, ov.height).data;
                 let gridInk = false;
                 for (let i = 3; i < od.length; i += 4) if (od[i] > 0) { gridInk = true; break; }
                 // retour Basic
                 document.getElementById('mode-basic').click();
                 await new Promise((res) => setTimeout(res, 400));
                 const basicBack = panel.hidden && !document.body.classList.contains('pro');
                 return {
                   panelOpen, vueOneLine, histInk, inspector, channelSwapped,
                   hasBits: infoText.includes('Bits'), hasChroma: infoText.includes('Chroma') || infoText.includes('Espace'),
                   stars, badge, picked, filtered, unfiltered, compareCells, gridInk, basicBack,
                 };
               })()`
            );
            console.log(`SMOKE PRO: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE PRO ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-home')) {
        // Accueil sans fichier : nouveau projet (gabarit + fond), retour à
        // l'accueil à la fermeture, nouveau dessin Paint.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 const homeVisible = !document.getElementById('empty-state').hidden;
                 document.getElementById('home-studio').click();
                 await new Promise((res) => setTimeout(res, 200));
                 const popupOpen = !document.getElementById('newproj-backdrop').hidden;
                 const tiles = document.querySelectorAll('.np-template');
                 tiles[1].click(); // Carré 1080 × 1080
                 document.getElementById('np-name').value = 'Projet test';
                 document.getElementById('np-create').click();
                 await new Promise((res) => setTimeout(res, 3000));
                 const studioOpen = Boolean(window.Studio && window.Studio.isOpen());
                 const c = document.getElementById('studio-canvas');
                 const dims = c ? c.width + 'x' + c.height : null;
                 const pix = c ? c.getContext('2d').getImageData(540, 540, 1, 1).data : [0, 0, 0, 0];
                 const whiteBg = pix[0] === 255 && pix[1] === 255 && pix[2] === 255 && pix[3] === 255;
                 const statusMeta = document.getElementById('studio-status-doc').textContent;
                 document.getElementById('studio-close').click();
                 await new Promise((res) => setTimeout(res, 400));
                 const backHome = !document.getElementById('empty-state').hidden && !window.Studio.isOpen();
                 document.getElementById('home-paint').click();
                 await new Promise((res) => setTimeout(res, 900));
                 const paintOpen = !document.getElementById('paint').hidden;
                 document.getElementById('paint-close').click();
                 await new Promise((res) => setTimeout(res, 300));
                 const backHome2 = !document.getElementById('empty-state').hidden;
                 return { homeVisible, popupOpen, studioOpen, dims, whiteBg, statusMeta, backHome, paintOpen, backHome2 };
               })()`
            );
            console.log(`SMOKE HOME: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE HOME ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-ocr')) {
        // OCR : activation du bouton → couche de texte sélectionnable posée
        // sur l'image, Ctrl+A/copie logique, désactivation propre.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 await new Promise((res) => setTimeout(res, 1000));
                 const img = document.getElementById('image');
                 const imageShown = !img.hidden && img.naturalWidth > 0;
                 const btn = document.getElementById('btn-ocr');
                 btn.click();
                 // l'analyse est asynchrone (PowerShell) : on attend le résultat
                 for (let i = 0; i < 100; i += 1) {
                   const layer = document.getElementById('ocr-layer');
                   if (layer && !layer.hidden) break;
                   await new Promise((res) => setTimeout(res, 200));
                 }
                 const layer = document.getElementById('ocr-layer');
                 const activated = Boolean(layer) && !layer.hidden && btn.classList.contains('active');
                 const words = layer ? [...layer.querySelectorAll('.ocr-word')] : [];
                 const sample = words.slice(0, 4).map((w) => w.textContent).join(' ');
                 // sélection complète : le texte copié doit contenir les mots
                 const sel = window.getSelection();
                 const range = document.createRange();
                 if (layer) { range.selectNodeContents(layer); sel.removeAllRanges(); sel.addRange(range); }
                 const selectedText = sel.toString().trim();
                 return { imageShown, activated, wordCount: words.length, sample, selectedText };
               })()`
            );
            // capture avec la sélection visible, pour contrôle visuel
            const shot = await mainWindow.webContents.capturePage();
            const shotPath = path.join(app.getPath('temp'), 'istudio-smoke-ocr.png');
            fssync.writeFileSync(shotPath, shot.toPNG());
            const r2 = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 document.getElementById('btn-ocr').click(); // bascule off
                 await new Promise((res) => setTimeout(res, 200));
                 const layer = document.getElementById('ocr-layer');
                 const btn = document.getElementById('btn-ocr');
                 return { deactivated: layer.hidden && !btn.classList.contains('active') };
               })()`
            );
            console.log(`SMOKE OCR: ${JSON.stringify({ ...r, ...r2, shotPath })}`);
          } catch (err) {
            console.log(`SMOKE OCR ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-strip')) {
        // Tri du bandeau : nom (ordre Explorateur) par défaut, bascule par
        // date puis inversion, retour au nom = ordre initial.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 await new Promise((res) => setTimeout(res, 800));
                 // le bandeau doit être visible pour ce test ; les préférences
                 // de l'utilisateur sont restaurées à la fin
                 const prevStrip = localStorage.getItem('filmstripVisible');
                 const prevSort = localStorage.getItem('stripSort');
                 const prevAsc = localStorage.getItem('stripSortAsc');
                 if (document.body.classList.contains('no-filmstrip')) {
                   document.getElementById('btn-film').click();
                 }
                 const names = () =>
                   [...document.querySelectorAll('#filmstrip .thumb .thumb-name')].map((n) => n.textContent);
                 const rows = () => [...document.querySelectorAll('.strip-sort-opt')];
                 const wait = (ms) => new Promise((res) => setTimeout(res, ms));
                 document.getElementById('strip-sort').click();
                 const popupOpen = !document.getElementById('strip-sort-popup').hidden;
                 rows()[0].click(); // Nom (ou inversion s'il était déjà actif)
                 await wait(700);
                 if (names()[0] !== 'alpha.png') { rows()[0].click(); await wait(400); }
                 const byName = names();
                 rows()[1].click(); // Date : sens naturel = récentes d'abord
                 await wait(700);
                 const byDateDesc = names();
                 rows()[1].click(); // re-clic : ordre chronologique
                 await wait(400);
                 const byDateAsc = names();
                 const currentName = document.getElementById('file-name').textContent;
                 // l'image affichée doit être visible dans le bandeau
                 const tileRect = document.querySelector('#filmstrip .thumb.current').getBoundingClientRect();
                 const stripRect = document.getElementById('filmstrip').getBoundingClientRect();
                 const currentVisible = tileRect.left >= stripRect.left - 1 && tileRect.right <= stripRect.right + 1;
                 // garde-fou : fenêtre de 30 tuiles max, extensible par +30
                 const tileCount = document.querySelectorAll('#filmstrip .thumb').length;
                 const moreBtns = document.querySelectorAll('#filmstrip .thumb-more').length;
                 const firstMore = document.querySelector('#filmstrip .thumb-more');
                 if (firstMore) { firstMore.click(); await wait(250); }
                 const tileCountAfterMore = document.querySelectorAll('#filmstrip .thumb').length;
                 if (prevStrip === null) localStorage.removeItem('filmstripVisible');
                 else localStorage.setItem('filmstripVisible', prevStrip);
                 if (prevSort === null) localStorage.removeItem('stripSort');
                 else localStorage.setItem('stripSort', prevSort);
                 if (prevAsc === null) localStorage.removeItem('stripSortAsc');
                 else localStorage.setItem('stripSortAsc', prevAsc);
                 return { popupOpen, byName: byName.slice(0, 5), byDateDesc: byDateDesc.slice(0, 5),
                          byDateAsc: byDateAsc.slice(0, 5), currentName, currentVisible,
                          tileCount, moreBtns, tileCountAfterMore };
               })()`
            );
            // le popup de tri est resté ouvert : contrôle visuel possible
            const shot = await mainWindow.webContents.capturePage();
            const shotPath = path.join(app.getPath('temp'), 'istudio-smoke-strip.png');
            fssync.writeFileSync(shotPath, shot.toPNG());
            console.log(`SMOKE STRIP: ${JSON.stringify({ ...r, shotPath })}`);
          } catch (err) {
            console.log(`SMOKE STRIP ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-psd')) {
        // PSD : composite affiché dans la visionneuse, calques séparés dans
        // Studio (ordre d'empilement respecté), export PSD disponible.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 const generated = ${smokePsdGenerated};
                 await new Promise((res) => setTimeout(res, 2500));
                 const img = document.getElementById('image');
                 const psdShown = generated
                   ? img.naturalWidth === 200 && img.naturalHeight === 150
                   : img.naturalWidth > 0 && !img.hidden;
                 const dims = img.naturalWidth + 'x' + img.naturalHeight;
                 document.getElementById('btn-studio').click();
                 await new Promise((res) => setTimeout(res, 3000));
                 const layersCount = document.querySelectorAll('.studio-layer').length;
                 const names = [...document.querySelectorAll('.studio-layer-name')].map((n) => n.textContent);
                 const c = document.getElementById('studio-canvas');
                 const ctx = c.getContext('2d');
                 const pTop = ctx.getImageData(50, 50, 1, 1).data; // carré bleu au-dessus
                 const pBg = ctx.getImageData(10, 10, 1, 1).data; // fond rouge
                 const psdMenuItem = (() => {
                   document.querySelector('.studio-menu-btn[data-menu="image"]').click();
                   const has = [...document.querySelectorAll('.studio-menu-item')]
                     .some((b) => b.textContent.startsWith('Exporter en PSD'));
                   window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                   return has;
                 })();

                 // Le calque texte PSD doit être éditable : double-clic sur sa
                 // ligne → champ de saisie ouvert avec le contenu d'origine
                 const textRow = [...document.querySelectorAll('.studio-layer')]
                   .find((row) => row.querySelector('.studio-layer-kind svg'));
                 let textEditable = false;
                 if (textRow) {
                   textRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                   await new Promise((res) => setTimeout(res, 300));
                   const te = document.getElementById('studio-text-editor');
                   textEditable = !te.hidden && (generated ? te.value === 'Salut' : te.value.trim().length > 0);
                   te.dispatchEvent(new Event('blur'));
                   await new Promise((res) => setTimeout(res, 250));
                 }

                 // Export PSD réel (écrit dans le dossier temporaire en mode smoke)
                 document.querySelector('.studio-menu-btn[data-menu="image"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 [...document.querySelectorAll('.studio-menu-item')]
                   .find((b) => b.textContent.startsWith('Exporter en PSD'))
                   .click();
                 await new Promise((res) => setTimeout(res, 1500));
                 const exportOk = document
                   .getElementById('studio-status-hint')
                   .textContent.startsWith('PSD exporté');
                 return {
                   exportOk,
                   psdShown,
                   dims,
                   layersCount,
                   names,
                   topIsBlue: generated ? pTop[2] > 150 && pTop[0] < 100 : null,
                   bgIsRed: generated ? pBg[0] > 150 && pBg[2] < 100 : null,
                   psdMenuItem,
                   textEditable,
                 };
               })()`
            );
            console.log(`SMOKE PSD: ${JSON.stringify(r)}`);
            // Contre-vérification : le PSD exporté doit se relire (calques)
            if (lastSmokeExport && fssync.existsSync(lastSmokeExport)) {
              try {
                const ag2 = require('ag-psd');
                const buf = fssync.readFileSync(lastSmokeExport);
                const rp = ag2.readPsd(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
                  skipLayerImageData: true,
                  skipCompositeImageData: true,
                  skipThumbnail: true,
                });
                console.log(
                  `SMOKE PSD EXPORT: ${JSON.stringify({
                    width: rp.width,
                    height: rp.height,
                    children: (rp.children || []).map((c) => c.name),
                  })}`
                );
                fssync.unlinkSync(lastSmokeExport);
              } catch (err) {
                console.log(`SMOKE PSD EXPORT ERROR: ${err.message}`);
              }
            }
          } catch (err) {
            console.log(`SMOKE PSD ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-transform-erase')) {
        // Régression : réduire (transformation non destructive), déplacer,
        // puis gommer — la marque doit tomber exactement sous le curseur
        // (la rasterisation ne doit laisser aucune transformation résiduelle).
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 document.getElementById('btn-studio').click();
                 await new Promise((res) => setTimeout(res, 2500));
                 const c = document.getElementById('studio-canvas');
                 const rect = c.getBoundingClientRect();
                 const scale = rect.width / c.width;
                 const mk = (type, x, y) => new PointerEvent(type, {
                   bubbles: true, cancelable: true, button: 0, buttons: 1,
                   pointerId: 1, pointerType: 'mouse',
                   clientX: rect.left + x, clientY: rect.top + y,
                 });
                 const cx = rect.width / 2;
                 const cy = rect.height / 2;
                 // réduction ~50 % par la poignée de coin haut-gauche
                 c.dispatchEvent(mk('pointerdown', 0, 0));
                 c.dispatchEvent(mk('pointermove', cx * 0.25, cy * 0.25));
                 c.dispatchEvent(mk('pointermove', cx * 0.5, cy * 0.5));
                 c.dispatchEvent(mk('pointerup', cx * 0.5, cy * 0.5));
                 await new Promise((res) => setTimeout(res, 200));
                 // ancrage : le coin opposé (bas-droit) reste immobile, le
                 // haut-gauche est libéré par la réduction
                 const ctx0 = c.getContext('2d');
                 const brAlpha = ctx0.getImageData(c.width - 5, c.height - 5, 1, 1).data[3];
                 const tlAlpha = ctx0.getImageData(Math.floor(c.width * 0.1), Math.floor(c.height * 0.1), 1, 1).data[3];
                 // déplacement du centre vers +80, +60
                 c.dispatchEvent(mk('pointerdown', cx, cy));
                 c.dispatchEvent(mk('pointermove', cx + 40, cy + 30));
                 c.dispatchEvent(mk('pointermove', cx + 80, cy + 60));
                 c.dispatchEvent(mk('pointerup', cx + 80, cy + 60));
                 await new Promise((res) => setTimeout(res, 200));
                 // gomme sur l'image déplacée : la marque doit être sous le curseur
                 document.querySelector('#studio-toolbar [data-tool="eraser"]').click();
                 const ex = cx + 110;
                 const ey = cy + 40;
                 c.dispatchEvent(mk('pointerdown', ex, ey));
                 c.dispatchEvent(mk('pointerup', ex, ey));
                 await new Promise((res) => setTimeout(res, 300));
                 const ctx = c.getContext('2d');
                 const at = (x, y) => ctx.getImageData(Math.floor(x / scale), Math.floor(y / scale), 1, 1).data[3];
                 return {
                   anchorKeptBR: brAlpha === 255,
                   anchorFreedTL: tlAlpha === 0,
                   erasedAtCursor: at(ex, ey) < 200,
                   intactNearby: at(ex - 60, ey + 40) === 255,
                 };
               })()`
            );
            console.log(`SMOKE TRANSFORM-ERASE: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE TRANSFORM-ERASE ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-studio')) {
        // Vérifie le chargement paresseux de Studio, un coup de crayon et
        // l'enregistrement dans le fichier.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 const lazyBefore = !window.Studio;
                 document.getElementById('btn-studio').click();
                 await new Promise((res) => setTimeout(res, 2500));
                 const studioOpen = Boolean(window.Studio && window.Studio.isOpen());
                 document.querySelector('#studio-toolbar [data-tool="pencil"]').click();
                 const c = document.getElementById('studio-canvas');
                 const rect = c.getBoundingClientRect();
                 const mk = (type, x, y) => new PointerEvent(type, {
                   bubbles: true, cancelable: true, button: 0, buttons: 1,
                   pointerId: 1, pointerType: 'mouse',
                   clientX: rect.left + x, clientY: rect.top + y,
                 });
                 c.dispatchEvent(mk('pointerdown', 25, 25));
                 c.dispatchEvent(mk('pointermove', 70, 45));
                 c.dispatchEvent(mk('pointerup', 70, 45));
                 await new Promise((res) => setTimeout(res, 300));
                 const layersCount = document.querySelectorAll('.studio-layer').length;

                 // Popup de brosse via clic droit avec la gomme
                 document.querySelector('#studio-toolbar [data-tool="eraser"]').click();
                 c.dispatchEvent(new MouseEvent('contextmenu', {
                   bubbles: true, cancelable: true,
                   clientX: rect.left + 40, clientY: rect.top + 40,
                 }));
                 await new Promise((res) => setTimeout(res, 200));
                 const popupOpen = !document.getElementById('studio-brush-popup').hidden;
                 const presetCount = document.querySelectorAll('.sbp-preset').length;
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

                 // Glisser-déposer : une image devient un nouveau calque
                 let dropLayers = -1;
                 try {
                   const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
                   const file = new File([blob], 'import.png', { type: 'image/png' });
                   const dt = new DataTransfer();
                   dt.items.add(file);
                   document.getElementById('studio-stage').dispatchEvent(
                     new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
                   );
                   await new Promise((res) => setTimeout(res, 600));
                   dropLayers = document.querySelectorAll('.studio-layer').length;
                 } catch (err) {
                   dropLayers = 'ERR ' + err.message;
                 }

                 // Déplacement du calque importé (aimantation au centre)
                 c.dispatchEvent(mk('pointerdown', rect.width / 2 + 10, rect.height / 2 + 10));
                 c.dispatchEvent(mk('pointermove', rect.width / 2 + 30, rect.height / 2 + 18));
                 c.dispatchEvent(mk('pointermove', rect.width / 2 + 2, rect.height / 2 + 2));
                 c.dispatchEvent(mk('pointerup', rect.width / 2 + 2, rect.height / 2 + 2));
                 await new Promise((res) => setTimeout(res, 200));

                 // Outil texte : un clic doit ouvrir un champ éditable focalisé
                 document.querySelector('#studio-toolbar [data-tool="text"]').click();
                 c.dispatchEvent(mk('pointerdown', 60, 70));
                 c.dispatchEvent(mk('pointerup', 60, 70));
                 await new Promise((res) => setTimeout(res, 250));
                 const te = document.getElementById('studio-text-editor');
                 const textEditorFocused = !te.hidden && document.activeElement === te;
                 te.value = 'Bonjour';
                 te.dispatchEvent(new Event('blur'));
                 await new Promise((res) => setTimeout(res, 250));
                 const layersAfterText = document.querySelectorAll('.studio-layer').length;

                 // Ctrl+C / Ctrl+V : duplication du calque actif
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
                 await new Promise((res) => setTimeout(res, 250));
                 const layersAfterCopyPaste = document.querySelectorAll('.studio-layer').length;

                 // Pot de peinture : remplit sur le calque importé (raster au
                 // premier plan des rasters, non recouvert au point testé)
                 const importRow = [...document.querySelectorAll('.studio-layer')].find(
                   (li) => li.querySelector('.studio-layer-name').textContent === 'import'
                 );
                 importRow.click();
                 document.querySelector('#studio-toolbar [data-tool="bucket"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 const bucketSliders = document.querySelectorAll('#studio-optionsbar input[type="range"]').length;
                 c.dispatchEvent(mk('pointerdown', 200, 150));
                 c.dispatchEvent(mk('pointerup', 200, 150));
                 await new Promise((res) => setTimeout(res, 400));
                 const scale = rect.width / c.width;
                 const dpx = Math.floor(200 / scale);
                 const dpy = Math.floor(150 / scale);
                 const pix = c.getContext('2d').getImageData(dpx, dpy, 1, 1).data;
                 const bucketFilled = pix[0] === 0x4c && pix[1] === 0x8d && pix[2] === 0xff;

                 // Gomme magique : retire la zone uniforme qui vient d'être remplie
                 document.querySelector('#studio-toolbar [data-tool="magic"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 c.dispatchEvent(mk('pointerdown', 200, 150));
                 c.dispatchEvent(mk('pointerup', 200, 150));
                 await new Promise((res) => setTimeout(res, 400));
                 const pix2 = c.getContext('2d').getImageData(dpx, dpy, 1, 1).data;
                 const magicErased = !(pix2[0] === 0x4c && pix2[1] === 0x8d && pix2[2] === 0xff);

                 // Cas « logo » : disque anti-aliasé sur fond blanc parfait —
                 // le retrait du fond ne doit laisser ni halo ni entamer l'objet
                 const cvt = document.createElement('canvas');
                 cvt.width = 100;
                 cvt.height = 100;
                 const tctx = cvt.getContext('2d');
                 tctx.fillStyle = '#ffffff';
                 tctx.fillRect(0, 0, 100, 100);
                 tctx.fillStyle = '#cc0000';
                 tctx.beginPath();
                 tctx.arc(49.5, 49.5, 30, 0, Math.PI * 2);
                 tctx.fill();
                 const fm = window.StudioCore.floodMask(cvt, 2, 2, { tolerance: 25, contiguous: true });
                 const fmc = window.StudioCore.maskToCanvas(fm.mask, 100, 100, [255, 255, 255]);
                 tctx.globalCompositeOperation = 'destination-out';
                 tctx.drawImage(fmc, 0, 0);
                 const td = tctx.getImageData(0, 0, 100, 100).data;
                 let halo = 0;
                 let eaten = 0;
                 for (let i = 0; i < 10000; i += 1) {
                   const rr = Math.hypot((i % 100) - 49.5, ((i / 100) | 0) - 49.5);
                   if (rr > 33 && td[i * 4 + 3] > 32) halo += 1;
                   if (rr < 27 && td[i * 4 + 3] < 250) eaten += 1;
                 }

                 // Boutons de style du texte : G, I, S, B
                 document.querySelector('#studio-toolbar [data-tool="text"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 const styleButtons = document.querySelectorAll('#studio-optionsbar .studio-style-btn').length;

                 // Zoom : molette avant → la scène grandit ; touche 0 → ajusté
                 const wrap = document.getElementById('studio-wrap');
                 const wrapWBefore = wrap.offsetWidth;
                 document.getElementById('studio-stage').dispatchEvent(new WheelEvent('wheel', {
                   bubbles: true, cancelable: true, deltaY: -120,
                   clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
                 }));
                 await new Promise((res) => setTimeout(res, 150));
                 const zoomedIn = wrap.offsetWidth > wrapWBefore;
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 150));
                 const zoomFitBack = wrap.offsetWidth === wrapWBefore;

                 // Cercle d'impact de la brosse sur le HUD (survol avec le pinceau)
                 document.querySelector('#studio-toolbar [data-tool="pencil"]').click();
                 c.dispatchEvent(new PointerEvent('pointermove', {
                   bubbles: true, pointerId: 1, pointerType: 'mouse',
                   clientX: rect.left + 60, clientY: rect.top + 60,
                 }));
                 await new Promise((res) => setTimeout(res, 100));
                 const hud = document.getElementById('studio-hud');
                 const hctx = hud.getContext('2d');
                 let hd = hctx.getImageData(0, 0, hud.width, hud.height).data;
                 let ringInk = 0;
                 for (let i = 3; i < hd.length; i += 4) if (hd[i] > 0) ringInk += 1;

                 // Valeurs R V B dans les pixels au très fort zoom (>= 3200 %)
                 for (let i = 0; i < 17; i += 1) {
                   window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
                 }
                 await new Promise((res) => setTimeout(res, 300));
                 const zoomDeep = document.getElementById('studio-zoom-label').textContent;
                 hd = hctx.getImageData(0, 0, hud.width, hud.height).data;
                 let rgbInk = 0;
                 for (let i = 3; i < hd.length; i += 4) if (hd[i] > 0) rgbInk += 1;
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 150));

                 // Menus, fusion, nombre d'outils
                 const toolsCount = document.querySelectorAll('.studio-tool').length;
                 const blendCount = document.getElementById('studio-blend').options.length;
                 const menuBtn = document.querySelector('.studio-menu-btn[data-menu="image"]');
                 menuBtn.click();
                 await new Promise((res) => setTimeout(res, 120));
                 const menuOpen = !document.getElementById('studio-menu-popup').hidden;
                 const menuItemCount = document.querySelectorAll('.studio-menu-item').length;
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 120));

                 // Sélection rectangle → recadrage → annulation (dimensions suivies)
                 document.querySelector('#studio-toolbar [data-tool="select-rect"]').click();
                 c.dispatchEvent(mk('pointerdown', 40, 40));
                 c.dispatchEvent(mk('pointermove', 150, 120));
                 c.dispatchEvent(mk('pointermove', 220, 190));
                 c.dispatchEvent(mk('pointerup', 220, 190));
                 await new Promise((res) => setTimeout(res, 200));
                 const selBtn = document.querySelector('#studio-optionsbar .studio-btn-primary');
                 const selActive = Boolean(selBtn) && !selBtn.disabled;
                 const widthBefore = c.width;
                 menuBtn.click();
                 await new Promise((res) => setTimeout(res, 120));
                 [...document.querySelectorAll('.studio-menu-item')]
                   .find((b) => b.textContent.startsWith('Recadrer'))
                   .click();
                 await new Promise((res) => setTimeout(res, 300));
                 const cropped = c.width < widthBefore;
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
                 await new Promise((res) => setTimeout(res, 250));
                 const uncropped = c.width === widthBefore;

                 // Formes : rectangle rempli avec la couleur active
                 document.querySelector('#studio-toolbar [data-tool="shape"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 const shapeSelects = document.querySelectorAll('#studio-optionsbar select');
                 shapeSelects[1].value = 'fill';
                 shapeSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
                 c.dispatchEvent(mk('pointerdown', 250, 40));
                 c.dispatchEvent(mk('pointermove', 300, 90));
                 c.dispatchEvent(mk('pointerup', 300, 90));
                 await new Promise((res) => setTimeout(res, 300));
                 const sPix = c.getContext('2d')
                   .getImageData(Math.floor(275 / scale), Math.floor(65 / scale), 1, 1).data;
                 const shapeDrawn = sPix[0] === 0x4c && sPix[1] === 0x8d && sPix[2] === 0xff;

                 // Retouche (flou) : le bord de la forme doit changer
                 document.querySelector('#studio-toolbar [data-tool="retouch"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 const edgeX = Math.floor(250 / scale);
                 const edgeY = Math.floor(65 / scale);
                 const rp0 = [...c.getContext('2d').getImageData(edgeX, edgeY, 1, 1).data].join(',');
                 c.dispatchEvent(mk('pointerdown', 250, 65));
                 c.dispatchEvent(mk('pointerup', 250, 65));
                 await new Promise((res) => setTimeout(res, 300));
                 const rp1 = [...c.getContext('2d').getImageData(edgeX, edgeY, 1, 1).data].join(',');
                 const retouchChanged = rp0 !== rp1;

                 // Courbes : la modale s'ouvre avec l'éditeur de courbe
                 document.querySelector('.studio-menu-btn[data-menu="reglages"]').click();
                 await new Promise((res) => setTimeout(res, 150));
                 [...document.querySelectorAll('.studio-menu-item')]
                   .find((b) => b.textContent.startsWith('Courbes'))
                   .click();
                 await new Promise((res) => setTimeout(res, 250));
                 const curvesOpen =
                   !document.getElementById('studio-modal-backdrop').hidden &&
                   Boolean(document.querySelector('.studio-curve'));
                 document.getElementById('studio-modal-cancel').click();
                 await new Promise((res) => setTimeout(res, 150));

                 // Styles du calque + aller-retour de projet .istudio
                 menuBtn.click();
                 await new Promise((res) => setTimeout(res, 150));
                 const hasLayerStyles = [...document.querySelectorAll('.studio-menu-item')]
                   .some((b) => b.textContent.startsWith('Styles du calque'));
                 const layersBeforeProject = document.querySelectorAll('.studio-layer').length;
                 [...document.querySelectorAll('.studio-menu-item')]
                   .find((b) => b.textContent.startsWith('Enregistrer le projet'))
                   .click();
                 await new Promise((res) => setTimeout(res, 900));
                 menuBtn.click();
                 await new Promise((res) => setTimeout(res, 150));
                 [...document.querySelectorAll('.studio-menu-item')]
                   .find((b) => b.textContent.startsWith('Ouvrir un projet'))
                   .click();
                 await new Promise((res) => setTimeout(res, 1600));
                 const projectRoundtrip =
                   document.querySelectorAll('.studio-layer').length === layersBeforeProject;

                 document.getElementById('studio-save').click();
                 await new Promise((res) => setTimeout(res, 2500));
                 return {
                   lazyBefore,
                   studioOpen,
                   layersCount,
                   popupOpen,
                   presetCount,
                   dropLayers,
                   textEditorFocused,
                   layersAfterText,
                   layersAfterCopyPaste,
                   bucketSliders,
                   bucketFilled,
                   magicErased,
                   magicNoHalo: halo === 0,
                   magicKeepsObject: eaten === 0,
                   styleButtons,
                   zoomedIn,
                   zoomFitBack,
                   brushRing: ringInk > 50,
                   pixelRgbHud: rgbInk > ringInk * 3,
                   zoomDeep,
                   toolsCount,
                   blendCount,
                   menuOpen,
                   menuItemCount,
                   selActive,
                   cropped,
                   uncropped,
                   shapeDrawn,
                   retouchChanged,
                   curvesOpen,
                   hasLayerStyles,
                   projectRoundtrip,
                   closedAfterSave: !window.Studio.isOpen(),
                 };
               })()`
            );
            console.log(`SMOKE STUDIO: ${JSON.stringify(r)}`);
            if (lastSmokeProject) {
              try {
                fssync.unlinkSync(lastSmokeProject);
              } catch {
                // déjà supprimé
              }
            }
          } catch (err) {
            console.log(`SMOKE STUDIO ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-gallery')) {
        // Galerie Global : grille remplie, recherche, tri par taille
        // (stats à la demande), filtre par format, clavier, clic.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 await new Promise((res) => setTimeout(res, 1800));
                 document.getElementById('btn-gallery').click();
                 await new Promise((res) => setTimeout(res, 1200));
                 const open = !document.getElementById('gallery').hidden;
                 const tiles = document.querySelectorAll('.gtile').length;
                 const withThumbs = document.querySelectorAll('.gtile img').length;
                 const captions = document.querySelectorAll('.gtile-caption').length;
                 // libellés taille · date remplis paresseusement (stat unitaire)
                 const metaFilled = [...document.querySelectorAll('.gtile-meta')]
                   .filter((m) => m.textContent.trim().length > 0).length;
                 // la barre d'outils ne garde que l'essentiel pendant la galerie
                 const toolbarClean =
                   document.getElementById('btn-rotate').offsetParent === null &&
                   document.getElementById('btn-zoom-in').offsetParent === null &&
                   document.getElementById('btn-open').offsetParent !== null;
                 // aucune tuile ne déborde sur sa voisine (pas de chevauchement)
                 const rects = [...document.querySelectorAll('.gtile')].map((t) => t.getBoundingClientRect());
                 let noOverlap = true;
                 for (let a = 0; a < rects.length && noOverlap; a += 1) {
                   for (let b = a + 1; b < rects.length; b += 1) {
                     const ra = rects[a];
                     const rb = rects[b];
                     if (ra.left < rb.right - 1 && rb.left < ra.right - 1 &&
                         ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) {
                       noOverlap = false;
                       break;
                     }
                   }
                 }
                 const countText = document.getElementById('gallery-count').textContent;
                 // recherche
                 const search = document.getElementById('gallery-search');
                 search.value = 'img_2';
                 search.dispatchEvent(new Event('input', { bubbles: true }));
                 await new Promise((res) => setTimeout(res, 400));
                 const filtered = document.querySelectorAll('.gtile').length;
                 search.value = '';
                 search.dispatchEvent(new Event('input', { bubbles: true }));
                 await new Promise((res) => setTimeout(res, 400));
                 // tri par taille : les stats se chargent à la demande
                 const sort = document.getElementById('gallery-sort');
                 sort.value = 'size';
                 sort.dispatchEvent(new Event('change', { bubbles: true }));
                 await new Promise((res) => setTimeout(res, 900));
                 const sortedTiles = document.querySelectorAll('.gtile').length;
                 // filtre format : PNG présent
                 const fmt = document.getElementById('gallery-format');
                 const fmtOptions = [...fmt.options].map((o) => o.value);
                 // navigation clavier : flèche droite puis Entrée
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 200));
                 const selMoved = [...document.querySelectorAll('.gtile')].findIndex((t) => t.classList.contains('selected'));
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 700));
                 const closedAfterEnter = document.getElementById('gallery').hidden;
                 const imageShown = !document.getElementById('image').hidden;
                 // réouverture puis Échap
                 document.getElementById('btn-gallery').click();
                 await new Promise((res) => setTimeout(res, 400));
                 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                 await new Promise((res) => setTimeout(res, 200));
                 const closedAfterEsc = document.getElementById('gallery').hidden;
                 return {
                   open, tiles, withThumbs, captions, metaFilled, toolbarClean, noOverlap,
                   countText, filtered, sortedTiles,
                   fmtOptions, selMoved, closedAfterEnter, imageShown, closedAfterEsc,
                 };
               })()`
            );
            console.log(`SMOKE GALLERY: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE GALLERY ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else if (process.argv.includes('--smoke-tabs')) {
        // Onglets : « + » ouvre l'accueil (barre épurée, panneau Pro absent),
        // la bascule restaure l'image, fermeture et détachement en fenêtre.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 await new Promise((res) => setTimeout(res, 1500));
                 const tabCount0 = document.querySelectorAll('.tab').length;
                 const title0 = document.querySelector('.tab .tab-title').textContent;
                 document.getElementById('tab-add').click();
                 await new Promise((res) => setTimeout(res, 300));
                 const tabCount1 = document.querySelectorAll('.tab').length;
                 const atHome1 = document.body.classList.contains('at-home');
                 const toolbarClean = document.getElementById('btn-rotate').offsetParent === null;
                 const proPanel = document.getElementById('pro-panel');
                 const proHidden = !proPanel || proPanel.offsetParent === null;
                 document.querySelectorAll('.tab')[0].click();
                 await new Promise((res) => setTimeout(res, 900));
                 const backImage =
                   !document.getElementById('image').hidden &&
                   document.getElementById('image').naturalWidth > 0;
                 const atHome2 = document.body.classList.contains('at-home');
                 const t2 = document.querySelectorAll('.tab')[1];
                 t2.querySelector('.tab-actions button:last-child').click();
                 await new Promise((res) => setTimeout(res, 300));
                 const tabCount2 = document.querySelectorAll('.tab').length;
                 document.querySelector('.tab .tab-actions button:first-child').click();
                 await new Promise((res) => setTimeout(res, 1500));
                 const tabCount3 = document.querySelectorAll('.tab').length;
                 const homeAfterDetach = document.body.classList.contains('at-home');
                 return {
                   tabCount0, title0, tabCount1, atHome1, toolbarClean, proHidden,
                   backImage, atHome2, tabCount2, tabCount3, homeAfterDetach,
                 };
               })()`
            );
            const winCount = BrowserWindow.getAllWindows().length;
            console.log(`SMOKE TABS: ${JSON.stringify({ ...r, winCount })}`);
          } catch (err) {
            console.log(`SMOKE TABS ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else {
        // --smoke simple : les vignettes du bandeau doivent être des
        // miniatures légères (blob:), jamais le fichier original.
        setTimeout(async () => {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                 // état neutre, quel que soit le localStorage d'une session
                 // précédente : bandeau visible, mode Basic
                 if (document.body.classList.contains('no-filmstrip')) {
                   document.getElementById('btn-film').click();
                 }
                 if (document.body.classList.contains('pro')) {
                   document.getElementById('mode-basic').click();
                 }
                 await new Promise((res) => setTimeout(res, 2600));
                 const tiles = document.querySelectorAll('.thumb').length;
                 const imgs = [...document.querySelectorAll('.thumb img')];
                 // le worker de vignettes doit répondre (chemin NAS : c'est
                 // lui qui fabrique toutes les miniatures)
                 const workerOk = await new Promise(async (res) => {
                   try {
                     const c = document.createElement('canvas');
                     c.width = 300;
                     c.height = 200;
                     const cx = c.getContext('2d');
                     cx.fillStyle = '#3377ff';
                     cx.fillRect(0, 0, 300, 200);
                     const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
                     const buf = await blob.arrayBuffer();
                     const w = new Worker('thumb-worker.js');
                     const t = setTimeout(() => res(false), 4000);
                     w.onmessage = (ev) => {
                       clearTimeout(t);
                       res(Boolean(ev.data.ok && ev.data.jpeg && ev.data.jpeg.byteLength));
                     };
                     w.postMessage({ id: 1, buf, type: 'image/png' }, [buf]);
                   } catch {
                     res(false);
                   }
                 });
                 return {
                   tiles,
                   loaded: imgs.length,
                   allBlobThumbs: imgs.length > 0 && imgs.every((im) => im.src.startsWith('blob:')),
                   workerOk,
                   widths: [...document.querySelectorAll('.thumb')].map((t) => t.offsetWidth),
                 };
               })()`
            );
            console.log(`SMOKE THUMBS: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE THUMBS ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      }
    });
  }
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = fileFromArgv(argv);
    if (file) {
      // Une image ouverte depuis l'Explorateur alors que l'application
      // tourne déjà (peut-être occupée dans Studio/Paint) : NOUVELLE fenêtre.
      createWindow(buildContext(file));
      return;
    }
    // Lancement sans fichier : on ramène une fenêtre existante au premier plan.
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    } else {
      createWindow();
    }
  });

  // macOS uniquement, sans effet sous Windows mais inoffensif.
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) {
      createWindow(buildContext(filePath));
    } else {
      pendingFile = filePath;
    }
  });

  app.whenReady().then(() => {
    createWindow(pendingFile ? buildContext(pendingFile) : null);
    pendingFile = null;
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

ipcMain.handle('renderer-ready', async (e) => {
  const p = pendingContexts.get(e.sender.id);
  pendingContexts.delete(e.sender.id);
  return p ? await p : null;
});

/* Détachement d'onglet / ouverture volontaire d'une nouvelle fenêtre. */
ipcMain.handle('open-new-window', (_e, filePath) => {
  createWindow(filePath ? buildContext(filePath) : null);
  return true;
});

/* ---------- Passerelle VStudio (éditeur vidéo) ----------
   Les boutons « Agrandir avec l'IA » et « Studio » d'une vidéo passent le
   relais à VStudio : l'exécutable est lancé avec une ROUTE en argument,
   que VStudio analyse pour ouvrir le bon module sur le bon fichier :

     vstudio://open?module=<enhance|edit>&file=<chemin encodé>&from=istudio

   Côté VStudio (process main) : retrouver dans process.argv l'argument
   qui commence par « vstudio:// », puis new URL(arg) — module via
   url.searchParams.get('module'), chemin via url.searchParams.get('file')
   (déjà décodé par searchParams). */

const VSTUDIO_DOWNLOAD_URL = 'http://stein-ind.fr/apps/download/VStudio-Setup-0.1.0.exe';

function resolveVStudioExe() {
  const candidates = [
    process.env.VSTUDIO_PATH, // remplacement possible sans recompiler
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Programs', 'VStudio', 'VStudio.exe'),
    'C:\\Program Files\\VStudio\\VStudio.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fssync.existsSync(p)) return p;
    } catch {
      // candidat illisible : on passe au suivant
    }
  }
  return null;
}

/* VStudio absent : proposer son téléchargement (l'installeur s'ouvre dans
   le navigateur par défaut). */
async function proposeVStudioDownload(win) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'VStudio',
    message: tr('VStudio n’est pas installé sur cet ordinateur.'),
    detail: tr(
      'VStudio est l’éditeur vidéo compagnon d’IStudio : amélioration par IA et montage. Voulez-vous le télécharger ?'
    ),
    buttons: [tr('Télécharger VStudio'), tr('Annuler')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) shell.openExternal(VSTUDIO_DOWNLOAD_URL);
}

ipcMain.handle('open-in-vstudio', async (e, { filePath, module: mod }) => {
  const exe = resolveVStudioExe();
  if (!exe) {
    await proposeVStudioDownload(senderWindow(e));
    return false;
  }
  const route =
    `vstudio://open?module=${encodeURIComponent(mod)}` +
    `&file=${encodeURIComponent(filePath)}&from=istudio`;
  try {
    spawn(exe, [route], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('reload-context', async (_e, filePath) => buildContext(filePath));

ipcMain.handle('pick-file', async (e) => {
  const result = await dialog.showOpenDialog(senderWindow(e), {
    title: tr('Ouvrir une image ou une vidéo'),
    properties: ['openFile'],
    filters: [
      {
        name: tr('Images et vidéos'),
        extensions: [...MEDIA_EXTS].map((e) => e.slice(1)),
      },
      {
        name: tr('Images'),
        extensions: [...IMAGE_EXTS].map((e) => e.slice(1)),
      },
      {
        name: tr('Vidéos'),
        extensions: [...VIDEO_EXTS].map((e) => e.slice(1)),
      },
      { name: tr('Tous les fichiers'), extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return buildContext(result.filePaths[0]);
});

ipcMain.handle('set-title', (e, title) => {
  const win = senderWindow(e);
  if (win) win.setTitle(title);
});

ipcMain.handle('toggle-fullscreen', (e) => {
  const win = senderWindow(e);
  if (!win) return false;
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  return next;
});

ipcMain.handle('file-info', async (_e, filePath) => {
  try {
    const st = await fs.stat(filePath);
    return {
      size: st.size,
      birthtime: st.birthtimeMs,
      mtime: st.mtimeMs,
      atime: st.atimeMs,
    };
  } catch {
    return null;
  }
});

ipcMain.handle('read-file', async (_e, filePath) => {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
});

/* ---------- OCR (moteur natif Windows) ----------
   Reconnaissance de texte via Windows.Media.Ocr, le moteur intégré au
   système : aucune dépendance, aucun modèle embarqué, aucun réseau. Un
   script PowerShell éphémère (passé en -EncodedCommand, donc rien à
   distribuer) lit un PNG temporaire envoyé par le renderer et écrit le
   résultat (mots + boîtes englobantes) en JSON dans un second fichier
   temporaire — ce qui évite tout problème d'encodage de la console. */

const OCR_PS = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]
  function Await($op, $resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $null = $task.Wait(-1)
    $task.Result
  }
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) {
    $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
    if ($langs.Count -gt 0) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($langs[0]) }
  }
  if (-not $engine) {
    [IO.File]::WriteAllText($env:ISTUDIO_OCR_OUT, '{"error":"nolang"}', [Text.UTF8Encoding]::new($false))
    exit 0
  }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:ISTUDIO_OCR_IN)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @()
  foreach ($line in $result.Lines) {
    $words = @()
    foreach ($w in $line.Words) {
      $r = $w.BoundingRect
      $words += [pscustomobject]@{
        t = $w.Text
        x = [Math]::Round($r.X, 1); y = [Math]::Round($r.Y, 1)
        w = [Math]::Round($r.Width, 1); h = [Math]::Round($r.Height, 1)
      }
    }
    $lines += [pscustomobject]@{ words = $words }
  }
  $json = [pscustomobject]@{ lang = $engine.RecognizerLanguage.LanguageTag; lines = $lines } | ConvertTo-Json -Depth 6 -Compress
  [IO.File]::WriteAllText($env:ISTUDIO_OCR_OUT, $json, [Text.UTF8Encoding]::new($false))
} catch {
  [IO.File]::WriteAllText($env:ISTUDIO_OCR_OUT, '{"error":"fail"}', [Text.UTF8Encoding]::new($false))
  exit 1
}
`;

ipcMain.handle('ocr-run', async (_e, data) => {
  if (process.platform !== 'win32') return { error: 'unsupported' };
  const stamp = crypto.randomBytes(6).toString('hex');
  const inPath = path.join(app.getPath('temp'), `istudio-ocr-${stamp}.png`);
  const outPath = path.join(app.getPath('temp'), `istudio-ocr-${stamp}.json`);
  try {
    await fs.writeFile(inPath, Buffer.from(data));
    await new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-EncodedCommand', Buffer.from(OCR_PS, 'utf16le').toString('base64'),
        ],
        {
          env: { ...process.env, ISTUDIO_OCR_IN: inPath, ISTUDIO_OCR_OUT: outPath },
          windowsHide: true,
          stdio: 'ignore',
        }
      );
      const timer = setTimeout(() => child.kill(), 30000);
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', () => {
        clearTimeout(timer);
        resolve(); // le verdict est dans le fichier de sortie, pas le code retour
      });
    });
    return JSON.parse(await fs.readFile(outPath, 'utf8'));
  } catch {
    return { error: 'fail' };
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
});

ipcMain.handle('delete-file', async (e, filePath) => {
  const { response } = await dialog.showMessageBox(senderWindow(e), {
    type: 'warning',
    buttons: [tr('Supprimer'), tr('Annuler')],
    defaultId: 0,
    cancelId: 1,
    title: tr('Supprimer l’image'),
    message: tr('Envoyer « {name} » à la corbeille ?', { name: path.basename(filePath) }),
    detail: tr('L’image pourra être restaurée depuis la corbeille Windows.'),
  });
  if (response !== 0) return false;
  try {
    await shell.trashItem(filePath);
    return true;
  } catch {
    return false;
  }
});

/* Écrit le résultat d'une édition (rotation, rognage) directement dans le
   fichier source. Si le format d'origine n'est pas ré-encodable (BMP, TIFF,
   GIF, SVG…), l'image est convertie en PNG à côté et l'original part à la
   corbeille. */
ipcMain.handle('save-in-place', async (_e, { sourcePath, outExt, data }) => {
  try {
    const curExt = path.extname(sourcePath).slice(1).toLowerCase();
    let target = sourcePath;
    if (curExt !== outExt.toLowerCase()) {
      const dir = path.dirname(sourcePath);
      const base = path.basename(sourcePath, path.extname(sourcePath));
      target = path.join(dir, `${base}.${outExt}`);
      let n = 1;
      while (fssync.existsSync(target)) {
        target = path.join(dir, `${base}-${n}.${outExt}`);
        n += 1;
      }
    }
    await fs.writeFile(target, Buffer.from(data));
    // conversion d'extension : l'original part à la corbeille, SAUF pour un
    // PSD — le document source (avec ses calques) doit rester intact
    if (target !== sourcePath && curExt !== 'psd') {
      try {
        await shell.trashItem(sourcePath);
      } catch {
        // l'original reste : pas bloquant
      }
    }
    return target;
  } catch {
    return null;
  }
});

/* Choix du mode d'enregistrement des éditeurs (Paint, Studio) :
   écraser le fichier d'origine, ou créer une copie à côté sans y toucher. */
ipcMain.handle('ask-save-mode', async (e, fileName) => {
  if (SMOKE) return process.argv.includes('--smoke-save-copy') ? 'copy' : 'overwrite';
  const { response } = await dialog.showMessageBox(senderWindow(e), {
    type: 'question',
    buttons: [tr('Écraser l’original'), tr('Enregistrer une copie'), tr('Annuler')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: tr('Enregistrer'),
    message: tr('Enregistrer « {name} »', { name: fileName }),
    detail: tr(
      'Écraser remplace le fichier d’origine. La copie est créée à côté, l’original reste intact.'
    ),
  });
  if (response === 0) return 'overwrite';
  if (response === 1) return 'copy';
  return null;
});

/* Notes & drapeaux du mode Pro : fichier annexe .istudio-tags.json,
   posé à côté des images (partageable avec le dossier). */
ipcMain.handle('read-folder-meta', async (_e, filePath) => {
  try {
    return await fs.readFile(path.join(path.dirname(filePath), '.istudio-tags.json'), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('write-folder-meta', async (_e, { filePath, json }) => {
  try {
    await fs.writeFile(path.join(path.dirname(filePath), '.istudio-tags.json'), json, 'utf8');
    return true;
  } catch {
    return false;
  }
});

/* ---------- Vignettes du bandeau ----------
   1. cache disque persistant de l'application (clé : chemin + mtime + taille)
      — décisif sur un NAS : après la première visite d'un dossier, les
      vignettes reviennent instantanément sans toucher au réseau ;
   2. sinon cache de miniatures de Windows (Explorateur) via nativeImage,
      et le résultat est mis en cache disque ;
   3. sinon le renderer décode en réduit et renvoie la vignette produite
      (store-thumbnail) pour qu'elle soit mise en cache elle aussi. */

const THUMB_CACHE_DIR = path.join(app.getPath('userData'), 'thumb-cache');
let thumbCacheReady = null;

function ensureThumbCacheDir() {
  if (!thumbCacheReady) {
    thumbCacheReady = fs.mkdir(THUMB_CACHE_DIR, { recursive: true }).catch(() => {});
  }
  return thumbCacheReady;
}

function thumbCacheKey(filePath, st) {
  return crypto
    .createHash('sha1')
    .update(`${filePath.toLowerCase()}|${st ? st.mtimeMs : 0}|${st ? st.size : 0}`)
    .digest('hex');
}

async function thumbCachePathFor(filePath) {
  await ensureThumbCacheDir();
  const st = await fs.stat(filePath).catch(() => null);
  return st ? path.join(THUMB_CACHE_DIR, `${thumbCacheKey(filePath, st)}.jpg`) : null;
}

ipcMain.handle('file-thumbnail', async (_e, filePath) => {
  try {
    const cachePath = await thumbCachePathFor(filePath);
    if (cachePath) {
      try {
        return await fs.readFile(cachePath);
      } catch {
        // pas encore en cache
      }
    }
    const img = await nativeImage.createThumbnailFromPath(filePath, { width: 256, height: 256 });
    if (!img || img.isEmpty()) return null;
    const jpeg = img.toJPEG(82);
    if (cachePath) fs.writeFile(cachePath, jpeg).catch(() => {});
    return jpeg;
  } catch {
    return null;
  }
});

/* Cache disque UNIQUEMENT — pour les dossiers réseau : l'extraction shell
   rapatrie le fichier entier dans le processus principal (qui route aussi
   les entrées clavier/souris) ; sur un NAS on préfère le décodage réduit
   côté renderer, dans un worker. */
ipcMain.handle('file-thumbnail-cached', async (_e, filePath) => {
  try {
    const cachePath = await thumbCachePathFor(filePath);
    if (!cachePath) return null;
    return await fs.readFile(cachePath);
  } catch {
    return null;
  }
});

/* Vignette produite par le renderer (formats que le shell ne couvre pas) :
   mise en cache disque pour les prochaines visites. */
ipcMain.handle('store-thumbnail', async (_e, { filePath, data }) => {
  try {
    await ensureThumbCacheDir();
    const st = await fs.stat(filePath).catch(() => null);
    if (!st) return false;
    await fs.writeFile(
      path.join(THUMB_CACHE_DIR, `${thumbCacheKey(filePath, st)}.jpg`),
      Buffer.from(data)
    );
    return true;
  } catch {
    return false;
  }
});

/* Début de fichier seulement (métadonnées JPEG/PNG du mode Pro) : évite de
   rapatrier un fichier de plusieurs dizaines de Mo depuis le NAS pour lire
   quelques en-têtes. */
ipcMain.handle('read-file-head', async (_e, { filePath, bytes }) => {
  let fh = null;
  try {
    fh = await fs.open(filePath, 'r');
    const st = await fh.stat();
    const n = Math.max(1, Math.min(st.size, bytes || 262144));
    const buf = Buffer.alloc(n);
    await fh.read(buf, 0, n, 0);
    return { data: buf, size: st.size };
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
});

/* Taille + date de modification à la demande (galerie Global : tri par
   date ou taille), avec un parallélisme borné. */
ipcMain.handle('stat-many', async (_e, paths) => {
  const out = new Array(paths.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const i = next;
      next += 1;
      try {
        const st = await fs.stat(paths[i]);
        out[i] = { size: st.size, mtime: st.mtimeMs };
      } catch {
        // infos indisponibles : null
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, paths.length) }, worker));
  return out;
});

/* Tailles des fichiers à la demande (tri par taille du mode Pro),
   avec un parallélisme borné — jamais des centaines de stat d'un coup. */
ipcMain.handle('stat-sizes', async (_e, paths) => {
  const out = new Array(paths.length).fill(0);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const i = next;
      next += 1;
      try {
        out[i] = (await fs.stat(paths[i])).size;
      } catch {
        // taille indisponible : 0
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, paths.length) }, worker));
  return out;
});

/* Projet Studio (.istudio) : montage complet avec ses calques. */
let lastSmokeProject = null;

ipcMain.handle('save-project', async (e, { suggestedName, json }) => {
  let filePath;
  if (SMOKE) {
    filePath = path.join(app.getPath('temp'), suggestedName);
  } else {
    const r = await dialog.showSaveDialog(senderWindow(e), {
      title: tr('Enregistrer le projet'),
      defaultPath: suggestedName,
      filters: [{ name: tr('Projet IStudio'), extensions: ['istudio'] }],
    });
    if (r.canceled || !r.filePath) return null;
    filePath = r.filePath;
  }
  try {
    await fs.writeFile(filePath, json, 'utf8');
    if (SMOKE) lastSmokeProject = filePath;
    return filePath;
  } catch {
    return null;
  }
});

ipcMain.handle('open-project', async (e) => {
  let filePath;
  if (SMOKE) {
    filePath = lastSmokeProject;
    if (!filePath) return null;
  } else {
    const r = await dialog.showOpenDialog(senderWindow(e), {
      title: tr('Ouvrir un projet'),
      filters: [{ name: tr('Projet IStudio'), extensions: ['istudio'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths.length) return null;
    filePath = r.filePaths[0];
  }
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
});

/* Export du montage Studio : boîte « Enregistrer sous » native. */
let lastSmokeExport = null;

ipcMain.handle('export-image', async (e, { suggestedName, data }) => {
  if (SMOKE) {
    const p = path.join(app.getPath('temp'), suggestedName);
    try {
      await fs.writeFile(p, Buffer.from(data));
      lastSmokeExport = p;
      return p;
    } catch {
      return null;
    }
  }
  const { canceled, filePath } = await dialog.showSaveDialog(senderWindow(e), {
    title: tr('Exporter l’image'),
    defaultPath: suggestedName,
    filters: [
      { name: tr('Image PNG'), extensions: ['png'] },
      { name: tr('Image JPEG'), extensions: ['jpg', 'jpeg'] },
      { name: tr('Image WebP'), extensions: ['webp'] },
      { name: tr('Document Photoshop'), extensions: ['psd'] },
      { name: tr('Tous les fichiers'), extensions: ['*'] },
    ],
  });
  if (canceled || !filePath) return null;
  try {
    await fs.writeFile(filePath, Buffer.from(data));
    return filePath;
  } catch {
    return null;
  }
});

/* Écrit le résultat sous « nom copie.ext » à côté de l'original. */
ipcMain.handle('save-copy', async (_e, { sourcePath, outExt, data }) => {
  try {
    const dir = path.dirname(sourcePath);
    const base = path.basename(sourcePath, path.extname(sourcePath));
    let target = path.join(dir, `${base} copie.${outExt}`);
    let n = 2;
    while (fssync.existsSync(target)) {
      target = path.join(dir, `${base} copie ${n}.${outExt}`);
      n += 1;
    }
    await fs.writeFile(target, Buffer.from(data));
    return target;
  } catch {
    return null;
  }
});

/* ---------- Upscale IA ----------
   Moteur : upscayl-bin.exe (Real-ESRGAN via NCNN/Vulkan), un exécutable
   autonome livré dans code_source_upscale/. L'upscale est donc un simple
   appel de processus : entrée -> sortie PNG, progression lue sur stderr. */

const UPSCALE_ROOT = (() => {
  const candidates = [
    path.join(__dirname, 'code_source_upscale'),
    process.resourcesPath ? path.join(process.resourcesPath, 'code_source_upscale') : null,
  ].filter(Boolean);
  for (const c of candidates) {
    if (fssync.existsSync(path.join(c, 'bin', 'upscayl-bin.exe'))) return c;
  }
  return null;
})();

/* Modèles disponibles : paires .param/.bin présentes dans models/ —
   on peut en déposer d'autres (remacri, ultrasharp…), ils apparaîtront. */
async function listUpscaleModels() {
  if (!UPSCALE_ROOT) return null;
  try {
    const files = await fs.readdir(path.join(UPSCALE_ROOT, 'models'));
    return files
      .filter((f) => f.endsWith('.param'))
      .map((f) => f.slice(0, -'.param'.length))
      .filter((n) => files.includes(`${n}.bin`));
  } catch {
    return null;
  }
}

ipcMain.handle('upscale-models', () => listUpscaleModels());

const upscaleJobs = new Map(); // webContents.id -> child process en cours
const upscaleCancelFlags = new Set(); // annulations reçues avant le lancement du moteur

/* Lance le moteur ; si `wc` est fourni, le process est suivi pour
   l'annulation et tué si la fenêtre disparaît. */
function runUpscaleEngine(wc, { inPath, outPath, model, scale, gpu, onText }) {
  return new Promise((resolve) => {
    const args = [
      '-i', inPath,
      '-o', outPath,
      '-m', path.join(UPSCALE_ROOT, 'models'),
      '-n', model,
      '-s', String(scale),
    ];
    if (gpu != null) args.push('-g', String(gpu));
    const child = spawn(path.join(UPSCALE_ROOT, 'bin', 'upscayl-bin.exe'), args, {
      windowsHide: true,
    });
    const onGone = () => {
      try {
        child.kill();
      } catch {
        // process déjà terminé
      }
    };
    if (wc) {
      upscaleJobs.set(wc.id, child);
      wc.once('destroyed', onGone);
    }
    let errText = '';
    child.stdout.on('data', (chunk) => onText && onText(chunk.toString()));
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      errText += s;
      if (onText) onText(s);
    });
    child.on('error', (err) =>
      resolve({ code: -1, killed: false, errText: `${errText}\n${err.message}` })
    );
    child.on('close', (code, signal) => {
      if (wc) {
        upscaleJobs.delete(wc.id);
        if (!wc.isDestroyed()) wc.removeListener('destroyed', onGone);
      }
      resolve({ code, killed: Boolean(signal) || child.killed, errText });
    });
  });
}

/* Le rendu NCNN/Vulkan est corrompu sur certaines cartes (constaté sur
   RTX série 50) : l'image ressort en bruit saturé. Contrôle : la sortie
   upscalée, redescendue à la taille d'origine, doit rester proche de la
   source — le bruit fait exploser l'écart moyen. */
const UPSCALE_CAL_W = 360;
const UPSCALE_CAL_H = 300;

function upscaleCalBitmap() {
  // dégradé structuré (proche d'une vraie image, sans hautes fréquences
  // que l'upscale altérerait légitimement). Alpha à 254 : le PNG garde
  // ainsi son canal alpha (RGBA) — c'est précisément ce chemin de rendu
  // qui est corrompu sur les GPU touchés, un PNG opaque passerait le test.
  const buf = Buffer.alloc(UPSCALE_CAL_W * UPSCALE_CAL_H * 4);
  let i = 0;
  for (let y = 0; y < UPSCALE_CAL_H; y += 1) {
    for (let x = 0; x < UPSCALE_CAL_W; x += 1) {
      buf[i] = Math.round((x / UPSCALE_CAL_W) * 255); // B
      buf[i + 1] = Math.round((y / UPSCALE_CAL_H) * 255); // G
      buf[i + 2] = Math.round(((x + y) / (UPSCALE_CAL_W + UPSCALE_CAL_H)) * 255); // R
      buf[i + 3] = 254; // A
      i += 4;
    }
  }
  return buf;
}

function upscaleOutputSane(outPath, refBitmap) {
  try {
    const img = nativeImage.createFromPath(outPath);
    if (img.isEmpty()) return false;
    const small = img.resize({ width: UPSCALE_CAL_W, height: UPSCALE_CAL_H });
    const bmp = small.toBitmap();
    if (bmp.length !== refBitmap.length) return false;
    let sum = 0;
    let n = 0;
    for (let j = 0; j < bmp.length; j += 4) {
      sum +=
        Math.abs(bmp[j] - refBitmap[j]) +
        Math.abs(bmp[j + 1] - refBitmap[j + 1]) +
        Math.abs(bmp[j + 2] - refBitmap[j + 2]);
      n += 3;
    }
    return sum / n < 20;
  } catch {
    return false;
  }
}

/* Choisit le premier GPU dont la sortie est saine (image de contrôle
   upscalée ×2 puis vérifiée). Choix mémorisé dans userData. */
async function pickUpscaleGpu() {
  const cachePath = path.join(app.getPath('userData'), 'upscale-gpu.json');
  try {
    const saved = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    if (Number.isInteger(saved.gpu)) return saved.gpu;
  } catch {
    // pas encore calibré
  }
  const models = (await listUpscaleModels()) || [];
  const model = models.includes('upscayl-lite-4x') ? 'upscayl-lite-4x' : models[0];
  if (!model) return null;

  const tag = crypto.randomBytes(4).toString('hex');
  const tmpDir = app.getPath('temp');
  const inPath = path.join(tmpDir, `istudio-upscale-cal-${tag}.png`);
  const refBitmap = upscaleCalBitmap();
  await fs.writeFile(
    inPath,
    nativeImage
      .createFromBitmap(refBitmap, { width: UPSCALE_CAL_W, height: UPSCALE_CAL_H })
      .toPNG()
  );

  let chosen = null;
  try {
    const tried = new Set();
    const queue = [0];
    while (queue.length) {
      const gpu = queue.shift();
      if (tried.has(gpu)) continue;
      tried.add(gpu);
      const outPath = path.join(tmpDir, `istudio-upscale-cal-${tag}-${gpu}.png`);
      const r = await runUpscaleEngine(null, { inPath, outPath, model, scale: 2, gpu });
      // le moteur liste les GPU à chaque lancement : « [1 AMD Radeon…] »
      for (const m of r.errText.matchAll(/^\[(\d+) /gm)) {
        const id = Number(m[1]);
        if (!tried.has(id) && !queue.includes(id)) queue.push(id);
      }
      queue.sort((a, b) => a - b);
      const ok = r.code === 0 && !r.killed && upscaleOutputSane(outPath, refBitmap);
      fs.unlink(outPath).catch(() => {});
      if (ok) {
        chosen = gpu;
        break;
      }
    }
  } finally {
    fs.unlink(inPath).catch(() => {});
  }
  if (chosen !== null) {
    fs.writeFile(cachePath, JSON.stringify({ gpu: chosen })).catch(() => {});
  }
  return chosen;
}

let upscaleGpuPromise = null;
function upscaleGpu() {
  if (!upscaleGpuPromise) upscaleGpuPromise = pickUpscaleGpu().catch(() => null);
  return upscaleGpuPromise;
}

ipcMain.handle('upscale-run', async (e, { sourcePath, data, ext, scale, model }) => {
  if (!UPSCALE_ROOT) {
    return { error: 'Moteur d’upscale introuvable (dossier code_source_upscale manquant).' };
  }
  const wc = e.sender;
  if (upscaleJobs.has(wc.id)) return { error: 'Un agrandissement est déjà en cours.' };
  upscaleCancelFlags.delete(wc.id);

  // premier lancement : calibration du GPU (voir upscaleOutputSane)
  const gpu = await upscaleGpu();
  if (gpu === null) {
    upscaleGpuPromise = null; // re-tester au prochain essai
    return {
      error:
        'Aucun processeur graphique compatible Vulkan n’a produit un résultat fiable sur cette machine.',
    };
  }
  if (upscaleCancelFlags.delete(wc.id)) return { cancelled: true };

  const tag = crypto.randomBytes(6).toString('hex');
  const tmpDir = app.getPath('temp');
  const outPath = path.join(tmpDir, `istudio-upscale-${tag}.png`);
  const cleanup = [outPath];
  try {
    // Entrée : le fichier lui-même si le moteur sait le lire (jpg/png/webp),
    // sinon les pixels décodés par la visionneuse, déposés en temporaire.
    let inPath = sourcePath;
    if (!inPath) {
      inPath = path.join(tmpDir, `istudio-upscale-src-${tag}.${ext || 'png'}`);
      await fs.writeFile(inPath, Buffer.from(data));
      cleanup.push(inPath);
    }

    // progression tuile par tuile : « 25,00% »
    const onText = (s) => {
      const matches = s.match(/(\d+(?:[.,]\d+)?)%/g);
      if (matches && !wc.isDestroyed()) {
        const pct = parseFloat(matches[matches.length - 1].replace(',', '.'));
        if (!Number.isNaN(pct)) wc.send('upscale-progress', pct);
      }
    };
    const r = await runUpscaleEngine(wc, { inPath, outPath, model, scale, gpu, onText });
    if (r.killed) return { cancelled: true };
    if (r.code !== 0) {
      const lines = r.errText
        .trim()
        .split(/\r?\n/)
        .filter((l) => l && !l.includes('%') && !l.startsWith('['));
      return { error: lines.slice(-3).join(' ') || `échec du moteur (code ${r.code})` };
    }
    return { data: await fs.readFile(outPath) };
  } catch (err) {
    return { error: err.message };
  } finally {
    upscaleJobs.delete(wc.id);
    for (const p of cleanup) fs.unlink(p).catch(() => {});
  }
});

ipcMain.handle('upscale-cancel', (e) => {
  const child = upscaleJobs.get(e.sender.id);
  if (child) {
    try {
      child.kill();
    } catch {
      // déjà terminé
    }
    return true;
  }
  // moteur pas encore lancé (calibration en cours) : on note l'annulation
  upscaleCancelFlags.add(e.sender.id);
  return true;
});

/* ---------- Module Export SVG (renderer/svg-export) ----------
   Seul point d'entrée côté main du module : dialogue d'enregistrement du
   fichier .svg produit par le renderer. Supprimer ce bloc (et l'entrée
   exportSvg du preload) pour débrancher le module. */
ipcMain.handle('export-svg', async (e, { suggestedName, data }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(senderWindow(e), {
    title: tr('Exporter en SVG'),
    defaultPath: suggestedName,
    filters: [
      { name: tr('Image vectorielle SVG'), extensions: ['svg'] },
      { name: tr('Tous les fichiers'), extensions: ['*'] },
    ],
  });
  if (canceled || !filePath) return null;
  try {
    await fs.writeFile(filePath, Buffer.from(data));
    return filePath;
  } catch {
    return null;
  }
});

ipcMain.handle('print-file', async (e, fileUrl) => {
  const printWin = new BrowserWindow({
    show: false,
    parent: senderWindow(e),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await printWin.loadFile(path.join(__dirname, 'renderer', 'print.html'), {
      query: { src: fileUrl },
    });
    // print.html passe son titre à « ready » quand l'image est chargée.
    await new Promise((resolve) => {
      if (printWin.getTitle() === 'ready') return resolve();
      const timer = setTimeout(resolve, 5000);
      printWin.webContents.on('page-title-updated', (_ev, title) => {
        if (title === 'ready') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    return await new Promise((resolve) => {
      printWin.webContents.print({}, (success) => {
        printWin.destroy();
        resolve(success);
      });
    });
  } catch {
    if (!printWin.isDestroyed()) printWin.destroy();
    return false;
  }
});
