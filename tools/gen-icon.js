'use strict';
/* Génère build/icon.ico multi-résolutions (16→256, entrées PNG) et
   renderer/assets/istudio-logo.png (256 px) depuis src/Logo/IStudio_logo.png.
   À lancer avec Electron :  npx electron tools/gen-icon.js
   Chaque taille est rééchantillonnée en qualité maximale depuis la source
   2048×2048 — jamais d'agrandissement ni de redimensionnement à la volée
   par Windows (cause des logos flous). */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'Logo', 'IStudio_logo.png');
const OUT_ICO = path.join(__dirname, '..', 'build', 'icon.ico');
const OUT_PNG = path.join(__dirname, '..', 'renderer', 'assets', 'istudio-logo.png');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // réservé
  header.writeUInt16LE(1, 2); // type : icône
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngBuffers.forEach(({ size, buf }, i) => {
    const e = i * 16;
    entries[e] = size >= 256 ? 0 : size; // largeur (0 = 256)
    entries[e + 1] = size >= 256 ? 0 : size; // hauteur
    entries[e + 2] = 0; // palette
    entries[e + 3] = 0; // réservé
    entries.writeUInt16LE(1, e + 4); // plans
    entries.writeUInt16LE(32, e + 6); // bits/pixel
    entries.writeUInt32LE(buf.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, entries, ...pngBuffers.map((p) => p.buf)]);
}

const src = nativeImage.createFromPath(SRC);
if (src.isEmpty()) {
  console.error('Logo source introuvable ou illisible :', SRC);
  app.exit(1);
} else {
  const pngs = SIZES.map((size) => ({
    size,
    buf: src.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  fs.mkdirSync(path.dirname(OUT_ICO), { recursive: true });
  fs.writeFileSync(OUT_ICO, buildIco(pngs));
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, src.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  console.log(`icon.ico : ${SIZES.join(', ')} px — ${Math.round(fs.statSync(OUT_ICO).size / 1024)} Ko`);
  console.log('istudio-logo.png : 256 px');
  app.exit(0);
}
