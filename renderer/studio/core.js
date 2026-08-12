'use strict';

/**
 * Studio — noyau du module de montage (type Photoshop/Photopea).
 *
 * Ce fichier ne contient AUCUNE interface : uniquement le modèle de document
 * et les opérations pures, pour que le reste (outils, UI) puisse évoluer
 * sans toucher au cœur.
 *
 * Modèle :
 *  - un document = taille fixe (celle de l'image d'origine) + pile de
 *    calques (fond → premier plan) + calque actif ;
 *  - calque « raster » : un canvas hors écran à la taille du document,
 *    déplaçable par un décalage (x, y) ;
 *  - calque « text » : vectoriel, re-rendu à chaque composition (reste
 *    éditable) ; position (x, y), encombrement mesuré (w, h).
 *
 * L'historique fonctionne par instantanés profonds (les canvas sont clonés),
 * plafonnés — simple et sûr ; pourra être remplacé par un historique de
 * commandes sans changer l'API (push / undo / redo).
 */

window.StudioCore = (() => {
  const HISTORY_MAX = 20;
  const TEXT_LINE_HEIGHT = 1.3;

  /** Modes de fusion des calques → opération de composition canvas. */
  const BLEND_MODES = [
    { value: 'normal', op: 'source-over', label: 'Normal' },
    { value: 'multiply', op: 'multiply', label: 'Produit' },
    { value: 'screen', op: 'screen', label: 'Écran' },
    { value: 'overlay', op: 'overlay', label: 'Superposition' },
    { value: 'darken', op: 'darken', label: 'Obscurcir' },
    { value: 'lighten', op: 'lighten', label: 'Éclaircir' },
    { value: 'color-dodge', op: 'color-dodge', label: 'Densité couleur -' },
    { value: 'color-burn', op: 'color-burn', label: 'Densité couleur +' },
    { value: 'hard-light', op: 'hard-light', label: 'Lumière crue' },
    { value: 'soft-light', op: 'soft-light', label: 'Lumière tamisée' },
    { value: 'difference', op: 'difference', label: 'Différence' },
    { value: 'exclusion', op: 'exclusion', label: 'Exclusion' },
    { value: 'hue', op: 'hue', label: 'Teinte' },
    { value: 'saturation', op: 'saturation', label: 'Saturation' },
    { value: 'color', op: 'color', label: 'Couleur' },
    { value: 'luminosity', op: 'luminosity', label: 'Luminosité' },
  ];
  const BLEND_OPS = Object.fromEntries(BLEND_MODES.map((m) => [m.value, m.op]));

  /* ---------- Texte ---------- */

  const DEFAULT_FONT = '"Segoe UI"';

  function textFont(fontSize, opts = {}) {
    const style = opts.italic ? 'italic ' : '';
    const weight = opts.bold ? 700 : 500;
    const family = opts.font || DEFAULT_FONT;
    return `${style}${weight} ${fontSize}px ${family}, system-ui, sans-serif`;
  }

  let measurer = null;

  function measureText(text, fontSize, opts = {}) {
    if (!measurer) measurer = document.createElement('canvas').getContext('2d');
    measurer.font = textFont(fontSize, opts);
    const lines = text.split('\n');
    let w = 4;
    for (const line of lines) w = Math.max(w, measurer.measureText(line).width);
    return { w, h: Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT };
  }

  /* ---------- Calques ---------- */

  function createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function createRasterLayer(name, w, h) {
    return {
      id: crypto.randomUUID(),
      kind: 'raster',
      name,
      visible: true,
      opacity: 1,
      blend: 'normal',
      x: 0,
      y: 0,
      canvas: createCanvas(w, h),
    };
  }

  function createTextLayer({
    text,
    x,
    y,
    fontSize,
    color,
    bold = false,
    italic = false,
    underline = false,
    strike = false,
    font = DEFAULT_FONT,
    strokeWidth = 0,
    strokeColor = '#000000',
  }) {
    const opts = { bold, italic, font };
    const m = measureText(text, fontSize, opts);
    return {
      id: crypto.randomUUID(),
      kind: 'text',
      name: text.split('\n')[0].slice(0, 24) || 'Texte',
      visible: true,
      opacity: 1,
      blend: 'normal',
      x,
      y,
      text,
      fontSize,
      color,
      bold,
      italic,
      underline,
      strike,
      font,
      strokeWidth,
      strokeColor,
      w: m.w,
      h: m.h,
    };
  }

  /** Recalcule nom et encombrement après édition du contenu ou du style. */
  function refreshTextLayer(layer) {
    const m = measureText(layer.text, layer.fontSize, layer);
    layer.w = m.w;
    layer.h = m.h;
    layer.name = layer.text.split('\n')[0].slice(0, 24) || 'Texte';
  }

  function cloneLayer(l) {
    const fx = l.fx ? JSON.parse(JSON.stringify(l.fx)) : null;
    if (l.kind === 'raster') {
      const canvas = createCanvas(l.canvas.width, l.canvas.height);
      canvas.getContext('2d').drawImage(l.canvas, 0, 0);
      return { ...l, canvas, tx: l.tx ? { ...l.tx } : null, fx };
    }
    return { ...l, fx };
  }

  /* ---------- Document ---------- */

  function createDocFromImage(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const bg = createRasterLayer('Arrière-plan', w, h);
    bg.canvas.getContext('2d').drawImage(img, 0, 0);
    return { width: w, height: h, layers: [bg], activeLayerId: bg.id };
  }

  function snapshotDoc(doc) {
    return {
      width: doc.width,
      height: doc.height,
      activeLayerId: doc.activeLayerId,
      layers: doc.layers.map(cloneLayer),
    };
  }

  function findLayer(doc, id) {
    return doc.layers.find((l) => l.id === id) || null;
  }

  function activeLayer(doc) {
    return findLayer(doc, doc.activeLayerId) || doc.layers[doc.layers.length - 1] || null;
  }

  function activeIndex(doc) {
    const l = activeLayer(doc);
    return l ? doc.layers.indexOf(l) : -1;
  }

  /** Nouveau calque raster vide, inséré au-dessus du calque actif. */
  function addEmptyLayer(doc) {
    const layer = createRasterLayer(`Calque ${doc.layers.length + 1}`, doc.width, doc.height);
    doc.layers.splice(activeIndex(doc) + 1, 0, layer);
    doc.activeLayerId = layer.id;
    return layer;
  }

  function duplicateLayer(doc, id) {
    const src = findLayer(doc, id);
    if (!src) return null;
    const copy = cloneLayer(src);
    copy.id = crypto.randomUUID();
    copy.name = `${src.name} copie`;
    doc.layers.splice(doc.layers.indexOf(src) + 1, 0, copy);
    doc.activeLayerId = copy.id;
    return copy;
  }

  function removeLayer(doc, id) {
    if (doc.layers.length <= 1) return false;
    const i = doc.layers.findIndex((l) => l.id === id);
    if (i === -1) return false;
    doc.layers.splice(i, 1);
    if (doc.activeLayerId === id) {
      doc.activeLayerId = doc.layers[Math.min(i, doc.layers.length - 1)].id;
    }
    return true;
  }

  /** dir = +1 : vers le premier plan ; -1 : vers le fond. */
  function moveLayerOrder(doc, id, dir) {
    const i = doc.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.layers.length) return false;
    [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
    return true;
  }

  /* ---------- Composition ---------- */

  function renderTextLayer(ctx, l) {
    ctx.font = textFont(l.fontSize, l);
    ctx.textBaseline = 'top';
    const lineHeight = l.fontSize * TEXT_LINE_HEIGHT;
    const halfLeading = (TEXT_LINE_HEIGHT - 1) * l.fontSize * 0.5;
    const lines = l.text.split('\n');
    if (l.strokeWidth > 0) {
      ctx.strokeStyle = l.strokeColor || '#000000';
      ctx.lineWidth = l.strokeWidth;
      ctx.lineJoin = 'round';
      lines.forEach((line, i) => {
        ctx.strokeText(line, l.x, l.y + halfLeading + i * lineHeight);
      });
    }
    ctx.fillStyle = l.color;
    lines.forEach((line, i) => {
      ctx.fillText(line, l.x, l.y + halfLeading + i * lineHeight);
    });
    if (l.underline || l.strike) {
      ctx.strokeStyle = l.color;
      ctx.lineWidth = Math.max(1, l.fontSize / 16);
      ctx.lineCap = 'round';
      ctx.beginPath();
      lines.forEach((line, i) => {
        const lw = ctx.measureText(line).width;
        if (!lw) return;
        const top = l.y + halfLeading + i * lineHeight;
        if (l.underline) {
          ctx.moveTo(l.x, top + l.fontSize * 1.04);
          ctx.lineTo(l.x + lw, top + l.fontSize * 1.04);
        }
        if (l.strike) {
          ctx.moveTo(l.x, top + l.fontSize * 0.56);
          ctx.lineTo(l.x + lw, top + l.fontSize * 0.56);
        }
      });
      ctx.stroke();
    }
  }

  /** Dessine le contenu brut d'un calque (avec sa transformation `tx`). */
  function renderLayerContent(ctx, l) {
    if (l.kind === 'raster') {
      if (l.tx) {
        const w0 = l.canvas.width;
        const h0 = l.canvas.height;
        ctx.save();
        ctx.translate(l.x + w0 / 2, l.y + h0 / 2);
        ctx.rotate(l.tx.rot);
        ctx.scale(l.tx.sx, l.tx.sy);
        ctx.drawImage(l.canvas, -w0 / 2, -h0 / 2);
        ctx.restore();
      } else {
        ctx.drawImage(l.canvas, l.x, l.y);
      }
    } else {
      renderTextLayer(ctx, l);
    }
  }

  function hasFx(l) {
    return Boolean(
      l.fx &&
        ((l.fx.shadow && l.fx.shadow.on) || (l.fx.stroke && l.fx.stroke.on) || (l.fx.glow && l.fx.glow.on))
    );
  }

  /** Silhouette du calque (sa forme opaque) remplie d'une couleur unie —
      base des styles de calque (ombre portée, contour, lueur). */
  function layerSilhouette(doc, l, color) {
    const t = createCanvas(doc.width, doc.height);
    const c2 = t.getContext('2d');
    renderLayerContent(c2, l);
    c2.globalCompositeOperation = 'source-in';
    c2.fillStyle = color;
    c2.fillRect(0, 0, doc.width, doc.height);
    return t;
  }

  /** Compose tous les calques visibles dans `ctx` (taille document).
      Un calque raster peut porter une transformation transitoire `tx`
      ({ sx, sy, rot }, autour de son centre), et tout calque peut porter des
      styles `fx` (ombre portée, contour, lueur) rendus sous son contenu. */
  function compositeTo(ctx, doc, { hideLayerId = null } = {}) {
    ctx.clearRect(0, 0, doc.width, doc.height);
    for (const l of doc.layers) {
      if (!l.visible || l.opacity <= 0 || l.id === hideLayerId) continue;
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = BLEND_OPS[l.blend] || 'source-over';
      if (hasFx(l)) {
        const fx = l.fx;
        if (fx.shadow && fx.shadow.on) {
          const s = layerSilhouette(doc, l, fx.shadow.color || '#000000');
          ctx.save();
          ctx.globalAlpha = l.opacity * ((fx.shadow.opacity ?? 60) / 100);
          if (fx.shadow.blur > 0) ctx.filter = `blur(${fx.shadow.blur}px)`;
          ctx.drawImage(s, fx.shadow.dx || 0, fx.shadow.dy || 0);
          ctx.restore();
        }
        if (fx.glow && fx.glow.on) {
          const s = layerSilhouette(doc, l, fx.glow.color || '#ffd166');
          ctx.save();
          ctx.filter = `blur(${Math.max(1, fx.glow.size || 10)}px)`;
          ctx.drawImage(s, 0, 0);
          ctx.drawImage(s, 0, 0); // second passage : lueur plus dense
          ctx.restore();
        }
        if (fx.stroke && fx.stroke.on) {
          const s = layerSilhouette(doc, l, fx.stroke.color || '#ffffff');
          const size = Math.max(1, fx.stroke.size || 3);
          const steps = 16;
          for (let i = 0; i < steps; i += 1) {
            const a = (i / steps) * Math.PI * 2;
            ctx.drawImage(s, Math.cos(a) * size, Math.sin(a) * size);
          }
        }
      }
      renderLayerContent(ctx, l);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Cuit la transformation transitoire d'un calque raster dans ses pixels
      (nouveau canvas englobant, centre conservé). */
  function bakeTransform(l) {
    const t = l.tx;
    if (!t || l.kind !== 'raster') return;
    const w0 = l.canvas.width;
    const h0 = l.canvas.height;
    const cx = l.x + w0 / 2;
    const cy = l.y + h0 / 2;
    const cos = Math.abs(Math.cos(t.rot));
    const sin = Math.abs(Math.sin(t.rot));
    const sw = Math.abs(w0 * t.sx);
    const sh = Math.abs(h0 * t.sy);
    const bw = Math.max(1, Math.ceil(sw * cos + sh * sin));
    const bh = Math.max(1, Math.ceil(sw * sin + sh * cos));
    const nc = createCanvas(bw, bh);
    const ctx = nc.getContext('2d');
    ctx.save(); // la transformation ne doit pas rester sur le contexte :
    ctx.translate(bw / 2, bh / 2); // les dessins suivants (gomme, pinceau…)
    ctx.rotate(t.rot); // seraient déplacés et mis à l'échelle avec elle
    ctx.scale(t.sx, t.sy);
    ctx.drawImage(l.canvas, -w0 / 2, -h0 / 2);
    ctx.restore();
    l.canvas = nc;
    l.x = Math.round(cx - bw / 2);
    l.y = Math.round(cy - bh / 2);
    l.tx = null;
  }

  /** Taille « naturelle » (non transformée) d'un calque. */
  function layerNaturalSize(l) {
    if (l.kind === 'raster') return { w: l.canvas.width, h: l.canvas.height };
    return { w: l.w, h: l.h };
  }

  /* ---------- Opérations sur le document ---------- */

  /** Redimensionne le document et tous ses calques (rééchantillonnage). */
  function resizeDoc(doc, nw, nh) {
    const fx = nw / doc.width;
    const fy = nh / doc.height;
    for (const l of doc.layers) {
      if (l.tx) bakeTransform(l);
      if (l.kind === 'raster') {
        const cw = Math.max(1, Math.round(l.canvas.width * fx));
        const ch = Math.max(1, Math.round(l.canvas.height * fy));
        const nc = createCanvas(cw, ch);
        nc.getContext('2d').drawImage(l.canvas, 0, 0, cw, ch);
        l.canvas = nc;
      } else {
        l.fontSize = Math.max(1, l.fontSize * fy);
        refreshTextLayer(l);
      }
      l.x = Math.round(l.x * fx);
      l.y = Math.round(l.y * fy);
    }
    doc.width = Math.max(1, Math.round(nw));
    doc.height = Math.max(1, Math.round(nh));
  }

  /** Rotation de la toile par quart de tour (dir = 1 : horaire). */
  function rotateDocQuarter(doc, dir) {
    for (const l of doc.layers) {
      if (l.tx) bakeTransform(l);
      if (l.kind === 'raster') {
        const w0 = l.canvas.width;
        const h0 = l.canvas.height;
        const nc = createCanvas(h0, w0);
        const ctx = nc.getContext('2d');
        ctx.translate(h0 / 2, w0 / 2);
        ctx.rotate((dir * Math.PI) / 2);
        ctx.drawImage(l.canvas, -w0 / 2, -h0 / 2);
        const nx = dir === 1 ? doc.height - (l.y + h0) : l.y;
        const ny = dir === 1 ? l.x : doc.width - (l.x + w0);
        l.canvas = nc;
        l.x = nx;
        l.y = ny;
      } else {
        const nx = dir === 1 ? doc.height - (l.y + l.h) : l.y;
        const ny = dir === 1 ? l.x : doc.width - (l.x + l.w);
        l.x = Math.round(nx);
        l.y = Math.round(ny);
      }
    }
    const t = doc.width;
    doc.width = doc.height;
    doc.height = t;
  }

  /** Miroir des pixels d'un canvas. */
  function flipCanvas(canvas, horizontal) {
    const nc = createCanvas(canvas.width, canvas.height);
    const ctx = nc.getContext('2d');
    if (horizontal) {
      ctx.scale(-1, 1);
      ctx.drawImage(canvas, -canvas.width, 0);
    } else {
      ctx.scale(1, -1);
      ctx.drawImage(canvas, 0, -canvas.height);
    }
    return nc;
  }

  /** Symétrie du document entier (tous les calques). */
  function flipDoc(doc, horizontal) {
    for (const l of doc.layers) {
      if (l.tx) bakeTransform(l);
      if (l.kind === 'raster') {
        l.canvas = flipCanvas(l.canvas, horizontal);
        if (horizontal) l.x = doc.width - (l.x + l.canvas.width);
        else l.y = doc.height - (l.y + l.canvas.height);
      } else if (horizontal) {
        l.x = Math.round(doc.width - (l.x + l.w));
      } else {
        l.y = Math.round(doc.height - (l.y + l.h));
      }
    }
  }

  /** Symétrie d'un seul calque raster (sur place). */
  function flipLayer(l, horizontal) {
    if (l.kind !== 'raster') return false;
    if (l.tx) bakeTransform(l);
    l.canvas = flipCanvas(l.canvas, horizontal);
    return true;
  }

  /** Recadre le document sur `rect` (les calques sont simplement décalés). */
  function cropDoc(doc, rect) {
    for (const l of doc.layers) {
      if (l.tx) bakeTransform(l);
      l.x -= Math.round(rect.x);
      l.y -= Math.round(rect.y);
    }
    doc.width = Math.max(1, Math.round(rect.w));
    doc.height = Math.max(1, Math.round(rect.h));
  }

  /** Fusionne le calque `id` avec celui du dessous (rendu composé). */
  function mergeDown(doc, id) {
    const i = doc.layers.findIndex((l) => l.id === id);
    if (i <= 0) return false;
    const upper = doc.layers[i];
    const lower = doc.layers[i - 1];
    if (lower.kind !== 'raster') return false;
    const nc = createCanvas(doc.width, doc.height);
    compositeTo(nc.getContext('2d'), {
      width: doc.width,
      height: doc.height,
      layers: [lower, upper],
      activeLayerId: null,
    });
    lower.canvas = nc;
    lower.x = 0;
    lower.y = 0;
    lower.tx = null;
    lower.opacity = 1;
    lower.blend = 'normal';
    lower.visible = true;
    doc.layers.splice(i, 1);
    doc.activeLayerId = lower.id;
    return true;
  }

  /** Aplatit tous les calques en un seul arrière-plan. */
  function flattenDoc(doc) {
    const merged = flatten(doc);
    const bg = createRasterLayer('Arrière-plan', doc.width, doc.height);
    bg.canvas.getContext('2d').drawImage(merged, 0, 0);
    doc.layers = [bg];
    doc.activeLayerId = bg.id;
  }

  /** Aplatit le document en un canvas (pour l'enregistrement). */
  function flatten(doc) {
    const canvas = createCanvas(doc.width, doc.height);
    compositeTo(canvas.getContext('2d'), doc);
    return canvas;
  }

  /* ---------- Tests de survol ---------- */

  /** Calque le plus haut ayant un pixel opaque (ou une boîte de texte) ici. */
  function layerAtPoint(doc, x, y) {
    for (let i = doc.layers.length - 1; i >= 0; i -= 1) {
      const l = doc.layers[i];
      if (!l.visible || l.opacity <= 0) continue;
      if (l.kind === 'text') {
        if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return l;
        continue;
      }
      // point ramené dans l'espace natif du calque (transformation inversée)
      let px;
      let py;
      if (l.tx) {
        const w0 = l.canvas.width;
        const h0 = l.canvas.height;
        const cx = l.x + w0 / 2;
        const cy = l.y + h0 / 2;
        const cos = Math.cos(l.tx.rot);
        const sin = Math.sin(l.tx.rot);
        const dx = x - cx;
        const dy = y - cy;
        px = Math.round((dx * cos + dy * sin) / (l.tx.sx || 1e-6) + w0 / 2);
        py = Math.round((-dx * sin + dy * cos) / (l.tx.sy || 1e-6) + h0 / 2);
      } else {
        px = Math.round(x - l.x);
        py = Math.round(y - l.y);
      }
      if (px < 0 || py < 0 || px >= l.canvas.width || py >= l.canvas.height) continue;
      const alpha = l.canvas.getContext('2d').getImageData(px, py, 1, 1).data[3];
      if (alpha > 8) return l;
    }
    return null;
  }

  /* ---------- Similarité de couleur (pot de peinture, gomme magique) ---------- */

  /** Masque GRADUÉ (0-255) des pixels de couleur semblable au pixel (x, y).
      Jusqu'à la tolérance (en %), le pixel est pleinement couvert (255) ;
      au-delà, la couverture décroît linéairement jusqu'à ~1,75 × tolérance —
      les pixels de lisière anti-aliasée (mélange objet/fond) sont ainsi
      couverts proportionnellement : pas de halo résiduel, pas de bord crénelé.
      `contiguous` limite à la zone connexe pleinement semblable, élargie de
      ~2 px de dégradé pour attraper la lisière. */
  function floodMask(canvas, x, y, { tolerance = 25, contiguous = true } = {}) {
    const w = canvas.width;
    const h = canvas.height;
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const i0 = (y * w + x) * 4;
    const c0 = d[i0];
    const c1 = d[i0 + 1];
    const c2 = d[i0 + 2];
    const c3 = d[i0 + 3];
    const tFull = Math.round((tolerance / 100) * 255);
    const tEdge = tFull + Math.max(32, Math.round(tFull * 0.75));
    const strength = (i) => {
      const ds = Math.max(
        Math.abs(d[i] - c0),
        Math.abs(d[i + 1] - c1),
        Math.abs(d[i + 2] - c2),
        Math.abs(d[i + 3] - c3)
      );
      if (ds <= tFull) return 255;
      if (ds >= tEdge) return 0;
      return Math.round(255 * (1 - (ds - tFull) / (tEdge - tFull)));
    };
    const mask = new Uint8Array(w * h);
    if (contiguous) {
      const match = (i) => strength(i) === 255;
      const stack = [y * w + x];
      while (stack.length) {
        const seed = stack.pop();
        if (mask[seed] || !match(seed * 4)) continue;
        const sy = (seed / w) | 0;
        let cx = seed % w;
        while (cx > 0 && !mask[sy * w + cx - 1] && match((sy * w + cx - 1) * 4)) cx -= 1;
        let up = false;
        let down = false;
        while (cx < w && !mask[sy * w + cx] && match((sy * w + cx) * 4)) {
          mask[sy * w + cx] = 255;
          if (sy > 0) {
            const i = (sy - 1) * w + cx;
            const m = !mask[i] && match(i * 4);
            if (m && !up) stack.push(i);
            up = m;
          }
          if (sy < h - 1) {
            const i = (sy + 1) * w + cx;
            const m = !mask[i] && match(i * 4);
            if (m && !down) stack.push(i);
            down = m;
          }
          cx += 1;
        }
      }
      // lisière anti-aliasée : ~2 px de couverture dégradée autour de la
      // zone pleine (sinon le liseré de lissage reste en halo)
      for (let pass = 0; pass < 2; pass += 1) {
        const prev = mask.slice();
        for (let yy = 0; yy < h; yy += 1) {
          const row = yy * w;
          for (let xx = 0; xx < w; xx += 1) {
            const p = row + xx;
            if (prev[p] > 0) continue;
            const near =
              (xx > 0 && prev[p - 1] > 0) ||
              (xx < w - 1 && prev[p + 1] > 0) ||
              (yy > 0 && prev[p - w] > 0) ||
              (yy < h - 1 && prev[p + w] > 0);
            if (near) mask[p] = strength(p * 4);
          }
        }
      }
    } else {
      for (let i = 0; i < w * h; i += 1) mask[i] = strength(i * 4);
    }
    return { mask, w, h };
  }

  /** Canvas au gabarit du masque, rempli en `rgb`, alpha = valeur du masque
      (bords dégradés → remplissage et retrait anti-aliasés). */
  function maskToCanvas(mask, w, h, rgb) {
    const out = createCanvas(w, h);
    const octx = out.getContext('2d');
    const od = octx.createImageData(w, h);
    const o = od.data;
    for (let i = 0; i < w * h; i += 1) {
      if (mask[i] > 0) {
        const j = i * 4;
        o[j] = rgb[0];
        o[j + 1] = rgb[1];
        o[j + 2] = rgb[2];
        o[j + 3] = mask[i];
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  /** Remplissage type Photoshop : canvas coloré en `rgb` là où la couleur est
      semblable au pixel (x, y). */
  function floodFillCanvas(canvas, x, y, rgb, opts) {
    const m = floodMask(canvas, x, y, opts);
    return m ? maskToCanvas(m.mask, m.w, m.h, rgb) : null;
  }

  /** Contour vectoriel d'un masque (suivi d'arêtes, intérieur à gauche) —
      utilisé par la baguette magique pour transformer un masque de pixels en
      chemin de sélection (les trous produisent des boucles opposées, gérées
      par la règle de remplissage nonzero). */
  function maskToPath(mask, w, h, threshold = 128) {
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] >= threshold;
    const key = (x, y) => y * (w + 1) + x;
    const edges = new Map();
    const addEdge = (x1, y1, x2, y2) => {
      const k = key(x1, y1);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push({ x: x2, y: y2, used: false });
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!inside(x, y)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
        if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
        if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
        if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
      }
    }
    if (minX === Infinity) return null;
    const path = new Path2D();
    for (const [k, list] of edges) {
      for (const first of list) {
        if (first.used) continue;
        first.used = true;
        const sx = k % (w + 1);
        const sy = (k / (w + 1)) | 0;
        path.moveTo(sx, sy);
        let cx = first.x;
        let cy = first.y;
        let guard = 0;
        while ((cx !== sx || cy !== sy) && guard < 4000000) {
          path.lineTo(cx, cy);
          const nexts = edges.get(key(cx, cy));
          let next = null;
          if (nexts) {
            for (const e of nexts) {
              if (!e.used) {
                e.used = true;
                next = e;
                break;
              }
            }
          }
          if (!next) break;
          cx = next.x;
          cy = next.y;
          guard += 1;
        }
        path.closePath();
      }
    }
    return { path, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
  }

  /* ---------- Réglages colorimétriques (sur les pixels d'un calque) ---------- */

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  function adjustBrightnessContrast(data, { brightness = 0, contrast = 0 }) {
    const b = (brightness / 100) * 150;
    const c = (contrast / 100) * 200;
    const f = (259 * (c + 255)) / (255 * (259 - c));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp255(f * (data[i] - 128) + 128 + b);
      data[i + 1] = clamp255(f * (data[i + 1] - 128) + 128 + b);
      data[i + 2] = clamp255(f * (data[i + 2] - 128) + 128 + b);
    }
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
  }

  function adjustHueSaturation(data, { hue = 0, saturation = 0, lightness = 0 }) {
    const dh = hue / 360;
    const ds = saturation / 100;
    const dl = lightness / 100;
    for (let i = 0; i < data.length; i += 4) {
      let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      h = (h + dh + 1) % 1;
      s = Math.min(1, Math.max(0, s * (1 + ds)));
      l = dl > 0 ? l + (1 - l) * dl : l + l * dl;
      const [r, g, b] = hslToRgb(h, s, l);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  function adjustLevels(data, { black = 0, white = 255, gamma = 1 }) {
    const range = Math.max(1, white - black);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v += 1) {
      let t = (v - black) / range;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      lut[v] = Math.round(255 * Math.pow(t, 1 / Math.max(0.05, gamma)));
    }
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
  }

  /** Applique une table de correspondance (courbes) aux canaux R, V, B. */
  function applyLut(data, { lut }) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
  }

  function adjustInvert(data) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  function adjustGrayscale(data) {
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }

  /* ---------- Filtres ---------- */

  /** Netteté (laplacien croisé, dosée par `amount` 0-100). */
  function filterSharpen(data, w, h, { amount = 50 }) {
    const a = amount / 100;
    const src = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch += 1) {
          const c = src[i + ch];
          const up = y > 0 ? src[i - w * 4 + ch] : c;
          const dn = y < h - 1 ? src[i + w * 4 + ch] : c;
          const lf = x > 0 ? src[i - 4 + ch] : c;
          const rt = x < w - 1 ? src[i + 4 + ch] : c;
          data[i + ch] = clamp255(c + a * (4 * c - up - dn - lf - rt));
        }
      }
    }
  }

  /** Bruit monochrome uniforme (`amount` 0-100). */
  function filterNoise(data, { amount = 20 }) {
    const a = (amount / 100) * 128;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const n = (Math.random() * 2 - 1) * a;
      data[i] = clamp255(data[i] + n);
      data[i + 1] = clamp255(data[i + 1] + n);
      data[i + 2] = clamp255(data[i + 2] + n);
    }
  }

  /** Flou gaussien via le filtre natif du canvas. */
  function blurCanvas(canvas, radius) {
    const nc = createCanvas(canvas.width, canvas.height);
    const ctx = nc.getContext('2d');
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(canvas, 0, 0);
    return nc;
  }

  /** Pixellisation (sous-échantillonnage puis agrandissement sans lissage). */
  function pixelateCanvas(canvas, size) {
    const w = canvas.width;
    const h = canvas.height;
    const sw = Math.max(1, Math.round(w / size));
    const sh = Math.max(1, Math.round(h / size));
    const small = createCanvas(sw, sh);
    small.getContext('2d').drawImage(canvas, 0, 0, sw, sh);
    const nc = createCanvas(w, h);
    const ctx = nc.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
    return nc;
  }

  /* ---------- Sélection (lasso) ---------- */

  function buildSelection(points) {
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) path.lineTo(points[i].x, points[i].y);
    path.closePath();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { points, path, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  }

  /* ---------- Historique ---------- */

  class History {
    constructor() {
      this.past = [];
      this.future = [];
    }

    push(before) {
      this.past.push(before);
      if (this.past.length > HISTORY_MAX) this.past.shift();
      this.future = [];
    }

    undo(current) {
      const prev = this.past.pop();
      if (!prev) return null;
      this.future.push(current);
      return snapshotDoc(prev); // clone : l'entrée d'historique reste intacte
    }

    redo(current) {
      const next = this.future.pop();
      if (!next) return null;
      this.past.push(current);
      return snapshotDoc(next);
    }

    get canUndo() {
      return this.past.length > 0;
    }

    get canRedo() {
      return this.future.length > 0;
    }
  }

  return {
    TEXT_LINE_HEIGHT,
    BLEND_MODES,
    textFont,
    measureText,
    createCanvas,
    createRasterLayer,
    createTextLayer,
    refreshTextLayer,
    cloneLayer,
    createDocFromImage,
    snapshotDoc,
    findLayer,
    activeLayer,
    addEmptyLayer,
    duplicateLayer,
    removeLayer,
    moveLayerOrder,
    renderTextLayer,
    compositeTo,
    bakeTransform,
    layerNaturalSize,
    resizeDoc,
    rotateDocQuarter,
    flipDoc,
    flipLayer,
    cropDoc,
    mergeDown,
    flattenDoc,
    flatten,
    layerAtPoint,
    floodMask,
    maskToCanvas,
    floodFillCanvas,
    maskToPath,
    adjustBrightnessContrast,
    adjustHueSaturation,
    adjustLevels,
    applyLut,
    adjustInvert,
    adjustGrayscale,
    filterSharpen,
    filterNoise,
    blurCanvas,
    pixelateCanvas,
    buildSelection,
    History,
  };
})();
