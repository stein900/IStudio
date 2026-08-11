'use strict';

/**
 * Paint — éditeur d'annotations sur l'image courante de la visionneuse.
 * Port JavaScript du module Paint d'origine (React/TS) : outils de tracé
 * (crayon lissé, ligne, flèche, rectangle, ellipse), texte, calques,
 * sélection avec poignées (déplacement/redimensionnement façon Paint : la
 * forme reste active après son tracé, ancrée dès qu'on en commence une
 * autre), gomme d'objet, annuler/rétablir.
 *
 * Différence majeure avec l'original : la toile n'est pas un papier blanc
 * mais l'image ouverte dans la visionneuse, à sa résolution native. Les
 * formes vivent en pixels image ; l'affichage est mis à l'échelle pour
 * tenir dans la fenêtre. « Enregistrer » aplatit image + calques visibles
 * dans le fichier lui-même.
 */

window.Paint = (() => {
  const HIT_TOLERANCE = 6;
  const HISTORY_MAX = 100;
  const TEXT_LINE_HEIGHT = 1.3;
  const SELECTION_COLOR = '#4c8dff';
  const GRID_COLOR = 'rgba(255, 255, 255, 0.28)';
  const GRID_STEP = 24;

  const PALETTE = ['#ffffff', '#1d1d1f', '#6e6e73', '#4c8dff', '#30b350', '#ff9500', '#ff3b30', '#af52de'];
  const WIDTHS = [2, 3.5, 6];

  const TOOLS = [
    { id: 'select', icon: 'pointer', label: 'Sélectionner / déplacer', key: 'v' },
    { id: 'pen', icon: 'pencil', label: 'Crayon (lissage automatique)', key: 'p' },
    { id: 'line', icon: 'minus', label: 'Ligne', key: 'l' },
    { id: 'arrow', icon: 'arrow', label: 'Flèche', key: 'f' },
    { id: 'rect', icon: 'square', label: 'Rectangle', key: 'r' },
    { id: 'ellipse', icon: 'circle', label: 'Ellipse', key: 'e' },
    { id: 'text', icon: 'type', label: 'Texte (cliquer pour écrire)', key: 't' },
    { id: 'eraser', icon: 'eraser', label: 'Gomme (efface les objets du calque actif)', key: 'g' },
  ];

  /* ---------- Icônes vectorielles ---------- */

  const ICONS = {
    pointer: '<path d="m4 3 7.5 17 2.2-7.3L21 10.5z" />',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />',
    minus: '<line x1="4" y1="19" x2="20" y2="5" />',
    arrow: '<line x1="5" y1="19" x2="19" y2="5" /><polyline points="9 5 19 5 19 15" />',
    square: '<rect x="4" y="4" width="16" height="16" rx="2" />',
    circle: '<circle cx="12" cy="12" r="9" />',
    type: '<polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />',
    back: '<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />',
    undo: '<path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />',
    redo: '<path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />',
    trash: '<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
    check: '<polyline points="20 6 9 17 4 12" />',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />',
    grid: '<circle cx="5" cy="5" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="19" cy="5" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="19" r="1" /><circle cx="12" cy="19" r="1" /><circle cx="19" cy="19" r="1" />',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />',
    sparkles: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />',
    plus: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />',
    chevronUp: '<polyline points="6 15 12 9 18 15" />',
    chevronDown: '<polyline points="6 9 12 15 18 9" />',
  };

  function svgIcon(name, size = 15) {
    return (
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] +
      '</svg>'
    );
  }

  /* ---------- Document (port de doc.ts) ---------- */

  function createLayer(name) {
    return { id: crypto.randomUUID(), name, visible: true };
  }

  function createDoc() {
    return { layers: [createLayer('Calque 1')], shapes: [] };
  }

  function isLayerVisible(doc, layerId) {
    const layer = doc.layers.find((l) => l.id === layerId);
    return layer ? layer.visible : false;
  }

  /** Formes visibles dans l'ordre de rendu (fond → premier plan). */
  function visibleShapes(doc) {
    const out = [];
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      for (const s of doc.shapes) if (s.layerId === layer.id) out.push(s);
    }
    return out;
  }

  /** Formes visibles du premier plan vers le fond (tests de survol). */
  function visibleShapesTopFirst(doc) {
    return visibleShapes(doc).reverse();
  }

  /* ---------- Géométrie (port de geometry.ts) ---------- */

  function shapeBounds(s) {
    switch (s.kind) {
      case 'pen': {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of s.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      case 'text':
        return { x: s.pos.x, y: s.pos.y, w: s.w, h: s.h };
      default:
        return {
          x: Math.min(s.from.x, s.to.x),
          y: Math.min(s.from.y, s.to.y),
          w: Math.abs(s.to.x - s.from.x),
          h: Math.abs(s.to.y - s.from.y),
        };
    }
  }

  function distToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function pointInBounds(p, b, m) {
    return p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m;
  }

  /** Aligne `to` sur les angles à 45° autour de `from` (contrainte Maj). */
  function constrainTo45(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: from.x + len * Math.cos(angle), y: from.y + len * Math.sin(angle) };
  }

  /**
   * La forme est-elle sous le pointeur ? Traits et lignes : proximité du
   * tracé. Formes fermées : l'intérieur si remplies, sinon le contour
   * seulement — on peut ainsi attraper un objet posé DANS un cadre non rempli.
   */
  function hitTest(s, p, tolerance) {
    const t = tolerance + s.style.strokeWidth / 2;
    switch (s.kind) {
      case 'pen': {
        if (s.points.length === 1) {
          return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= t;
        }
        for (let i = 0; i < s.points.length - 1; i += 1) {
          if (distToSegment(p, s.points[i], s.points[i + 1]) <= t) return true;
        }
        return false;
      }
      case 'line':
      case 'arrow':
        return distToSegment(p, s.from, s.to) <= t;
      case 'text':
        return pointInBounds(p, shapeBounds(s), tolerance);
      case 'rect': {
        const b = shapeBounds(s);
        if (s.style.fill) return pointInBounds(p, b, t);
        return pointInBounds(p, b, t) && !pointInBounds(p, b, -t);
      }
      case 'ellipse': {
        const b = shapeBounds(s);
        const rx = Math.max(b.w / 2, 1e-6);
        const ry = Math.max(b.h / 2, 1e-6);
        const nx = (p.x - (b.x + rx)) / rx;
        const ny = (p.y - (b.y + ry)) / ry;
        const r = Math.hypot(nx, ny);
        if (s.style.fill) return r <= 1 + t / Math.min(rx, ry);
        return Math.abs(r - 1) * Math.min(rx, ry) <= t;
      }
      default:
        return false;
    }
  }

  function translateShape(s, dx, dy) {
    switch (s.kind) {
      case 'pen':
        return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
      case 'text':
        return { ...s, pos: { x: s.pos.x + dx, y: s.pos.y + dy } };
      default:
        return {
          ...s,
          from: { x: s.from.x + dx, y: s.from.y + dy },
          to: { x: s.to.x + dx, y: s.to.y + dy },
        };
    }
  }

  const BOX_HANDLES = [
    { id: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
    { id: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
    { id: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
    { id: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
    { id: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
    { id: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
    { id: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
    { id: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
  ];

  function shapeHandles(s) {
    if (s.kind === 'line' || s.kind === 'arrow') {
      return [
        { id: 'start', x: s.from.x, y: s.from.y, cursor: 'move' },
        { id: 'end', x: s.to.x, y: s.to.y, cursor: 'move' },
      ];
    }
    const b = shapeBounds(s);
    // le texte se redimensionne par les coins (échelle uniforme)
    const list = s.kind === 'text' ? BOX_HANDLES.filter((h) => h.id.length === 2) : BOX_HANDLES;
    return list.map((h) => ({ id: h.id, x: b.x + b.w * h.fx, y: b.y + b.h * h.fy, cursor: h.cursor }));
  }

  function handleAt(s, p, tolerance) {
    return (
      shapeHandles(s).find(
        (h) => Math.abs(p.x - h.x) <= tolerance && Math.abs(p.y - h.y) <= tolerance
      ) || null
    );
  }

  /**
   * Redimensionne `orig` (état au DÉBUT du geste — jamais cumulatif, pour
   * éviter toute dérive) en amenant la poignée `handle` sous le pointeur.
   * Croiser une poignée retourne la forme, comme dans Paint.
   */
  function resizeShape(orig, handle, p, shiftKey) {
    if (orig.kind === 'line' || orig.kind === 'arrow') {
      const anchor = handle === 'start' ? orig.to : orig.from;
      const pt = shiftKey ? constrainTo45(anchor, p) : p;
      return handle === 'start' ? { ...orig, from: pt } : { ...orig, to: pt };
    }

    const ob = shapeBounds(orig);
    let x1 = ob.x;
    let y1 = ob.y;
    let x2 = ob.x + ob.w;
    let y2 = ob.y + ob.h;
    if (handle.includes('w')) x1 = p.x;
    if (handle.includes('e')) x2 = p.x;
    if (handle.includes('n')) y1 = p.y;
    if (handle.includes('s')) y2 = p.y;

    if (orig.kind === 'text') {
      // échelle uniforme portée par la taille de police, coin opposé fixe
      const f = Math.max(
        ob.w > 1 ? Math.abs(x2 - x1) / ob.w : 1,
        ob.h > 1 ? Math.abs(y2 - y1) / ob.h : 1
      );
      const fontSize = Math.min(2000, Math.max(4, orig.fontSize * f));
      const applied = fontSize / orig.fontSize;
      const w = ob.w * applied;
      const h = ob.h * applied;
      return {
        ...orig,
        fontSize,
        w,
        h,
        pos: {
          x: handle.includes('w') ? ob.x + ob.w - w : ob.x,
          y: handle.includes('n') ? ob.y + ob.h - h : ob.y,
        },
      };
    }

    if (orig.kind === 'pen') {
      const sx = ob.w > 1e-6 ? (x2 - x1) / ob.w : 1;
      const sy = ob.h > 1e-6 ? (y2 - y1) / ob.h : 1;
      return {
        ...orig,
        points: orig.points.map((pt) => ({
          x: x1 + (pt.x - ob.x) * sx,
          y: y1 + (pt.y - ob.y) * sy,
        })),
      };
    }

    return { ...orig, from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
  }

  /* ---------- Lissage (port de smoothing.ts) ---------- */

  /** Étage temps réel : tire `next` vers `prev` (plus fort = plus amorti). */
  function followPoint(prev, next, strength) {
    const follow = 1 - 0.55 * strength;
    return {
      x: prev.x + (next.x - prev.x) * follow,
      y: prev.y + (next.y - prev.y) * follow,
    };
  }

  function dedupe(points, minDist) {
    if (points.length < 2) return points;
    const out = [points[0]];
    for (const p of points) {
      const last = out[out.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
    }
    const tail = points[points.length - 1];
    const last = out[out.length - 1];
    if (tail !== last && (tail.x !== last.x || tail.y !== last.y)) out.push(tail);
    return out;
  }

  function movingAverage(points, passes) {
    let pts = points;
    for (let pass = 0; pass < passes; pass += 1) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i += 1) {
        out.push({
          x: (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3,
          y: (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3,
        });
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  function perpDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  }

  /** Simplification Ramer-Douglas-Peucker (itérative : pile explicite). */
  function rdp(points, epsilon) {
    if (points.length < 3) return points;
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      let maxDist = 0;
      let index = -1;
      for (let i = first + 1; i < last; i += 1) {
        const d = perpDist(points[i], points[first], points[last]);
        if (d > maxDist) {
          maxDist = d;
          index = i;
        }
      }
      if (index !== -1 && maxDist > epsilon) {
        keep[index] = true;
        stack.push([first, index], [index, last]);
      }
    }
    return points.filter((_, i) => keep[i]);
  }

  /** Pipeline complet appliqué au lâcher du trait (seuils en pixels image). */
  function smoothStroke(points, strength, scaleInv) {
    if (points.length < 3 || strength <= 0) return dedupe(points, 0.75 * scaleInv);
    const passes = Math.round(1 + strength * 3);
    const averaged = movingAverage(dedupe(points, 1.25 * scaleInv), passes);
    return rdp(averaged, (0.35 + strength * 1.4) * scaleInv);
  }

  /* ---------- Rendu (port de render.ts, fond = image) ---------- */

  function textFont(fontSize) {
    return `500 ${fontSize}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  }

  let measurer = null;

  /** Encombrement d'un bloc de texte (multiligne), en pixels image. */
  function measureTextSize(text, fontSize) {
    if (!measurer) measurer = document.createElement('canvas').getContext('2d');
    if (!measurer) return { w: 4, h: fontSize * TEXT_LINE_HEIGHT };
    measurer.font = textFont(fontSize);
    const lines = text.split('\n');
    let w = 4;
    for (const line of lines) w = Math.max(w, measurer.measureText(line).width);
    return { w, h: Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT };
  }

  /** Aplat translucide dérivé de la couleur de trait (formes remplies). */
  function withAlpha(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /** Courbe régulière passant par les points (quadratiques par points milieux). */
  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (let i = 1; i < pts.length - 1; i += 1) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function drawText(ctx, s) {
    ctx.font = textFont(s.fontSize);
    ctx.textBaseline = 'top';
    ctx.fillStyle = s.style.stroke;
    const lineHeight = s.fontSize * TEXT_LINE_HEIGHT;
    const halfLeading = (TEXT_LINE_HEIGHT - 1) * s.fontSize * 0.5;
    s.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, s.pos.x, s.pos.y + halfLeading + i * lineHeight);
    });
  }

  function drawShape(ctx, s) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.style.stroke;
    ctx.fillStyle = s.style.stroke;
    ctx.lineWidth = s.style.strokeWidth;

    switch (s.kind) {
      case 'pen': {
        if (s.points.length === 1) {
          // clic sans mouvement : une pastille
          ctx.beginPath();
          ctx.arc(s.points[0].x, s.points[0].y, s.style.strokeWidth / 2 + 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          tracePath(ctx, s.points);
          ctx.stroke();
        }
        break;
      }
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(s.from.x, s.from.y);
        ctx.lineTo(s.to.x, s.to.y);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const angle = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
        const head = 8 + 2.6 * s.style.strokeWidth;
        // fût raccourci pour ne pas dépasser de la pointe
        ctx.beginPath();
        ctx.moveTo(s.from.x, s.from.y);
        ctx.lineTo(s.to.x - head * 0.6 * Math.cos(angle), s.to.y - head * 0.6 * Math.sin(angle));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.to.x, s.to.y);
        ctx.lineTo(s.to.x - head * Math.cos(angle - 0.42), s.to.y - head * Math.sin(angle - 0.42));
        ctx.lineTo(s.to.x - head * Math.cos(angle + 0.42), s.to.y - head * Math.sin(angle + 0.42));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'rect': {
        const b = shapeBounds(s);
        roundedRect(ctx, b.x, b.y, b.w, b.h, 6);
        if (s.style.fill) {
          ctx.fillStyle = s.style.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
      }
      case 'ellipse': {
        const b = shapeBounds(s);
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        if (s.style.fill) {
          ctx.fillStyle = s.style.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
      }
      case 'text': {
        drawText(ctx, s);
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  /** Contour de sélection + poignées (tailles constantes à l'écran : / scale). */
  function drawSelection(ctx, s, scale) {
    const k = 1 / scale;
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 * k;
    if (s.kind !== 'line' && s.kind !== 'arrow') {
      const b = shapeBounds(s);
      ctx.setLineDash([5 * k, 4 * k]);
      roundedRect(ctx, b.x, b.y, b.w, b.h, 2 * k);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const h of shapeHandles(s)) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.rect(h.x - 3.5 * k, h.y - 3.5 * k, 7 * k, 7 * k);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- État et éléments ---------- */

  let host = { onSave: null };
  let P = null; // session en cours (null = paint fermé)
  let els = null;
  let renderQueued = false;

  function q(id) {
    return document.getElementById(id);
  }

  function grabElements() {
    els = {
      root: q('paint'),
      fileName: q('paint-file-name'),
      tools: q('paint-tools'),
      palette: q('paint-palette'),
      widths: q('paint-widths'),
      smoothing: q('paint-smoothing'),
      btnClose: q('paint-close'),
      btnUndo: q('paint-undo'),
      btnRedo: q('paint-redo'),
      btnClear: q('paint-clear'),
      btnCopy: q('paint-copy'),
      btnSave: q('paint-save'),
      btnGrid: q('paint-grid'),
      btnLayers: q('paint-layers-toggle'),
      stage: q('paint-stage'),
      wrap: q('paint-wrap'),
      canvas: q('paint-canvas'),
      textEditor: q('paint-text-editor'),
      layersPanel: q('paint-layers'),
      layersList: q('paint-layers-list'),
      btnAddLayer: q('paint-add-layer'),
      statusCounts: q('paint-status-counts'),
      statusLayer: q('paint-status-layer'),
    };
  }

  /* ---------- Redessin ---------- */

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (P) renderCanvas();
    });
  }

  function renderCanvas() {
    const ctx = els.canvas.getContext('2d');
    const w = P.img.naturalWidth;
    const h = P.img.naturalHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(P.img, 0, 0);

    if (P.grid) {
      const step = GRID_STEP / P.scale;
      const dot = 0.75 / P.scale;
      ctx.fillStyle = GRID_COLOR;
      for (let x = step; x < w; x += step) {
        for (let y = step; y < h; y += step) {
          ctx.fillRect(x - dot, y - dot, dot * 2, dot * 2);
        }
      }
    }

    const hideId = P.editing ? P.editing.id : null;
    for (const s of visibleShapes(P.doc)) {
      if (s.id !== hideId) drawShape(ctx, s);
    }
    if (P.draft) drawShape(ctx, P.draft);

    const selected = P.selectedId ? P.doc.shapes.find((s) => s.id === P.selectedId) : null;
    if (selected && selected.id !== hideId && isLayerVisible(P.doc, selected.layerId)) {
      drawSelection(ctx, selected, P.scale);
    }
  }

  /* ---------- Mise à jour de l'interface ---------- */

  function updateToolbarUI() {
    for (const b of els.tools.querySelectorAll('button')) {
      b.classList.toggle('is-active', b.dataset.tool === P.tool);
    }
    for (const b of els.palette.querySelectorAll('button[data-color]')) {
      b.classList.toggle('is-active', b.dataset.color === P.stroke);
    }
    for (const b of els.widths.querySelectorAll('button[data-width]')) {
      b.classList.toggle('is-active', Number(b.dataset.width) === P.strokeWidth);
    }
    const fillBtn = els.widths.querySelector('#paint-fill');
    fillBtn.classList.toggle('is-active', P.fillOn);
    fillBtn.querySelector('.paint-fill-dot').style.background = P.fillOn
      ? withAlpha(P.stroke, 0.35)
      : 'transparent';
    els.btnGrid.classList.toggle('is-active', P.grid);
    els.btnLayers.classList.toggle('is-active', P.showLayers);
    els.layersPanel.hidden = !P.showLayers;
    updateHistoryUI();
  }

  function updateHistoryUI() {
    els.btnUndo.disabled = P.past.length === 0;
    els.btnRedo.disabled = P.future.length === 0;
    els.btnClear.disabled = P.doc.shapes.length === 0;
    const exportable = visibleShapes(P.doc).length > 0;
    els.btnSave.disabled = !exportable;
    els.btnCopy.disabled = !exportable;
  }

  function updateStatus() {
    const n = P.doc.shapes.length;
    const l = P.doc.layers.length;
    els.statusCounts.textContent = `${n} objet${n > 1 ? 's' : ''} · ${l} calque${l > 1 ? 's' : ''}`;
    els.statusLayer.textContent = `calque : ${activeLayer().name} · lissage ${Math.round(P.smoothing * 100)} %`;
  }

  /* ---------- Calques ---------- */

  function activeLayer() {
    return (
      P.doc.layers.find((l) => l.id === P.activeLayerId) || P.doc.layers[P.doc.layers.length - 1]
    );
  }

  function renderLayers() {
    els.layersList.innerHTML = '';
    const layers = [...P.doc.layers].reverse();
    layers.forEach((layer, ri) => {
      const count = P.doc.shapes.filter((s) => s.layerId === layer.id).length;
      const isTop = ri === 0;
      const isBottom = ri === layers.length - 1;

      const li = document.createElement('li');
      li.className = 'paint-layer';
      li.classList.toggle('is-active', layer.id === activeLayer().id);
      li.classList.toggle('is-hidden', !layer.visible);
      li.addEventListener('click', () => {
        P.activeLayerId = layer.id;
        renderLayers();
        updateStatus();
      });

      const eyeBtn = document.createElement('button');
      eyeBtn.className = 'paint-tb';
      eyeBtn.title = layer.visible ? 'Masquer le calque' : 'Afficher le calque';
      eyeBtn.innerHTML = svgIcon(layer.visible ? 'eye' : 'eyeOff', 13);
      eyeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        P.doc = {
          ...P.doc,
          layers: P.doc.layers.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
        };
        renderLayers();
        updateHistoryUI();
        requestRender();
      });

      const name = document.createElement('span');
      name.className = 'paint-layer-name';
      name.textContent = layer.name;
      name.title = 'Double-clic pour renommer';
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.value = layer.name;
        input.addEventListener('click', (ev) => ev.stopPropagation());
        const done = (commitName) => {
          if (commitName) {
            const clean = input.value.trim();
            if (clean) {
              P.doc = {
                ...P.doc,
                layers: P.doc.layers.map((l) => (l.id === layer.id ? { ...l, name: clean } : l)),
              };
            }
          }
          renderLayers();
          updateStatus();
        };
        input.addEventListener('blur', () => done(true));
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') done(true);
          if (ev.key === 'Escape') done(false);
          ev.stopPropagation();
        });
        li.replaceChild(input, name);
        input.focus();
        input.select();
      });

      const countEl = document.createElement('span');
      countEl.className = 'paint-layer-count';
      countEl.textContent = count || '';

      const tools = document.createElement('span');
      tools.className = 'paint-layer-tools';

      const upBtn = document.createElement('button');
      upBtn.className = 'paint-tb';
      upBtn.disabled = isTop;
      upBtn.title = 'Monter (vers le premier plan)';
      upBtn.innerHTML = svgIcon('chevronUp', 13);
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveLayer(layer.id, 1);
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'paint-tb';
      downBtn.disabled = isBottom;
      downBtn.title = 'Descendre (vers le fond)';
      downBtn.innerHTML = svgIcon('chevronDown', 13);
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveLayer(layer.id, -1);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'paint-tb';
      delBtn.disabled = P.doc.layers.length <= 1;
      delBtn.title = 'Supprimer le calque';
      delBtn.innerHTML = svgIcon('trash', 13);
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeLayer(layer.id);
      });

      tools.append(upBtn, downBtn, delBtn);
      li.append(eyeBtn, name, countEl, tools);
      els.layersList.appendChild(li);
    });
  }

  function addLayer() {
    const layer = createLayer(`Calque ${P.doc.layers.length + 1}`);
    commit({ ...P.doc, layers: [...P.doc.layers, layer] });
    P.activeLayerId = layer.id;
    renderLayers();
    updateStatus();
  }

  function removeLayer(id) {
    if (P.doc.layers.length <= 1) return;
    const count = P.doc.shapes.filter((s) => s.layerId === id).length;
    if (count > 0 && !window.confirm(`Supprimer le calque et ses ${count} objet(s) ?`)) return;
    const layers = P.doc.layers.filter((l) => l.id !== id);
    commit({ layers, shapes: P.doc.shapes.filter((s) => s.layerId !== id) });
    if (P.activeLayerId === id) P.activeLayerId = layers[layers.length - 1].id;
    const sel = selectedShape();
    if (sel && sel.layerId === id) P.selectedId = null;
    renderLayers();
    updateStatus();
    requestRender();
  }

  function moveLayer(id, dir) {
    const i = P.doc.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= P.doc.layers.length) return;
    const layers = [...P.doc.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    commit({ ...P.doc, layers });
    renderLayers();
    requestRender();
  }

  /** Calque cible d'un nouvel objet — re-affiché s'il était masqué. */
  function ensureDrawableLayer() {
    const layer = activeLayer();
    if (!layer.visible) {
      P.doc = {
        ...P.doc,
        layers: P.doc.layers.map((l) => (l.id === layer.id ? { ...l, visible: true } : l)),
      };
      renderLayers();
    }
    return layer.id;
  }

  /* ---------- Historique ---------- */

  function recordHistory(before) {
    P.past.push(before);
    if (P.past.length > HISTORY_MAX) P.past.shift();
    P.future = [];
    updateHistoryUI();
  }

  function commit(next) {
    recordHistory(P.doc);
    P.doc = next;
    updateHistoryUI();
    updateStatus();
    requestRender();
  }

  function undo() {
    const prev = P.past.pop();
    if (!prev) return;
    P.future.push(P.doc);
    P.doc = prev;
    P.selectedId = null;
    P.fresh = false;
    updateHistoryUI();
    updateStatus();
    renderLayers();
    requestRender();
  }

  function redo() {
    const next = P.future.pop();
    if (!next) return;
    P.past.push(P.doc);
    P.doc = next;
    P.selectedId = null;
    P.fresh = false;
    updateHistoryUI();
    updateStatus();
    renderLayers();
    requestRender();
  }

  /* ---------- Sélection et outils ---------- */

  function selectedShape() {
    return P.selectedId ? P.doc.shapes.find((s) => s.id === P.selectedId) : undefined;
  }

  /** Changer d'outil ancre la forme active : plus aucune sélection ne peut
   * bloquer le dessin (l'outil Sélection, lui, conserve la sélection). */
  function chooseTool(t) {
    P.tool = t;
    P.fresh = false;
    if (t !== 'select') P.selectedId = null;
    updateToolbarUI();
    requestRender();
  }

  function deleteSelected() {
    if (!P.selectedId) return;
    commit({ ...P.doc, shapes: P.doc.shapes.filter((s) => s.id !== P.selectedId) });
    P.selectedId = null;
    P.fresh = false;
    renderLayers();
  }

  /* ---------- Texte ---------- */

  /** Taille de police (px écran) d'un nouveau texte, liée à l'épaisseur. */
  function textSizeFor(strokeWidth) {
    return Math.round(9 + strokeWidth * 2.6);
  }

  function layoutTextEditor() {
    const ed = P.editing;
    if (!ed) return;
    const sc = P.scale;
    const m = measureTextSize(ed.value || 'M', ed.fontSize);
    const t = els.textEditor;
    t.style.left = `${ed.pos.x * sc - 4}px`;
    t.style.top = `${ed.pos.y * sc - 3}px`;
    t.style.color = ed.color;
    t.style.fontSize = `${ed.fontSize * sc}px`;
    t.style.width = `${m.w * sc + ed.fontSize * sc + 8}px`;
    t.style.height = `${m.h * sc + 8}px`;
  }

  function startEditingText(s) {
    P.selectedId = s.id;
    P.activeLayerId = s.layerId;
    P.editing = { id: s.id, pos: s.pos, value: s.text, fontSize: s.fontSize, color: s.style.stroke };
    els.textEditor.value = s.text;
    els.textEditor.hidden = false;
    layoutTextEditor();
    setTimeout(() => {
      if (P && P.editing) els.textEditor.focus();
    }, 0);
    renderLayers();
    requestRender();
  }

  function openNewTextEditor(p) {
    P.editing = {
      id: null,
      pos: p,
      value: '',
      fontSize: textSizeFor(P.strokeWidth) / P.scale,
      color: P.stroke,
    };
    els.textEditor.value = '';
    els.textEditor.hidden = false;
    layoutTextEditor();
    setTimeout(() => {
      if (P && P.editing) els.textEditor.focus();
    }, 0);
  }

  /** Valide la saisie en cours (vide → rien / suppression du bloc édité). */
  function commitTextEditing() {
    const ed = P.editing;
    if (!ed) return;
    P.editing = null; // le blur qui suit ne doit pas re-valider
    els.textEditor.hidden = true;
    const text = ed.value.replace(/\s+$/, '');

    if (ed.id) {
      const existing = P.doc.shapes.find((s) => s.id === ed.id);
      if (!existing || existing.kind !== 'text') return;
      if (!text.trim()) {
        commit({ ...P.doc, shapes: P.doc.shapes.filter((s) => s.id !== ed.id) });
        P.selectedId = null;
      } else if (text !== existing.text) {
        const m = measureTextSize(text, existing.fontSize);
        commit({
          ...P.doc,
          shapes: P.doc.shapes.map((s) =>
            s.id === ed.id ? { ...existing, text, w: m.w, h: m.h } : s
          ),
        });
      } else {
        requestRender();
      }
      renderLayers();
      return;
    }

    if (!text.trim()) {
      requestRender();
      return;
    }
    const m = measureTextSize(text, ed.fontSize);
    const shape = {
      id: crypto.randomUUID(),
      kind: 'text',
      layerId: ensureDrawableLayer(),
      style: { stroke: ed.color, strokeWidth: 1, fill: null },
      pos: ed.pos,
      text,
      fontSize: ed.fontSize,
      w: m.w,
      h: m.h,
    };
    commit({ ...P.doc, shapes: [...P.doc.shapes, shape] });
    P.selectedId = shape.id;
    renderLayers();
  }

  /* ---------- Gestes ---------- */

  function pointerPos(e) {
    return { x: e.offsetX / P.scale, y: e.offsetY / P.scale };
  }

  function tolerance() {
    return HIT_TOLERANCE / P.scale;
  }

  /** La gomme n'efface QUE le calque actif (et seulement s'il est visible). */
  function eraseAt(p) {
    const layerId = activeLayer().id;
    if (!isLayerVisible(P.doc, layerId)) return;
    const shapes = P.doc.shapes.filter(
      (s) => !(s.layerId === layerId && hitTest(s, p, tolerance()))
    );
    if (shapes.length !== P.doc.shapes.length) {
      P.doc = { ...P.doc, shapes };
      requestRender();
    }
  }

  /** Contrainte Maj pendant le tracé : 45° pour les lignes, carré pour les boîtes. */
  function constrainDraw(kind, from, to) {
    if (kind === 'line' || kind === 'arrow') return constrainTo45(from, to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: from.x + side * Math.sign(dx || 1), y: from.y + side * Math.sign(dy || 1) };
  }

  /** La sélection est-elle attrapable ici (corps de la forme) ? Le corps est
   * le tracé lui-même (ou l'intérieur s'il est rempli) ; l'intérieur du cadre
   * complet ne déplace que la forme TOUT JUSTE posée, comme Paint — jamais
   * une sélection plus ancienne, qui volerait les clics du dessin. */
  function grabsSelection(sel, p) {
    return (
      hitTest(sel, p, tolerance()) ||
      (P.tool !== 'select' && P.fresh && pointInBounds(p, shapeBounds(sel), 0))
    );
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    // empêche le mousedown par défaut de voler le focus (saisie de texte)
    e.preventDefault();
    try {
      els.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointeur synthétique (tests) : pas de capture possible
    }
    const p = pointerPos(e);

    // toucher la toile valide la saisie de texte en cours
    commitTextEditing();

    // forme active : poignées (redimensionner) puis corps (déplacer)
    const sel = selectedShape();
    if (sel && P.tool !== 'eraser' && isLayerVisible(P.doc, sel.layerId)) {
      const handle = handleAt(sel, p, 7 / P.scale);
      if (handle) {
        P.gesture = { type: 'resize', before: P.doc, orig: sel, handle: handle.id };
        return;
      }
      if (grabsSelection(sel, p)) {
        P.gesture = { type: 'move', before: P.doc, last: p };
        return;
      }
    }

    if (P.tool === 'select') {
      const hit = visibleShapesTopFirst(P.doc).find((s) => hitTest(s, p, tolerance()));
      P.selectedId = hit ? hit.id : null;
      P.fresh = false;
      if (hit) {
        P.activeLayerId = hit.layerId;
        P.gesture = { type: 'move', before: P.doc, last: p };
        renderLayers();
      }
      requestRender();
      return;
    }
    if (P.tool === 'eraser') {
      P.gesture = { type: 'erase', before: P.doc };
      eraseAt(p);
      return;
    }
    if (P.tool === 'text') {
      P.selectedId = null;
      const hitText = visibleShapesTopFirst(P.doc).find(
        (s) => s.kind === 'text' && hitTest(s, p, tolerance())
      );
      if (hitText) startEditingText(hitText);
      else openNewTextEditor(p);
      requestRender();
      return;
    }

    // outils de tracé : la forme précédente s'ancre, une nouvelle commence
    P.selectedId = null;
    const style = {
      stroke: P.stroke,
      strokeWidth: P.strokeWidth / P.scale,
      fill:
        P.fillOn && (P.tool === 'rect' || P.tool === 'ellipse')
          ? withAlpha(P.stroke, 0.14)
          : null,
    };
    const layerId = ensureDrawableLayer();
    P.draft =
      P.tool === 'pen'
        ? { id: crypto.randomUUID(), kind: 'pen', layerId, style, points: [p] }
        : { id: crypto.randomUUID(), kind: P.tool, layerId, style, from: p, to: p };
    P.gesture = { type: 'draw' };
    requestRender();
  }

  function onPointerMove(e) {
    const g = P.gesture;
    const p = pointerPos(e);

    if (!g) {
      // survol : curseur adapté (poignées, corps déplaçable, outil courant)
      let cursor = P.tool === 'select' ? 'default' : P.tool === 'text' ? 'text' : 'crosshair';
      const sel = selectedShape();
      if (sel && P.tool !== 'eraser' && isLayerVisible(P.doc, sel.layerId)) {
        const handle = handleAt(sel, p, 7 / P.scale);
        if (handle) cursor = handle.cursor;
        else if (grabsSelection(sel, p)) cursor = 'move';
      }
      els.canvas.style.cursor = cursor;
      return;
    }

    if (g.type === 'draw') {
      const d = P.draft;
      if (!d) return;
      if (d.kind === 'pen') {
        // étage temps réel du lissage : le point est tiré vers le précédent
        const last = d.points[d.points.length - 1];
        d.points.push(followPoint(last, p, P.smoothing));
      } else {
        d.to = e.shiftKey ? constrainDraw(d.kind, d.from, p) : p;
      }
      requestRender();
    } else if (g.type === 'move') {
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      g.last = p;
      if (P.selectedId && (dx || dy)) {
        P.doc = {
          ...P.doc,
          shapes: P.doc.shapes.map((s) =>
            s.id === P.selectedId ? translateShape(s, dx, dy) : s
          ),
        };
        requestRender();
      }
    } else if (g.type === 'resize') {
      if (P.selectedId) {
        P.doc = {
          ...P.doc,
          shapes: P.doc.shapes.map((s) =>
            s.id === P.selectedId ? resizeShape(g.orig, g.handle, p, e.shiftKey) : s
          ),
        };
        requestRender();
      }
    } else {
      eraseAt(p);
    }
  }

  function onPointerUp() {
    const g = P.gesture;
    P.gesture = null;
    if (!g) return;

    if (g.type === 'draw') {
      const d = P.draft;
      P.draft = null;
      if (!d) return;
      if (d.kind === 'pen') {
        // étage final du lissage : moyenne glissante + simplification
        const points = smoothStroke(d.points, P.smoothing, 1 / P.scale);
        commit({ ...P.doc, shapes: [...P.doc.shapes, { ...d, points }] });
        renderLayers();
      } else {
        const w = Math.abs(d.to.x - d.from.x);
        const h = Math.abs(d.to.y - d.from.y);
        if ((w >= 3 / P.scale) || (h >= 3 / P.scale)) {
          commit({ ...P.doc, shapes: [...P.doc.shapes, d] });
          P.selectedId = d.id; // la forme reste active : poignées prêtes
          P.fresh = true; // déplaçable par tout son cadre jusqu'à l'ancrage
          renderLayers();
        }
        requestRender(); // tracé avorté : effacer le brouillon affiché
      }
      return;
    }
    // déplacement / redimensionnement / gommage : une entrée d'historique par geste
    if (P.doc !== g.before) {
      recordHistory(g.before);
      if (g.type === 'erase') {
        renderLayers();
        updateStatus();
      }
    }
  }

  function onDoubleClick(e) {
    if (P.tool !== 'select') return;
    const p = pointerPos(e);
    const hitText = visibleShapesTopFirst(P.doc).find(
      (s) => s.kind === 'text' && hitTest(s, p, tolerance())
    );
    if (hitText) startEditingText(hitText);
  }

  /* ---------- Clavier ---------- */

  function onKeyDown(e) {
    if (!P) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      save();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
    } else if (e.key === 'Escape') {
      // ancre la forme active / abandonne le tracé en cours
      P.draft = null;
      P.gesture = null;
      P.selectedId = null;
      P.fresh = false;
      requestRender();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = TOOLS.find((tl) => tl.key === key);
      if (t) chooseTool(t.id);
    }
  }

  /* ---------- Dimensionnement ---------- */

  function layout() {
    if (!P) return;
    const availW = els.stage.clientWidth - 32;
    const availH = els.stage.clientHeight - 32;
    P.scale = Math.min(availW / P.img.naturalWidth, availH / P.img.naturalHeight, 1);
    const dw = Math.max(1, Math.round(P.img.naturalWidth * P.scale));
    const dh = Math.max(1, Math.round(P.img.naturalHeight * P.scale));
    els.wrap.style.width = `${dw}px`;
    els.wrap.style.height = `${dh}px`;
    layoutTextEditor();
    requestRender();
  }

  /* ---------- Aplatissement, enregistrement, copie ---------- */

  function flatten() {
    const canvas = document.createElement('canvas');
    canvas.width = P.img.naturalWidth;
    canvas.height = P.img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(P.img, 0, 0);
    for (const s of visibleShapes(P.doc)) drawShape(ctx, s);
    return canvas;
  }

  async function save() {
    if (!P || els.btnSave.disabled || !host.onSave) return;
    commitTextEditing();
    els.btnSave.disabled = true;
    try {
      const ok = await host.onSave(flatten(), P.file);
      if (ok) close(true);
    } finally {
      if (P) updateHistoryUI();
    }
  }

  async function copyPng() {
    if (!P || els.btnCopy.disabled) return;
    commitTextEditing();
    const blob = await new Promise((resolve) => flatten().toBlob(resolve, 'image/png'));
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      els.btnCopy.classList.add('is-active');
      setTimeout(() => els.btnCopy && els.btnCopy.classList.remove('is-active'), 1200);
    } catch {
      /* presse-papiers indisponible */
    }
  }

  function clearAll() {
    if (!P.doc.shapes.length) return;
    if (!window.confirm('Effacer toutes les annotations (tous les calques) ?')) return;
    commit(createDoc());
    P.selectedId = null;
    P.activeLayerId = P.doc.layers[0].id;
    renderLayers();
  }

  /* ---------- Construction des contrôles ---------- */

  function buildControls() {
    // Outils
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'paint-tb';
      b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key.toUpperCase()})`;
      b.innerHTML = svgIcon(t.icon);
      b.addEventListener('click', () => chooseTool(t.id));
      els.tools.appendChild(b);
    }

    // Palette
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = 'paint-swatch';
      b.dataset.color = c;
      b.title = c;
      b.style.background = c;
      b.addEventListener('click', () => {
        P.stroke = c;
        updateToolbarUI();
      });
      els.palette.appendChild(b);
    }
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'paint-swatch paint-swatch-custom';
    custom.title = 'Couleur personnalisée';
    custom.addEventListener('input', () => {
      P.stroke = custom.value;
      updateToolbarUI();
    });
    els.palette.appendChild(custom);

    // Épaisseurs + remplissage
    for (const w of WIDTHS) {
      const b = document.createElement('button');
      b.className = 'paint-tb';
      b.dataset.width = String(w);
      b.title = `Épaisseur ${w} px (fixe aussi la taille des nouveaux textes)`;
      const dot = document.createElement('span');
      dot.className = 'paint-width-dot';
      dot.style.width = `${w + 3}px`;
      dot.style.height = `${w + 3}px`;
      b.appendChild(dot);
      b.addEventListener('click', () => {
        P.strokeWidth = w;
        updateToolbarUI();
      });
      els.widths.appendChild(b);
    }
    const fill = document.createElement('button');
    fill.className = 'paint-tb';
    fill.id = 'paint-fill';
    fill.title = 'Remplir les rectangles et ellipses (aplat translucide)';
    const fillDot = document.createElement('span');
    fillDot.className = 'paint-fill-dot';
    fill.appendChild(fillDot);
    fill.addEventListener('click', () => {
      P.fillOn = !P.fillOn;
      updateToolbarUI();
    });
    els.widths.appendChild(fill);
  }

  function bindStatic() {
    // Icônes des boutons statiques
    for (const el of els.root.querySelectorAll('[data-icon]')) {
      el.insertAdjacentHTML('afterbegin', svgIcon(el.dataset.icon, Number(el.dataset.iconSize) || 15));
    }

    els.btnClose.addEventListener('click', () => {
      if (P && P.doc.shapes.length > 0 && !window.confirm('Fermer sans enregistrer les annotations ?')) {
        return;
      }
      close(false);
    });
    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);
    els.btnClear.addEventListener('click', clearAll);
    els.btnCopy.addEventListener('click', copyPng);
    els.btnSave.addEventListener('click', save);
    els.btnGrid.addEventListener('click', () => {
      P.grid = !P.grid;
      updateToolbarUI();
      requestRender();
    });
    els.btnLayers.addEventListener('click', () => {
      P.showLayers = !P.showLayers;
      updateToolbarUI();
    });
    els.btnAddLayer.addEventListener('click', addLayer);

    els.smoothing.addEventListener('input', () => {
      P.smoothing = Number(els.smoothing.value) / 100;
      updateStatus();
    });

    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerup', onPointerUp);
    els.canvas.addEventListener('pointercancel', onPointerUp);
    els.canvas.addEventListener('dblclick', onDoubleClick);

    els.textEditor.addEventListener('input', () => {
      if (!P.editing) return;
      P.editing.value = els.textEditor.value;
      layoutTextEditor();
    });
    els.textEditor.addEventListener('blur', () => commitTextEditing());
    els.textEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        commitTextEditing();
        requestRender();
      }
      e.stopPropagation();
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', layout);
  }

  /* ---------- API ---------- */

  function init(callbacks) {
    host = callbacks;
    grabElements();
    buildControls();
    bindStatic();
  }

  /** Ouvre l'éditeur sur une image décodée (élément Image + URL blob). */
  function open({ file, img, url }) {
    if (P) return;
    P = {
      file,
      img,
      url,
      doc: createDoc(),
      tool: 'pen',
      stroke: PALETTE[3],
      strokeWidth: WIDTHS[1],
      fillOn: false,
      smoothing: 0.6,
      grid: false,
      selectedId: null,
      activeLayerId: null,
      editing: null,
      showLayers: false,
      fresh: false,
      draft: null,
      gesture: null,
      past: [],
      future: [],
      scale: 1,
    };
    P.activeLayerId = P.doc.layers[0].id;

    els.fileName.textContent = file.name;
    els.canvas.width = img.naturalWidth;
    els.canvas.height = img.naturalHeight;
    els.smoothing.value = String(Math.round(P.smoothing * 100));
    els.textEditor.hidden = true;
    els.root.hidden = false;
    document.body.classList.add('painting');

    layout();
    updateToolbarUI();
    renderLayers();
    updateStatus();
  }

  function close(saved) {
    if (!P) return;
    const url = P.url;
    P = null;
    els.root.hidden = true;
    els.textEditor.hidden = true;
    document.body.classList.remove('painting');
    if (url) URL.revokeObjectURL(url);
    if (host.onClose) host.onClose(saved);
  }

  function isOpen() {
    return P !== null;
  }

  return { init, open, close, isOpen };
})();
