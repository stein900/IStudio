'use strict';

/**
 * Worker du module Export SVG — vectorisation d'une image en SVG.
 *
 * Deux modes :
 *
 * - « lossless » (sans perte) : les suites horizontales de pixels d'une même
 *   couleur sont fusionnées verticalement en rectangles ; chaque couleur
 *   devient UN <path> regroupant ses rectangles. Rendu identique au pixel
 *   près (couleurs et alpha exacts, aucune approximation).
 *
 * - « simplified » (simplifié) : pour les images photographiques, dont la
 *   vectorisation sans perte exploserait. L'image est d'abord réduite à N
 *   couleurs (quantification median cut), puis les zones sont consolidées
 *   (filtre majoritaire 3×3), et enfin vectorisée par le même moteur.
 *   Le SVG est alors fidèle à l'image simplifiée — celle de l'aperçu.
 *
 * Entrée  : { width, height, pixels: ArrayBuffer (RGBA), mode,
 *             colors, smoothPasses }   (colors/smoothPasses : mode simplifié)
 * Sorties : { type: 'progress', pct }
 *           { type: 'done', svg, stats: { colors, rects, bytes } }
 *           { type: 'error', code: 'limit' | 'error', message }
 */

/* Garde-fou : au-delà, le SVG serait démesuré et inutilisable. */
const MAX_RECTS = 1_000_000;

/* Échantillonnage maximal pour construire la palette (median cut). */
const MAX_SAMPLES = 300_000;

self.onmessage = (event) => {
  const { width, height, pixels, mode, colors, smoothPasses } = event.data;
  try {
    const px = new Uint32Array(pixels);
    let base = 0;
    let span = 100;
    if (mode === 'simplified') {
      simplify(px, width, height, colors, smoothPasses);
      base = 55;
      span = 45;
    }
    const result = vectorize(width, height, px, base, span);
    self.postMessage({
      type: 'done',
      svg: result.svg,
      stats: { colors: result.colors, rects: result.rects, bytes: result.svg.length },
    });
  } catch (err) {
    self.postMessage({ type: 'error', code: err.code || 'error', message: err.message });
  }
};

function progress(pct) {
  self.postMessage({ type: 'progress', pct });
}

function limitError() {
  const err = new Error(
    `plus de ${MAX_RECTS.toLocaleString('fr-FR')} tracés nécessaires — l'image est trop détaillée.`
  );
  err.code = 'limit';
  return err;
}

/* Les pixels RGBA lus en Uint32 sur une machine petit-boutiste (Windows)
   s'empaquettent en 0xAABBGGRR. */
function channels(color) {
  return {
    r: color & 0xff,
    g: (color >>> 8) & 0xff,
    b: (color >>> 16) & 0xff,
    a: color >>> 24,
  };
}

/* ==================== Mode simplifié ==================== */

/* Remplace les pixels par leur version réduite à `colorCount` couleurs,
   zones consolidées. Travaille en place sur `px`. */
function simplify(px, width, height, colorCount, smoothPasses) {
  const palette = buildPalette(px, colorCount); // Uint32Array
  progress(15);
  if (palette.length === 0) return; // image entièrement transparente

  // affectation de chaque pixel à sa couleur de palette la plus proche
  const transparentIdx = palette.length;
  const indices = new Uint16Array(px.length);
  const cache = new Map(); // couleur exacte -> index de palette
  for (let i = 0; i < px.length; i += 1) {
    const c = px[i];
    if (c >>> 24 === 0) {
      indices[i] = transparentIdx;
      continue;
    }
    let idx = cache.get(c);
    if (idx === undefined) {
      idx = nearestIndex(palette, c);
      cache.set(c, idx);
    }
    indices[i] = idx;
    if ((i & 0xfffff) === 0) progress(15 + (i / px.length) * 20);
  }
  progress(35);

  // consolidation : filtre majoritaire 3×3 (gomme le grain du tramage)
  let smoothed = indices;
  for (let pass = 0; pass < smoothPasses; pass += 1) {
    smoothed = majorityFilter(smoothed, width, height, palette.length + 1);
    progress(35 + ((pass + 1) / smoothPasses) * 18);
  }

  for (let i = 0; i < px.length; i += 1) {
    px[i] = smoothed[i] === transparentIdx ? 0 : palette[smoothed[i]];
  }
  progress(55);
}

/* Palette par median cut : découpes successives de la boîte de couleurs la
   plus étendue, moyenne par boîte. Sur un échantillon des pixels opaques. */
