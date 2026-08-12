'use strict';
/* Corrige l'ordre de lecture du bloc « layer mask data » d'ag-psd :
   selon la spec Adobe, les paramètres de masque (flags & 16) précèdent les
   champs du real mask. ag-psd lit le real mask d'abord et casse sur les
   fichiers où les paramètres font >= 18 octets (« Invalid realMask size »).
   On échange les deux blocs, dans dist/psdReader.js et dist/bundle.js. */
const fs = require('fs');
const path = require('path');

function patchFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('PATCH-ISTUDIO-MASKPARAMS')) {
    console.log(`${path.basename(file)}: déjà corrigé`);
    return;
  }
  const iReal = src.indexOf('const realMask = {};');
  if (iReal === -1) throw new Error(`${file}: bloc realMask introuvable`);
  const a0 = src.lastIndexOf('if (left() >= 18) {', iReal);
  const errIdx = src.indexOf("Invalid realMask size", a0);
  if (a0 === -1 || errIdx === -1) throw new Error(`${file}: bornes du bloc realMask introuvables`);
  const a1 = src.indexOf('}', errIdx) + 1;
  const b0 = src.indexOf('if (flags & 16', a1);
  const featherIdx = src.indexOf('vectorMaskFeather = readFloat64(reader);', b0);
  if (b0 === -1 || featherIdx === -1) throw new Error(`${file}: bloc paramètres introuvable`);
  const b1 = src.indexOf('}', featherIdx) + 1;
  const blockA = src.slice(a0, a1);
  const mid = src.slice(a1, b0);
  const blockB = src.slice(b0, b1);
  const out =
    src.slice(0, a0) +
    '/* PATCH-ISTUDIO-MASKPARAMS : paramètres avant real mask (spec Adobe) */ ' +
    blockB +
    mid +
    blockA +
    src.slice(b1);
  fs.writeFileSync(file, out);
  console.log(`${path.basename(file)}: corrigé`);
}

const root = process.argv[2];
patchFile(path.join(root, 'node_modules/ag-psd/dist/psdReader.js'));
patchFile(path.join(root, 'node_modules/ag-psd/dist/bundle.js'));
