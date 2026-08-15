'use strict';

/**
 * Module Convertir — encodeurs TIFF et BMP (hors du thread d'interface).
 *
 * Chromium n'encode nativement que PNG, JPEG et WebP : ces deux formats
 * sont donc écrits à la main, octet par octet. Le travail se fait dans ce
 * worker pour ne jamais bloquer l'interface, même sur une photo de 50 Mpx.
 *
 * Entrée  : { format: 'tiff' | 'bmp', width, height, pixels (RGBA), hasAlpha }
 * Sortie  : { ok: true, buffer } (transféré) ou { ok: false, message }
 */

self.onmessage = (event) => {
  const { format, width, height, pixels, hasAlpha } = event.data;
  try {
    const rgba = new Uint8Array(pixels);
    const buffer =
      format === 'tiff'
        ? encodeTiff(rgba, width, height, hasAlpha)
        : encodeBmp(rgba, width, height, hasAlpha);
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ ok: false, message: err && err.message ? err.message : String(err) });
  }
};

/* ---------- TIFF ----------
   TIFF de référence (baseline) : little-endian, non compressé, une seule
   bande. RGB pour une image opaque, RGBA (alpha non associé) sinon —
   lisible par Photoshop, GIMP, l'Explorateur Windows et les RIP
   d'impression sans aucune dépendance. */

function encodeTiff(rgba, width, height, hasAlpha) {
  const SHORT = 3;
  const LONG = 4;
  const RATIONAL = 5;

  const samples = hasAlpha ? 4 : 3;
  const entryCount = hasAlpha ? 13 : 12;
  const headerSize = 8;
  const ifdSize = 2 + entryCount * 12 + 4;
  const bitsOffset = headerSize + ifdSize; // valeurs BitsPerSample (hors ligne)
  const xResOffset = bitsOffset + samples * 2;
  const yResOffset = xResOffset + 8;
  // la bande de pixels commence sur un offset pair (exigence du format)
  const stripOffset = yResOffset + 8 + ((yResOffset + 8) % 2);
  const stripBytes = width * height * samples;

  const out = new ArrayBuffer(stripOffset + stripBytes);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  view.setUint8(0, 0x49); // 'II' : little-endian
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, headerSize, true); // offset du premier IFD

  let p = headerSize;
  view.setUint16(p, entryCount, true);
  p += 2;
  const entry = (tag, type, count, value) => {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    view.setUint32(p + 8, value, true);
    p += 12;
  };
  // les entrées doivent rester triées par numéro de tag croissant
  entry(256, LONG, 1, width); // ImageWidth
  entry(257, LONG, 1, height); // ImageLength
  entry(258, SHORT, samples, bitsOffset); // BitsPerSample : 8 par canal
  entry(259, SHORT, 1, 1); // Compression : aucune
  entry(262, SHORT, 1, 2); // PhotometricInterpretation : RGB
  entry(273, LONG, 1, stripOffset); // StripOffsets
  entry(277, SHORT, 1, samples); // SamplesPerPixel
  entry(278, LONG, 1, height); // RowsPerStrip : tout en une bande
  entry(279, LONG, 1, stripBytes); // StripByteCounts
  entry(282, RATIONAL, 1, xResOffset); // XResolution
  entry(283, RATIONAL, 1, yResOffset); // YResolution
  entry(296, SHORT, 1, 2); // ResolutionUnit : pouce
  if (hasAlpha) entry(338, SHORT, 1, 2); // ExtraSamples : alpha non associé
  view.setUint32(p, 0, true); // pas d'IFD suivant

  for (let s = 0; s < samples; s += 1) view.setUint16(bitsOffset + s * 2, 8, true);
  view.setUint32(xResOffset, 72, true); // 72/1 : 72 ppp
  view.setUint32(xResOffset + 4, 1, true);
  view.setUint32(yResOffset, 72, true);
  view.setUint32(yResOffset + 4, 1, true);

  if (hasAlpha) {
    bytes.set(rgba, stripOffset);
  } else {
    const n = width * height;
    let o = stripOffset;
    for (let i = 0; i < n; i += 1) {
      const q = i * 4;
      bytes[o] = rgba[q];
      bytes[o + 1] = rgba[q + 1];
      bytes[o + 2] = rgba[q + 2];
      o += 3;
    }
  }
  return out;
}

/* ---------- BMP ----------
   Image opaque : 24 bits BITMAPINFOHEADER classique, la variante comprise
   par absolument tout. Image avec transparence : 32 bits BITMAPV4HEADER
   et masques BI_BITFIELDS, la forme standard du BMP avec canal alpha. */

function encodeBmp(rgba, width, height, hasAlpha) {
  return hasAlpha ? encodeBmp32(rgba, width, height) : encodeBmp24(rgba, width, height);
}

function encodeBmp24(rgba, width, height) {
  const rowBytes = width * 3;
  const stride = rowBytes + ((4 - (rowBytes % 4)) % 4); // lignes alignées sur 4 octets
  const dataSize = stride * height;
  const offset = 14 + 40;

  const out = new ArrayBuffer(offset + dataSize);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  view.setUint16(0, 0x4d42, true); // 'BM'
  view.setUint32(2, out.byteLength, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // hauteur positive : lignes de bas en haut
  view.setUint16(26, 1, true); // plans
  view.setUint16(28, 24, true); // bits par pixel
  view.setUint32(30, 0, true); // BI_RGB : sans compression
  view.setUint32(34, dataSize, true);
  view.setInt32(38, 2835, true); // 72 ppp
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y += 1) {
    let src = (height - 1 - y) * width * 4;
    let dst = offset + y * stride;
    for (let x = 0; x < width; x += 1) {
      bytes[dst] = rgba[src + 2]; // BGR
      bytes[dst + 1] = rgba[src + 1];
      bytes[dst + 2] = rgba[src];
      src += 4;
      dst += 3;
    }
  }
  return out;
}

function encodeBmp32(rgba, width, height) {
  const offset = 14 + 108;
  const dataSize = width * height * 4;

  const out = new ArrayBuffer(offset + dataSize);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  view.setUint16(0, 0x4d42, true); // 'BM'
  view.setUint32(2, out.byteLength, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 108, true); // BITMAPV4HEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 3, true); // BI_BITFIELDS
  view.setUint32(34, dataSize, true);
  view.setInt32(38, 2835, true); // 72 ppp
  view.setInt32(42, 2835, true);
  view.setUint32(54, 0x00ff0000, true); // masque rouge
  view.setUint32(58, 0x0000ff00, true); // masque vert
  view.setUint32(62, 0x000000ff, true); // masque bleu
  view.setUint32(66, 0xff000000, true); // masque alpha
  view.setUint32(70, 0x73524742, true); // espace de couleur 'sRGB'

  for (let y = 0; y < height; y += 1) {
    let src = (height - 1 - y) * width * 4;
    let dst = offset + y * width * 4;
    for (let x = 0; x < width; x += 1) {
      bytes[dst] = rgba[src + 2]; // BGRA
      bytes[dst + 1] = rgba[src + 1];
      bytes[dst + 2] = rgba[src];
      bytes[dst + 3] = rgba[src + 3];
      src += 4;
      dst += 4;
    }
  }
  return out;
}