function buildPalette(px, colorCount) {
  const stride = Math.max(1, Math.floor(px.length / MAX_SAMPLES));
  const samples = [];
  for (let i = 0; i < px.length; i += stride) {
    if (px[i] >>> 24 !== 0) samples.push(px[i]);
  }
  if (samples.length === 0) return new Uint32Array(0);

  const CHANNEL_SHIFTS = [0, 8, 16, 24]; // R, G, B, A
  let boxes = [{ start: 0, end: samples.length }];
  const widestChannel = (box) => {
    const min = [255, 255, 255, 255];
    const max = [0, 0, 0, 0];
    for (let i = box.start; i < box.end; i += 1) {
      for (let ch = 0; ch < 4; ch += 1) {
        const v = (samples[i] >>> CHANNEL_SHIFTS[ch]) & 0xff;
        if (v < min[ch]) min[ch] = v;
        if (v > max[ch]) max[ch] = v;
      }
    }
    let best = 0;
    let bestRange = -1;
    for (let ch = 0; ch < 4; ch += 1) {
      if (max[ch] - min[ch] > bestRange) {
        bestRange = max[ch] - min[ch];
        best = ch;
      }
    }
    return { channel: best, range: bestRange };
  };

  while (boxes.length < colorCount) {
    // boîte la plus étendue (celles d'un seul pixel ne se découpent plus)
    let target = -1;
    let targetRange = 0;
    let targetChannel = 0;
    for (let b = 0; b < boxes.length; b += 1) {
      if (boxes[b].end - boxes[b].start < 2) continue;
      const { channel, range } = widestChannel(boxes[b]);
      if (range > targetRange) {
        targetRange = range;
        targetChannel = channel;
        target = b;
      }
    }
    if (target === -1) break; // plus rien à découper
    const box = boxes[target];
    const shift = CHANNEL_SHIFTS[targetChannel];
    const part = samples.slice(box.start, box.end).sort((x, y) => ((x >>> shift) & 0xff) - ((y >>> shift) & 0xff));
    for (let i = 0; i < part.length; i += 1) samples[box.start + i] = part[i];
    const mid = box.start + (part.length >> 1);
    boxes.splice(target, 1, { start: box.start, end: mid }, { start: mid, end: box.end });
  }

  const palette = new Uint32Array(boxes.length);
  for (let b = 0; b < boxes.length; b += 1) {
    const box = boxes[b];
    const sum = [0, 0, 0, 0];
    for (let i = box.start; i < box.end; i += 1) {
      for (let ch = 0; ch < 4; ch += 1) sum[ch] += (samples[i] >>> CHANNEL_SHIFTS[ch]) & 0xff;
    }
    const n = box.end - box.start;
    palette[b] =
      (Math.round(sum[3] / n) << 24) |
      (Math.round(sum[2] / n) << 16) |
      (Math.round(sum[1] / n) << 8) |
      Math.round(sum[0] / n);
  }
  return palette;
}

function nearestIndex(palette, color) {
  const c = channels(color);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const p = channels(palette[i]);
    const dist =
      (c.r - p.r) * (c.r - p.r) +
      (c.g - p.g) * (c.g - p.g) +
      (c.b - p.b) * (c.b - p.b) +
      (c.a - p.a) * (c.a - p.a);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/* Chaque pixel prend l'index majoritaire de son voisinage 3×3
   (le centre gagne à égalité : pas de dérive). */
function majorityFilter(indices, width, height, indexCount) {
  const out = new Uint16Array(indices.length);
  const counts = new Uint16Array(indexCount);
  const touched = [];
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      touched.length = 0;
      for (let yy = y0; yy <= y1; yy += 1) {
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx += 1) {
          const v = indices[row + xx];
          if (counts[v] === 0) touched.push(v);
          counts[v] += 1;
        }
      }
      const center = indices[y * width + x];
      let bestIdx = center;
      let bestCount = counts[center];
      for (let t = 0; t < touched.length; t += 1) {
        const v = touched[t];
        if (counts[v] > bestCount) {
          bestCount = counts[v];
          bestIdx = v;
        }
        counts[v] = 0;
      }
      out[y * width + x] = bestIdx;
    }
  }
  return out;
}

/* ==================== Vectorisation ==================== */

function hexColor(color) {
  const { r, g, b } = channels(color);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function vectorize(width, height, px, progressBase, progressSpan) {
  const byColor = new Map(); // couleur u32 -> tableau de sous-chemins « d »
  let openRects = new Map(); // `x:w:couleur` -> rectangle en cours de fusion
  let rects = 0;

  const closeRect = (r) => {
    rects += 1;
    if (rects > MAX_RECTS) throw limitError();
    let d = byColor.get(r.c);
    if (!d) {
      d = [];
      byColor.set(r.c, d);
    }
    d.push(`M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`);
  };

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    const stillOpen = new Map();
    let x = 0;
    while (x < width) {
      const c = px[rowStart + x];
      if (c >>> 24 === 0) {
        // pixel entièrement transparent : ne produit aucun tracé
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < width && px[rowStart + end] === c) end += 1;
      const key = `${x}:${end - x}:${c}`;
      const prev = openRects.get(key);
      if (prev) {
        // même run que la ligne précédente : le rectangle grandit
        prev.h += 1;
        openRects.delete(key);
        stillOpen.set(key, prev);
      } else {
        stillOpen.set(key, { x, y, w: end - x, h: 1, c });
      }
      x = end;
    }
    for (const r of openRects.values()) closeRect(r);
    openRects = stillOpen;
    if ((y & 63) === 0) progress(progressBase + (y / height) * progressSpan);
  }
  for (const r of openRects.values()) closeRect(r);

  return { svg: assemble(width, height, byColor), colors: byColor.size, rects };
}

function assemble(width, height, byColor) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- IStudio : image vectorisee (zones de couleur fusionnees en rectangles) -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
  ];
  for (const [color, d] of byColor) {
    const { a } = channels(color);
    // l'alpha exact du pixel est conservé via fill-opacity
    const opacity = a === 255 ? '' : ` fill-opacity="${(a / 255).toFixed(4).replace(/0+$/, '')}"`;
    parts.push(`<path fill="${hexColor(color)}"${opacity} d="${d.join('')}"/>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}
