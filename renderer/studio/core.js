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
  const HISTORY_MAX = 12;
  const TEXT_LINE_HEIGHT = 1.3;

  /* ---------- Texte ---------- */

  const DEFAULT_FONT = '"Segoe UI"';

  function textFont(fontSize, opts = {}) {
    const weight = opts.bold ? 700 : 500;
    const family = opts.font || DEFAULT_FONT;
    return `${weight} ${fontSize}px ${family}, system-ui, sans-serif`;
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
      x: 0,
      y: 0,
      canvas: createCanvas(w, h),
    };
  }

  function createTextLayer({ text, x, y, fontSize, color, bold = false, font = DEFAULT_FONT, strokeWidth = 0, strokeColor = '#000000' }) {
    const opts = { bold, font };
    const m = measureText(text, fontSize, opts);
    return {
      id: crypto.randomUUID(),
      kind: 'text',
      name: text.split('\n')[0].slice(0, 24) || 'Texte',
      visible: true,
      opacity: 1,
      x,
      y,
      text,
      fontSize,
      color,
      bold,
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
    if (l.kind === 'raster') {
      const canvas = createCanvas(l.canvas.width, l.canvas.height);
      canvas.getContext('2d').drawImage(l.canvas, 0, 0);
      return { ...l, canvas, tx: l.tx ? { ...l.tx } : null };
    }
    return { ...l };
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
  }

  /** Compose tous les calques visibles dans `ctx` (taille document).
      Un calque raster peut porter une transformation transitoire `tx`
      ({ sx, sy, rot }, autour de son centre) — utilisée pendant le geste de
      transformation, puis « cuite » dans les pixels au relâcher. */
  function compositeTo(ctx, doc, { hideLayerId = null } = {}) {
    ctx.clearRect(0, 0, doc.width, doc.height);
    for (const l of doc.layers) {
      if (!l.visible || l.opacity <= 0 || l.id === hideLayerId) continue;
      ctx.globalAlpha = l.opacity;
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
    ctx.globalAlpha = 1;
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
    ctx.translate(bw / 2, bh / 2);
    ctx.rotate(t.rot);
    ctx.scale(t.sx, t.sy);
    ctx.drawImage(l.canvas, -w0 / 2, -h0 / 2);
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
    flatten,
    layerAtPoint,
    buildSelection,
    History,
  };
})();
