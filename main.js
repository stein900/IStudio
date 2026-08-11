const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const { pathToFileURL } = require('url');

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.jfif', '.png', '.gif', '.bmp',
  '.webp', '.ico', '.svg', '.tif', '.tiff', '.avif',
]);

const SMOKE = process.argv.includes('--smoke');

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

  const files = entries
    .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => {
      const p = path.join(dir, name);
      return { name, path: p, url: pathToFileURL(p).href };
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

function createWindow() {
  mainWindow = new BrowserWindow({
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
          } catch (err) {
            console.log(`SMOKE PAINT ERROR: ${err.message}`);
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
                   closedAfterSave: !window.Studio.isOpen(),
                 };
               })()`
            );
            console.log(`SMOKE STUDIO: ${JSON.stringify(r)}`);
          } catch (err) {
            console.log(`SMOKE STUDIO ERROR: ${err.message}`);
          }
          app.quit();
        }, 1500);
      } else {
        setTimeout(() => app.quit(), 2000);
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
    if (target !== sourcePath) {
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
