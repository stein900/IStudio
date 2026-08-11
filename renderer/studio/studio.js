'use strict';

/**
 * Studio — coquille de l'éditeur de montage (type Photoshop/Photopea).
 *
 * Construit toute son interface dynamiquement (le module n'existe dans le
 * DOM qu'une fois chargé — la visionneuse reste légère), délègue le modèle
 * à StudioCore et les comportements de souris aux outils de StudioTools,
 * et expose la même API que Paint : init({ onSave, onClose }), open(), close().
 */

window.Studio = (() => {
  const C = window.StudioCore;
  const T = window.StudioTools;

  const ICONS = {
    pointer: '<path d="m4 3 7.5 17 2.2-7.3L21 10.5z" />',
    lasso: '<path d="M12 4c5 0 9 2.2 9 5.5S17 15 12 15c-2 0-3.9-.4-5.4-1" /><path d="M3 9.5C3 6.2 7 4 12 4" /><path d="M4.6 12.6A2.4 2.4 0 0 0 3 14.9c0 1.7 1.6 2.4 2.7 3.1 1 .6 1.3 1.6 1.3 3" /><circle cx="5" cy="15" r="2" />',
    dropper: '<path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z" />',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />',
    type: '<polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />',
    back: '<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />',
    undo: '<path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />',
    redo: '<path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />',
    plus: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
    trash: '<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />',
    chevronUp: '<polyline points="6 15 12 9 18 15" />',
    chevronDown: '<polyline points="6 9 12 15 18 9" />',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />',
    textLayer: '<polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />',
  };

  function svgIcon(name, size = 15) {
    return (
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] +
      '</svg>'
    );
  }

  let host = { onSave: null, onClose: null };
  let els = null;
  let S = null; // session (null = fermé)
  let renderQueued = false;
  let antsTimer = null;
  let antsPhase = 0;
  let opacityBefore = null;

  /* ================= Construction de l'interface ================= */

  function buildDom() {
    const root = document.createElement('div');
    root.id = 'studio';
    root.hidden = true;
    root.innerHTML = `
      <header id="studio-topbar">
        <div class="studio-group">
          <button id="studio-close" class="studio-btn">${svgIcon('back', 16)}<span>Retour</span></button>
          <span class="studio-sep"></span>
          <div id="studio-title">
            <span id="studio-title-label">Studio</span>
            <span id="studio-file-name"></span>
          </div>
        </div>
        <div class="studio-group">
          <button id="studio-undo" class="studio-tb" title="Annuler (Ctrl+Z)">${svgIcon('undo')}</button>
          <button id="studio-redo" class="studio-tb" title="Rétablir (Ctrl+Maj+Z)">${svgIcon('redo')}</button>
          <span class="studio-sep"></span>
          <button id="studio-save" class="studio-btn studio-btn-primary" title="Aplatir le montage dans le fichier (Ctrl+S)">${svgIcon('save', 16)}<span>Enregistrer</span></button>
        </div>
      </header>
      <div id="studio-optionsbar"></div>
      <div id="studio-body">
        <nav id="studio-toolbar"></nav>
        <div id="studio-stage">
          <div id="studio-wrap">
            <canvas id="studio-canvas"></canvas>
            <canvas id="studio-overlay"></canvas>
            <textarea id="studio-text-editor" spellcheck="false" placeholder="Texte…" hidden></textarea>
          </div>
        </div>
        <aside id="studio-layers">
          <div id="studio-layers-head">
            <span>${svgIcon('layers', 14)}Calques</span>
            <button id="studio-add-layer" class="studio-tb" title="Nouveau calque vide (au-dessus de l'actif)">${svgIcon('plus', 14)}</button>
          </div>
          <div id="studio-opacity-row">
            <span>Opacité</span>
            <input id="studio-opacity" type="range" min="0" max="100" value="100" />
            <span id="studio-opacity-val">100 %</span>
          </div>
          <ul id="studio-layers-list"></ul>
        </aside>
      </div>
      <footer id="studio-statusbar">
        <span id="studio-status-doc"></span>
        <span id="studio-status-hint"></span>
        <span id="studio-status-layer"></span>
      </footer>
      <div id="studio-brush-popup" hidden>
        <div class="sbp-top">
          <canvas id="sbp-preview" width="72" height="72"></canvas>
          <div class="sbp-sliders">
            <div class="sbp-row"><span class="sbp-lab">Taille :</span><input id="sbp-size" type="range" min="1" max="300" /><span id="sbp-size-val" class="sbp-val"></span></div>
            <div class="sbp-row"><span class="sbp-lab">Dureté :</span><input id="sbp-hardness" type="range" min="0" max="100" /><span id="sbp-hardness-val" class="sbp-val"></span></div>
            <div class="sbp-row"><span class="sbp-lab">Rondeur :</span><input id="sbp-roundness" type="range" min="10" max="100" /><span id="sbp-roundness-val" class="sbp-val"></span></div>
            <div class="sbp-row"><span class="sbp-lab">Angle :</span><input id="sbp-angle" type="range" min="0" max="180" /><span id="sbp-angle-val" class="sbp-val"></span></div>
          </div>
        </div>
        <div class="sbp-presets-head">Default</div>
        <div id="sbp-presets"></div>
      </div>
    `;
    document.body.appendChild(root);

    els = {
      root,
      fileName: root.querySelector('#studio-file-name'),
      btnClose: root.querySelector('#studio-close'),
      btnUndo: root.querySelector('#studio-undo'),
      btnRedo: root.querySelector('#studio-redo'),
      btnSave: root.querySelector('#studio-save'),
      optionsbar: root.querySelector('#studio-optionsbar'),
      toolbar: root.querySelector('#studio-toolbar'),
      stage: root.querySelector('#studio-stage'),
      wrap: root.querySelector('#studio-wrap'),
      canvas: root.querySelector('#studio-canvas'),
      overlay: root.querySelector('#studio-overlay'),
      textEditor: root.querySelector('#studio-text-editor'),
      layersList: root.querySelector('#studio-layers-list'),
      btnAddLayer: root.querySelector('#studio-add-layer'),
      opacity: root.querySelector('#studio-opacity'),
      opacityVal: root.querySelector('#studio-opacity-val'),
      statusDoc: root.querySelector('#studio-status-doc'),
      statusHint: root.querySelector('#studio-status-hint'),
      statusLayer: root.querySelector('#studio-status-layer'),
      brushPopup: root.querySelector('#studio-brush-popup'),
      sbpPreview: root.querySelector('#sbp-preview'),
      sbpSize: root.querySelector('#sbp-size'),
      sbpSizeVal: root.querySelector('#sbp-size-val'),
      sbpHardness: root.querySelector('#sbp-hardness'),
      sbpHardnessVal: root.querySelector('#sbp-hardness-val'),
      sbpRoundness: root.querySelector('#sbp-roundness'),
      sbpRoundnessVal: root.querySelector('#sbp-roundness-val'),
      sbpAngle: root.querySelector('#sbp-angle'),
      sbpAngleVal: root.querySelector('#sbp-angle-val'),
      sbpPresets: root.querySelector('#sbp-presets'),
    };

    // Barre d'outils verticale : construite depuis le registre.
    for (const tool of T.all()) {
      const b = document.createElement('button');
      b.className = 'studio-tool';
      b.dataset.tool = tool.id;
      b.title = tool.label;
      b.innerHTML = svgIcon(tool.icon, 17);
      b.addEventListener('click', () => chooseTool(tool.id));
      els.toolbar.appendChild(b);
    }
    // Pastille de couleur (partagée crayon / texte / pipette) en bas des outils.
    const colorWrap = document.createElement('label');
    colorWrap.id = 'studio-color';
    colorWrap.title = 'Couleur active (cliquer pour choisir)';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = 'studio-color-input';
    colorWrap.appendChild(colorInput);
    els.toolbar.appendChild(colorWrap);
    els.colorInput = colorInput;
    els.colorWrap = colorWrap;
    colorInput.addEventListener('input', () => setColor(colorInput.value));
  }

  /* ================= Rendu ================= */

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (S) renderCanvas();
    });
  }

  function renderCanvas() {
    const ctx = els.canvas.getContext('2d');
    C.compositeTo(ctx, S.doc, { hideLayerId: S.editing && S.editing.layer ? S.editing.layer.id : null });
    renderOverlay();
  }

  function renderOverlay() {
    const ctx = els.overlay.getContext('2d');
    const k = 1 / S.scale;
    ctx.clearRect(0, 0, S.doc.width, S.doc.height);

    if (S.snapGuides) {
      ctx.strokeStyle = '#ff4bd8';
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([]);
      if (S.snapGuides.x) {
        ctx.beginPath();
        ctx.moveTo(S.doc.width / 2, 0);
        ctx.lineTo(S.doc.width / 2, S.doc.height);
        ctx.stroke();
      }
      if (S.snapGuides.y) {
        ctx.beginPath();
        ctx.moveTo(0, S.doc.height / 2);
        ctx.lineTo(S.doc.width, S.doc.height / 2);
        ctx.stroke();
      }
    }

    if (S.lassoPreview && S.lassoPreview.length > 1) {
      ctx.strokeStyle = '#6ea8ff';
      ctx.lineWidth = 1.2 * k;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(S.lassoPreview[0].x, S.lassoPreview[0].y);
      for (const p of S.lassoPreview) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    if (S.selection) {
      // fourmis en marche : deux traits en opposition de phase
      ctx.lineWidth = 1.2 * k;
      ctx.setLineDash([5 * k, 5 * k]);
      ctx.lineDashOffset = -antsPhase * k;
      ctx.strokeStyle = '#000';
      ctx.stroke(S.selection.path);
      ctx.lineDashOffset = -(antsPhase + 5) * k;
      ctx.strokeStyle = '#fff';
      ctx.stroke(S.selection.path);
      ctx.setLineDash([]);
    }

    // cadre de transformation du calque actif (outil Déplacement)
    const frame = activeFrame();
    if (frame && (!S.editing || S.editing.layer !== frame.l)) {
      const hs = 3.5 * k; // demi-côté des poignées
      ctx.strokeStyle = '#6ea8ff';
      ctx.lineWidth = 1.2 * k;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(frame.corners[0].x, frame.corners[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(frame.corners[i].x, frame.corners[i].y);
      ctx.closePath();
      ctx.stroke();
      // lien + poignée de rotation
      ctx.beginPath();
      ctx.moveTo(frame.edges[0].x, frame.edges[0].y);
      ctx.lineTo(frame.rotHandle.x, frame.rotHandle.y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(frame.rotHandle.x, frame.rotHandle.y, 4 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const pt of [...frame.corners, ...frame.edges]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.rect(pt.x - hs, pt.y - hs, hs * 2, hs * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // contour discret du calque texte actif (autres outils)
      const l = C.activeLayer(S.doc);
      if (l && l.kind === 'text' && l.visible && (!S.editing || S.editing.layer !== l)) {
        ctx.strokeStyle = 'rgba(110, 168, 255, 0.65)';
        ctx.lineWidth = 1 * k;
        ctx.setLineDash([4 * k, 3 * k]);
        ctx.strokeRect(l.x, l.y, l.w, l.h);
        ctx.setLineDash([]);
      }
    }
  }

  function startAnts() {
    if (antsTimer) return;
    antsTimer = setInterval(() => {
      if (!S || (!S.selection && !S.lassoPreview)) return;
      antsPhase = (antsPhase + 1) % 10;
      renderOverlay();
    }, 90);
  }

  function stopAnts() {
    if (antsTimer) {
      clearInterval(antsTimer);
      antsTimer = null;
    }
  }

  /* ================= Dimensionnement ================= */

  function layout() {
    if (!S) return;
    const availW = els.stage.clientWidth - 40;
    const availH = els.stage.clientHeight - 40;
    S.scale = Math.min(availW / S.doc.width, availH / S.doc.height, 1);
    const dw = Math.max(1, Math.round(S.doc.width * S.scale));
    const dh = Math.max(1, Math.round(S.doc.height * S.scale));
    els.wrap.style.width = `${dw}px`;
    els.wrap.style.height = `${dh}px`;
    layoutTextEditor();
    requestRender();
  }

  /* ================= Façade éditeur (donnée aux outils) ================= */

  function status(msg) {
    els.statusHint.textContent = msg;
  }

  function setColor(hex) {
    S.color = hex;
    els.colorInput.value = hex;
    els.colorWrap.style.background = hex;
  }

  function sampleColor(p) {
    const x = Math.max(0, Math.min(S.doc.width - 1, Math.round(p.x)));
    const y = Math.max(0, Math.min(S.doc.height - 1, Math.round(p.y)));
    const d = els.canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    if (d[3] === 0) return null; // transparent
    return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Retour visuel de la pipette (barre d'options) : pastille + code hexa. */
  function updatePickerReadout(hex, picked) {
    const swatch = els.optionsbar.querySelector('#studio-picker-swatch');
    const label = els.optionsbar.querySelector('#studio-picker-hex');
    if (!swatch || !label) return;
    if (hex) {
      swatch.style.background = hex;
      label.textContent = hex.toUpperCase();
      swatch.classList.toggle('picked', Boolean(picked));
    } else {
      label.textContent = 'transparent';
    }
  }

  function previewColor(p) {
    updatePickerReadout(sampleColor(p), false);
  }

  function pickColor(p) {
    const hex = sampleColor(p);
    if (!hex) return; // transparent : on garde la couleur courante
    setColor(hex);
    updatePickerReadout(hex, true);
    status(`Couleur prélevée : ${hex.toUpperCase()}`);
  }

  function buildPickerReadout() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const swatch = document.createElement('span');
    swatch.id = 'studio-picker-swatch';
    swatch.style.background = S.color;
    const hex = document.createElement('span');
    hex.id = 'studio-picker-hex';
    hex.textContent = S.color.toUpperCase();
    const hint = document.createElement('span');
    hint.className = 'studio-opt-label';
    hint.textContent = 'sous le curseur';
    box.append(swatch, hex, hint);
    return box;
  }

  function requireRaster() {
    const l = C.activeLayer(S.doc);
    if (!l || l.kind !== 'raster') {
      status('Cet outil agit sur un calque pixel — sélectionnez-en un (pas un calque de texte).');
      return null;
    }
    if (!l.visible) {
      status('Le calque actif est masqué — réaffichez-le pour le modifier.');
      return null;
    }
    return l;
  }

  /* ================= Moteur de brosse =================
     Peinture par estampage : la pointe est un disque à dégradé radial
     (dureté = proportion du rayon pleinement opaque), déformée par la
     rondeur et l'angle, posée à intervalles réguliers le long du geste.
     Le pinceau et la gomme partagent ce moteur et ses réglages. */

  const BRUSH_PRESETS = [
    { hardness: 0, roundness: 100, angle: 0 },
    { hardness: 100, roundness: 100, angle: 0 },
    { hardness: 0, roundness: 100, angle: 0, size: 12 },
    { hardness: 0, roundness: 100, angle: 0, size: 24 },
    { hardness: 100, roundness: 100, angle: 0, size: 12 },
    { hardness: 100, roundness: 100, angle: 0, size: 24 },
    { hardness: 100, roundness: 20, angle: 90, size: 76 },
    { hardness: 0, roundness: 20, angle: 90, size: 80 },
    { hardness: 100, roundness: 15, angle: 105, size: 105 },
    { hardness: 50, roundness: 25, angle: 87, size: 87 },
    { hardness: 100, roundness: 30, angle: 99, size: 99 },
    { hardness: 0, roundness: 35, angle: 100, size: 100 },
  ];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  /** Pointe ronde de base (forme/angle appliqués à l'estampage).
      Chute d'opacité gaussienne : à faible dureté le cœur plein rétrécit et
      le halo s'étend sur presque tout le rayon — brosse réellement douce. */
  function makeTipCanvas(brush, rgb) {
    const d = Math.max(2, Math.ceil(brush.size));
    const tip = C.createCanvas(d, d);
    const ctx = tip.getContext('2d');
    const r = d / 2;
    const hard = Math.min(1, Math.max(0, brush.hardness / 100));
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    if (hard >= 0.99) {
      g.addColorStop(0, `rgba(${rgb},1)`);
      g.addColorStop(0.97, `rgba(${rgb},1)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
    } else {
      const solid = hard * 0.75; // cœur plein réduit → halo plus étendu
      g.addColorStop(0, `rgba(${rgb},1)`);
      g.addColorStop(solid, `rgba(${rgb},1)`);
      const K = 4; // gaussienne normalisée : a(0)=1, a(1)=0
      const norm = 1 - Math.exp(-K);
      const steps = 10;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const a = Math.max(0, (Math.exp(-K * t * t) - Math.exp(-K)) / norm);
        g.addColorStop(Math.min(1, solid + (1 - solid) * t), `rgba(${rgb},${a.toFixed(3)})`);
      }
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, d, d);
    return tip;
  }

  function stampAt(ctx, stroke, x, y) {
    const b = stroke.brush;
    const r = stroke.tip.width / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((b.angle * Math.PI) / 180);
    ctx.scale(1, Math.max(0.1, b.roundness / 100));
    ctx.drawImage(stroke.tip, -r, -r);
    ctx.restore();
  }

  function beginBrushStroke(l, { toolId, erase }) {
    const brush = { ...S.brushes[toolId] };
    const rgb = erase ? '0,0,0' : hexToRgb(S.color);
    const hard = brush.hardness / 100;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    return {
      l,
      erase,
      brush,
      tip: makeTipCanvas(brush, rgb),
      // brosse douce : estampes plus espacées et flux réduit, sinon
      // l'accumulation re-durcit le bord
      spacing: Math.max(0.6, brush.size * (0.12 + 0.18 * (1 - hard))),
      flow: hard >= 0.99 ? 1 : 0.75,
      rest: 0,
      before,
    };
  }

  function brushStampSegment(stroke, a, b) {
    const l = stroke.l;
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    ctx.translate(-l.x, -l.y);
    if (S.selection) ctx.clip(S.selection.path);
    if (stroke.erase) ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = stroke.flow;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      stampAt(ctx, stroke, a.x, a.y);
    } else {
      let t = stroke.rest;
      while (t <= dist) {
        stampAt(ctx, stroke, a.x + (dx * t) / dist, a.y + (dy * t) / dist);
        t += stroke.spacing;
      }
      stroke.rest = t - dist;
    }
    ctx.restore();
    requestRender();
  }

  function endBrushStroke(stroke) {
    commit(stroke.before);
  }

  /* ================= Transformation libre (échelle + rotation) =================
     Avec l'outil Déplacement, le calque actif porte un cadre : 8 poignées
     d'échelle + une poignée de rotation au-dessus. La transformation est
     appliquée en transitoire (l.tx) pendant le geste, puis cuite dans les
     pixels au relâcher. Ctrl+T / Ctrl+Alt+T activent l'outil. */

  let transformGesture = null;

  function layerFrame(l) {
    const { w, h } = C.layerNaturalSize(l);
    const cx = l.x + w / 2;
    const cy = l.y + h / 2;
    const t = l.tx || { sx: 1, sy: 1, rot: 0 };
    const cos = Math.cos(t.rot);
    const sin = Math.sin(t.rot);
    const map = (lx, ly) => ({
      x: cx + lx * t.sx * cos - ly * t.sy * sin,
      y: cy + lx * t.sx * sin + ly * t.sy * cos,
    });
    const corners = [map(-w / 2, -h / 2), map(w / 2, -h / 2), map(w / 2, h / 2), map(-w / 2, h / 2)];
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const edges = [
      mid(corners[0], corners[1]),
      mid(corners[1], corners[2]),
      mid(corners[2], corners[3]),
      mid(corners[3], corners[0]),
    ];
    // poignée de rotation : au-dessus du milieu du bord haut
    const topMid = edges[0];
    const dxn = topMid.x - cx;
    const dyn = topMid.y - cy;
    const len = Math.hypot(dxn, dyn) || 1;
    const off = 26 / S.scale;
    const rotHandle = { x: topMid.x + (dxn / len) * off, y: topMid.y + (dyn / len) * off };
    return { l, w, h, cx, cy, t, corners, edges, rotHandle };
  }

  function activeFrame() {
    if (!S || S.tool !== 'move') return null;
    const l = C.activeLayer(S.doc);
    if (!l || !l.visible) return null;
    return layerFrame(l);
  }

  const CORNER_CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];
  const EDGE_CURSORS = ['ns-resize', 'ew-resize', 'ns-resize', 'ew-resize'];

  function transformHandleAt(p) {
    const f = activeFrame();
    if (!f) return null;
    const tol = 9 / S.scale;
    const near = (pt) => Math.abs(p.x - pt.x) <= tol && Math.abs(p.y - pt.y) <= tol;
    if (near(f.rotHandle)) return { kind: 'rotate', cursor: 'grab' };
    for (let i = 0; i < 4; i += 1) {
      if (near(f.corners[i])) return { kind: 'corner', index: i, cursor: CORNER_CURSORS[i] };
    }
    for (let i = 0; i < 4; i += 1) {
      if (near(f.edges[i])) return { kind: 'edge', index: i, cursor: EDGE_CURSORS[i] };
    }
    return null;
  }

  /** Coordonnées locales (non transformées) d'un point du document. */
  function toLocal(f, p) {
    const dx = p.x - f.cx;
    const dy = p.y - f.cy;
    const cos = Math.cos(f.t.rot);
    const sin = Math.sin(f.t.rot);
    return {
      x: (dx * cos + dy * sin) / (f.t.sx || 1e-6),
      y: (-dx * sin + dy * cos) / (f.t.sy || 1e-6),
    };
  }

  function insideActiveFrame(p) {
    const f = activeFrame();
    if (!f) return false;
    const lp = toLocal(f, p);
    return Math.abs(lp.x) <= f.w / 2 && Math.abs(lp.y) <= f.h / 2;
  }

  function beginTransform(handle, p) {
    const f = activeFrame();
    if (!f) return false;
    if (f.l.kind === 'text' && handle.kind !== 'corner') {
      status('Sur un texte : redimensionnez par les coins (rotation à venir).');
      return false;
    }
    transformGesture = {
      handle,
      f,
      before: C.snapshotDoc(S.doc),
      orig: { ...(f.l.tx || { sx: 1, sy: 1, rot: 0 }) },
      origFont: f.l.kind === 'text' ? f.l.fontSize : 0,
      startAngle: Math.atan2(p.y - f.cy, p.x - f.cx),
      startDist: Math.max(1e-3, Math.hypot(p.x - f.cx, p.y - f.cy)),
      startLocal: toLocal(f, p),
    };
    return true;
  }

  function updateTransform(p, shiftKey) {
    const g = transformGesture;
    if (!g) return;
    const l = g.f.l;

    if (g.handle.kind === 'rotate') {
      let rot = g.orig.rot + (Math.atan2(p.y - g.f.cy, p.x - g.f.cx) - g.startAngle);
      if (shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12); // pas de 15°
      l.tx = { sx: g.orig.sx, sy: g.orig.sy, rot };
    } else if (g.handle.kind === 'corner') {
      const s = Math.hypot(p.x - g.f.cx, p.y - g.f.cy) / g.startDist;
      if (l.kind === 'text') {
        l.fontSize = Math.min(2000, Math.max(4, g.origFont * s));
        C.refreshTextLayer(l);
        l.x = Math.round(g.f.cx - l.w / 2);
        l.y = Math.round(g.f.cy - l.h / 2);
      } else if (shiftKey) {
        // Maj : échelle libre par axe (en espace local)
        const lp = toLocal({ ...g.f, t: { ...g.orig, sx: 1, sy: 1 } }, p);
        const sx = g.startLocal.x * g.orig.sx ? lp.x / (g.startLocal.x * g.orig.sx) : 1;
        const sy = g.startLocal.y * g.orig.sy ? lp.y / (g.startLocal.y * g.orig.sy) : 1;
        l.tx = { sx: clampScale(g.orig.sx * sx), sy: clampScale(g.orig.sy * sy), rot: g.orig.rot };
      } else {
        l.tx = { sx: clampScale(g.orig.sx * s), sy: clampScale(g.orig.sy * s), rot: g.orig.rot };
      }
    } else {
      // bord : échelle sur un seul axe, en espace local
      const lp = toLocal({ ...g.f, t: { ...g.orig, sx: 1, sy: 1 } }, p);
      const horizontal = g.handle.index % 2 === 1; // e / w
      if (horizontal) {
        const ratio = g.startLocal.x * g.orig.sx ? lp.x / (g.startLocal.x * g.orig.sx) : 1;
        l.tx = { sx: clampScale(g.orig.sx * ratio), sy: g.orig.sy, rot: g.orig.rot };
      } else {
        const ratio = g.startLocal.y * g.orig.sy ? lp.y / (g.startLocal.y * g.orig.sy) : 1;
        l.tx = { sx: g.orig.sx, sy: clampScale(g.orig.sy * ratio), rot: g.orig.rot };
      }
    }
    requestRender();
  }

  function clampScale(s) {
    const a = Math.abs(s);
    if (a < 0.02) return s < 0 ? -0.02 : 0.02;
    return s;
  }

  function endTransform() {
    const g = transformGesture;
    transformGesture = null;
    if (!g) return;
    const l = g.f.l;
    // La transformation reste NON destructive (l.tx persiste) : le calque
    // conserve ses pixels natifs — réduire puis ré-agrandir ne floute rien.
    // Elle n'est cuite dans les pixels qu'au moment de peindre dessus.
    if (
      l.tx &&
      Math.abs(l.tx.sx - 1) < 1e-3 &&
      Math.abs(l.tx.sy - 1) < 1e-3 &&
      Math.abs(l.tx.rot) < 1e-3
    ) {
      l.tx = null; // revenu à l'identité : on nettoie
    }
    commit(g.before);
    updateStatus();
  }

  /** Rasterise la transformation avant une opération sur les pixels
      (peinture, gomme, opérations de sélection) — comme Photoshop. */
  function rasterizeIfTransformed(l) {
    if (l.tx) {
      C.bakeTransform(l);
      status('Calque rasterisé (il portait une transformation).');
    }
  }

  /* ================= Recentrage magnétique =================
     Pendant un déplacement, le centre du calque s'aimante sur les axes
     médians du document (guides roses affichés). */

  function applyMoveSnap(l) {
    const { w, h } = C.layerNaturalSize(l);
    const thr = 6 / S.scale;
    const cx = l.x + w / 2;
    const cy = l.y + h / 2;
    const snapX = Math.abs(cx - S.doc.width / 2) <= thr;
    const snapY = Math.abs(cy - S.doc.height / 2) <= thr;
    if (snapX) l.x = Math.round(S.doc.width / 2 - w / 2);
    if (snapY) l.y = Math.round(S.doc.height / 2 - h / 2);
    S.snapGuides = snapX || snapY ? { x: snapX, y: snapY } : null;
  }

  function clearSnapGuides() {
    S.snapGuides = null;
    requestRender();
  }

  /* ================= Style de texte (gras, contour, police) ================= */

  const FONTS = [
    { label: 'Segoe UI', css: '"Segoe UI"' },
    { label: 'Arial', css: 'Arial' },
    { label: 'Verdana', css: 'Verdana' },
    { label: 'Tahoma', css: 'Tahoma' },
    { label: 'Trebuchet MS', css: '"Trebuchet MS"' },
    { label: 'Georgia', css: 'Georgia' },
    { label: 'Times New Roman', css: '"Times New Roman"' },
    { label: 'Courier New', css: '"Courier New"' },
    { label: 'Consolas', css: 'Consolas' },
    { label: 'Impact', css: 'Impact' },
    { label: 'Comic Sans MS', css: '"Comic Sans MS"' },
  ];

  function activeTextLayer() {
    const l = C.activeLayer(S.doc);
    return l && l.kind === 'text' ? l : null;
  }

  let textStyleBefore = null; // instantané en attente pendant un glissement

  /** Applique un changement de style aux nouveaux textes ET au calque texte
      actif. `commitNow` : false pendant un glissement de curseur (l'entrée
      d'historique part au relâcher via commitTextStyle). */
  function applyTextStyle(mutator, commitNow = true) {
    mutator(S.textStyle);
    const l = activeTextLayer();
    if (!l) return;
    if (commitNow) {
      const before = C.snapshotDoc(S.doc);
      mutator(l);
      C.refreshTextLayer(l);
      commit(before);
      layersChanged();
    } else {
      if (!textStyleBefore) textStyleBefore = C.snapshotDoc(S.doc);
      mutator(l);
      C.refreshTextLayer(l);
      requestRender();
    }
  }

  function commitTextStyle() {
    if (textStyleBefore) {
      commit(textStyleBefore);
      textStyleBefore = null;
      layersChanged();
    }
  }

  function buildTextOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';

    // Police
    const select = document.createElement('select');
    select.className = 'studio-font-select';
    select.title = 'Police d’écriture';
    for (const f of FONTS) {
      const opt = document.createElement('option');
      opt.value = f.css;
      opt.textContent = f.label;
      select.appendChild(opt);
    }
    const current = activeTextLayer();
    select.value = current ? current.font : S.textStyle.font;
    if (!select.value) select.value = FONTS[0].css;
    select.addEventListener('change', () => {
      applyTextStyle((t) => {
        t.font = select.value;
      });
    });
    box.appendChild(select);

    // Gras
    const boldBtn = document.createElement('button');
    boldBtn.className = 'studio-bold-btn';
    boldBtn.textContent = 'G';
    boldBtn.title = 'Gras';
    boldBtn.classList.toggle('is-active', current ? current.bold : S.textStyle.bold);
    boldBtn.addEventListener('click', () => {
      const next = !(activeTextLayer() ? activeTextLayer().bold : S.textStyle.bold);
      applyTextStyle((t) => {
        t.bold = next;
      });
      boldBtn.classList.toggle('is-active', next);
    });
    box.appendChild(boldBtn);

    // Corps
    box.appendChild(
      buildSlider({
        label: 'Corps',
        min: 8,
        max: 300,
        value: current ? Math.round(current.fontSize) : S.fontSize,
        unit: 'px',
        onInput: (v) => {
          S.fontSize = v;
          applyTextStyle((t) => {
            if (t.fontSize !== undefined) t.fontSize = v;
          }, false);
        },
      })
    );

    // Contour
    box.appendChild(
      buildSlider({
        label: 'Contour',
        min: 0,
        max: 20,
        value: current ? current.strokeWidth : S.textStyle.strokeWidth,
        unit: 'px',
        onInput: (v) => {
          applyTextStyle((t) => {
            t.strokeWidth = v;
          }, false);
        },
      })
    );
    const strokeColor = document.createElement('input');
    strokeColor.type = 'color';
    strokeColor.className = 'studio-stroke-color';
    strokeColor.title = 'Couleur du contour';
    strokeColor.value = current ? current.strokeColor : S.textStyle.strokeColor;
    strokeColor.addEventListener('input', () => {
      applyTextStyle((t) => {
        t.strokeColor = strokeColor.value;
      }, false);
    });
    strokeColor.addEventListener('change', commitTextStyle);
    box.appendChild(strokeColor);

    // Relâcher un curseur = une entrée d'historique
    box.addEventListener('change', commitTextStyle);
    return box;
  }

  /* ================= Presse-papiers de calque (Ctrl+C / Ctrl+V) ================= */

  let layerClipboard = null;

  function copyActiveLayer() {
    const l = C.activeLayer(S.doc);
    if (!l) return;
    layerClipboard = C.cloneLayer(l);
    status(`Calque « ${l.name} » copié — Ctrl+V pour le coller.`);
  }

  function pasteLayerClipboard() {
    if (!layerClipboard) return false;
    const before = C.snapshotDoc(S.doc);
    const copy = C.cloneLayer(layerClipboard);
    copy.id = crypto.randomUUID();
    copy.name = `${layerClipboard.name} copie`;
    copy.x += 16;
    copy.y += 16;
    const active = C.activeLayer(S.doc);
    S.doc.layers.splice(S.doc.layers.indexOf(active) + 1, 0, copy);
    S.doc.activeLayerId = copy.id;
    commit(before);
    layersChanged();
    status(`Calque « ${copy.name} » collé.`);
    return true;
  }

  /* ---------- Aperçus de pointe ---------- */

  function renderTipPreview(canvas, brush, display) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = Math.max(4, Math.min(display, brush.size));
    const tip = makeTipCanvas({ ...brush, size: s }, '229,229,234');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((brush.angle * Math.PI) / 180);
    ctx.scale(1, Math.max(0.1, brush.roundness / 100));
    ctx.drawImage(tip, -s / 2, -s / 2);
    ctx.restore();
  }

  /* ---------- Popup de réglages de brosse ---------- */

  let brushPopupTool = null;

  function popupBrush() {
    return S && brushPopupTool ? S.brushes[brushPopupTool] : null;
  }

  function syncBrushPopupUI() {
    const b = popupBrush();
    if (!b) return;
    els.sbpSize.value = String(b.size);
    els.sbpSizeVal.textContent = `${b.size} px`;
    els.sbpHardness.value = String(b.hardness);
    els.sbpHardnessVal.textContent = `${b.hardness} %`;
    els.sbpRoundness.value = String(b.roundness);
    els.sbpRoundnessVal.textContent = `${b.roundness} %`;
    els.sbpAngle.value = String(b.angle);
    els.sbpAngleVal.textContent = `${b.angle} °`;
    renderTipPreview(els.sbpPreview, b, 56);
  }

  function openBrushPopup(toolId, x, y) {
    brushPopupTool = toolId;
    syncBrushPopupUI();
    const pop = els.brushPopup;
    pop.hidden = false;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(x, els.root.clientWidth - w - 8))}px`;
    pop.style.top = `${Math.max(8, Math.min(y, els.root.clientHeight - h - 8))}px`;
  }

  function closeBrushPopup() {
    brushPopupTool = null;
    els.brushPopup.hidden = true;
  }

  function initBrushPopup() {
    const bindSlider = (input, valEl, prop, unit) => {
      input.addEventListener('input', () => {
        const b = popupBrush();
        if (!b) return;
        b[prop] = Number(input.value);
        valEl.textContent = `${input.value} ${unit}`;
        renderTipPreview(els.sbpPreview, b, 56);
        updateOptionsBar(); // les curseurs de la barre d'options suivent
      });
    };
    bindSlider(els.sbpSize, els.sbpSizeVal, 'size', 'px');
    bindSlider(els.sbpHardness, els.sbpHardnessVal, 'hardness', '%');
    bindSlider(els.sbpRoundness, els.sbpRoundnessVal, 'roundness', '%');
    bindSlider(els.sbpAngle, els.sbpAngleVal, 'angle', '°');

    for (const preset of BRUSH_PRESETS) {
      const tile = document.createElement('button');
      tile.className = 'sbp-preset';
      tile.title = `Dureté ${preset.hardness} % · rondeur ${preset.roundness} %`;
      const cv = document.createElement('canvas');
      cv.width = 36;
      cv.height = 36;
      renderTipPreview(cv, { size: 26, ...preset }, 26);
      const lab = document.createElement('span');
      lab.textContent = preset.size ? String(preset.size) : '—';
      tile.append(cv, lab);
      tile.addEventListener('click', () => {
        const b = popupBrush();
        if (!b) return;
        b.hardness = preset.hardness;
        b.roundness = preset.roundness;
        b.angle = preset.angle;
        if (preset.size) b.size = preset.size;
        syncBrushPopupUI();
        updateOptionsBar();
      });
      els.sbpPresets.appendChild(tile);
    }

    // Clic hors du popup : fermeture (mais pas sur le bouton qui l'ouvre).
    document.addEventListener('pointerdown', (e) => {
      if (els.brushPopup.hidden) return;
      if (els.brushPopup.contains(e.target) || e.target.closest('.studio-tip-btn')) return;
      closeBrushPopup();
    });
  }

  /* ---------- Barre d'options des outils à brosse ---------- */

  function buildBrushOptions(toolId) {
    const brush = S.brushes[toolId];
    const box = document.createElement('div');
    box.className = 'studio-opt-group';

    const tipBtn = document.createElement('button');
    tipBtn.className = 'studio-tip-btn';
    tipBtn.title = 'Réglages de la brosse (ou clic droit sur la scène)';
    const tipCv = document.createElement('canvas');
    tipCv.width = 30;
    tipCv.height = 30;
    renderTipPreview(tipCv, brush, 24);
    const chev = document.createElement('span');
    chev.className = 'studio-tip-chev';
    chev.innerHTML = svgIcon('chevronDown', 11);
    tipBtn.append(tipCv, chev);
    tipBtn.addEventListener('click', () => {
      if (!els.brushPopup.hidden && brushPopupTool === toolId) {
        closeBrushPopup();
        return;
      }
      const r = tipBtn.getBoundingClientRect();
      openBrushPopup(toolId, r.left, r.bottom + 6);
    });
    box.appendChild(tipBtn);

    box.appendChild(
      buildSlider({
        label: 'Taille',
        min: 1,
        max: 300,
        value: brush.size,
        unit: 'px',
        onInput: (v) => {
          brush.size = v;
          renderTipPreview(tipCv, brush, 24);
          if (brushPopupTool === toolId) syncBrushPopupUI();
        },
      })
    );
    box.appendChild(
      buildSlider({
        label: 'Dureté',
        min: 0,
        max: 100,
        value: brush.hardness,
        unit: '%',
        onInput: (v) => {
          brush.hardness = v;
          renderTipPreview(tipCv, brush, 24);
          if (brushPopupTool === toolId) syncBrushPopupUI();
        },
      })
    );
    return box;
  }

  /* ---------- Import d'images (collage, glisser-déposer) ---------- */

  /** Chaque image importée devient un calque raster indépendant, centré. */
  function importImageBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const before = C.snapshotDoc(S.doc);
      const layer = C.createRasterLayer(name || 'Image importée', img.naturalWidth, img.naturalHeight);
      layer.canvas.getContext('2d').drawImage(img, 0, 0);
      layer.x = Math.round((S.doc.width - img.naturalWidth) / 2);
      layer.y = Math.round((S.doc.height - img.naturalHeight) / 2);
      const active = C.activeLayer(S.doc);
      S.doc.layers.splice(S.doc.layers.indexOf(active) + 1, 0, layer);
      S.doc.activeLayerId = layer.id;
      URL.revokeObjectURL(url);
      commit(before);
      layersChanged();
      chooseTool('move');
      status(`« ${layer.name} » importé sur un nouveau calque — outil Déplacement actif.`);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function onPaste(e) {
    if (!S) return;
    const items = e.clipboardData ? e.clipboardData.items : [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          importImageBlob(f, 'Image collée');
          return;
        }
      }
    }
  }

  function onDrop(e) {
    if (!S) return;
    e.preventDefault();
    const files = [...(e.dataTransfer.files || [])].filter(
      (f) =>
        (f.type && f.type.startsWith('image/')) ||
        /\.(png|jpe?g|jfif|gif|bmp|webp|svg|avif|tiff?)$/i.test(f.name)
    );
    for (const f of files) importImageBlob(f, f.name.replace(/\.[^.]+$/, ''));
  }

  function selectionToLayer(cut) {
    const l = C.activeLayer(S.doc);
    if (!S.selection || !l || l.kind !== 'raster') {
      if (l && l.kind !== 'raster') status('Copier/couper une sélection agit sur un calque pixel.');
      return;
    }
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const nl = C.createRasterLayer(`${l.name} ${cut ? 'découpe' : 'copie'}`, S.doc.width, S.doc.height);
    const nctx = nl.canvas.getContext('2d');
    nctx.save();
    nctx.clip(S.selection.path);
    nctx.drawImage(l.canvas, l.x, l.y);
    nctx.restore();
    if (cut) {
      const sctx = l.canvas.getContext('2d');
      sctx.save();
      sctx.translate(-l.x, -l.y);
      sctx.globalCompositeOperation = 'destination-out';
      sctx.fill(S.selection.path);
      sctx.restore();
    }
    S.doc.layers.splice(S.doc.layers.indexOf(l) + 1, 0, nl);
    S.doc.activeLayerId = nl.id;
    S.selection = null;
    commit(before);
    layersChanged();
    updateOptionsBar();
    status(cut ? 'Zone coupée sur un nouveau calque.' : 'Zone copiée sur un nouveau calque.');
  }

  function eraseSelection() {
    const l = C.activeLayer(S.doc);
    if (!S.selection || !l || l.kind !== 'raster') return;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    ctx.translate(-l.x, -l.y);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(S.selection.path);
    ctx.restore();
    commit(before);
  }

  function deselect() {
    S.selection = null;
    requestRender();
    updateOptionsBar();
  }

  function buildSlider({ label, min, max, value, unit, onInput }) {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const lab = document.createElement('span');
    lab.className = 'studio-opt-label';
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    const val = document.createElement('span');
    val.className = 'studio-opt-value';
    val.textContent = `${value} ${unit}`;
    input.addEventListener('input', () => {
      onInput(Number(input.value));
      val.textContent = `${input.value} ${unit}`;
    });
    box.append(lab, input, val);
    return box;
  }

  const ed = {
    doc: () => S.doc,
    scale: () => S.scale,
    color: () => S.color,
    setColor,
    pickColor,
    previewColor,
    buildPickerReadout,
    setCursor: (cursor) => {
      els.canvas.style.cursor = cursor;
    },
    transformHandleAt,
    insideActiveFrame,
    beginTransform,
    updateTransform,
    endTransform,
    applyMoveSnap,
    clearSnapGuides,
    buildTextOptions,
    fontSize: () => S.fontSize,
    setFontSize: (v) => {
      S.fontSize = v;
    },
    selection: () => S.selection,
    setSelection: (sel) => {
      S.selection = sel;
      requestRender();
    },
    setLassoPreview: (pts) => {
      S.lassoPreview = pts;
      renderOverlay();
    },
    snapshot: () => C.snapshotDoc(S.doc),
    commit,
    requestRender,
    layersChanged,
    updateOptionsBar,
    status,
    requireRaster,
    beginBrushStroke,
    brushStampSegment,
    endBrushStroke,
    buildBrushOptions,
    selectionToLayer,
    eraseSelection,
    deselect,
    startTextEdit,
    buildSlider,
  };

  /* ================= Historique ================= */

  function commit(before) {
    S.history.push(before);
    updateHistoryUI();
    requestRender();
  }

  function undo() {
    const doc = S.history.undo(C.snapshotDoc(S.doc));
    if (!doc) return;
    S.doc = doc;
    S.selection = null;
    updateHistoryUI();
    layersChanged();
    requestRender();
  }

  function redo() {
    const doc = S.history.redo(C.snapshotDoc(S.doc));
    if (!doc) return;
    S.doc = doc;
    S.selection = null;
    updateHistoryUI();
    layersChanged();
    requestRender();
  }

  function updateHistoryUI() {
    els.btnUndo.disabled = !S.history.canUndo;
    els.btnRedo.disabled = !S.history.canRedo;
  }

  /* ================= Outils ================= */

  function currentTool() {
    return T.get(S.tool);
  }

  function chooseTool(id) {
    commitTextEditing();
    closeBrushPopup();
    S.tool = id;
    const tool = currentTool();
    for (const b of els.toolbar.querySelectorAll('.studio-tool')) {
      b.classList.toggle('is-active', b.dataset.tool === id);
    }
    els.canvas.style.cursor = tool.cursor || 'default';
    status(tool.hint || '');
    updateOptionsBar();
    updateStatus();
  }

  function updateOptionsBar() {
    if (!S) return;
    els.optionsbar.innerHTML = '';
    const tool = currentTool();
    const name = document.createElement('span');
    name.className = 'studio-opt-toolname';
    name.innerHTML = svgIcon(tool.icon, 13) + tool.label.split('—')[0].trim();
    els.optionsbar.appendChild(name);
    if (tool.options) {
      els.optionsbar.appendChild(tool.options(ed));
    }
  }

  /* ================= Pointeur ================= */

  function pointerPos(e) {
    const rect = els.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / S.scale,
      y: (e.clientY - rect.top) / S.scale,
    };
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    // empêche le mousedown par défaut de voler le focus (champ de texte)
    e.preventDefault();
    try {
      els.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointeur synthétique (tests)
    }
    commitTextEditing();
    currentTool().onDown(ed, pointerPos(e), e);
  }

  function onPointerMove(e) {
    currentTool().onMove(ed, pointerPos(e), e);
  }

  function onPointerUp(e) {
    currentTool().onUp(ed, pointerPos(e), e);
    updateStatus();
  }

  function onDblClick(e) {
    const tool = currentTool();
    if (tool.onDblClick) tool.onDblClick(ed, pointerPos(e));
  }

  /* ================= Texte ================= */

  function layoutTextEditor() {
    const edp = S && S.editing;
    if (!edp) return;
    const sc = S.scale;
    const m = C.measureText(els.textEditor.value || 'M', edp.fontSize, edp);
    const t = els.textEditor;
    t.style.left = `${edp.x * sc - 4}px`;
    t.style.top = `${edp.y * sc - 3}px`;
    t.style.color = edp.color;
    t.style.fontSize = `${edp.fontSize * sc}px`;
    t.style.fontFamily = edp.font || '"Segoe UI"';
    t.style.fontWeight = edp.bold ? '700' : '500';
    t.style.width = `${m.w * sc + edp.fontSize * sc + 8}px`;
    t.style.height = `${m.h * sc + 8}px`;
  }

  /** Ouvre l'édition d'un calque texte existant, ou une saisie neuve en `pos`. */
  function startTextEdit(layer, pos) {
    commitTextEditing();
    if (layer) {
      S.doc.activeLayerId = layer.id;
      S.editing = {
        layer,
        x: layer.x,
        y: layer.y,
        fontSize: layer.fontSize,
        color: layer.color,
        bold: layer.bold,
        font: layer.font,
        strokeWidth: layer.strokeWidth,
        strokeColor: layer.strokeColor,
      };
      els.textEditor.value = layer.text;
      layersChanged();
    } else {
      S.editing = {
        layer: null,
        x: pos.x,
        y: pos.y,
        fontSize: S.fontSize / S.scale,
        color: S.color,
        bold: S.textStyle.bold,
        font: S.textStyle.font,
        strokeWidth: S.textStyle.strokeWidth,
        strokeColor: S.textStyle.strokeColor,
      };
      els.textEditor.value = '';
    }
    els.textEditor.hidden = false;
    layoutTextEditor();
    // focus différé : le mousedown en cours redonnerait le focus au fond
    setTimeout(() => {
      if (S && S.editing) els.textEditor.focus();
    }, 0);
    requestRender();
  }

  function commitTextEditing() {
    const edp = S && S.editing;
    if (!edp) return;
    S.editing = null;
    els.textEditor.hidden = true;
    const text = els.textEditor.value.replace(/\s+$/, '');

    if (edp.layer) {
      if (!text.trim()) {
        const before = C.snapshotDoc(S.doc);
        C.removeLayer(S.doc, edp.layer.id);
        commit(before);
      } else if (text !== edp.layer.text) {
        const before = C.snapshotDoc(S.doc);
        edp.layer.text = text;
        C.refreshTextLayer(edp.layer);
        commit(before);
      }
      layersChanged();
      requestRender();
      return;
    }

    if (!text.trim()) {
      requestRender();
      return;
    }
    const before = C.snapshotDoc(S.doc);
    const layer = C.createTextLayer({
      text,
      x: edp.x,
      y: edp.y,
      fontSize: edp.fontSize,
      color: edp.color,
      bold: edp.bold,
      font: edp.font,
      strokeWidth: edp.strokeWidth,
      strokeColor: edp.strokeColor,
    });
    S.doc.layers.splice(S.doc.layers.indexOf(C.activeLayer(S.doc)) + 1, 0, layer);
    S.doc.activeLayerId = layer.id;
    commit(before);
    layersChanged();
  }

  /* ================= Panneau des calques ================= */

  function layersChanged() {
    renderLayersPanel();
    updateStatus();
  }

  function renderLayersPanel() {
    els.layersList.innerHTML = '';
    const active = C.activeLayer(S.doc);
    els.opacity.value = String(Math.round((active ? active.opacity : 1) * 100));
    els.opacityVal.textContent = `${els.opacity.value} %`;

    const layers = [...S.doc.layers].reverse(); // premier plan en haut
    layers.forEach((layer, ri) => {
      const isTop = ri === 0;
      const isBottom = ri === layers.length - 1;

      const li = document.createElement('li');
      li.className = 'studio-layer';
      li.classList.toggle('is-active', layer.id === S.doc.activeLayerId);
      li.classList.toggle('is-hidden', !layer.visible);
      li.addEventListener('click', () => {
        S.doc.activeLayerId = layer.id;
        layersChanged();
        requestRender();
      });
      li.addEventListener('dblclick', () => {
        if (layer.kind === 'text') startTextEdit(layer);
      });

      // Réordonnancement par glisser-déposer dans le panneau.
      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/studio-layer', layer.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('text/studio-layer')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = li.getBoundingClientRect();
        const above = e.clientY < r.top + r.height / 2;
        li.classList.toggle('drop-above', above);
        li.classList.toggle('drop-below', !above);
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drop-above', 'drop-below');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        li.classList.remove('drop-above', 'drop-below');
        const srcId = e.dataTransfer.getData('text/studio-layer');
        if (!srcId || srcId === layer.id) return;
        const r = li.getBoundingClientRect();
        reorderLayer(srcId, layer.id, e.clientY < r.top + r.height / 2);
      });

      const eyeBtn = document.createElement('button');
      eyeBtn.className = 'studio-tb';
      eyeBtn.title = layer.visible ? 'Masquer le calque' : 'Afficher le calque';
      eyeBtn.innerHTML = svgIcon(layer.visible ? 'eye' : 'eyeOff', 13);
      eyeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        renderLayersPanel();
        requestRender();
      });

      const kind = document.createElement('span');
      kind.className = 'studio-layer-kind';
      kind.innerHTML = layer.kind === 'text' ? svgIcon('textLayer', 11) : '';

      const name = document.createElement('span');
      name.className = 'studio-layer-name';
      name.textContent = layer.name;
      name.title = layer.kind === 'text' ? 'Calque de texte (double-clic : éditer)' : layer.name;

      const opacity = document.createElement('span');
      opacity.className = 'studio-layer-opacity';
      opacity.textContent = layer.opacity < 1 ? `${Math.round(layer.opacity * 100)} %` : '';

      const tools = document.createElement('span');
      tools.className = 'studio-layer-tools';
      const mk = (icon, title, disabled, fn) => {
        const b = document.createElement('button');
        b.className = 'studio-tb';
        b.title = title;
        b.disabled = disabled;
        b.innerHTML = svgIcon(icon, 13);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        return b;
      };
      tools.append(
        mk('chevronUp', 'Monter (vers le premier plan)', isTop, () => {
          const before = C.snapshotDoc(S.doc);
          if (C.moveLayerOrder(S.doc, layer.id, 1)) {
            commit(before);
            layersChanged();
          }
        }),
        mk('chevronDown', 'Descendre (vers le fond)', isBottom, () => {
          const before = C.snapshotDoc(S.doc);
          if (C.moveLayerOrder(S.doc, layer.id, -1)) {
            commit(before);
            layersChanged();
          }
        }),
        mk('copy', 'Dupliquer le calque', false, () => {
          const before = C.snapshotDoc(S.doc);
          C.duplicateLayer(S.doc, layer.id);
          commit(before);
          layersChanged();
        }),
        mk('trash', 'Supprimer le calque', S.doc.layers.length <= 1, () => {
          const before = C.snapshotDoc(S.doc);
          if (C.removeLayer(S.doc, layer.id)) {
            commit(before);
            layersChanged();
          }
        })
      );

      li.append(eyeBtn, kind, name, opacity, tools);
      els.layersList.appendChild(li);
    });
  }

  /** Déplace `srcId` par rapport à `targetId` ; `abovePanel` = déposé sur la
      moitié haute de la cible (donc au-dessus dans la pile visuelle). */
  function reorderLayer(srcId, targetId, abovePanel) {
    const src = C.findLayer(S.doc, srcId);
    if (!src) return;
    const before = C.snapshotDoc(S.doc);
    S.doc.layers.splice(S.doc.layers.indexOf(src), 1);
    const ti = S.doc.layers.findIndex((l) => l.id === targetId);
    if (ti === -1) {
      S.doc.layers.push(src);
    } else {
      S.doc.layers.splice(abovePanel ? ti + 1 : ti, 0, src);
    }
    S.doc.activeLayerId = src.id;
    commit(before);
    layersChanged();
  }

  function updateStatus() {
    if (!S) return;
    els.statusDoc.textContent = `${S.doc.width} × ${S.doc.height} px · zoom ${Math.round(S.scale * 100)} %`;
    const l = C.activeLayer(S.doc);
    const tool = currentTool();
    els.statusLayer.textContent = `${l ? l.name : '–'} · outil : ${tool ? tool.label.split('—')[0].split('(')[0].trim() : ''}`;
  }

  /* ================= Enregistrement ================= */

  async function save() {
    if (!S || !host.onSave) return;
    commitTextEditing();
    els.btnSave.disabled = true;
    try {
      const ok = await host.onSave(C.flatten(S.doc), S.file);
      if (ok) close(true);
    } finally {
      if (S) els.btnSave.disabled = false;
    }
  }

  /* ================= Clavier ================= */

  function onKeyDown(e) {
    if (!S) return;
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
    } else if ((e.ctrlKey || e.metaKey) && key === 'c') {
      e.preventDefault();
      copyActiveLayer();
    } else if ((e.ctrlKey || e.metaKey) && key === 'v') {
      // calque copié en interne prioritaire ; sinon l'événement « paste »
      // système importera une éventuelle image du presse-papiers
      if (layerClipboard && pasteLayerClipboard()) e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && key === 't') {
      e.preventDefault();
      chooseTool('move');
      status('Transformation : poignées = échelle (Maj = libre), poignée du haut = rotation (Maj = 15°).');
    } else if ((e.ctrlKey || e.metaKey) && key === 'j') {
      e.preventDefault();
      selectionToLayer(false);
    } else if ((e.ctrlKey || e.metaKey) && key === 'd') {
      e.preventDefault();
      deselect();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (S.selection) eraseSelection();
    } else if (e.key === 'Escape') {
      if (!els.brushPopup.hidden) {
        closeBrushPopup();
      } else if (S.lassoPreview) {
        S.lassoPreview = null;
        renderOverlay();
      } else if (S.selection) {
        deselect();
      }
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const tool = T.all().find((t) => t.key === key);
      if (tool) chooseTool(tool.id);
    }
  }

  /* ================= Liaisons ================= */

  function bind() {
    els.btnClose.addEventListener('click', () => {
      if (S && S.history.canUndo && !window.confirm('Fermer sans enregistrer le montage ?')) return;
      close(false);
    });
    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);
    els.btnSave.addEventListener('click', save);
    els.btnAddLayer.addEventListener('click', () => {
      const before = C.snapshotDoc(S.doc);
      C.addEmptyLayer(S.doc);
      commit(before);
      layersChanged();
    });

    els.opacity.addEventListener('input', () => {
      const l = C.activeLayer(S.doc);
      if (!l) return;
      if (!opacityBefore) opacityBefore = C.snapshotDoc(S.doc);
      l.opacity = Number(els.opacity.value) / 100;
      els.opacityVal.textContent = `${els.opacity.value} %`;
      requestRender();
    });
    els.opacity.addEventListener('change', () => {
      if (opacityBefore) {
        commit(opacityBefore);
        opacityBefore = null;
        renderLayersPanel();
      }
    });

    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerup', onPointerUp);
    els.canvas.addEventListener('pointercancel', onPointerUp);
    els.canvas.addEventListener('dblclick', onDblClick);

    // Clic droit sur la scène : réglages de la brosse (pinceau / gomme).
    els.stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (S && (S.tool === 'pencil' || S.tool === 'eraser')) {
        openBrushPopup(S.tool, e.clientX, e.clientY);
      }
    });

    // Import : collage (Ctrl+V) et glisser-déposer d'images → un calque chacun.
    window.addEventListener('paste', onPaste);
    els.stage.addEventListener('dragover', (e) => {
      if (!S) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    els.stage.addEventListener('drop', onDrop);

    els.textEditor.addEventListener('input', layoutTextEditor);
    els.textEditor.addEventListener('blur', () => commitTextEditing());
    els.textEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        commitTextEditing();
      }
      e.stopPropagation();
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', layout);
  }

  /* ================= API ================= */

  function init(callbacks) {
    host = callbacks;
    buildDom();
    bind();
    initBrushPopup();
  }

  function open({ file, img, url }) {
    if (S) return;
    S = {
      file,
      img,
      url,
      doc: C.createDocFromImage(img),
      history: new C.History(),
      tool: 'move',
      color: '#4c8dff',
      brushes: {
        pencil: { size: 12, hardness: 100, roundness: 100, angle: 0 },
        eraser: { size: 40, hardness: 40, roundness: 100, angle: 0 },
      },
      fontSize: 32,
      selection: null,
      lassoPreview: null,
      editing: null,
      scale: 1,
      snapGuides: null,
      textStyle: { font: '"Segoe UI"', bold: false, strokeWidth: 0, strokeColor: '#000000' },
    };

    els.fileName.textContent = file.name;
    els.canvas.width = S.doc.width;
    els.canvas.height = S.doc.height;
    els.overlay.width = S.doc.width;
    els.overlay.height = S.doc.height;
    els.textEditor.hidden = true;
    els.root.hidden = false;
    document.body.classList.add('studio-open');

    setColor(S.color);
    layout();
    chooseTool('move');
    updateHistoryUI();
    layersChanged();
    startAnts();
  }

  function close(saved) {
    if (!S) return;
    closeBrushPopup();
    const url = S.url;
    S = null;
    stopAnts();
    els.root.hidden = true;
    els.textEditor.hidden = true;
    document.body.classList.remove('studio-open');
    if (url) URL.revokeObjectURL(url);
    if (host.onClose) host.onClose(saved);
  }

  function isOpen() {
    return S !== null;
  }

  return { init, open, close, isOpen };
})();
