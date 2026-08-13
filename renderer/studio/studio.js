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
  // i18n : cle = phrase francaise ; les attributs title sont balayes par I18n.apply
  const st = (str, params) => (window.I18n ? window.I18n.t(str, params) : str);

  const ICONS = {
    pointer: '<path d="m4 3 7.5 17 2.2-7.3L21 10.5z" />',
    lasso: '<path d="M12 4c5 0 9 2.2 9 5.5S17 15 12 15c-2 0-3.9-.4-5.4-1" /><path d="M3 9.5C3 6.2 7 4 12 4" /><path d="M4.6 12.6A2.4 2.4 0 0 0 3 14.9c0 1.7 1.6 2.4 2.7 3.1 1 .6 1.3 1.6 1.3 3" /><circle cx="5" cy="15" r="2" />',
    dropper: '<path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z" />',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />',
    bucket: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" /><path d="m5 2 5 5" /><path d="M2 13h15" /><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />',
    selectRect: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3.2 2.6" />',
    selectEllipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="3.2 2.6" />',
    wandSelect: '<path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="m17.8 11.8 1.2 1.2" /><path d="m17.8 6.2 1.2-1.2" /><path d="m12.2 6.2-1.2-1.2" /><path d="m3 21 9-9" />',
    stamp: '<path d="M5 22h14" /><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z" /><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" />',
    gradient: '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15 15 3" /><path d="M7 21 21 7" /><path d="M12.5 21 21 12.5" />',
    droplet: '<path d="M12 2.7 6.8 8.5a7 7 0 1 0 10.4 0Z" /><path d="M9.2 14.2a2.8 2.8 0 0 0 2 2.9" />',
    shapes: '<rect x="3" y="9" width="11" height="11" rx="1.5" /><circle cx="16.8" cy="7" r="4.2" />',
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
    zoomIn: '<circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="11" y1="8" x2="11" y2="14" />',
    zoomOut: '<circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /><line x1="8" y1="11" x2="14" y2="11" />',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />',
    textLayer: '<polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />',
    ruler: '<path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10a1 1 0 0 0 0-1.3Z" /><path d="m7.5 10.5 2 2" /><path d="m10.5 7.5 2 2" /><path d="m13.5 4.5 2 2" /><path d="m4.5 13.5 2 2" />',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" />',
    bandage: '<path d="M18 6a2.83 2.83 0 0 1 4 4l-12 12a2.83 2.83 0 0 1-4-4Z" /><path d="M6 18a2.83 2.83 0 0 1-4-4L14 2a2.83 2.83 0 0 1 4 4Z" /><path d="M10 10h.01" /><path d="M10 14h.01" /><path d="M14 10h.01" /><path d="M14 14h.01" />',
    compass: '<circle cx="12" cy="5" r="2" /><path d="m3 21 8.02-14.26" /><path d="m12.99 6.74 1.93 3.44" /><path d="M19.14 12a10 10 0 0 1-14.28 0" /><path d="m21 21-2.16-3.84" />',
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
  // affichages d'aide (persistés) : distances aux bords, grille du document
  let showDistances = localStorage.getItem('studioShowDist') === 'true';
  let showGrid = localStorage.getItem('studioShowGrid') === 'true';

  /* ================= Construction de l'interface ================= */

  function buildDom() {
    const root = document.createElement('div');
    root.id = 'studio';
    root.hidden = true;
    root.innerHTML = `
      <header id="studio-topbar">
        <div class="studio-group">
          <button id="studio-close" class="studio-btn">${svgIcon('back', 16)}<span data-i18n>Retour</span></button>
          <span class="studio-sep"></span>
          <div id="studio-title">
            <span id="studio-title-label">Studio</span>
            <span id="studio-file-name"></span>
          </div>
          <span class="studio-sep"></span>
          <button class="studio-btn studio-menu-btn" data-menu="image" data-i18n>Image</button>
          <button class="studio-btn studio-menu-btn" data-menu="reglages" data-i18n>Réglages</button>
          <button class="studio-btn studio-menu-btn" data-menu="filtres" data-i18n>Filtres</button>
        </div>
        <div class="studio-group">
          <button id="studio-toggle-dist" class="studio-tb" title="Distances du calque sélectionné aux bords du canevas (repères roses)">${svgIcon('ruler')}</button>
          <button id="studio-toggle-grid" class="studio-tb" title="Grille du document">${svgIcon('grid')}</button>
          <span class="studio-sep"></span>
          <button id="studio-undo" class="studio-tb" title="Annuler (Ctrl+Z)">${svgIcon('undo')}</button>
          <button id="studio-redo" class="studio-tb" title="Rétablir (Ctrl+Maj+Z)">${svgIcon('redo')}</button>
          <span class="studio-sep"></span>
          <button id="studio-zoom-out" class="studio-tb" title="Zoom arrière (- ou molette)">${svgIcon('zoomOut')}</button>
          <button id="studio-zoom-label" class="studio-btn" title="Cliquer : 100 % (touche 1)">100 %</button>
          <button id="studio-zoom-in" class="studio-tb" title="Zoom avant (+ ou molette)">${svgIcon('zoomIn')}</button>
          <button id="studio-zoom-fit" class="studio-tb" title="Ajuster à la fenêtre (0)">${svgIcon('fit')}</button>
          <span class="studio-sep"></span>
          <button id="studio-save" class="studio-btn studio-btn-primary" title="Aplatir le montage dans le fichier (Ctrl+S)">${svgIcon('save', 16)}<span data-i18n>Enregistrer</span></button>
        </div>
      </header>
      <div id="studio-optionsbar">
        <div id="studio-opt-tools"></div>
        <div id="studio-info" title="Objet sélectionné — les valeurs sont modifiables (Entrée pour appliquer)">
          <span class="sinf"><span class="sinf-k">X</span><input id="sinf-x" class="sinf-in" type="number" step="1" /></span>
          <span class="sinf"><span class="sinf-k">Y</span><input id="sinf-y" class="sinf-in" type="number" step="1" /></span>
          <span class="sinf"><span class="sinf-k">L</span><input id="sinf-l" class="sinf-in" type="number" step="1" min="1" /></span>
          <span class="sinf"><span class="sinf-k">H</span><input id="sinf-h" class="sinf-in" type="number" step="1" min="1" /></span>
          <span class="sinf" title="Angle de rotation (degrés)"><span class="sinf-k">A</span><input id="sinf-a" class="sinf-in" type="number" step="0.1" /></span>
          <span class="sinf" title="Inclinaison (degrés)"><span class="sinf-k">V</span><input id="sinf-v" class="sinf-in" type="number" step="0.1" /></span>
          <span id="sinf-name">–</span>
        </div>
      </div>
      <div id="studio-body">
        <nav id="studio-toolbar"></nav>
        <div id="studio-stage">
          <div id="studio-wrap">
            <canvas id="studio-canvas"></canvas>
            <canvas id="studio-overlay"></canvas>
            <textarea id="studio-text-editor" spellcheck="false" placeholder="Texte…" hidden></textarea>
          </div>
          <canvas id="studio-hud"></canvas>
        </div>
        <aside id="studio-layers">
          <div id="studio-layers-head">
            <span>${svgIcon('layers', 14)}<span data-i18n>Calques</span></span>
            <button id="studio-add-layer" class="studio-tb" title="Nouveau calque vide (au-dessus de l'actif)">${svgIcon('plus', 14)}</button>
          </div>
          <div id="studio-blend-row">
            <span data-i18n>Fusion</span>
            <select id="studio-blend" title="Mode de fusion du calque actif"></select>
          </div>
          <div id="studio-opacity-row">
            <span data-i18n>Opacité</span>
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
          <canvas id="sbp-preview" width="84" height="84"></canvas>
          <div class="sbp-sliders">
            <div class="sbp-row"><span class="sbp-lab" data-i18n>Taille</span><input id="sbp-size" type="range" min="0" max="1000" /><input id="sbp-size-num" class="sbp-num" type="number" min="1" max="1000" step="1" /><span class="sbp-unit">px</span></div>
            <div class="sbp-row"><span class="sbp-lab" data-i18n>Dureté</span><input id="sbp-hardness" type="range" min="0" max="100" /><input id="sbp-hardness-num" class="sbp-num" type="number" min="0" max="100" step="1" /><span class="sbp-unit">%</span></div>
            <div class="sbp-row"><span class="sbp-lab" data-i18n>Rondeur</span><input id="sbp-roundness" type="range" min="10" max="100" /><input id="sbp-roundness-num" class="sbp-num" type="number" min="10" max="100" step="1" /><span class="sbp-unit">%</span></div>
            <div class="sbp-row"><span class="sbp-lab" data-i18n>Angle</span><input id="sbp-angle" type="range" min="0" max="180" /><input id="sbp-angle-num" class="sbp-num" type="number" min="0" max="180" step="1" /><span class="sbp-unit">°</span></div>
          </div>
        </div>
        <div class="sbp-presets-head">Default</div>
        <div id="sbp-presets"></div>
      </div>
      <div id="studio-menu-popup" hidden></div>
      <div id="studio-modal-backdrop" hidden>
        <div id="studio-modal">
          <div id="studio-modal-title"></div>
          <div id="studio-modal-fields"></div>
          <div id="studio-modal-buttons">
            <button id="studio-modal-cancel" class="studio-btn" data-i18n>Annuler</button>
            <button id="studio-modal-ok" class="studio-btn studio-btn-primary">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    if (window.I18n) window.I18n.apply(root); // traduit titres et textes marques

    els = {
      root,
      fileName: root.querySelector('#studio-file-name'),
      btnClose: root.querySelector('#studio-close'),
      btnUndo: root.querySelector('#studio-undo'),
      btnRedo: root.querySelector('#studio-redo'),
      btnSave: root.querySelector('#studio-save'),
      btnZoomIn: root.querySelector('#studio-zoom-in'),
      btnZoomOut: root.querySelector('#studio-zoom-out'),
      btnZoomFit: root.querySelector('#studio-zoom-fit'),
      zoomLabel: root.querySelector('#studio-zoom-label'),
      optionsbar: root.querySelector('#studio-opt-tools'),
      toolbar: root.querySelector('#studio-toolbar'),
      stage: root.querySelector('#studio-stage'),
      wrap: root.querySelector('#studio-wrap'),
      canvas: root.querySelector('#studio-canvas'),
      overlay: root.querySelector('#studio-overlay'),
      hud: root.querySelector('#studio-hud'),
      textEditor: root.querySelector('#studio-text-editor'),
      layersList: root.querySelector('#studio-layers-list'),
      btnAddLayer: root.querySelector('#studio-add-layer'),
      opacity: root.querySelector('#studio-opacity'),
      opacityVal: root.querySelector('#studio-opacity-val'),
      infX: root.querySelector('#sinf-x'),
      infY: root.querySelector('#sinf-y'),
      infL: root.querySelector('#sinf-l'),
      infH: root.querySelector('#sinf-h'),
      infA: root.querySelector('#sinf-a'),
      infV: root.querySelector('#sinf-v'),
      infName: root.querySelector('#sinf-name'),
      toggleDist: root.querySelector('#studio-toggle-dist'),
      toggleGrid: root.querySelector('#studio-toggle-grid'),
      statusDoc: root.querySelector('#studio-status-doc'),
      statusHint: root.querySelector('#studio-status-hint'),
      statusLayer: root.querySelector('#studio-status-layer'),
      brushPopup: root.querySelector('#studio-brush-popup'),
      sbpPreview: root.querySelector('#sbp-preview'),
      sbpSize: root.querySelector('#sbp-size'),
      sbpSizeNum: root.querySelector('#sbp-size-num'),
      sbpHardness: root.querySelector('#sbp-hardness'),
      sbpHardnessNum: root.querySelector('#sbp-hardness-num'),
      sbpRoundness: root.querySelector('#sbp-roundness'),
      sbpRoundnessNum: root.querySelector('#sbp-roundness-num'),
      sbpAngle: root.querySelector('#sbp-angle'),
      sbpAngleNum: root.querySelector('#sbp-angle-num'),
      sbpPresets: root.querySelector('#sbp-presets'),
      blend: root.querySelector('#studio-blend'),
      menuPopup: root.querySelector('#studio-menu-popup'),
      modalBackdrop: root.querySelector('#studio-modal-backdrop'),
      modalTitle: root.querySelector('#studio-modal-title'),
      modalFields: root.querySelector('#studio-modal-fields'),
      modalOk: root.querySelector('#studio-modal-ok'),
      modalCancel: root.querySelector('#studio-modal-cancel'),
    };

    for (const mode of C.BLEND_MODES) {
      const opt = document.createElement('option');
      opt.value = mode.value;
      opt.textContent = st(mode.label);
      els.blend.appendChild(opt);
    }

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
    // Seconde couleur (dégradés, permutation avec X)
    const colorWrap2 = document.createElement('label');
    colorWrap2.id = 'studio-color2';
    colorWrap2.title = 'Seconde couleur (X : permuter avec la couleur active)';
    const colorInput2 = document.createElement('input');
    colorInput2.type = 'color';
    colorWrap2.appendChild(colorInput2);
    els.toolbar.appendChild(colorWrap2);
    els.colorInput2 = colorInput2;
    els.colorWrap2 = colorWrap2;
    colorInput2.addEventListener('input', () => setColor2(colorInput2.value));
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
    drawHud();
    updateInfoBar();
  }

  function renderOverlay() {
    const ctx = els.overlay.getContext('2d');
    const k = 1 / S.scale;
    ctx.clearRect(0, 0, S.doc.width, S.doc.height);

    if (S.snapGuides) {
      ctx.strokeStyle = '#ff4bd8';
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([]);
      const vLine = (x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, S.doc.height);
        ctx.stroke();
      };
      const hLine = (y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(S.doc.width, y);
        ctx.stroke();
      };
      if (S.snapGuides.x) vLine(S.doc.width / 2);
      if (S.snapGuides.y) hLine(S.doc.height / 2);
      for (const x of S.snapGuides.vs || []) vLine(x);
      for (const y of S.snapGuides.hs || []) hLine(y);
    }

    if (S.selDraft) {
      const { a, b, kind } = S.selDraft;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.strokeStyle = '#6ea8ff';
      ctx.lineWidth = 1.2 * k;
      ctx.setLineDash([4 * k, 3 * k]);
      if (kind === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, w, h);
      }
      ctx.setLineDash([]);
    }

    if (S.shapeDraft) {
      drawShape(ctx, S.shape.kind, S.shapeDraft.a, S.shapeDraft.b, {
        fill: S.shape.fill,
        width: S.shape.width,
        color: S.color,
      });
    }

    if (S.gradientPreview) {
      const { a, b } = S.gradientPreview;
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5 * k;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = 1.2 * k;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      for (const pt of [a, b]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
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

    // aperçu du correcteur de tons directs : voile blanc sur la zone peinte
    if (S.healPreview) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(S.healPreview.mask, S.healPreview.l.x, S.healPreview.l.y);
      ctx.restore();
    }

    // NB : le cadre de transformation est dessiné sur le HUD (résolution
    // écran, non rogné par le canevas) — voir drawTransformFrameHud.
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

  /* ================= Dimensionnement & zoom =================
     S.zoom = null : la vue s'ajuste à la fenêtre ; sinon échelle choisie
     (molette centrée sur le curseur, boutons, touches + - 0 1), de 2 % à
     3200 % — au-delà de 300 % les pixels sont rendus nets, sans lissage.
     La scène défile (molette-clic ou Espace + glisser pour se déplacer). */

  const ZOOM_MIN = 0.02;
  const ZOOM_MAX = 80;
  const GRID_ZOOM = 16; // grille de pixels à partir de 1600 %
  const RGB_ZOOM = 32; // valeurs R V B dans les pixels à partir de 3200 %

  function layout() {
    if (!S) return;
    const availW = els.stage.clientWidth - 40;
    const availH = els.stage.clientHeight - 40;
    S.fitScale = Math.max(ZOOM_MIN, Math.min(availW / S.doc.width, availH / S.doc.height, 1));
    S.scale = S.zoom === null ? S.fitScale : S.zoom;
    const dw = Math.max(1, Math.round(S.doc.width * S.scale));
    const dh = Math.max(1, Math.round(S.doc.height * S.scale));
    els.wrap.style.width = `${dw}px`;
    els.wrap.style.height = `${dh}px`;
    els.wrap.classList.toggle('pixelated', S.scale >= 3);
    els.zoomLabel.textContent = `${Math.round(S.scale * 100)} %`;
    // HUD : canvas à la résolution de l'écran, calé sur la zone visible
    const dpr = window.devicePixelRatio || 1;
    els.hud.width = Math.max(1, Math.round(els.stage.clientWidth * dpr));
    els.hud.height = Math.max(1, Math.round(els.stage.clientHeight * dpr));
    els.hud.style.width = `${els.stage.clientWidth}px`;
    els.hud.style.height = `${els.stage.clientHeight}px`;
    syncHud();
    layoutTextEditor();
    updateStatus();
    requestRender();
  }

  /** Zoome en gardant le point d'ancrage (client) immobile à l'écran —
      par défaut le centre de la vue. */
  function setZoom(z, anchorX, anchorY) {
    if (!S) return;
    z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (anchorX === undefined) {
      const sr = els.stage.getBoundingClientRect();
      anchorX = sr.left + els.stage.clientWidth / 2;
      anchorY = sr.top + els.stage.clientHeight / 2;
    }
    const rect = els.canvas.getBoundingClientRect();
    const px = (anchorX - rect.left) / S.scale; // point document sous l'ancre
    const py = (anchorY - rect.top) / S.scale;
    S.zoom = z;
    layout();
    const r2 = els.canvas.getBoundingClientRect();
    els.stage.scrollLeft += px * S.scale + r2.left - anchorX;
    els.stage.scrollTop += py * S.scale + r2.top - anchorY;
  }

  function zoomFit() {
    if (!S) return;
    S.zoom = null;
    layout();
  }

  /* ================= HUD (résolution écran) =================
     Canvas posé au-dessus de la scène, net à tout niveau de zoom :
     cercle d'impact du pinceau / de la gomme, grille de pixels au fort
     zoom, et valeurs R V B dans chaque pixel quand on est très près
     (seulement les pixels visibles — aucun coût au zoom courant). */

  function syncHud() {
    if (!S) return;
    // HUD en position fixe calée sur la scène : un enfant transformé
    // gonflerait la zone défilable de la scène (bug de défilement fantôme)
    const sr = els.stage.getBoundingClientRect();
    els.hud.style.left = `${sr.left}px`;
    els.hud.style.top = `${sr.top}px`;
    drawHud();
  }

  function drawHud() {
    if (!S) return;
    const ctx = els.hud.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, els.hud.width, els.hud.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sr = els.stage.getBoundingClientRect();
    const rect = els.canvas.getBoundingClientRect();
    const ox = rect.left - sr.left; // origine du document dans la vue (px écran)
    const oy = rect.top - sr.top;
    const sc = S.scale;

    // pixels du document actuellement visibles
    const x0 = Math.max(0, Math.floor(-ox / sc));
    const y0 = Math.max(0, Math.floor(-oy / sc));
    const x1 = Math.min(S.doc.width, Math.ceil((els.stage.clientWidth - ox) / sc));
    const y1 = Math.min(S.doc.height, Math.ceil((els.stage.clientHeight - oy) / sc));

    // grille du document (commutateur de la barre du haut) : pas adaptatif
    // pour garder au moins ~28 px écran entre deux lignes
    if (showGrid && x1 > x0 && y1 > y0) {
      const steps = [5, 10, 25, 50, 100, 250, 500, 1000];
      const minor = steps.find((s) => s * sc >= 28) || 1000;
      const drawLines = (step, style) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
          ctx.moveTo(ox + x * sc, oy + y0 * sc);
          ctx.lineTo(ox + x * sc, oy + y1 * sc);
        }
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
          ctx.moveTo(ox + x0 * sc, oy + y * sc);
          ctx.lineTo(ox + x1 * sc, oy + y * sc);
        }
        ctx.stroke();
      };
      drawLines(minor, 'rgba(130, 150, 200, 0.16)');
      drawLines(minor * 5, 'rgba(130, 150, 200, 0.35)');
    }

    if (sc >= GRID_ZOOM && x1 > x0 && y1 > y0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 1) {
        ctx.moveTo(ox + x * sc, oy + y0 * sc);
        ctx.lineTo(ox + x * sc, oy + y1 * sc);
      }
      for (let y = y0; y <= y1; y += 1) {
        ctx.moveTo(ox + x0 * sc, oy + y * sc);
        ctx.lineTo(ox + x1 * sc, oy + y * sc);
      }
      ctx.stroke();
    }

    if (sc >= RGB_ZOOM && x1 > x0 && y1 > y0) {
      const data = els.canvas.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const fontPx = Math.max(8, Math.min(14, sc / 4.5));
      ctx.font = `500 ${fontPx}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
          if (data[i + 3] === 0) continue; // pixel transparent
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          ctx.fillStyle = lum < 140 ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.8)';
          const px = ox + (x + 0.5) * sc;
          const py = oy + (y + 0.5) * sc;
          ctx.fillText(String(r), px, py - sc * 0.24);
          ctx.fillText(String(g), px, py);
          ctx.fillText(String(b), px, py + sc * 0.24);
        }
      }
    }

    if (showDistances) drawEdgeDistances(ctx, ox, oy, sc);
    drawGuidesHud(ctx, ox, oy, sc);
    drawTransformFrameHud(ctx, ox, oy, sc);

    // cercle d'impact de la brosse (forme réelle : taille, rondeur, angle)
    if (S.cursorPos && S.brushes[S.tool]) {
      const b = S.brushes[S.tool];
      ctx.save();
      ctx.translate(ox + S.cursorPos.x * sc, oy + S.cursorPos.y * sc);
      ctx.rotate((b.angle * Math.PI) / 180);
      ctx.scale(1, Math.max(0.1, b.roundness / 100));
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, (b.size / 2) * sc), 0, Math.PI * 2);
      ctx.restore(); // le tracé garde la forme, l'épaisseur reste constante
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.stroke();
    }
  }

  /* Distances du calque sélectionné aux bords du canevas : repères roses
     type Photoshop, avec l'écart en pixels — dessinés à la résolution écran. */
  function drawEdgeDistances(ctx, ox, oy, sc) {
    const l = C.activeLayer(S.doc);
    if (!l || !l.visible) return;
    const f = layerFrame(l);
    const xs = f.corners.map((c) => c.x);
    const ys = f.corners.map((c) => c.y);
    const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const midX = (bb.x0 + bb.x1) / 2;
    const midY = (bb.y0 + bb.y1) / 2;
    const segs = [
      { d: bb.x0, ax: 0, ay: midY, bx: bb.x0, by: midY }, // gauche
      { d: S.doc.width - bb.x1, ax: bb.x1, ay: midY, bx: S.doc.width, by: midY }, // droite
      { d: bb.y0, ax: midX, ay: 0, bx: midX, by: bb.y0 }, // haut
      { d: S.doc.height - bb.y1, ax: midX, ay: bb.y1, bx: midX, by: S.doc.height }, // bas
    ];
    ctx.save();
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of segs) {
      if (s.d < 0.5) continue; // le calque atteint ou dépasse ce bord
      const x1p = ox + s.ax * sc;
      const y1p = oy + s.ay * sc;
      const x2p = ox + s.bx * sc;
      const y2p = oy + s.by * sc;
      ctx.strokeStyle = '#ff4bd8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x1p, y1p);
      ctx.lineTo(x2p, y2p);
      // taquets perpendiculaires aux extrémités
      const vertical = Math.abs(x2p - x1p) < Math.abs(y2p - y1p);
      const t = 4;
      if (vertical) {
        ctx.moveTo(x1p - t, y1p);
        ctx.lineTo(x1p + t, y1p);
        ctx.moveTo(x2p - t, y2p);
        ctx.lineTo(x2p + t, y2p);
      } else {
        ctx.moveTo(x1p, y1p - t);
        ctx.lineTo(x1p, y1p + t);
        ctx.moveTo(x2p, y2p - t);
        ctx.lineTo(x2p, y2p + t);
      }
      ctx.stroke();
      const label = `${Math.round(s.d)} px`;
      const mx = (x1p + x2p) / 2;
      const my = (y1p + y2p) / 2;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = '#ff4bd8';
      ctx.fillRect(mx - w / 2, my - 9, w, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, mx, my + 0.5);
    }
    ctx.restore();
  }

  /* Cadre de transformation du calque actif, dessiné à la résolution écran
     sur le HUD : il reste visible et manipulable même quand le calque
     déborde du canevas (image plus grande que le document). */
  function drawTransformFrameHud(ctx, ox, oy, sc) {
    const frame = activeFrame();
    const P = (pt) => ({ x: ox + pt.x * sc, y: oy + pt.y * sc });
    if (frame && (!S.editing || S.editing.layer !== frame.l)) {
      const hs = 3.5;
      ctx.strokeStyle = '#6ea8ff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      const c0 = P(frame.corners[0]);
      ctx.moveTo(c0.x, c0.y);
      for (let i = 1; i < 4; i += 1) {
        const c = P(frame.corners[i]);
        ctx.lineTo(c.x, c.y);
      }
      ctx.closePath();
      ctx.stroke();
      // lien + poignée de rotation
      const e0 = P(frame.edges[0]);
      const rh = P(frame.rotHandle);
      ctx.beginPath();
      ctx.moveTo(e0.x, e0.y);
      ctx.lineTo(rh.x, rh.y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(rh.x, rh.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const pt of [...frame.corners, ...frame.edges]) {
        const s = P(pt);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.rect(s.x - hs, s.y - hs, hs * 2, hs * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // contour discret du calque texte actif (autres outils)
      const l = C.activeLayer(S.doc);
      if (l && l.kind === 'text' && l.visible && (!S.editing || S.editing.layer !== l)) {
        ctx.strokeStyle = 'rgba(110, 168, 255, 0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(ox + l.x * sc, oy + l.y * sc, l.w * sc, l.h * sc);
        ctx.setLineDash([]);
      }
    }
  }

  /* ================= Repères de mesure (règle, compas, cercle) =================
     Objets temporaires dessinés sur le HUD : jamais dans le rendu ni dans
     l'enregistrement, manipulables avec l'outil Repères, effaçables d'un clic. */

  const GUIDE_COLOR = '#2fc6e8';
  const GUIDE_DARK = 'rgba(0, 30, 40, 0.6)';

  function guideLabel(ctx, text, x, y) {
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = GUIDE_COLOR;
    ctx.fillRect(x - w / 2, y - 9, w, 18);
    ctx.fillStyle = '#04303c';
    ctx.fillText(text, x, y + 0.5);
  }

  function guideStroke(ctx, draw) {
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = GUIDE_DARK;
    draw();
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = GUIDE_COLOR;
    draw();
    ctx.stroke();
  }

  function guideHandleDot(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.stroke();
  }

  function drawGuidesHud(ctx, ox, oy, sc) {
    if (!S.guides || S.guides.length === 0) return;
    const P = (pt) => ({ x: ox + pt.x * sc, y: oy + pt.y * sc });
    ctx.save();
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of S.guides) {
      if (g.kind === 'ruler') {
        const a = P(g.a);
        const b = P(g.b);
        const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
        const slen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / slen; // normale écran
        const ny = (b.x - a.x) / slen;
        guideStroke(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          // graduations le long de la règle
          const steps = [5, 10, 25, 50, 100, 250, 500];
          const step = steps.find((s) => s * sc >= 9) || 1000;
          for (let d = step; d < len; d += step) {
            const t = d / len;
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            const tick = (d / step) % 5 === 0 ? 7 : 4;
            ctx.moveTo(px, py);
            ctx.lineTo(px + nx * tick, py + ny * tick);
          }
        });
        guideHandleDot(ctx, a.x, a.y);
        guideHandleDot(ctx, b.x, b.y);
        const ang = (Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180) / Math.PI;
        guideLabel(
          ctx,
          `${Math.round(len)} px · ${(Math.round(ang * 10) / 10).toLocaleString('fr-FR')}°`,
          (a.x + b.x) / 2 - nx * 16,
          (a.y + b.y) / 2 - ny * 16
        );
      } else if (g.kind === 'angle') {
        const o = P(g.o);
        const a = P(g.a);
        const b = P(g.b);
        const angA = Math.atan2(a.y - o.y, a.x - o.x);
        const angB = Math.atan2(b.y - o.y, b.x - o.x);
        guideStroke(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(o.x, o.y);
          ctx.lineTo(b.x, b.y);
        });
        let sweep = angB - angA;
        while (sweep <= -Math.PI) sweep += Math.PI * 2;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
        guideStroke(ctx, () => {
          ctx.beginPath();
          ctx.arc(o.x, o.y, 26, angA, angA + sweep, sweep < 0);
        });
        guideHandleDot(ctx, o.x, o.y);
        guideHandleDot(ctx, a.x, a.y);
        guideHandleDot(ctx, b.x, b.y);
        const bis = angA + sweep / 2;
        guideLabel(
          ctx,
          `${(Math.round(Math.abs((sweep * 180) / Math.PI) * 10) / 10).toLocaleString('fr-FR')}°`,
          o.x + Math.cos(bis) * 46,
          o.y + Math.sin(bis) * 46
        );
      } else if (g.kind === 'circle') {
        const c = P(g.c);
        const rs = g.r * sc;
        guideStroke(ctx, () => {
          ctx.beginPath();
          ctx.arc(c.x, c.y, rs, 0, Math.PI * 2);
        });
        guideStroke(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(c.x - 5, c.y);
          ctx.lineTo(c.x + 5, c.y);
          ctx.moveTo(c.x, c.y - 5);
          ctx.lineTo(c.x, c.y + 5);
        });
        guideHandleDot(ctx, c.x + rs, c.y);
        guideLabel(ctx, `R ${Math.round(g.r)} px · Ø ${Math.round(g.r * 2)} px`, c.x, c.y - 16);
      }
    }
    ctx.restore();
  }

  function viewCenterDoc() {
    const sr = els.stage.getBoundingClientRect();
    const cr = els.canvas.getBoundingClientRect();
    return {
      x: (sr.left + sr.width / 2 - cr.left) / S.scale,
      y: (sr.top + sr.height / 2 - cr.top) / S.scale,
    };
  }

  function addGuide(kind) {
    const c = viewCenterDoc();
    const u = 120 / S.scale; // taille de départ : constante à l'écran
    if (kind === 'ruler') {
      S.guides.push({ kind, a: { x: c.x - u, y: c.y }, b: { x: c.x + u, y: c.y } });
    } else if (kind === 'angle') {
      S.guides.push({
        kind,
        o: { x: c.x, y: c.y + u / 2 },
        a: { x: c.x - u, y: c.y - u / 2 },
        b: { x: c.x + u, y: c.y - u / 2 },
      });
    } else {
      S.guides.push({ kind: 'circle', c: { x: c.x, y: c.y }, r: u * 0.75 });
    }
    drawHud();
    status('Repère ajouté — glissez ses poignées ; « Tout effacer » le retire (jamais dans le rendu).');
  }

  function distToSegment(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1e-6)));
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }

  let guideDrag = null;

  function guideHitAt(p) {
    const tol = 10 / S.scale;
    const near = (pt) => Math.hypot(p.x - pt.x, p.y - pt.y) <= tol;
    for (let i = S.guides.length - 1; i >= 0; i -= 1) {
      const g = S.guides[i];
      if (g.kind === 'ruler') {
        if (near(g.a)) return { g, part: 'a' };
        if (near(g.b)) return { g, part: 'b' };
        if (distToSegment(p, g.a, g.b) <= tol) return { g, part: 'body' };
      } else if (g.kind === 'angle') {
        if (near(g.o)) return { g, part: 'o' };
        if (near(g.a)) return { g, part: 'a' };
        if (near(g.b)) return { g, part: 'b' };
      } else if (g.kind === 'circle') {
        if (near(g.c)) return { g, part: 'c' };
        if (Math.abs(Math.hypot(p.x - g.c.x, p.y - g.c.y) - g.r) <= tol) return { g, part: 'r' };
      }
    }
    return null;
  }

  function guideDown(p) {
    const hit = guideHitAt(p);
    if (!hit) return false;
    guideDrag = { ...hit, start: p, orig: JSON.parse(JSON.stringify(hit.g)) };
    return true;
  }

  function guideMove(p) {
    if (!guideDrag) return;
    const { g, part, start, orig } = guideDrag;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (part === 'body') {
      g.a = { x: orig.a.x + dx, y: orig.a.y + dy };
      g.b = { x: orig.b.x + dx, y: orig.b.y + dy };
    } else if (part === 'o') {
      g.o = { x: orig.o.x + dx, y: orig.o.y + dy };
      g.a = { x: orig.a.x + dx, y: orig.a.y + dy };
      g.b = { x: orig.b.x + dx, y: orig.b.y + dy };
    } else if (part === 'c') {
      g.c = { x: orig.c.x + dx, y: orig.c.y + dy };
    } else if (part === 'r') {
      g.r = Math.max(2, Math.hypot(p.x - g.c.x, p.y - g.c.y));
    } else {
      g[part] = { x: orig[part].x + dx, y: orig[part].y + dy };
    }
    drawHud();
  }

  function guideUp() {
    guideDrag = null;
  }

  function buildGuideOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'studio-btn';
      b.textContent = st(label);
      b.addEventListener('click', fn);
      return b;
    };
    box.append(
      mk('Règle', () => addGuide('ruler')),
      mk('Compas', () => addGuide('angle')),
      mk('Cercle', () => addGuide('circle')),
      mk('Tout effacer', () => {
        S.guides = [];
        drawHud();
      })
    );
    return box;
  }

  /* Lecture en direct dans la barre d'options : position, dimensions, angle,
     inclinaison et nom de l'objet sélectionné. Les champs sont éditables ;
     un champ en cours de saisie n'est jamais écrasé. */
  function updateInfoBar() {
    if (!S) return;
    const l = C.activeLayer(S.doc);
    const fields = [els.infX, els.infY, els.infL, els.infH, els.infA, els.infV];
    const put = (input, value) => {
      input.disabled = !l;
      if (document.activeElement === input) return;
      input.value = l ? String(value) : '';
    };
    if (!l) {
      for (const input of fields) put(input, '');
      els.infName.textContent = '–';
      return;
    }
    const f = layerFrame(l);
    const xs = f.corners.map((c) => c.x);
    const ys = f.corners.map((c) => c.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const deg = (rad) => {
      const d = ((((rad * 180) / Math.PI + 180) % 360) + 360) % 360 - 180;
      return Math.round(d * 10) / 10;
    };
    put(els.infX, Math.round(x0));
    put(els.infY, Math.round(y0));
    put(els.infL, Math.round(Math.max(...xs) - x0));
    put(els.infH, Math.round(Math.max(...ys) - y0));
    put(els.infA, deg(f.t.rot || 0));
    put(els.infV, deg(Math.atan(f.t.k || 0)));
    els.infName.textContent = l.name;
  }

  /* Application d'une valeur saisie dans la barre d'infos au calque actif. */
  function applyInfoEdit(field, raw) {
    const l = C.activeLayer(S.doc);
    if (!l) return;
    const value = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(value)) {
      updateInfoBar();
      return;
    }
    if (l.kind === 'text' && field !== 'x' && field !== 'y') {
      status('Sur un calque de texte : seuls X et Y se modifient ici (corps via la barre Texte).');
      updateInfoBar();
      return;
    }
    const before = C.snapshotDoc(S.doc);
    const f = layerFrame(l);
    const xs = f.corners.map((c) => c.x);
    const ys = f.corners.map((c) => c.y);
    const bb = {
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    const t = { sx: 1, sy: 1, rot: 0, k: 0, ...(l.tx || {}) };
    if (field === 'x') {
      l.x += Math.round(value - bb.x0);
    } else if (field === 'y') {
      l.y += Math.round(value - bb.y0);
    } else if (field === 'l' || field === 'h') {
      const current = field === 'l' ? bb.w : bb.h;
      if (value >= 1 && current > 0) {
        const factor = value / current;
        l.tx = field === 'l' ? { ...t, sx: t.sx * factor } : { ...t, sy: t.sy * factor };
      }
    } else if (field === 'a') {
      l.tx = { ...t, rot: (value * Math.PI) / 180 };
    } else if (field === 'v') {
      l.tx = { ...t, k: Math.tan((Math.max(-80, Math.min(80, value)) * Math.PI) / 180) };
    }
    if (
      l.tx &&
      Math.abs(l.tx.sx - 1) < 1e-6 &&
      Math.abs(l.tx.sy - 1) < 1e-6 &&
      Math.abs(l.tx.rot) < 1e-6 &&
      Math.abs(l.tx.k) < 1e-6
    ) {
      l.tx = null;
    }
    commit(before);
    requestRender();
    updateInfoBar();
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

  function setColor2(hex) {
    S.color2 = hex;
    els.colorInput2.value = hex;
    els.colorWrap2.style.background = hex;
  }

  /* ================= Sélections =================
     Une sélection = { path, bounds, fillRule } en coordonnées document.
     Maj pendant un tracé (rectangle, ellipse, lasso, baguette) : ajout à la
     sélection existante. Ctrl+A tout, Ctrl+Maj+I inverser, Ctrl+D rien. */

  function selFillRule() {
    return (S.selection && S.selection.fillRule) || 'nonzero';
  }

  function clipSelection(ctx) {
    ctx.clip(S.selection.path, selFillRule());
  }

  function finishSelection(sel, additive) {
    const ns = { path: sel.path, bounds: sel.bounds, fillRule: sel.fillRule || 'nonzero' };
    if (additive && S.selection && selFillRule() === 'nonzero') {
      const combined = new Path2D();
      combined.addPath(S.selection.path);
      combined.addPath(ns.path);
      const b1 = S.selection.bounds;
      const b2 = ns.bounds;
      const x = Math.min(b1.x, b2.x);
      const y = Math.min(b1.y, b2.y);
      S.selection = {
        path: combined,
        fillRule: 'nonzero',
        bounds: {
          x,
          y,
          w: Math.max(b1.x + b1.w, b2.x + b2.w) - x,
          h: Math.max(b1.y + b1.h, b2.y + b2.h) - y,
        },
      };
    } else {
      S.selection = ns;
    }
    requestRender();
    updateOptionsBar();
  }

  function selectAll() {
    const path = new Path2D();
    path.rect(0, 0, S.doc.width, S.doc.height);
    S.selection = { path, fillRule: 'nonzero', bounds: { x: 0, y: 0, w: S.doc.width, h: S.doc.height } };
    requestRender();
    updateOptionsBar();
    status('Tout est sélectionné.');
  }

  function invertSelection() {
    if (!S.selection) {
      selectAll();
      return;
    }
    const path = new Path2D();
    path.rect(0, 0, S.doc.width, S.doc.height);
    path.addPath(S.selection.path);
    S.selection = { path, fillRule: 'evenodd', bounds: { x: 0, y: 0, w: S.doc.width, h: S.doc.height } };
    requestRender();
    updateOptionsBar();
    status('Sélection inversée.');
  }

  /** Baguette magique : sélectionne la couleur semblable sur le calque actif. */
  function wandSelect(p, additive) {
    const l = requireRaster();
    if (!l) return;
    rasterizeIfTransformed(l);
    const px = Math.floor(p.x - l.x);
    const py = Math.floor(p.y - l.y);
    if (px < 0 || py < 0 || px >= l.canvas.width || py >= l.canvas.height) {
      status('Le point cliqué est en dehors du calque actif.');
      return;
    }
    const m = C.floodMask(l.canvas, px, py, S.wand);
    if (!m) return;
    const traced = C.maskToPath(m.mask, m.w, m.h);
    if (!traced) return;
    const path = new Path2D();
    path.addPath(traced.path, new DOMMatrix([1, 0, 0, 1, l.x, l.y]));
    finishSelection(
      {
        path,
        bounds: { x: traced.bounds.x + l.x, y: traced.bounds.y + l.y, w: traced.bounds.w, h: traced.bounds.h },
      },
      additive
    );
    status('Zone sélectionnée par couleur — Maj + clic pour étendre la sélection.');
  }

  function buildWandOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    box.appendChild(
      buildSlider({
        label: 'Tolérance',
        min: 0,
        max: 100,
        value: S.wand.tolerance,
        unit: '%',
        onInput: (v) => {
          S.wand.tolerance = v;
        },
      })
    );
    const contig = document.createElement('button');
    contig.className = 'studio-btn';
    contig.textContent = 'Contigu';
    contig.title = 'Ne sélectionner que la zone connexe sous le clic';
    contig.classList.toggle('is-active', S.wand.contiguous);
    contig.addEventListener('click', () => {
      S.wand.contiguous = !S.wand.contiguous;
      contig.classList.toggle('is-active', S.wand.contiguous);
    });
    box.appendChild(contig);
    box.appendChild(buildSelectionActions());
    return box;
  }

  /** Boutons d'action communs aux outils de sélection. */
  function buildSelectionActions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const has = Boolean(S.selection);
    const mk = (label, title, fn, primary) => {
      const b = document.createElement('button');
      b.className = primary ? 'studio-btn studio-btn-primary' : 'studio-btn';
      b.textContent = st(label);
      b.title = title;
      b.disabled = !has;
      b.addEventListener('click', fn);
      return b;
    };
    box.append(
      mk('Copier en calque', 'Duplique la zone sélectionnée sur un nouveau calque (Ctrl+J)', () => selectionToLayer(false), true),
      mk('Couper en calque', 'Déplace la zone sélectionnée sur un nouveau calque', () => selectionToLayer(true)),
      mk('Effacer', 'Efface les pixels de la sélection sur le calque actif (Suppr)', () => eraseSelection()),
      mk('Désélectionner', 'Abandonne la sélection (Ctrl+D)', () => deselect())
    );
    return box;
  }

  function setSelectionDraft(d) {
    S.selDraft = d;
    renderOverlay();
  }

  function setGradientPreview(g) {
    S.gradientPreview = g;
    renderOverlay();
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
    if (S.selection) clipSelection(ctx);
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

  /* ================= Correcteur de tons directs =================
     On peint un masque sur le défaut (voile blanc à l'écran) ; au relâcher,
     la zone masquée est reconstruite par diffusion depuis son voisinage
     (inpainting par propagation de front puis lissage) — les poussières,
     boutons et petites rayures se fondent dans leur entourage. */

  function beginHealStroke(l) {
    const brush = { ...S.brushes.heal };
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const mask = C.createCanvas(l.canvas.width, l.canvas.height);
    return {
      l,
      brush,
      mask,
      tip: makeTipCanvas(brush, '255,255,255'),
      spacing: Math.max(1, brush.size * 0.15),
      rest: 0,
      before,
    };
  }

  function healStampSegment(stroke, a, b) {
    const ctx = stroke.mask.getContext('2d');
    ctx.save();
    ctx.translate(-stroke.l.x, -stroke.l.y);
    if (S.selection) clipSelection(ctx);
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
    S.healPreview = stroke;
    renderOverlay();
  }

  function endHealStroke(stroke) {
    S.healPreview = null;
    healApply(stroke);
    commit(stroke.before);
    requestRender();
  }

  function healApply({ l, mask }) {
    const w = mask.width;
    const h = mask.height;
    const md = mask.getContext('2d').getImageData(0, 0, w, h).data;
    // boîte englobante de la zone peinte
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (md[(y * w + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return;
    const margin = 24;
    x0 = Math.max(0, x0 - margin);
    y0 = Math.max(0, y0 - margin);
    x1 = Math.min(w - 1, x1 + margin);
    y1 = Math.min(h - 1, y1 + margin);
    const rw = x1 - x0 + 1;
    const rh = y1 - y0 + 1;

    const lctx = l.canvas.getContext('2d');
    const img = lctx.getImageData(x0, y0, rw, rh);
    const d = img.data;
    const unknown = new Uint8Array(rw * rh);
    let list = [];
    for (let y = 0; y < rh; y += 1) {
      for (let x = 0; x < rw; x += 1) {
        if (md[((y + y0) * w + (x + x0)) * 4 + 3] > 24) {
          unknown[y * rw + x] = 1;
          list.push(y * rw + x);
        }
      }
    }
    const masked = list.slice(); // pour le lissage final

    // propagation de front : chaque tour remplit les pixels inconnus qui
    // touchent des pixels connus (moyenne des voisins), du bord vers le cœur
    while (list.length) {
      const next = [];
      const updates = [];
      for (const i of list) {
        const px = i % rw;
        const py = (i / rw) | 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let yy = Math.max(0, py - 1); yy <= Math.min(rh - 1, py + 1); yy += 1) {
          for (let xx = Math.max(0, px - 1); xx <= Math.min(rw - 1, px + 1); xx += 1) {
            const j = yy * rw + xx;
            if (unknown[j]) continue;
            const o = j * 4;
            r += d[o];
            g += d[o + 1];
            b += d[o + 2];
            a += d[o + 3];
            n += 1;
          }
        }
        if (n === 0) next.push(i);
        else updates.push([i, r / n, g / n, b / n, a / n]);
      }
      if (updates.length === 0) break; // masque isolé (aucun voisinage connu)
      for (const [i, r, g, b, a] of updates) {
        const o = i * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = a;
        unknown[i] = 0;
      }
      list = next;
    }

    // lissage de membrane : quelques itérations de moyenne 4-voisins sur la
    // zone reconstruite, pour fondre les raccords
    for (let it = 0; it < 6; it += 1) {
      for (const i of masked) {
        const px = i % rw;
        const py = (i / rw) | 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (const [xx, yy] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue;
          const o = (yy * rw + xx) * 4;
          r += d[o];
          g += d[o + 1];
          b += d[o + 2];
          a += d[o + 3];
          n += 1;
        }
        if (n === 0) continue;
        const o = i * 4;
        d[o] = r / n;
        d[o + 1] = g / n;
        d[o + 2] = b / n;
        d[o + 3] = a / n;
      }
    }
    lctx.putImageData(img, x0, y0);
  }

  /* ================= Tampon de duplication =================
     Peint des pixels prélevés dans un instantané du calque, décalés du
     vecteur source→départ (Alt + clic définit la source). */

  function beginCloneStroke(l, src, start) {
    const brush = { ...S.brushes.clone };
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const snapshot = C.createCanvas(l.canvas.width, l.canvas.height);
    snapshot.getContext('2d').drawImage(l.canvas, 0, 0);
    return {
      l,
      brush,
      tip: makeTipCanvas(brush, '255,255,255'),
      spacing: Math.max(0.6, brush.size * 0.15),
      rest: 0,
      before,
      snapshot,
      dx: src.x - start.x,
      dy: src.y - start.y,
    };
  }

  function cloneStampAt(ctx, stroke, x, y) {
    const b = stroke.brush;
    const d = stroke.tip.width;
    const r = d / 2;
    const tmp = C.createCanvas(d, d);
    const tctx = tmp.getContext('2d');
    // la pointe sert de masque alpha, remplie par l'instantané décalé
    tctx.translate(r, r);
    tctx.rotate((b.angle * Math.PI) / 180);
    tctx.scale(1, Math.max(0.1, b.roundness / 100));
    tctx.drawImage(stroke.tip, -r, -r);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    const sx = x + stroke.dx - stroke.l.x;
    const sy = y + stroke.dy - stroke.l.y;
    tctx.drawImage(stroke.snapshot, r - sx, r - sy);
    ctx.drawImage(tmp, x - r, y - r);
  }

  function cloneStampSegment(stroke, a, b) {
    const l = stroke.l;
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    ctx.translate(-l.x, -l.y);
    if (S.selection) clipSelection(ctx);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      cloneStampAt(ctx, stroke, a.x, a.y);
    } else {
      let t = stroke.rest;
      while (t <= dist) {
        cloneStampAt(ctx, stroke, a.x + (dx * t) / dist, a.y + (dy * t) / dist);
        t += stroke.spacing;
      }
      stroke.rest = t - dist;
    }
    ctx.restore();
    requestRender();
  }

  /* ================= Retouche (flou, netteté, doigt, éclaircir, assombrir) =================
     Brosse de retouche locale : chaque estampe agit sur la zone sous la
     pointe — flou / netteté par filtrage de la région, doigt par étalement
     itératif, éclaircir / assombrir par estampes écran / produit. */

  const RETOUCH_MODES = [
    { value: 'blur', label: 'Flou' },
    { value: 'sharpen', label: 'Netteté' },
    { value: 'smudge', label: 'Doigt' },
    { value: 'lighten', label: 'Éclaircir' },
    { value: 'darken', label: 'Assombrir' },
  ];

  function beginRetouchStroke(l) {
    const brush = { ...S.brushes.retouch };
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const mode = S.retouch.mode;
    return {
      l,
      brush,
      tip: makeTipCanvas(brush, mode === 'darken' ? '0,0,0' : '255,255,255'),
      spacing: Math.max(1, brush.size * 0.25),
      rest: 0,
      before,
      mode,
      strength: S.retouch.strength,
      buffer: null,
    };
  }

  /** Applique la pointe comme masque alpha sur un canvas de région. */
  function maskRegionByTip(rctx, stroke) {
    const r = stroke.tip.width / 2;
    rctx.globalCompositeOperation = 'destination-in';
    rctx.translate(r, r);
    rctx.rotate((stroke.brush.angle * Math.PI) / 180);
    rctx.scale(1, Math.max(0.1, stroke.brush.roundness / 100));
    rctx.drawImage(stroke.tip, -r, -r);
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.globalCompositeOperation = 'source-over';
  }

  function retouchStampAt(ctx, stroke, x, y) {
    const l = stroke.l;
    const d = stroke.tip.width;
    const r = d / 2;
    const k = stroke.strength / 100;
    const sx = x - l.x - r; // coin de la région, en coordonnées calque
    const sy = y - l.y - r;

    if (stroke.mode === 'lighten' || stroke.mode === 'darken') {
      ctx.save();
      ctx.globalCompositeOperation = stroke.mode === 'lighten' ? 'screen' : 'multiply';
      ctx.globalAlpha = 0.05 + 0.2 * k;
      stampAt(ctx, stroke, x, y);
      ctx.restore();
      return;
    }

    if (stroke.mode === 'smudge') {
      if (stroke.buffer) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.55 * k;
        ctx.drawImage(stroke.buffer, x - r, y - r);
        ctx.restore();
      }
      const buf = C.createCanvas(d, d);
      const bctx = buf.getContext('2d');
      bctx.drawImage(l.canvas, -sx, -sy);
      maskRegionByTip(bctx, stroke);
      stroke.buffer = buf;
      return;
    }

    const tmp = C.createCanvas(d, d);
    const tctx = tmp.getContext('2d');
    if (stroke.mode === 'blur') {
      tctx.filter = `blur(${(1 + 5 * k).toFixed(1)}px)`;
      tctx.drawImage(l.canvas, -sx, -sy);
      tctx.filter = 'none';
    } else {
      tctx.drawImage(l.canvas, -sx, -sy);
      const id = tctx.getImageData(0, 0, d, d);
      C.filterSharpen(id.data, d, d, { amount: 25 + 55 * k });
      tctx.putImageData(id, 0, 0);
    }
    maskRegionByTip(tctx, stroke);
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.45 + 0.5 * k);
    ctx.drawImage(tmp, x - r, y - r);
    ctx.restore();
  }

  function retouchStampSegment(stroke, a, b) {
    const l = stroke.l;
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    ctx.translate(-l.x, -l.y);
    if (S.selection) clipSelection(ctx);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      retouchStampAt(ctx, stroke, a.x, a.y);
    } else {
      let t = stroke.rest;
      while (t <= dist) {
        retouchStampAt(ctx, stroke, a.x + (dx * t) / dist, a.y + (dy * t) / dist);
        t += stroke.spacing;
      }
      stroke.rest = t - dist;
    }
    ctx.restore();
    requestRender();
  }

  function buildRetouchOptions() {
    const wrap = document.createElement('div');
    wrap.className = 'studio-opt-group';
    const sel = document.createElement('select');
    sel.className = 'studio-font-select';
    sel.title = 'Mode de retouche';
    for (const m of RETOUCH_MODES) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      sel.appendChild(opt);
    }
    sel.value = S.retouch.mode;
    sel.addEventListener('change', () => {
      S.retouch.mode = sel.value;
    });
    wrap.appendChild(sel);
    wrap.appendChild(
      buildSlider({
        label: 'Intensité',
        min: 1,
        max: 100,
        value: S.retouch.strength,
        unit: '%',
        onInput: (v) => {
          S.retouch.strength = v;
        },
      })
    );
    wrap.appendChild(buildBrushOptions('retouch'));
    return wrap;
  }

  /* ================= Formes (rectangle, ellipse, ligne, flèche) ================= */

  function drawShape(ctx, kind, a, b, { fill, width, color }) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (kind === 'rect') {
      if (fill) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
    } else if (kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      else ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (kind === 'arrow') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const hl = Math.max(10, width * 3.2);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - hl * Math.cos(angle - 0.45), b.y - hl * Math.sin(angle - 0.45));
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - hl * Math.cos(angle + 0.45), b.y - hl * Math.sin(angle + 0.45));
        ctx.stroke();
      }
    }
  }

  function setShapeDraft(d) {
    S.shapeDraft = d;
    renderOverlay();
  }

  function applyShape(a, b) {
    const l = requireRaster();
    if (!l) return;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    ctx.translate(-l.x, -l.y);
    if (S.selection) clipSelection(ctx);
    drawShape(ctx, S.shape.kind, a, b, { fill: S.shape.fill, width: S.shape.width, color: S.color });
    ctx.restore();
    commit(before);
    status('Forme tracée.');
  }

  function buildShapeOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const mkSel = (title, value, options, onChange) => {
      const sel = document.createElement('select');
      sel.className = 'studio-font-select';
      sel.title = title;
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      }
      sel.value = value;
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    };
    box.appendChild(
      mkSel('Forme', S.shape.kind, [
        { value: 'rect', label: 'Rectangle' },
        { value: 'ellipse', label: 'Ellipse' },
        { value: 'line', label: 'Ligne' },
        { value: 'arrow', label: 'Flèche' },
      ], (v) => {
        S.shape.kind = v;
        updateOptionsBar();
      })
    );
    if (S.shape.kind === 'rect' || S.shape.kind === 'ellipse') {
      box.appendChild(
        mkSel('Contour ou rempli', S.shape.fill ? 'fill' : 'stroke', [
          { value: 'stroke', label: 'Contour' },
          { value: 'fill', label: 'Rempli' },
        ], (v) => {
          S.shape.fill = v === 'fill';
        })
      );
    }
    box.appendChild(
      buildSlider({
        label: 'Épaisseur',
        min: 1,
        max: 60,
        value: S.shape.width,
        unit: 'px',
        onInput: (v) => {
          S.shape.width = v;
        },
      })
    );
    return box;
  }

  /* ================= Dégradé ================= */

  function hexToRgbaStr(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function applyGradient(a, b) {
    const l = requireRaster();
    if (!l) return;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    ctx.translate(-l.x, -l.y);
    if (S.selection) clipSelection(ctx);
    let g;
    if (S.gradientOpts.type === 'radial') {
      g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)));
    } else {
      g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    }
    g.addColorStop(0, S.color);
    g.addColorStop(1, S.gradientOpts.to === 'color2' ? S.color2 : hexToRgbaStr(S.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(l.x, l.y, l.canvas.width, l.canvas.height);
    ctx.restore();
    commit(before);
    status('Dégradé appliqué.');
  }

  function buildGradientOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const mkSelect = (title, value, options, onChange) => {
      const sel = document.createElement('select');
      sel.className = 'studio-font-select';
      sel.title = title;
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      }
      sel.value = value;
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    };
    box.appendChild(
      mkSelect('Forme du dégradé', S.gradientOpts.type, [
        { value: 'linear', label: 'Linéaire' },
        { value: 'radial', label: 'Radial' },
      ], (v) => {
        S.gradientOpts.type = v;
      })
    );
    box.appendChild(
      mkSelect('Couleur d’arrivée', S.gradientOpts.to, [
        { value: 'transparent', label: 'Vers le transparent' },
        { value: 'color2', label: 'Vers la seconde couleur' },
      ], (v) => {
        S.gradientOpts.to = v;
      })
    );
    return box;
  }

  /* ================= Pot de peinture =================
     Remplit la zone de couleur semblable sous le clic avec la couleur
     active. Réglages : tolérance, opacité, contigu (zone connexe seulement
     ou tout le calque). Une sélection borne le remplissage. */

  function bucketFill(p) {
    const l = requireRaster();
    if (!l) return;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const px = Math.floor(p.x - l.x);
    const py = Math.floor(p.y - l.y);
    if (px < 0 || py < 0 || px >= l.canvas.width || py >= l.canvas.height) {
      status('Le point cliqué est en dehors du calque actif.');
      return;
    }
    const n = parseInt(S.color.slice(1), 16);
    const fill = C.floodFillCanvas(l.canvas, px, py, [(n >> 16) & 255, (n >> 8) & 255, n & 255], S.bucket);
    if (!fill) return;
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    if (S.selection) {
      // la sélection est en coordonnées document : on l'y ramène, puis on
      // revient dans l'espace du calque pour poser le remplissage
      ctx.translate(-l.x, -l.y);
      clipSelection(ctx);
      ctx.translate(l.x, l.y);
    }
    ctx.globalAlpha = S.bucket.opacity / 100;
    ctx.drawImage(fill, 0, 0);
    ctx.restore();
    commit(before);
    status('Zone remplie avec la couleur active.');
  }

  /* ================= Gomme magique =================
     Un clic retire du calque actif tous les pixels de couleur semblable :
     contigu = seulement la zone connexe (détourage autour d'un objet),
     sinon toute l'image (retrait d'un fond uni). Tolérance et adoucissement
     des bords réglables. Une sélection borne le retrait. */

  function magicErase(p) {
    const l = requireRaster();
    if (!l) return;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const px = Math.floor(p.x - l.x);
    const py = Math.floor(p.y - l.y);
    if (px < 0 || py < 0 || px >= l.canvas.width || py >= l.canvas.height) {
      status('Le point cliqué est en dehors du calque actif.');
      return;
    }
    if (l.canvas.getContext('2d').getImageData(px, py, 1, 1).data[3] === 0) {
      status('Ce pixel est déjà transparent — cliquez la couleur à retirer.');
      return;
    }
    const m = C.floodMask(l.canvas, px, py, S.magic);
    if (!m) return;
    const maskCv = C.maskToCanvas(m.mask, m.w, m.h, [255, 255, 255]);
    const ctx = l.canvas.getContext('2d');
    ctx.save();
    if (S.selection) {
      ctx.translate(-l.x, -l.y);
      clipSelection(ctx);
      ctx.translate(l.x, l.y);
    }
    ctx.globalCompositeOperation = 'destination-out';
    if (S.magic.feather > 0) ctx.filter = `blur(${S.magic.feather}px)`;
    ctx.drawImage(maskCv, 0, 0);
    ctx.restore();
    commit(before);
    status(
      S.magic.contiguous
        ? 'Zone contiguë retirée — décochez « Contigu » pour retirer la couleur partout.'
        : 'Couleur retirée sur tout le calque.'
    );
  }

  function buildMagicOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    box.appendChild(
      buildSlider({
        label: 'Tolérance',
        min: 0,
        max: 100,
        value: S.magic.tolerance,
        unit: '%',
        onInput: (v) => {
          S.magic.tolerance = v;
        },
      })
    );
    box.appendChild(
      buildSlider({
        label: 'Adoucir',
        min: 0,
        max: 10,
        value: S.magic.feather,
        unit: 'px',
        onInput: (v) => {
          S.magic.feather = v;
        },
      })
    );
    const contig = document.createElement('button');
    contig.className = 'studio-btn';
    contig.textContent = 'Contigu';
    contig.title =
      'Coché : seule la zone connexe sous le clic est retirée (détourage) · décoché : la couleur est retirée sur tout le calque (fond)';
    contig.classList.toggle('is-active', S.magic.contiguous);
    contig.addEventListener('click', () => {
      S.magic.contiguous = !S.magic.contiguous;
      contig.classList.toggle('is-active', S.magic.contiguous);
    });
    box.appendChild(contig);
    return box;
  }

  function buildBucketOptions() {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    box.appendChild(
      buildSlider({
        label: 'Tolérance',
        min: 0,
        max: 100,
        value: S.bucket.tolerance,
        unit: '%',
        onInput: (v) => {
          S.bucket.tolerance = v;
        },
      })
    );
    box.appendChild(
      buildSlider({
        label: 'Opacité',
        min: 1,
        max: 100,
        value: S.bucket.opacity,
        unit: '%',
        onInput: (v) => {
          S.bucket.opacity = v;
        },
      })
    );
    const contig = document.createElement('button');
    contig.className = 'studio-btn';
    contig.textContent = 'Contigu';
    contig.title = 'Ne remplir que la zone connexe sous le clic (sinon : toute couleur semblable du calque)';
    contig.classList.toggle('is-active', S.bucket.contiguous);
    contig.addEventListener('click', () => {
      S.bucket.contiguous = !S.bucket.contiguous;
      contig.classList.toggle('is-active', S.bucket.contiguous);
    });
    box.appendChild(contig);
    return box;
  }

  /* ================= Courbes =================
     Interpolation monotone (Fritsch–Carlson) entre les points de contrôle :
     lisse comme Photoshop, sans dépassement au-delà des points. */

  function curveLut(points) {
    const pts = [...points].sort((a, b) => a.x - b.x);
    const lut = new Uint8Array(256);
    const cb = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const n = pts.length;
    if (n === 1) {
      lut.fill(cb(pts[0].y));
      return lut;
    }
    const dxs = [];
    const deltas = [];
    for (let i = 0; i < n - 1; i += 1) {
      const dx = Math.max(1e-6, pts[i + 1].x - pts[i].x);
      dxs.push(dx);
      deltas.push((pts[i + 1].y - pts[i].y) / dx);
    }
    const m = new Array(n);
    m[0] = deltas[0];
    m[n - 1] = deltas[n - 2];
    for (let i = 1; i < n - 1; i += 1) {
      m[i] = deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2;
    }
    for (let i = 0; i < n - 1; i += 1) {
      if (deltas[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / deltas[i];
      const b = m[i + 1] / deltas[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * deltas[i];
        m[i + 1] = t * b * deltas[i];
      }
    }
    let seg = 0;
    for (let x = 0; x < 256; x += 1) {
      if (x <= pts[0].x) {
        lut[x] = cb(pts[0].y);
        continue;
      }
      if (x >= pts[n - 1].x) {
        lut[x] = cb(pts[n - 1].y);
        continue;
      }
      while (x > pts[seg + 1].x) seg += 1;
      const h = dxs[seg];
      const t = (x - pts[seg].x) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      lut[x] = cb(
        pts[seg].y * (2 * t3 - 3 * t2 + 1) +
          m[seg] * h * (t3 - 2 * t2 + t) +
          pts[seg + 1].y * (-2 * t3 + 3 * t2) +
          m[seg + 1] * h * (t3 - t2)
      );
    }
    return lut;
  }

  /* ================= Modale générique (réglages, filtres, dialogues) ================= */

  let modalState = null;

  function openModal({ title, fields, onChange, onOk, onCancel }) {
    els.modalTitle.textContent = st(title);
    els.modalFields.innerHTML = '';
    const params = {};
    const setters = {};
    const emit = () => {
      if (onChange) onChange({ ...params });
    };
    for (const f of fields) {
      params[f.key] = f.value;
      const row = document.createElement('div');
      row.className = 'studio-modal-row';
      const lab = document.createElement('span');
      lab.className = 'studio-modal-label';
      lab.textContent = st(f.label);
      row.appendChild(lab);
      if (f.type === 'select') {
        const sel = document.createElement('select');
        sel.className = 'studio-font-select';
        for (const o of f.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          sel.appendChild(opt);
        }
        sel.value = String(f.value);
        sel.addEventListener('change', () => {
          params[f.key] = sel.value;
          if (f.onInput) f.onInput(params, setters);
          emit();
        });
        row.appendChild(sel);
        setters[f.key] = (v) => {
          sel.value = String(v);
          params[f.key] = v;
        };
      } else if (f.type === 'number') {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'studio-modal-number';
        inp.min = String(f.min);
        inp.max = String(f.max);
        inp.value = String(f.value);
        inp.addEventListener('input', () => {
          params[f.key] = Number(inp.value) || 0;
          if (f.onInput) f.onInput(params, setters);
          emit();
        });
        row.appendChild(inp);
        setters[f.key] = (v) => {
          inp.value = String(v);
          params[f.key] = v;
        };
      } else if (f.type === 'color') {
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.className = 'studio-modal-color';
        inp.value = String(f.value);
        inp.addEventListener('input', () => {
          params[f.key] = inp.value;
          emit();
        });
        row.appendChild(inp);
      } else if (f.type === 'curve') {
        const cv = document.createElement('canvas');
        const CW = 252;
        const CH = 190;
        cv.width = CW;
        cv.height = CH;
        cv.className = 'studio-curve';
        const pts = f.value.map((p) => ({ ...p }));
        const toC = (p) => ({ x: (p.x / 255) * (CW - 12) + 6, y: CH - 6 - (p.y / 255) * (CH - 12) });
        const fromC = (mx, my) => ({
          x: Math.max(0, Math.min(255, ((mx - 6) / (CW - 12)) * 255)),
          y: Math.max(0, Math.min(255, ((CH - 6 - my) / (CH - 12)) * 255)),
        });
        const drawCurve = () => {
          const c2 = cv.getContext('2d');
          c2.clearRect(0, 0, CW, CH);
          c2.fillStyle = '#262626';
          c2.fillRect(0, 0, CW, CH);
          c2.strokeStyle = 'rgba(255, 255, 255, 0.07)';
          c2.lineWidth = 1;
          for (let i = 1; i < 4; i += 1) {
            const gx = 6 + ((CW - 12) * i) / 4;
            const gy = 6 + ((CH - 12) * i) / 4;
            c2.beginPath();
            c2.moveTo(gx, 6);
            c2.lineTo(gx, CH - 6);
            c2.moveTo(6, gy);
            c2.lineTo(CW - 6, gy);
            c2.stroke();
          }
          const lut = params[f.key];
          c2.strokeStyle = '#6ea8ff';
          c2.lineWidth = 1.6;
          c2.beginPath();
          for (let x = 0; x < 256; x += 1) {
            const pt = toC({ x, y: lut[x] });
            if (x === 0) c2.moveTo(pt.x, pt.y);
            else c2.lineTo(pt.x, pt.y);
          }
          c2.stroke();
          for (const p of pts) {
            const pc = toC(p);
            c2.fillStyle = '#fff';
            c2.strokeStyle = '#262626';
            c2.beginPath();
            c2.rect(pc.x - 3.5, pc.y - 3.5, 7, 7);
            c2.fill();
            c2.stroke();
          }
        };
        const refresh = () => {
          params[f.key] = curveLut(pts);
          drawCurve();
          emit();
        };
        let dragIdx = -1;
        const local = (e) => {
          const r = cv.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const nearIdx = (m) => {
          for (let i = 0; i < pts.length; i += 1) {
            const pc = toC(pts[i]);
            if (Math.hypot(m.x - pc.x, m.y - pc.y) <= 9) return i;
          }
          return -1;
        };
        cv.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const m = local(e);
          const i = nearIdx(m);
          if (i >= 0) {
            dragIdx = i;
          } else {
            const p = fromC(m.x, m.y);
            let at = pts.length;
            for (let j = 0; j < pts.length; j += 1) {
              if (pts[j].x > p.x) {
                at = j;
                break;
              }
            }
            pts.splice(at, 0, p);
            dragIdx = at;
            refresh();
          }
          try {
            cv.setPointerCapture(e.pointerId);
          } catch {
            // pointeur synthétique
          }
        });
        cv.addEventListener('pointermove', (e) => {
          if (dragIdx < 0) return;
          const p = fromC(local(e).x, local(e).y);
          const pt = pts[dragIdx];
          pt.y = p.y;
          if (dragIdx === 0) pt.x = 0;
          else if (dragIdx === pts.length - 1) pt.x = 255;
          else pt.x = Math.max(pts[dragIdx - 1].x + 1, Math.min(pts[dragIdx + 1].x - 1, p.x));
          refresh();
        });
        cv.addEventListener('pointerup', () => {
          dragIdx = -1;
        });
        cv.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const i = nearIdx(local(e));
          if (i > 0 && i < pts.length - 1) {
            pts.splice(i, 1);
            refresh();
          }
        });
        params[f.key] = curveLut(pts);
        drawCurve();
        row.appendChild(cv);
      } else {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = String(f.min);
        inp.max = String(f.max);
        inp.value = String(f.value);
        const val = document.createElement('span');
        val.className = 'studio-opt-value';
        val.textContent = `${f.value} ${f.unit || ''}`;
        inp.addEventListener('input', () => {
          params[f.key] = Number(inp.value);
          val.textContent = `${inp.value} ${f.unit || ''}`;
          emit();
        });
        row.append(inp, val);
        setters[f.key] = (v) => {
          inp.value = String(v);
          val.textContent = `${v} ${f.unit || ''}`;
          params[f.key] = v;
        };
      }
      els.modalFields.appendChild(row);
    }
    modalState = { params, onOk, onCancel };
    els.modalBackdrop.hidden = false;
    emit();
  }

  function closeModal(ok) {
    if (!modalState) return;
    const st = modalState;
    modalState = null;
    els.modalBackdrop.hidden = true;
    if (ok && st.onOk) st.onOk({ ...st.params });
    if (!ok && st.onCancel) st.onCancel();
  }

  /* ================= Réglages & filtres (sur le calque actif) =================
     Aperçu en direct pendant le réglage ; une sélection restreint l'effet à
     la zone sélectionnée ; OK = une entrée d'historique, Annuler = retour. */

  /** Réapplique `result` seulement dans la sélection (sinon tel quel). */
  function maskedResult(l, orig, result) {
    if (!S.selection) return result;
    const nc = C.createCanvas(orig.width, orig.height);
    const ctx = nc.getContext('2d');
    ctx.drawImage(orig, 0, 0);
    ctx.save();
    ctx.translate(-l.x, -l.y);
    clipSelection(ctx);
    ctx.translate(l.x, l.y);
    ctx.drawImage(result, 0, 0);
    ctx.restore();
    return nc;
  }

  /** Transforme une fonction pixels (data, params, w, h) en productrice de canvas. */
  const pixelProduce = (fn) => (orig, params) => {
    const nc = C.createCanvas(orig.width, orig.height);
    const ctx = nc.getContext('2d');
    ctx.drawImage(orig, 0, 0);
    const id = ctx.getImageData(0, 0, orig.width, orig.height);
    fn(id.data, params, orig.width, orig.height);
    ctx.putImageData(id, 0, 0);
    return nc;
  };

  function runAdjustment({ title, fields, produce }) {
    const l = requireRaster();
    if (!l) return;
    commitTextEditing();
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    const orig = l.canvas;
    openModal({
      title,
      fields,
      onChange: (params) => {
        l.canvas = maskedResult(l, orig, produce(orig, params));
        requestRender();
      },
      onOk: () => {
        commit(before);
        status(`${title} : appliqué.`);
      },
      onCancel: () => {
        l.canvas = orig;
        requestRender();
      },
    });
  }

  function quickAdjust(title, produce) {
    const l = requireRaster();
    if (!l) return;
    const before = C.snapshotDoc(S.doc);
    rasterizeIfTransformed(l);
    l.canvas = maskedResult(l, l.canvas, produce(l.canvas, {}));
    commit(before);
    status(`${title} : appliqué.`);
  }

  /* ================= Opérations sur le document ================= */

  function docOp(label, fn) {
    commitTextEditing();
    const before = C.snapshotDoc(S.doc);
    fn(S.doc);
    S.selection = null;
    syncDocCanvas();
    commit(before);
    layersChanged();
    status(label);
  }

  /** Aligne les canvas d'affichage sur les dimensions du document. */
  function syncDocCanvas() {
    if (els.canvas.width !== S.doc.width || els.canvas.height !== S.doc.height) {
      els.canvas.width = S.doc.width;
      els.canvas.height = S.doc.height;
      els.overlay.width = S.doc.width;
      els.overlay.height = S.doc.height;
    }
    layout();
  }

  function cropToSelection() {
    if (!S.selection) {
      status('Faites d’abord une sélection (rectangle, ellipse, lasso, baguette).');
      return;
    }
    const b = S.selection.bounds;
    const x = Math.max(0, Math.floor(b.x));
    const y = Math.max(0, Math.floor(b.y));
    const w = Math.min(S.doc.width, Math.ceil(b.x + b.w)) - x;
    const h = Math.min(S.doc.height, Math.ceil(b.y + b.h)) - y;
    if (w < 1 || h < 1) return;
    docOp(`Image recadrée en ${w} × ${h}px.`, (d) => C.cropDoc(d, { x, y, w, h }));
  }

  function resizeDialog() {
    const w0 = S.doc.width;
    const h0 = S.doc.height;
    const ratio = w0 / h0;
    openModal({
      title: 'Taille de l’image',
      fields: [
        {
          key: 'width',
          label: 'Largeur (px)',
          type: 'number',
          min: 1,
          max: 20000,
          value: w0,
          onInput: (p, set) => {
            if (p.linked === '1') set.height(Math.max(1, Math.round(p.width / ratio)));
          },
        },
        {
          key: 'height',
          label: 'Hauteur (px)',
          type: 'number',
          min: 1,
          max: 20000,
          value: h0,
          onInput: (p, set) => {
            if (p.linked === '1') set.width(Math.max(1, Math.round(p.height * ratio)));
          },
        },
        {
          key: 'linked',
          label: 'Conserver les proportions',
          type: 'select',
          value: '1',
          options: [
            { value: '1', label: 'Oui' },
            { value: '0', label: 'Non' },
          ],
        },
      ],
      onOk: (p) => {
        const nw = Math.max(1, Math.round(p.width));
        const nh = Math.max(1, Math.round(p.height));
        if (nw === w0 && nh === h0) return;
        docOp(`Image redimensionnée en ${nw} × ${nh}px.`, (d) => C.resizeDoc(d, nw, nh));
      },
    });
  }

  function mergeActiveDown() {
    const l = C.activeLayer(S.doc);
    if (!l) return;
    const before = C.snapshotDoc(S.doc);
    if (C.mergeDown(S.doc, l.id)) {
      commit(before);
      layersChanged();
      status('Calque fusionné avec celui du dessous.');
    } else {
      status('Fusion impossible : il faut un calque pixel juste en dessous.');
    }
  }

  function flattenAll() {
    const before = C.snapshotDoc(S.doc);
    commitTextEditing();
    C.flattenDoc(S.doc);
    commit(before);
    layersChanged();
    status('Image aplatie en un seul calque.');
  }

  function flipActiveLayer(horizontal) {
    const l = C.activeLayer(S.doc);
    if (!l || l.kind !== 'raster') {
      status('La symétrie de calque agit sur un calque pixel.');
      return;
    }
    const before = C.snapshotDoc(S.doc);
    C.flipLayer(l, horizontal);
    commit(before);
  }

  function exportDialog() {
    commitTextEditing();
    openModal({
      title: 'Exporter l’image',
      fields: [
        {
          key: 'format',
          label: 'Format',
          type: 'select',
          value: 'png',
          options: [
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' },
            { value: 'psd', label: 'PSD (calques préservés)' },
          ],
        },
        { key: 'quality', label: 'Qualité (JPEG/WebP)', type: 'slider', min: 10, max: 100, value: 92, unit: '%' },
      ],
      onOk: async (p) => {
        if (p.format === 'psd') {
          await exportPsdFile();
          return;
        }
        const canvas = C.flatten(S.doc);
        const mime = p.format === 'png' ? 'image/png' : p.format === 'webp' ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise((res) => canvas.toBlob(res, mime, p.quality / 100));
        if (!blob) return;
        const base = (S.file.name || 'image').replace(/\.[^.]+$/, '');
        const saved = await window.viewer.exportImage({
          suggestedName: `${base}.${p.format === 'jpeg' ? 'jpg' : p.format}`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
        status(saved ? `Image exportée : ${saved}` : 'Export annulé.');
      },
    });
  }

  /* ================= Styles du calque (ombre, contour, lueur) ================= */

  const ONOFF = [
    { value: '1', label: 'Activé' },
    { value: '0', label: 'Désactivé' },
  ];

  function layerStylesDialog() {
    const l = C.activeLayer(S.doc);
    if (!l) return;
    commitTextEditing();
    const before = C.snapshotDoc(S.doc);
    const prev = l.fx ? JSON.parse(JSON.stringify(l.fx)) : null;
    const cur = l.fx || {};
    const sh = cur.shadow || {};
    const st = cur.stroke || {};
    const gl = cur.glow || {};
    const num = (v, dflt) => (typeof v === 'number' ? v : dflt);
    openModal({
      title: 'Styles du calque',
      fields: [
        { key: 'shadowOn', label: 'Ombre portée', type: 'select', value: sh.on ? '1' : '0', options: ONOFF },
        { key: 'shadowDx', label: 'Décalage X', type: 'slider', min: -60, max: 60, value: num(sh.dx, 6), unit: 'px' },
        { key: 'shadowDy', label: 'Décalage Y', type: 'slider', min: -60, max: 60, value: num(sh.dy, 6), unit: 'px' },
        { key: 'shadowBlur', label: 'Flou', type: 'slider', min: 0, max: 60, value: num(sh.blur, 12), unit: 'px' },
        { key: 'shadowOpacity', label: 'Opacité', type: 'slider', min: 0, max: 100, value: num(sh.opacity, 60), unit: '%' },
        { key: 'shadowColor', label: 'Couleur', type: 'color', value: sh.color || '#000000' },
        { key: 'strokeOn', label: 'Contour', type: 'select', value: st.on ? '1' : '0', options: ONOFF },
        { key: 'strokeSize', label: 'Épaisseur', type: 'slider', min: 1, max: 30, value: num(st.size, 4), unit: 'px' },
        { key: 'strokeColor', label: 'Couleur', type: 'color', value: st.color || '#ffffff' },
        { key: 'glowOn', label: 'Lueur externe', type: 'select', value: gl.on ? '1' : '0', options: ONOFF },
        { key: 'glowSize', label: 'Étendue', type: 'slider', min: 1, max: 60, value: num(gl.size, 14), unit: 'px' },
        { key: 'glowColor', label: 'Couleur', type: 'color', value: gl.color || '#ffd166' },
      ],
      onChange: (p) => {
        l.fx = {
          shadow: { on: p.shadowOn === '1', dx: p.shadowDx, dy: p.shadowDy, blur: p.shadowBlur, opacity: p.shadowOpacity, color: p.shadowColor },
          stroke: { on: p.strokeOn === '1', size: p.strokeSize, color: p.strokeColor },
          glow: { on: p.glowOn === '1', size: p.glowSize, color: p.glowColor },
        };
        requestRender();
      },
      onOk: () => {
        commit(before);
        status('Styles du calque appliqués (non destructifs — modifiables à tout moment).');
      },
      onCancel: () => {
        l.fx = prev;
        requestRender();
      },
    });
  }

  /* ================= Projet .istudio (montage complet, calques préservés) ================= */

  function serializeProject() {
    commitTextEditing();
    return JSON.stringify({
      app: 'istudio',
      version: 1,
      width: S.doc.width,
      height: S.doc.height,
      meta: { dpi: S.meta.dpi, mode: S.meta.mode, name: S.file.name },
      activeLayerId: S.doc.activeLayerId,
      layers: S.doc.layers.map((l) => {
        const base = {
          id: l.id,
          kind: l.kind,
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          blend: l.blend || 'normal',
          x: l.x,
          y: l.y,
          tx: l.tx || null,
          fx: l.fx || null,
        };
        if (l.kind === 'raster') return { ...base, png: l.canvas.toDataURL('image/png') };
        return {
          ...base,
          text: l.text,
          fontSize: l.fontSize,
          color: l.color,
          bold: l.bold,
          italic: l.italic,
          underline: l.underline,
          strike: l.strike,
          font: l.font,
          strokeWidth: l.strokeWidth,
          strokeColor: l.strokeColor,
        };
      }),
    });
  }

  async function saveProjectFile() {
    const base = (S.file.name || 'montage').replace(/\.[^.]+$/, '');
    const saved = await window.viewer.saveProject({
      suggestedName: `${base}.istudio`,
      json: serializeProject(),
    });
    status(saved ? `Projet enregistré (calques préservés) : ${saved}` : 'Enregistrement du projet annulé.');
  }

  async function openProjectFile() {
    const json = await window.viewer.openProject();
    if (!json) return false;
    let data = null;
    try {
      data = JSON.parse(json);
    } catch {
      // illisible
    }
    if (!data || data.app !== 'istudio' || !Array.isArray(data.layers)) {
      status('Ce fichier n’est pas un projet IStudio valide.');
      return false;
    }
    const before = C.snapshotDoc(S.doc);
    const layers = [];
    // la CSP n'autorise pas les images data: — on passe par un Blob (blob:)
    const imageFromDataUrl = (dataUrl) =>
      new Promise((res) => {
        try {
          const bin = atob(dataUrl.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
          const im = new Image();
          im.onload = () => {
            URL.revokeObjectURL(url);
            res(im);
          };
          im.onerror = () => {
            URL.revokeObjectURL(url);
            res(null);
          };
          im.src = url;
        } catch {
          res(null);
        }
      });
    for (const sl of data.layers) {
      if (sl.kind === 'raster') {
        const img = await imageFromDataUrl(sl.png);
        if (!img) continue;
        const layer = C.createRasterLayer(sl.name, img.width, img.height);
        layer.canvas.getContext('2d').drawImage(img, 0, 0);
        Object.assign(layer, {
          id: sl.id,
          visible: sl.visible,
          opacity: sl.opacity,
          blend: sl.blend,
          x: sl.x,
          y: sl.y,
          tx: sl.tx || null,
          fx: sl.fx || null,
        });
        layers.push(layer);
      } else {
        const layer = C.createTextLayer({
          text: sl.text,
          x: sl.x,
          y: sl.y,
          fontSize: sl.fontSize,
          color: sl.color,
          bold: sl.bold,
          italic: sl.italic,
          underline: sl.underline,
          strike: sl.strike,
          font: sl.font,
          strokeWidth: sl.strokeWidth,
          strokeColor: sl.strokeColor,
        });
        Object.assign(layer, {
          id: sl.id,
          visible: sl.visible,
          opacity: sl.opacity,
          blend: sl.blend,
          fx: sl.fx || null,
        });
        layers.push(layer);
      }
    }
    if (!layers.length) {
      status('Projet vide ou illisible.');
      return false;
    }
    S.doc = {
      width: Math.max(1, Math.round(data.width)),
      height: Math.max(1, Math.round(data.height)),
      layers,
      activeLayerId: data.activeLayerId,
    };
    if (data.meta) {
      S.meta = { dpi: data.meta.dpi || 72, mode: data.meta.mode || 'rgb' };
      if (data.meta.name && !S.file.path) S.file = { ...S.file, name: data.meta.name };
      els.fileName.textContent = S.file.name;
    }
    S.selection = null;
    syncDocCanvas();
    commit(before);
    layersChanged();
    status('Projet chargé — tous les calques sont restaurés.');
    return true;
  }

  /** Depuis l'accueil : ouvre Studio (vierge si besoin) puis charge un projet. */
  async function openProjectFromHome() {
    const wasOpen = Boolean(S);
    if (!wasOpen) {
      open({
        file: { name: 'Projet', path: null, url: null },
        blank: { width: 1280, height: 800, background: null },
      });
    }
    const ok = await openProjectFile();
    if (!ok && !wasOpen) close(false);
    return ok;
  }

  /* ================= Export PSD (calques préservés) ================= */

  const BLEND_TO_PSD = {
    normal: 'normal',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'color dodge',
    'color-burn': 'color burn',
    'hard-light': 'hard light',
    'soft-light': 'soft light',
    difference: 'difference',
    exclusion: 'exclusion',
    hue: 'hue',
    saturation: 'saturation',
    color: 'color',
    luminosity: 'luminosity',
  };

  async function exportPsdFile() {
    commitTextEditing();
    if (host.ensurePsd) {
      try {
        await host.ensurePsd();
      } catch {
        // module indisponible
      }
    }
    if (!window.agPsd) {
      status('Module PSD indisponible.');
      return;
    }
    const children = S.doc.layers.map((l) => {
      const cl = C.cloneLayer(l);
      if (cl.kind === 'raster' && cl.tx) C.bakeTransform(cl);
      let canvas;
      let left;
      let top;
      if (cl.kind === 'raster') {
        canvas = cl.canvas;
        left = cl.x;
        top = cl.y;
      } else {
        // calque texte : rendu dans un canvas à son gabarit
        const pad = Math.ceil(cl.strokeWidth || 0) + 2;
        canvas = C.createCanvas(Math.ceil(cl.w) + pad * 2, Math.ceil(cl.h) + pad * 2);
        C.renderTextLayer(canvas.getContext('2d'), { ...cl, x: pad, y: pad });
        left = cl.x - pad;
        top = cl.y - pad;
      }
      return {
        name: l.name,
        left,
        top,
        opacity: l.opacity,
        hidden: !l.visible,
        blendMode: BLEND_TO_PSD[l.blend || 'normal'] || 'normal',
        canvas,
      };
    });
    const composite = C.flatten(S.doc);
    const buffer = window.agPsd.writePsd({
      width: S.doc.width,
      height: S.doc.height,
      canvas: composite,
      children,
    });
    const base = (S.file.name || 'montage').replace(/\.[^.]+$/, '');
    const saved = await window.viewer.exportImage({
      suggestedName: `${base}.psd`,
      data: new Uint8Array(buffer),
    });
    status(saved ? `PSD exporté avec ses calques : ${saved}` : 'Export PSD annulé.');
  }

  /* ================= Menus (Image, Réglages, Filtres) ================= */

  function menuItems(menuId) {
    if (menuId === 'image') {
      return [
        { label: 'Recadrer selon la sélection', action: cropToSelection, disabled: !S.selection },
        { label: 'Taille de l’image…', action: resizeDialog },
        'sep',
        { label: 'Rotation 90° horaire', action: () => docOp('Toile pivotée de 90°.', (d) => C.rotateDocQuarter(d, 1)) },
        { label: 'Rotation 90° antihoraire', action: () => docOp('Toile pivotée de -90°.', (d) => C.rotateDocQuarter(d, -1)) },
        { label: 'Symétrie horizontale', action: () => docOp('Symétrie horizontale appliquée.', (d) => C.flipDoc(d, true)) },
        { label: 'Symétrie verticale', action: () => docOp('Symétrie verticale appliquée.', (d) => C.flipDoc(d, false)) },
        'sep',
        { label: 'Symétrie du calque — horizontale', action: () => flipActiveLayer(true) },
        { label: 'Symétrie du calque — verticale', action: () => flipActiveLayer(false) },
        { label: 'Styles du calque…', action: layerStylesDialog },
        'sep',
        { label: 'Fusionner avec le calque du dessous\tCtrl+E', action: mergeActiveDown },
        { label: 'Aplatir l’image', action: flattenAll },
        'sep',
        { label: 'Enregistrer le projet (.istudio)…', action: saveProjectFile },
        { label: 'Ouvrir un projet…', action: openProjectFile },
        'sep',
        { label: 'Exporter…', action: exportDialog },
        { label: 'Exporter en PSD (calques)…', action: exportPsdFile },
      ];
    }
    if (menuId === 'reglages') {
      return [
        {
          label: 'Luminosité / Contraste…',
          action: () =>
            runAdjustment({
              title: 'Luminosité / Contraste',
              fields: [
                { key: 'brightness', label: 'Luminosité', type: 'slider', min: -100, max: 100, value: 0 },
                { key: 'contrast', label: 'Contraste', type: 'slider', min: -100, max: 100, value: 0 },
              ],
              produce: pixelProduce(C.adjustBrightnessContrast),
            }),
        },
        {
          label: 'Teinte / Saturation…',
          action: () =>
            runAdjustment({
              title: 'Teinte / Saturation',
              fields: [
                { key: 'hue', label: 'Teinte', type: 'slider', min: -180, max: 180, value: 0, unit: '°' },
                { key: 'saturation', label: 'Saturation', type: 'slider', min: -100, max: 100, value: 0 },
                { key: 'lightness', label: 'Luminosité', type: 'slider', min: -100, max: 100, value: 0 },
              ],
              produce: pixelProduce(C.adjustHueSaturation),
            }),
        },
        {
          label: 'Niveaux…',
          action: () =>
            runAdjustment({
              title: 'Niveaux',
              fields: [
                { key: 'black', label: 'Point noir', type: 'slider', min: 0, max: 250, value: 0 },
                { key: 'white', label: 'Point blanc', type: 'slider', min: 5, max: 255, value: 255 },
                { key: 'gamma', label: 'Gamma', type: 'slider', min: 10, max: 300, value: 100 },
              ],
              produce: pixelProduce((d, p) => C.adjustLevels(d, { black: p.black, white: p.white, gamma: p.gamma / 100 })),
            }),
        },
        {
          label: 'Courbes…',
          action: () =>
            runAdjustment({
              title: 'Courbes',
              fields: [
                {
                  key: 'lut',
                  label: 'Courbe RVB',
                  type: 'curve',
                  value: [
                    { x: 0, y: 0 },
                    { x: 255, y: 255 },
                  ],
                },
              ],
              produce: pixelProduce((d, p) => C.applyLut(d, { lut: p.lut })),
            }),
        },
        'sep',
        { label: 'Inverser les couleurs', action: () => quickAdjust('Inversion', pixelProduce((d) => C.adjustInvert(d))) },
        { label: 'Noir et blanc', action: () => quickAdjust('Noir et blanc', pixelProduce((d) => C.adjustGrayscale(d))) },
      ];
    }
    return [
      {
        label: 'Flou gaussien…',
        action: () =>
          runAdjustment({
            title: 'Flou gaussien',
            fields: [{ key: 'radius', label: 'Rayon', type: 'slider', min: 1, max: 60, value: 6, unit: 'px' }],
            produce: (orig, p) => C.blurCanvas(orig, p.radius),
          }),
      },
      {
        label: 'Netteté…',
        action: () =>
          runAdjustment({
            title: 'Netteté',
            fields: [{ key: 'amount', label: 'Intensité', type: 'slider', min: 1, max: 100, value: 40 }],
            produce: pixelProduce((d, p, w, h) => C.filterSharpen(d, w, h, p)),
          }),
      },
      {
        label: 'Bruit…',
        action: () =>
          runAdjustment({
            title: 'Bruit',
            fields: [{ key: 'amount', label: 'Quantité', type: 'slider', min: 1, max: 100, value: 20 }],
            produce: pixelProduce((d, p) => C.filterNoise(d, p)),
          }),
      },
      {
        label: 'Pixelliser…',
        action: () =>
          runAdjustment({
            title: 'Pixelliser',
            fields: [{ key: 'size', label: 'Taille de cellule', type: 'slider', min: 2, max: 64, value: 8, unit: 'px' }],
            produce: (orig, p) => C.pixelateCanvas(orig, p.size),
          }),
      },
    ];
  }

  function openMenu(btn) {
    const items = menuItems(btn.dataset.menu);
    const pop = els.menuPopup;
    pop.innerHTML = '';
    for (const it of items) {
      if (it === 'sep') {
        const s = document.createElement('div');
        s.className = 'studio-menu-sep';
        pop.appendChild(s);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'studio-menu-item';
      const parts = it.label.split('\t');
      b.textContent = st(parts[0]);
      if (parts[1]) {
        const kbd = document.createElement('span');
        kbd.className = 'studio-menu-kbd';
        kbd.textContent = parts[1];
        b.appendChild(kbd);
      }
      b.disabled = Boolean(it.disabled);
      b.addEventListener('click', () => {
        closeMenu();
        it.action();
      });
      pop.appendChild(b);
    }
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    pop.style.left = `${r.left}px`;
    pop.style.top = `${r.bottom + 4}px`;
  }

  function closeMenu() {
    els.menuPopup.hidden = true;
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
    const t = l.tx || { sx: 1, sy: 1, rot: 0, k: 0 };
    const cos = Math.cos(t.rot);
    const sin = Math.sin(t.rot);
    const shear = t.k || 0;
    // ordre : échelle, inclinaison (cisaillement), rotation — voir core.js
    const map = (lx, ly) => {
      const xs = lx * t.sx + shear * (ly * t.sy);
      const ys = ly * t.sy;
      return { x: cx + xs * cos - ys * sin, y: cy + xs * sin + ys * cos };
    };
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
    const xr = dx * cos + dy * sin;
    const yr = -dx * sin + dy * cos;
    return {
      x: (xr - (f.t.k || 0) * yr) / (f.t.sx || 1e-6),
      y: yr / (f.t.sy || 1e-6),
    };
  }

  /* Matrice linéaire 2×2 de la transformation (colonnes = images des axes
     locaux), et décomposition inverse : toute matrice inversible se ramène
     à rotation ∘ inclinaison ∘ échelle (décomposition QR). */
  function txMatrix(t) {
    const cos = Math.cos(t.rot);
    const sin = Math.sin(t.rot);
    const k = t.k || 0;
    return {
      a: cos * t.sx,
      b: sin * t.sx,
      c: cos * k * t.sy - sin * t.sy,
      d: sin * k * t.sy + cos * t.sy,
    };
  }

  function matrixTx(m) {
    const len = Math.hypot(m.a, m.b) || 1e-6;
    const cos = m.a / len;
    const sin = m.b / len;
    const r12 = cos * m.c + sin * m.d;
    const sy = -sin * m.c + cos * m.d;
    return {
      sx: len,
      sy: sy || 1e-6,
      rot: Math.atan2(sin, cos),
      k: Math.abs(sy) > 1e-6 ? r12 / sy : 0,
    };
  }

  function insideActiveFrame(p) {
    const f = activeFrame();
    if (!f) return false;
    const lp = toLocal(f, p);
    return Math.abs(lp.x) <= f.w / 2 && Math.abs(lp.y) <= f.h / 2;
  }

  /** Coordonnées locales (non transformées) d'un coin / milieu de bord. */
  function cornerLocal(i, w, h) {
    return { x: i === 0 || i === 3 ? -w / 2 : w / 2, y: i < 2 ? -h / 2 : h / 2 };
  }

  function edgeLocal(i, w, h) {
    if (i === 0) return { x: 0, y: -h / 2 };
    if (i === 1) return { x: w / 2, y: 0 };
    if (i === 2) return { x: 0, y: h / 2 };
    return { x: -w / 2, y: 0 };
  }

  function beginTransform(handle, p) {
    const f = activeFrame();
    if (!f) return false;
    if (f.l.kind === 'text' && handle.kind !== 'corner') {
      status('Sur un texte : redimensionnez par les coins (rotation à venir).');
      return false;
    }
    // Point d'ancrage : l'opposé de la poignée tirée reste immobile
    // (Alt : échelle depuis le centre, comme Photoshop).
    let anchor = null;
    let anchorLocal = null;
    let dragLocal = null;
    let startDistA = 1;
    if (handle.kind === 'corner') {
      const j = (handle.index + 2) % 4;
      anchor = f.corners[j];
      anchorLocal = cornerLocal(j, f.w, f.h);
      dragLocal = cornerLocal(handle.index, f.w, f.h);
      startDistA = Math.max(
        1e-3,
        Math.hypot(f.corners[handle.index].x - anchor.x, f.corners[handle.index].y - anchor.y)
      );
    } else if (handle.kind === 'edge') {
      const j = (handle.index + 2) % 4;
      anchor = f.edges[j];
      anchorLocal = edgeLocal(j, f.w, f.h);
      dragLocal = edgeLocal(handle.index, f.w, f.h);
    }
    transformGesture = {
      handle,
      f,
      before: C.snapshotDoc(S.doc),
      orig: { k: 0, ...(f.l.tx || { sx: 1, sy: 1, rot: 0 }) },
      origFont: f.l.kind === 'text' ? f.l.fontSize : 0,
      startAngle: Math.atan2(p.y - f.cy, p.x - f.cx),
      startDist: Math.max(1e-3, Math.hypot(p.x - f.cx, p.y - f.cy)),
      startLocal: toLocal(f, p),
      anchor,
      anchorLocal,
      dragLocal,
      startDistA,
    };
    return true;
  }

  function updateTransform(p, shiftKey, altKey, ctrlKey) {
    const g = transformGesture;
    if (!g) return;
    const l = g.f.l;
    const origK = g.orig.k || 0;

    if (g.handle.kind === 'rotate') {
      let rot = g.orig.rot + (Math.atan2(p.y - g.f.cy, p.x - g.f.cx) - g.startAngle);
      if (shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12); // pas de 15°
      l.tx = { sx: g.orig.sx, sy: g.orig.sy, rot, k: origK };
      requestRender();
      return;
    }

    // Ctrl : déformation (comme Photoshop) — coin : distorsion, l'ancre et
    // le pointeur commandent la matrice ; bord : inclinaison pure, le
    // déplacement ne compte que le long du bord. Calques raster seulement.
    if (ctrlKey && g.anchor && l.kind === 'raster') {
      const M0 = txMatrix(g.orig);
      const v = { x: g.dragLocal.x - g.anchorLocal.x, y: g.dragLocal.y - g.anchorLocal.y };
      const m0v = { x: M0.a * v.x + M0.c * v.y, y: M0.b * v.x + M0.d * v.y };
      let delta = { x: p.x - g.anchor.x - m0v.x, y: p.y - g.anchor.y - m0v.y };
      if (g.handle.kind === 'edge') {
        const e = g.handle.index % 2 === 1 ? { x: 0, y: 1 } : { x: 1, y: 0 }; // direction locale du bord
        const ex = M0.a * e.x + M0.c * e.y;
        const ey = M0.b * e.x + M0.d * e.y;
        const len = Math.hypot(ex, ey) || 1e-6;
        const dot = (delta.x * ex + delta.y * ey) / len;
        delta = { x: (ex / len) * dot, y: (ey / len) * dot };
      }
      // mise à jour de rang 1 : M·v suit exactement le pointeur, les
      // vecteurs orthogonaux à v (dans le repère local) sont préservés
      const vv = v.x * v.x + v.y * v.y || 1e-6;
      const t = matrixTx({
        a: M0.a + (delta.x * v.x) / vv,
        c: M0.c + (delta.x * v.y) / vv,
        b: M0.b + (delta.y * v.x) / vv,
        d: M0.d + (delta.y * v.y) / vv,
      });
      if (Math.abs(t.sx) < 0.02 || Math.abs(t.sy) < 0.02 || Math.abs(t.k) > 8) return;
      l.tx = t;
      // l'ancre reste exactement immobile
      const M = txMatrix(t);
      const ax = M.a * g.anchorLocal.x + M.c * g.anchorLocal.y;
      const ay = M.b * g.anchorLocal.x + M.d * g.anchorLocal.y;
      l.x = Math.round(g.anchor.x - ax - g.f.w / 2);
      l.y = Math.round(g.anchor.y - ay - g.f.h / 2);
      requestRender();
      return;
    }

    if (l.kind === 'text') {
      // corps de texte : le coin opposé reste immobile (Alt : depuis le centre)
      const s = altKey
        ? Math.hypot(p.x - g.f.cx, p.y - g.f.cy) / g.startDist
        : Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y) / g.startDistA;
      l.fontSize = Math.min(2000, Math.max(4, g.origFont * s));
      C.refreshTextLayer(l);
      if (altKey) {
        l.x = Math.round(g.f.cx - l.w / 2);
        l.y = Math.round(g.f.cy - l.h / 2);
      } else {
        const k = (g.handle.index + 2) % 4; // coin d'ancrage
        l.x = Math.round(k === 0 || k === 3 ? g.anchor.x : g.anchor.x - l.w);
        l.y = Math.round(k < 2 ? g.anchor.y : g.anchor.y - l.h);
      }
      requestRender();
      return;
    }

    if (altKey) {
      // Alt : échelle autour du centre (comportement Photoshop)
      if (g.handle.kind === 'corner') {
        const s = Math.hypot(p.x - g.f.cx, p.y - g.f.cy) / g.startDist;
        if (shiftKey) {
          const lp = toLocal({ ...g.f, t: { ...g.orig, sx: 1, sy: 1 } }, p);
          const sx = g.startLocal.x * g.orig.sx ? lp.x / (g.startLocal.x * g.orig.sx) : 1;
          const sy = g.startLocal.y * g.orig.sy ? lp.y / (g.startLocal.y * g.orig.sy) : 1;
          l.tx = { sx: clampScale(g.orig.sx * sx), sy: clampScale(g.orig.sy * sy), rot: g.orig.rot, k: origK };
        } else {
          l.tx = { sx: clampScale(g.orig.sx * s), sy: clampScale(g.orig.sy * s), rot: g.orig.rot, k: origK };
        }
      } else {
        const lp = toLocal({ ...g.f, t: { ...g.orig, sx: 1, sy: 1 } }, p);
        const horizontal = g.handle.index % 2 === 1;
        if (horizontal) {
          const ratio = g.startLocal.x * g.orig.sx ? lp.x / (g.startLocal.x * g.orig.sx) : 1;
          l.tx = { sx: clampScale(g.orig.sx * ratio), sy: g.orig.sy, rot: g.orig.rot, k: origK };
        } else {
          const ratio = g.startLocal.y * g.orig.sy ? lp.y / (g.startLocal.y * g.orig.sy) : 1;
          l.tx = { sx: g.orig.sx, sy: clampScale(g.orig.sy * ratio), rot: g.orig.rot, k: origK };
        }
      }
      requestRender();
      return;
    }

    // Par défaut : la poignée OPPOSÉE est le point fixe — précis et prévisible.
    const rot = g.orig.rot;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const dx = p.x - g.anchor.x;
    const dy = p.y - g.anchor.y;
    const d = { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }; // repère local
    const diag = { x: g.dragLocal.x - g.anchorLocal.x, y: g.dragLocal.y - g.anchorLocal.y };
    let sx = g.orig.sx;
    let sy = g.orig.sy;
    if (g.handle.kind === 'corner') {
      if (shiftKey) {
        // Maj : libre par axe
        if (diag.x) sx = d.x / diag.x;
        if (diag.y) sy = d.y / diag.y;
      } else {
        // uniforme : projection du geste sur la diagonale
        const s = (d.x * diag.x + d.y * diag.y) / (diag.x * diag.x + diag.y * diag.y);
        sx = s;
        sy = s;
      }
    } else if (g.handle.index % 2 === 1) {
      if (diag.x) sx = d.x / diag.x;
    } else if (diag.y) {
      sy = d.y / diag.y;
    }
    sx = clampScale(sx);
    sy = clampScale(sy);
    // replace le centre pour que l'ancre reste exactement immobile
    // (l'inclinaison éventuelle fait partie de la position de l'ancre)
    const ax = g.anchorLocal.x * sx + origK * (g.anchorLocal.y * sy);
    const ay = g.anchorLocal.y * sy;
    const ncx = g.anchor.x - (ax * cos - ay * sin);
    const ncy = g.anchor.y - (ax * sin + ay * cos);
    l.tx = { sx, sy, rot, k: origK };
    l.x = Math.round(ncx - g.f.w / 2);
    l.y = Math.round(ncy - g.f.h / 2);
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
      Math.abs(l.tx.rot) < 1e-3 &&
      Math.abs(l.tx.k || 0) < 1e-3
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
    const vs = [];
    const hs = [];
    const cx = l.x + w / 2;
    const cy = l.y + h / 2;
    const snapX = Math.abs(cx - S.doc.width / 2) <= thr;
    const snapY = Math.abs(cy - S.doc.height / 2) <= thr;
    if (snapX) l.x = Math.round(S.doc.width / 2 - w / 2);
    if (snapY) l.y = Math.round(S.doc.height / 2 - h / 2);
    // bords du document
    if (!snapX) {
      if (Math.abs(l.x) <= thr) {
        l.x = 0;
        vs.push(0);
      } else if (Math.abs(l.x + w - S.doc.width) <= thr) {
        l.x = Math.round(S.doc.width - w);
        vs.push(S.doc.width);
      }
    }
    if (!snapY) {
      if (Math.abs(l.y) <= thr) {
        l.y = 0;
        hs.push(0);
      } else if (Math.abs(l.y + h - S.doc.height) <= thr) {
        l.y = Math.round(S.doc.height - h);
        hs.push(S.doc.height);
      }
    }
    S.snapGuides = snapX || snapY || vs.length || hs.length ? { x: snapX, y: snapY, vs, hs } : null;
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
    if (S.editing) {
      mutator(S.editing);
      layoutTextEditor();
    }
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

  /** Détecte si une famille de police est réellement disponible : on compare
      la largeur d'un texte rendu avec la famille + repli, contre le repli seul. */
  let fontProbe = null;

  function fontAvailable(cssFamily) {
    if (!fontProbe) fontProbe = document.createElement('canvas').getContext('2d');
    const sample = 'mmMMwwWW1234567890ilIL';
    fontProbe.font = '32px monospace';
    const w1 = fontProbe.measureText(sample).width;
    fontProbe.font = `32px ${cssFamily}, monospace`;
    const w2 = fontProbe.measureText(sample).width;
    fontProbe.font = `32px ${cssFamily}, serif`;
    const w3 = fontProbe.measureText(sample).width;
    // si la famille manque, les replis (monospace vs serif) donnent des
    // largeurs différentes entre elles ; si elle existe, w2 === w3
    return w2 === w3 || w2 !== w1;
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
    const curFont = (current ? current.font : S.textStyle.font) || FONTS[0].css;
    // Police venue d'ailleurs (PSD…) : on l'ajoute à la liste au lieu de
    // l'écraser par la police par défaut — signalée si elle est absente
    // du système (le rendu se fait alors avec une police de repli).
    if (!FONTS.some((f) => f.css === curFont)) {
      const opt = document.createElement('option');
      opt.value = curFont;
      const label = curFont.replace(/"/g, '');
      opt.textContent = fontAvailable(curFont) ? label : `${label} (absente)`;
      select.appendChild(opt);
    }
    select.value = curFont;
    select.addEventListener('change', () => {
      applyTextStyle((t) => {
        t.font = select.value;
      });
    });
    box.appendChild(select);

    // Styles : gras, italique, souligné, barré
    const mkStyleToggle = (label, title, prop, cls) => {
      const btn = document.createElement('button');
      btn.className = `studio-style-btn ${cls}`;
      btn.textContent = label;
      btn.title = title;
      btn.classList.toggle('is-active', Boolean(current ? current[prop] : S.textStyle[prop]));
      btn.addEventListener('click', () => {
        const l = activeTextLayer();
        const next = !(l ? l[prop] : S.textStyle[prop]);
        applyTextStyle((t) => {
          t[prop] = next;
        });
        btn.classList.toggle('is-active', next);
      });
      return btn;
    };
    box.append(
      mkStyleToggle('G', 'Gras', 'bold', 'f-bold'),
      mkStyleToggle('I', 'Italique', 'italic', 'f-italic'),
      mkStyleToggle('S', 'Souligné', 'underline', 'f-underline'),
      mkStyleToggle('B', 'Barré', 'strike', 'f-strike')
    );

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

  /* Le curseur de taille est logarithmique : autant de course pour 1→10 px
     que pour 100→1000 px — précis pour les petites pointes, ample pour les
     grandes. Le champ numérique permet de toute façon la valeur exacte. */
  const BRUSH_SIZE_MAX = 1000;
  const SIZE_SLIDER_STEPS = 1000;

  function sizeFromSlider(pos) {
    return Math.round(Math.exp((pos / SIZE_SLIDER_STEPS) * Math.log(BRUSH_SIZE_MAX)));
  }

  function sizeToSlider(size) {
    return Math.round((Math.log(Math.max(1, size)) / Math.log(BRUSH_SIZE_MAX)) * SIZE_SLIDER_STEPS);
  }

  function popupBrush() {
    return S && brushPopupTool ? S.brushes[brushPopupTool] : null;
  }

  function syncBrushPopupUI() {
    const b = popupBrush();
    if (!b) return;
    els.sbpSize.value = String(sizeToSlider(b.size));
    els.sbpSizeNum.value = String(b.size);
    els.sbpHardness.value = String(b.hardness);
    els.sbpHardnessNum.value = String(b.hardness);
    els.sbpRoundness.value = String(b.roundness);
    els.sbpRoundnessNum.value = String(b.roundness);
    els.sbpAngle.value = String(b.angle);
    els.sbpAngleNum.value = String(b.angle);
    renderTipPreview(els.sbpPreview, b, 68);
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
    const apply = (prop, value) => {
      const b = popupBrush();
      if (!b) return;
      b[prop] = value;
      renderTipPreview(els.sbpPreview, b, 68);
      updateOptionsBar(); // les curseurs de la barre d'options suivent
      drawHud(); // le cercle d'impact suit les réglages
    };
    /* Chaque rangée : un curseur et un champ numérique synchronisés —
       le champ donne la valeur exacte, le curseur la course rapide. */
    const bindRow = ({ slider, num, prop, min, max, toValue, toSlider }) => {
      slider.addEventListener('input', () => {
        const v = toValue ? toValue(Number(slider.value)) : Number(slider.value);
        num.value = String(v);
        apply(prop, v);
      });
      num.addEventListener('change', () => {
        const v = Math.round(Math.min(max, Math.max(min, Number(num.value) || min)));
        num.value = String(v);
        slider.value = String(toSlider ? toSlider(v) : v);
        apply(prop, v);
      });
    };
    bindRow({
      slider: els.sbpSize,
      num: els.sbpSizeNum,
      prop: 'size',
      min: 1,
      max: BRUSH_SIZE_MAX,
      toValue: sizeFromSlider,
      toSlider: sizeToSlider,
    });
    bindRow({ slider: els.sbpHardness, num: els.sbpHardnessNum, prop: 'hardness', min: 0, max: 100 });
    bindRow({ slider: els.sbpRoundness, num: els.sbpRoundnessNum, prop: 'roundness', min: 10, max: 100 });
    bindRow({ slider: els.sbpAngle, num: els.sbpAngleNum, prop: 'angle', min: 0, max: 180 });

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
        max: BRUSH_SIZE_MAX,
        scale: 'log',
        value: brush.size,
        unit: 'px',
        onInput: (v) => {
          brush.size = v;
          renderTipPreview(tipCv, brush, 24);
          if (brushPopupTool === toolId) syncBrushPopupUI();
          drawHud();
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
    clipSelection(nctx);
    nctx.drawImage(l.canvas, l.x, l.y);
    nctx.restore();
    if (cut) {
      const sctx = l.canvas.getContext('2d');
      sctx.save();
      sctx.translate(-l.x, -l.y);
      sctx.globalCompositeOperation = 'destination-out';
      sctx.fill(S.selection.path, selFillRule());
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
    ctx.fill(S.selection.path, selFillRule());
    ctx.restore();
    commit(before);
  }

  function deselect() {
    S.selection = null;
    requestRender();
    updateOptionsBar();
  }

  /* scale: 'log' — curseur logarithmique (précision sur les petites valeurs,
     course ample sur les grandes) ; min doit alors être >= 1. */
  function buildSlider({ label, min, max, value, unit, onInput, scale }) {
    const box = document.createElement('div');
    box.className = 'studio-opt-group';
    const lab = document.createElement('span');
    lab.className = 'studio-opt-label';
    lab.textContent = st(label);
    const log = scale === 'log';
    const toPos = (v) =>
      log ? Math.round((Math.log(Math.max(min, v) / min) / Math.log(max / min)) * 1000) : v;
    const fromPos = (p) => (log ? Math.round(min * Math.pow(max / min, p / 1000)) : p);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = log ? '0' : String(min);
    input.max = log ? '1000' : String(max);
    input.value = String(toPos(value));
    const val = document.createElement('span');
    val.className = 'studio-opt-value';
    val.textContent = `${value} ${unit}`;
    input.addEventListener('input', () => {
      const v = fromPos(Number(input.value));
      onInput(v);
      val.textContent = `${v} ${unit}`;
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
      els.stage.style.cursor = cursor === 'default' ? '' : cursor;
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
    finishSelection,
    setSelectionDraft,
    buildSelectionActions,
    wandSelect,
    buildWandOptions,
    setGradientPreview,
    applyGradient,
    buildGradientOptions,
    beginCloneStroke,
    cloneStampSegment,
    beginRetouchStroke,
    retouchStampSegment,
    buildRetouchOptions,
    setShapeDraft,
    applyShape,
    buildShapeOptions,
    shapeKind: () => S.shape.kind,
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
    beginHealStroke,
    healStampSegment,
    endHealStroke,
    guideDown,
    guideMove,
    guideUp,
    guideHitAt,
    buildGuideOptions,
    bucketFill,
    buildBucketOptions,
    magicErase,
    buildMagicOptions,
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
    syncDocCanvas(); // les dimensions du document ont pu changer
    updateHistoryUI();
    layersChanged();
    requestRender();
  }

  function redo() {
    const doc = S.history.redo(C.snapshotDoc(S.doc));
    if (!doc) return;
    S.doc = doc;
    S.selection = null;
    syncDocCanvas();
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
    els.stage.style.cursor = tool.cursor && tool.cursor !== 'default' ? tool.cursor : '';
    status(st(tool.hint || ''));
    updateOptionsBar();
    updateStatus();
    drawHud();
  }

  function updateOptionsBar() {
    if (!S) return;
    els.optionsbar.innerHTML = '';
    const tool = currentTool();
    const name = document.createElement('span');
    name.className = 'studio-opt-toolname';
    name.innerHTML = svgIcon(tool.icon, 13) + st(tool.label).split('—')[0].trim();
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
    if (e.target === els.textEditor) return; // édition de texte en cours
    // empêche le mousedown par défaut de voler le focus (champ de texte)
    e.preventDefault();
    try {
      els.stage.setPointerCapture(e.pointerId);
    } catch {
      // pointeur synthétique (tests)
    }
    commitTextEditing();
    currentTool().onDown(ed, pointerPos(e), e);
  }

  function onPointerMove(e) {
    const p = pointerPos(e);
    S.cursorPos = p;
    currentTool().onMove(ed, p, e);
    if (S.brushes[S.tool]) drawHud();
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
    t.style.fontStyle = edp.italic ? 'italic' : 'normal';
    t.style.textDecoration =
      [edp.underline ? 'underline' : '', edp.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
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
        italic: layer.italic,
        underline: layer.underline,
        strike: layer.strike,
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
        italic: S.textStyle.italic,
        underline: S.textStyle.underline,
        strike: S.textStyle.strike,
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
      italic: edp.italic,
      underline: edp.underline,
      strike: edp.strike,
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
    els.blend.value = (active && active.blend) || 'normal';

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
      name.title =
        layer.kind === 'text'
          ? 'Calque de texte (double-clic sur le nom : renommer)'
          : `${layer.name} (double-clic : renommer)`;
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRenameLayer(layer, name);
      });

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

  /** Renommage en place d'un calque (double-clic sur son nom). */
  function startRenameLayer(layer, nameEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'studio-rename-input';
    input.value = layer.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const done = (apply) => {
      const v = input.value.trim();
      if (apply && v && v !== layer.name) {
        const before = C.snapshotDoc(S.doc);
        layer.name = v.slice(0, 40);
        commit(before);
      }
      layersChanged();
    };
    input.addEventListener('blur', () => done(true));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = layer.name;
        input.blur();
      }
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

  /** Supprime le calque actif (touche Suppr sans sélection). */
  function deleteActiveLayer() {
    const l = C.activeLayer(S.doc);
    if (!l) return;
    if (S.doc.layers.length <= 1) {
      status('Impossible de supprimer le dernier calque du montage.');
      return;
    }
    const before = C.snapshotDoc(S.doc);
    if (C.removeLayer(S.doc, l.id)) {
      commit(before);
      layersChanged();
      status(`Calque « ${l.name} » supprimé.`);
    }
  }

  function updateStatus() {
    if (!S) return;
    els.statusDoc.textContent = `${S.doc.width} × ${S.doc.height} px · ${S.meta.dpi} DPI · ${
      S.meta.mode === 'cmyk' ? 'CMJN' : 'RVB'
    } · zoom ${Math.round(S.scale * 100)} %`;
    const l = C.activeLayer(S.doc);
    const tool = currentTool();
    els.statusLayer.textContent = `${l ? l.name : '–'} · ${st('outil')} : ${tool ? st(tool.label).split('—')[0].split('(')[0].trim() : ''}`;
    updateInfoBar();
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

  let spaceHeld = false;
  let panDrag = null;

  function onKeyDown(e) {
    if (!S) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (e.key === ' ') {
      // Espace maintenu : main (panoramique au glisser)
      if (!spaceHeld) {
        spaceHeld = true;
        els.stage.style.cursor = 'grab';
      }
      e.preventDefault();
      return;
    }
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
      status('Transformation : poignées = échelle (Maj = libre, Ctrl = déformer / incliner), poignée du haut = rotation (Maj = 15°).');
    } else if ((e.ctrlKey || e.metaKey) && key === 'j') {
      e.preventDefault();
      selectionToLayer(false);
    } else if ((e.ctrlKey || e.metaKey) && key === 'd') {
      e.preventDefault();
      deselect();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'i') {
      e.preventDefault();
      invertSelection();
    } else if ((e.ctrlKey || e.metaKey) && key === 'a') {
      e.preventDefault();
      selectAll();
    } else if ((e.ctrlKey || e.metaKey) && key === 'e') {
      e.preventDefault();
      mergeActiveDown();
    } else if (!e.ctrlKey && !e.metaKey && (key === '[' || key === ']')) {
      const brush = S.brushes[S.tool];
      if (brush) {
        const step = brush.size < 12 ? 1 : brush.size < 60 ? 4 : 10;
        brush.size = Math.min(BRUSH_SIZE_MAX, Math.max(1, brush.size + (key === ']' ? step : -step)));
        updateOptionsBar();
        if (brushPopupTool === S.tool) syncBrushPopupUI();
        drawHud();
      }
    } else if (!e.ctrlKey && !e.metaKey && key === 'x') {
      const t = S.color;
      setColor(S.color2);
      setColor2(t);
      status('Couleurs permutées.');
    } else if (key === '+' || key === '=') {
      e.preventDefault();
      setZoom(S.scale * 1.25);
    } else if (key === '-') {
      e.preventDefault();
      setZoom(S.scale / 1.25);
    } else if (key === '0' && !e.ctrlKey && !e.metaKey) {
      zoomFit();
    } else if (key === '1' && !e.ctrlKey && !e.metaKey) {
      setZoom(1);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // une sélection prime (on efface dedans) ; sinon le calque entier part
      if (S.selection) eraseSelection();
      else deleteActiveLayer();
    } else if (e.key === 'Escape') {
      if (modalState) {
        closeModal(false);
      } else if (!els.menuPopup.hidden) {
        closeMenu();
      } else if (!els.brushPopup.hidden) {
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

    els.btnZoomIn.addEventListener('click', () => setZoom(S.scale * 1.25));
    els.btnZoomOut.addEventListener('click', () => setZoom(S.scale / 1.25));
    els.btnZoomFit.addEventListener('click', zoomFit);
    els.zoomLabel.addEventListener('click', () => setZoom(1));

    // Changement de langue : re-balaye les textes du Studio et reconstruit
    // ce qui est généré dynamiquement (barre d'options, modes de fusion…)
    if (window.I18n) {
      window.I18n.onChange(() => {
        if (!els) return;
        window.I18n.apply(els.root);
        C.BLEND_MODES.forEach((mode, i) => {
          if (els.blend.options[i]) els.blend.options[i].textContent = st(mode.label);
        });
        if (S) {
          updateOptionsBar();
          updateStatus();
        }
      });
    }

    // Barre d'infos éditable : chaque champ applique sa valeur au calque
    for (const [input, field] of [
      [els.infX, 'x'],
      [els.infY, 'y'],
      [els.infL, 'l'],
      [els.infH, 'h'],
      [els.infA, 'a'],
      [els.infV, 'v'],
    ]) {
      input.addEventListener('change', () => {
        applyInfoEdit(field, input.value);
        input.blur();
      });
      input.addEventListener('keydown', (e) => e.stopPropagation());
    }

    // Commutateurs d'affichage : distances aux bords, grille (persistés)
    const syncViewToggles = () => {
      els.toggleDist.classList.toggle('is-active', showDistances);
      els.toggleGrid.classList.toggle('is-active', showGrid);
    };
    els.toggleDist.addEventListener('click', () => {
      showDistances = !showDistances;
      localStorage.setItem('studioShowDist', String(showDistances));
      syncViewToggles();
      if (S) drawHud();
    });
    els.toggleGrid.addEventListener('click', () => {
      showGrid = !showGrid;
      localStorage.setItem('studioShowGrid', String(showGrid));
      syncViewToggles();
      if (S) drawHud();
    });
    syncViewToggles();

    // Les gestes s'écoutent sur toute la scène, pas seulement le canevas :
    // un coup de pinceau peut commencer (et vivre) hors de l'image — seule
    // sa partie qui recouvre le calque laisse une trace, comme Photoshop.
    els.stage.addEventListener('pointerdown', onPointerDown);
    els.stage.addEventListener('pointermove', onPointerMove);
    els.stage.addEventListener('pointerup', onPointerUp);
    els.stage.addEventListener('pointercancel', onPointerUp);
    els.stage.addEventListener('dblclick', onDblClick);
    els.stage.addEventListener('pointerleave', () => {
      if (!S) return;
      S.cursorPos = null;
      drawHud();
    });
    els.stage.addEventListener('scroll', syncHud);

    // Zoom à la molette, centré sur le curseur.
    els.stage.addEventListener(
      'wheel',
      (e) => {
        if (!S) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setZoom(S.scale * factor, e.clientX, e.clientY);
      },
      { passive: false }
    );

    // Panoramique : molette-clic, ou Espace + glisser (phase capture pour
    // que l'outil actif ne reçoive pas le geste).
    els.stage.addEventListener(
      'pointerdown',
      (e) => {
        if (!S) return;
        if (e.button === 1 || (e.button === 0 && spaceHeld)) {
          e.preventDefault();
          e.stopPropagation();
          panDrag = { x: e.clientX, y: e.clientY, sl: els.stage.scrollLeft, st: els.stage.scrollTop };
          els.stage.style.cursor = 'grabbing';
          try {
            els.stage.setPointerCapture(e.pointerId);
          } catch {
            // pointeur synthétique (tests)
          }
        }
      },
      true
    );
    window.addEventListener('pointermove', (e) => {
      if (!panDrag) return;
      els.stage.scrollLeft = panDrag.sl - (e.clientX - panDrag.x);
      els.stage.scrollTop = panDrag.st - (e.clientY - panDrag.y);
    });
    window.addEventListener('pointerup', () => {
      if (!panDrag) return;
      panDrag = null;
      els.stage.style.cursor = spaceHeld ? 'grab' : '';
    });

    // Clic droit sur la scène : réglages de la brosse (pinceau / gomme / tampon).
    els.stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (S && S.brushes[S.tool]) {
        openBrushPopup(S.tool, e.clientX, e.clientY);
      }
    });

    // Menus Image / Réglages / Filtres
    for (const btn of els.root.querySelectorAll('.studio-menu-btn')) {
      btn.addEventListener('click', () => {
        if (!S) return;
        if (!els.menuPopup.hidden) {
          closeMenu();
          return;
        }
        openMenu(btn);
      });
    }
    document.addEventListener('pointerdown', (e) => {
      if (els.menuPopup.hidden) return;
      if (els.menuPopup.contains(e.target) || e.target.closest('.studio-menu-btn')) return;
      closeMenu();
    });

    // Modale : OK / Annuler / Échap
    els.modalOk.addEventListener('click', () => closeModal(true));
    els.modalCancel.addEventListener('click', () => closeModal(false));
    els.modalBackdrop.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') closeModal(false);
      if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) closeModal(true);
    });

    // Mode de fusion du calque actif
    els.blend.addEventListener('change', () => {
      const l = C.activeLayer(S.doc);
      if (!l) return;
      const before = C.snapshotDoc(S.doc);
      l.blend = els.blend.value;
      commit(before);
      status(`Mode de fusion : ${els.blend.selectedOptions[0].textContent}.`);
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
    window.addEventListener('keyup', (e) => {
      if (!S) return;
      if (e.key === ' ') {
        spaceHeld = false;
        if (!panDrag) els.stage.style.cursor = '';
      }
    });
    window.addEventListener('resize', layout);
  }

  /* ================= API ================= */

  function init(callbacks) {
    host = callbacks;
    buildDom();
    bind();
    initBrushPopup();
  }

  /** Document construit depuis des calques préparés (ouverture de PSD) —
      les calques de texte restent des calques texte éditables. */
  function docFromLayers(width, height, specs) {
    const doc = { width, height, layers: [], activeLayerId: null };
    for (const sp of specs) {
      let layer;
      if (sp.kind === 'text') {
        layer = C.createTextLayer({
          text: sp.text,
          x: sp.x | 0,
          y: sp.y | 0,
          fontSize: sp.fontSize,
          color: sp.color,
          bold: sp.bold,
          italic: sp.italic,
          underline: sp.underline,
          strike: sp.strike,
          font: sp.font,
        });
      } else {
        layer = C.createRasterLayer(sp.name || 'Calque', sp.canvas.width, sp.canvas.height);
        layer.canvas.getContext('2d').drawImage(sp.canvas, 0, 0);
        layer.x = sp.x | 0;
        layer.y = sp.y | 0;
      }
      layer.opacity = typeof sp.opacity === 'number' ? Math.max(0, Math.min(1, sp.opacity)) : 1;
      layer.blend = sp.blend || 'normal';
      layer.visible = sp.visible !== false;
      doc.layers.push(layer);
    }
    if (!doc.layers.length) doc.layers.push(C.createRasterLayer('Arrière-plan', width, height));
    doc.activeLayerId = doc.layers[doc.layers.length - 1].id;
    return doc;
  }

  /** Document vierge (nouveau projet) : fond uni ou transparent. */
  function blankDoc({ width, height, background }) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const bg = C.createRasterLayer('Arrière-plan', w, h);
    if (background) {
      const ctx = bg.canvas.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    return { width: w, height: h, layers: [bg], activeLayerId: bg.id };
  }

  function open({ file, img, url, layers = null, width, height, blank = null }) {
    if (S) return;
    S = {
      file,
      img,
      url,
      doc: blank
        ? blankDoc(blank)
        : layers
          ? docFromLayers(width, height, layers)
          : C.createDocFromImage(img),
      meta: { dpi: (blank && blank.dpi) || 72, mode: (blank && blank.mode) || 'rgb' },
      history: new C.History(),
      tool: 'move',
      color: '#4c8dff',
      color2: '#ffffff',
      brushes: {
        pencil: { size: 12, hardness: 100, roundness: 100, angle: 0 },
        eraser: { size: 40, hardness: 40, roundness: 100, angle: 0 },
        clone: { size: 34, hardness: 55, roundness: 100, angle: 0 },
        retouch: { size: 44, hardness: 25, roundness: 100, angle: 0 },
        heal: { size: 30, hardness: 60, roundness: 100, angle: 0 },
      },
      guides: [], // repères de mesure temporaires (règle, compas, cercle)
      healPreview: null,
      retouch: { mode: 'blur', strength: 50 },
      shape: { kind: 'rect', fill: false, width: 6 },
      shapeDraft: null,
      bucket: { tolerance: 25, opacity: 100, contiguous: true },
      magic: { tolerance: 25, feather: 0, contiguous: true },
      wand: { tolerance: 25, contiguous: true },
      gradientOpts: { type: 'linear', to: 'transparent' },
      selDraft: null,
      gradientPreview: null,
      fontSize: 32,
      selection: null,
      lassoPreview: null,
      editing: null,
      scale: 1,
      zoom: null, // null = ajusté à la fenêtre
      fitScale: 1,
      cursorPos: null,
      snapGuides: null,
      textStyle: {
        font: '"Segoe UI"',
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        strokeWidth: 0,
        strokeColor: '#000000',
      },
    };

    els.fileName.textContent = file.name;
    els.canvas.width = S.doc.width;
    els.canvas.height = S.doc.height;
    els.overlay.width = S.doc.width;
    els.overlay.height = S.doc.height;
    els.textEditor.hidden = true;
    els.root.hidden = false;
    document.body.classList.add('studio-open');
    els.stage.scrollLeft = 0;
    els.stage.scrollTop = 0;

    setColor(S.color);
    setColor2(S.color2);
    layout();
    chooseTool('move');
    updateHistoryUI();
    layersChanged();
    startAnts();
  }

  function close(saved) {
    if (!S) return;
    closeBrushPopup();
    closeMenu();
    if (modalState) closeModal(false);
    spaceHeld = false;
    panDrag = null;
    els.stage.style.cursor = '';
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

  return { init, open, close, isOpen, openProjectFromHome };
})();
