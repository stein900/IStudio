const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.jfif', '.png', '.gif', '.bmp',
  '.webp', '.ico', '.svg', '.tif', '.tiff', '.avif', '.psd',
]);

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

let mainWindow = null;
let pendingFile = fileFromArgv(process.argv);

function fileFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (typeof arg !== 'string' || arg.startsWith('-')) continue;
    try {
      const p = path.resolve(arg);
      if (fssync.existsSync(p) && IMAGE_EXTS.has(path.extname(p).toLowerCase())) {
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
    .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
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

function createWindow() {
  // icône de fenêtre en dev (l'application installée reprend l'icône de
  // l'exécutable) : l'ICO multi-résolutions évite tout flou de mise à l'échelle
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (SMOKE) {
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
                   panelOpen, histInk, inspector, channelSwapped,
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
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv) => {
    const file = fileFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (file) {
        mainWindow.webContents.send('open-context', await buildContext(file));
      }
    }
  });

  // macOS uniquement, sans effet sous Windows mais inoffensif.
  app.on('open-file', async (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
      mainWindow.webContents.send('open-context', await buildContext(filePath));
    } else {
      pendingFile = filePath;
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    app.quit();
  });
}

ipcMain.handle('renderer-ready', async () => {
  if (pendingFile) {
    const ctx = await buildContext(pendingFile);
    pendingFile = null;
    return ctx;
  }
  return null;
});

ipcMain.handle('reload-context', async (_e, filePath) => buildContext(filePath));

ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir une image',
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: [...IMAGE_EXTS].map((e) => e.slice(1)),
      },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return buildContext(result.filePaths[0]);
});

ipcMain.handle('set-title', (_e, title) => {
  if (mainWindow) mainWindow.setTitle(title);
});

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
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

ipcMain.handle('delete-file', async (_e, filePath) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Supprimer', 'Annuler'],
    defaultId: 0,
    cancelId: 1,
    title: 'Supprimer l’image',
    message: `Envoyer « ${path.basename(filePath)} » à la corbeille ?`,
    detail: 'L’image pourra être restaurée depuis la corbeille Windows.',
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
ipcMain.handle('ask-save-mode', async (_e, fileName) => {
  if (SMOKE) return process.argv.includes('--smoke-save-copy') ? 'copy' : 'overwrite';
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Écraser l’original', 'Enregistrer une copie', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: 'Enregistrer',
    message: `Enregistrer « ${fileName} »`,
    detail:
      'Écraser remplace le fichier d’origine. La copie est créée à côté, l’original reste intact.',
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

ipcMain.handle('save-project', async (_e, { suggestedName, json }) => {
  let filePath;
  if (SMOKE) {
    filePath = path.join(app.getPath('temp'), suggestedName);
  } else {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer le projet',
      defaultPath: suggestedName,
      filters: [{ name: 'Projet IStudio', extensions: ['istudio'] }],
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

ipcMain.handle('open-project', async () => {
  let filePath;
  if (SMOKE) {
    filePath = lastSmokeProject;
    if (!filePath) return null;
  } else {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Ouvrir un projet',
      filters: [{ name: 'Projet IStudio', extensions: ['istudio'] }],
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

ipcMain.handle('export-image', async (_e, { suggestedName, data }) => {
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
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter l’image',
    defaultPath: suggestedName,
    filters: [
      { name: 'Image PNG', extensions: ['png'] },
      { name: 'Image JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'Image WebP', extensions: ['webp'] },
      { name: 'Document Photoshop', extensions: ['psd'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
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

ipcMain.handle('print-file', async (_e, fileUrl) => {
  const printWin = new BrowserWindow({
    show: false,
    parent: mainWindow,
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
