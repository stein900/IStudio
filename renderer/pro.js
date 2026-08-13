'use strict';

/**
 * Mode Pro — analyse d'image et gestion de dataset.
 *
 * Chargé à la demande (le mode Basic reste léger). Script classique : il
 * partage la portée globale de renderer.js (state, image, stage, filmstrip,
 * currentFile, decodeCurrentFile, reorderContext, setZoomCentered…).
 *
 *  - histogramme RVB + luma avec écrêtage
 *  - inspecteur de pixel (X/Y, RVBA, hex, float) en direct
 *  - canaux isolés (R, V, B, A, luma) et fausse couleur (heatmap)
 *  - profil de ligne / mesure en pixels (longueur, angle)
 *  - grille en pixels image, zoom 1:1, verrou de vue entre images
 *  - métadonnées : profondeur de bit, sous-échantillonnage chroma, profil
 *    ICC, taux de compression, EXIF
 *  - notes (1-5) et drapeaux (retenir / supprimer), sidecar .istudio-tags.json
 *  - tri / filtre de la galerie, comparaison côte à côte / différence
 */

window.Pro = (() => {
  let built = false;
  let on = false;
  const els = {};

  let full = null; // { path, stamp, canvas, ctx, w, h } — pixels pleine résolution
  let decodeToken = 0;
  let channelMode = 'rgb';
  let channelUrl = null;
  let baseSrc = null;
  let pendingView = null; // vue à restaurer après un échange de src (canaux)
  let lockView = false;
  let gridOn = false;
  let measureMode = false;
  let measureLine = null; // en pixels image
  let measuring = false;
  const tags = { data: {}, timer: null, anchor: null };
  let master = null;
  let sortAsc = true;
  let sizesLoaded = false; // tailles récupérées à la demande (tri par taille)
  const compareState = { mode: 'off', aIndex: null, bIndex: null, urls: [] };
  let compareToken = 0; // invalide les rendus asynchrones périmés

  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  /** Couleur du thème courant (les canvas se redessinent au changement). */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  function starSvg(filled) {
    return (
      '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="1.6" ' +
      `stroke-linejoin="round" fill="${filled ? 'currentColor' : 'none'}" aria-hidden="true">` +
      '<path d="M12 2.8l2.8 5.9 6.4.9-4.6 4.5 1.1 6.4L12 17.4l-5.7 3.1 1.1-6.4L2.8 9.6l6.4-.9z" /></svg>'
    );
  }

  /* ================= Construction du panneau ================= */

  function build() {
    if (built) return;
    built = true;

    const panel = document.createElement('aside');
    panel.id = 'pro-panel';
    panel.innerHTML = `
      <div class="pro-head">Analyse</div>
      <div class="pro-sec">
        <span class="pro-label">Canaux</span>
        <div class="pro-seg" id="pro-chan">
          <button data-ch="rgb" class="is-active" title="Image d'origine">RVB</button>
          <button data-ch="r" title="Canal rouge isolé">R</button>
          <button data-ch="g" title="Canal vert isolé">V</button>
          <button data-ch="b" title="Canal bleu isolé">B</button>
          <button data-ch="a" title="Canal alpha isolé">A</button>
          <button data-ch="luma" title="Luminance (BT.709)">L</button>
          <button data-ch="heat" title="Fausse couleur : heatmap de la luminance">Heat</button>
        </div>
      </div>
      <div class="pro-sec">
        <span class="pro-label">Histogramme</span>
        <canvas id="pro-hist" width="264" height="92"></canvas>
        <div id="pro-clip" class="pro-mini"></div>
      </div>
      <div class="pro-sec">
        <span class="pro-label">Inspecteur de pixel</span>
        <div class="pro-grid2">
          <span>X, Y</span><span id="pro-xy">—</span>
          <span>RVBA</span><span id="pro-rgba">—</span>
          <span>Hex</span><span id="pro-hex">—</span>
          <span>Float</span><span id="pro-float">—</span>
        </div>
      </div>
      <div class="pro-sec">
        <div class="pro-row">
          <span class="pro-label">Mesure / profil</span>
          <button id="pro-measure" class="pro-btn">Tracer (M)</button>
        </div>
        <div id="pro-measure-info" class="pro-mini">Glisser sur l'image pour mesurer un segment.</div>
        <canvas id="pro-profile" width="264" height="80"></canvas>
      </div>
      <div class="pro-sec">
        <span class="pro-label">Image</span>
        <div id="pro-info" class="pro-grid2"></div>
      </div>
      <div class="pro-sec pro-row pro-row-tight">
        <span class="pro-label">Vue</span>
        <button id="pro-grid" class="pro-btn" title="Grille en pixels image (G)">Grille</button>
        <input id="pro-grid-step" type="number" min="2" max="2000" value="100" title="Pas de la grille, en pixels image" />
        <button id="pro-100" class="pro-btn" title="Zoom 100 % : 1 pixel image = 1 pixel écran">1:1</button>
        <button id="pro-lock" class="pro-btn" title="Conserver zoom et position en changeant d'image — pour inspecter la même zone sur tout le dataset (K)">Verrou</button>
      </div>
      <div class="pro-sec">
        <div class="pro-row"><span class="pro-label">Note</span><div id="pro-stars"></div></div>
        <div class="pro-row">
          <button id="pro-pick" class="pro-btn" title="Marquer « à retenir » (P)">Retenir (P)</button>
          <button id="pro-reject" class="pro-btn" title="Marquer « à supprimer » (X)">Rejeter (X)</button>
          <button id="pro-unflag" class="pro-btn" title="Enlever le drapeau (U)">Ø (U)</button>
        </div>
        <div class="pro-mini">1-5 : note · 0 : sans note · enregistré dans .istudio-tags.json</div>
      </div>
      <div class="pro-sec">
        <div class="pro-row">
          <span class="pro-label">Galerie</span>
          <select id="pro-sort" title="Trier par">
            <option value="name">Nom</option>
            <option value="size">Taille</option>
            <option value="rating">Note</option>
          </select>
          <button id="pro-sort-dir" class="pro-btn" title="Ordre croissant / décroissant">Asc</button>
          <select id="pro-filter" title="Filtrer">
            <option value="all">Toutes</option>
            <option value="pick">À retenir</option>
            <option value="reject">À supprimer</option>
            <option value="r1">≥ 1 étoile</option>
            <option value="r2">≥ 2 étoiles</option>
            <option value="r3">≥ 3 étoiles</option>
            <option value="r4">≥ 4 étoiles</option>
            <option value="r5">5 étoiles</option>
          </select>
        </div>
        <div id="pro-gallery-count" class="pro-mini"></div>
      </div>
      <div class="pro-sec">
        <div class="pro-row">
          <span class="pro-label">Comparer</span>
          <button id="pro-cmp-side" class="pro-btn">Côte à côte</button>
          <button id="pro-cmp-diff" class="pro-btn">Différence</button>
        </div>
        <div class="pro-mini">A et B se choisissent dans la barre au-dessus de l'aperçu (listes déroulantes, bouton d'échange). Raccourci : Ctrl + clic sur une vignette pour l'image B. Les flèches changent l'image A.</div>
      </div>
      <div class="pro-sec">
        <span class="pro-label">EXIF</span>
        <div id="pro-exif" class="pro-grid2"></div>
      </div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement('canvas');
    overlay.id = 'pro-overlay';
    stage.appendChild(overlay);

    const compare = document.createElement('div');
    compare.id = 'pro-compare';
    compare.hidden = true;
    stage.appendChild(compare);

    Object.assign(els, {
      panel,
      overlay,
      compare,
      chan: panel.querySelector('#pro-chan'),
      hist: panel.querySelector('#pro-hist'),
      clip: panel.querySelector('#pro-clip'),
      xy: panel.querySelector('#pro-xy'),
      rgba: panel.querySelector('#pro-rgba'),
      hex: panel.querySelector('#pro-hex'),
      float: panel.querySelector('#pro-float'),
      measureBtn: panel.querySelector('#pro-measure'),
      measureInfo: panel.querySelector('#pro-measure-info'),
      profile: panel.querySelector('#pro-profile'),
      gridBtn: panel.querySelector('#pro-grid'),
      gridStep: panel.querySelector('#pro-grid-step'),
      lockBtn: panel.querySelector('#pro-lock'),
      stars: panel.querySelector('#pro-stars'),
      pick: panel.querySelector('#pro-pick'),
      reject: panel.querySelector('#pro-reject'),
      unflag: panel.querySelector('#pro-unflag'),
      sort: panel.querySelector('#pro-sort'),
      sortDir: panel.querySelector('#pro-sort-dir'),
      filter: panel.querySelector('#pro-filter'),
      galleryCount: panel.querySelector('#pro-gallery-count'),
      cmpSide: panel.querySelector('#pro-cmp-side'),
      cmpDiff: panel.querySelector('#pro-cmp-diff'),
      info: panel.querySelector('#pro-info'),
      exif: panel.querySelector('#pro-exif'),
    });

    // étoiles cliquables
    for (let n = 1; n <= 5; n += 1) {
      const b = document.createElement('button');
      b.className = 'pro-star';
      b.dataset.n = String(n);
      b.title = `${n} étoile${n > 1 ? 's' : ''} (touche ${n})`;
      b.innerHTML = starSvg(false);
      b.addEventListener('click', () => setRating(ratingOf(currentFile()) === n ? 0 : n));
      els.stars.appendChild(b);
    }

    els.chan.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ch]');
      if (b) setChannel(b.dataset.ch);
    });
    els.measureBtn.addEventListener('click', () => toggleMeasure());
    els.gridBtn.addEventListener('click', () => toggleGrid());
    els.gridStep.addEventListener('input', () => drawOverlay());
    els.lockBtn.addEventListener('click', () => toggleLock());
    panel.querySelector('#pro-100').addEventListener('click', () => {
      if (currentFile()) setZoomCentered(1);
    });
    els.pick.addEventListener('click', () => setFlag('pick'));
    els.reject.addEventListener('click', () => setFlag('reject'));
    els.unflag.addEventListener('click', () => setFlag(null));
    els.sort.addEventListener('change', applyGallery);
    els.filter.addEventListener('change', applyGallery);
    els.sortDir.addEventListener('click', () => {
      sortAsc = !sortAsc;
      els.sortDir.textContent = sortAsc ? 'Asc' : 'Desc';
      applyGallery();
    });
    els.cmpSide.addEventListener('click', () => setCompare(compareState.mode === 'side' ? 'off' : 'side'));
    els.cmpDiff.addEventListener('click', () => setCompare(compareState.mode === 'diff' ? 'off' : 'diff'));

    // inspecteur de pixel + mesure
    stage.addEventListener('pointermove', onStageMove);
    stage.addEventListener(
      'pointerdown',
      (e) => {
        if (!on || !measureMode || e.button !== 0 || image.hidden) return;
        e.preventDefault(); // neutralise le pan de la visionneuse
        measuring = true;
        const p = screenToImage(e.clientX, e.clientY);
        measureLine = { ax: p.x, ay: p.y, bx: p.x, by: p.y };
        drawOverlay();
      },
      true
    );
    window.addEventListener('pointermove', (e) => {
      if (!measuring) return;
      const p = screenToImage(e.clientX, e.clientY);
      measureLine.bx = p.x;
      measureLine.by = p.y;
      drawOverlay();
      updateProfile();
    });
    window.addEventListener('pointerup', () => {
      measuring = false;
    });
    window.addEventListener('resize', () => {
      if (on) {
        layoutPanel();
        drawOverlay();
      }
    });
  }

  /* ================= Position du panneau / overlay ================= */

  function layoutPanel() {
    const toolbar = document.getElementById('toolbar');
    const top = toolbar ? toolbar.getBoundingClientRect().bottom : 0;
    const stripTop = filmstrip && !document.body.classList.contains('no-filmstrip')
      ? filmstrip.getBoundingClientRect().top
      : window.innerHeight;
    els.panel.style.top = `${Math.round(top)}px`;
    els.panel.style.height = `${Math.max(120, Math.round(stripTop - top))}px`;
    const dpr = window.devicePixelRatio || 1;
    els.overlay.width = Math.max(1, Math.round(stage.clientWidth * dpr));
    els.overlay.height = Math.max(1, Math.round(stage.clientHeight * dpr));
    els.overlay.style.width = `${stage.clientWidth}px`;
    els.overlay.style.height = `${stage.clientHeight}px`;
  }

  /* ================= Coordonnées écran <-> image ================= */

  function imageToScreen(px, py) {
    return {
      x: stage.clientWidth / 2 + state.panX + (px - image.naturalWidth / 2) * state.zoom,
      y: stage.clientHeight / 2 + state.panY + (py - image.naturalHeight / 2) * state.zoom,
    };
  }

  function screenToImage(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: (clientX - rect.left - rect.width / 2 - state.panX) / state.zoom + image.naturalWidth / 2,
      y: (clientY - rect.top - rect.height / 2 - state.panY) / state.zoom + image.naturalHeight / 2,
    };
  }

  /* ================= Pixels pleine résolution ================= */

  async function ensureFull() {
    const f = currentFile();
    if (!f || image.hidden) {
      full = null;
      return;
    }
    if (full && full.path === f.path && full.stamp === f.url) return;
    const token = ++decodeToken;
    full = null;
    const decoded = await decodeCurrentFile(f).catch(() => null);
    if (!decoded || token !== decodeToken) return;
    const c = document.createElement('canvas');
    c.width = decoded.img.naturalWidth;
    c.height = decoded.img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(decoded.img, 0, 0);
    URL.revokeObjectURL(decoded.url);
    full = { path: f.path, stamp: f.url, canvas: c, ctx, w: c.width, h: c.height };
  }

  /* ================= Inspecteur de pixel ================= */

  let moveRaf = 0;

  function onStageMove(e) {
    if (!on || image.hidden || moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      const p = screenToImage(e.clientX, e.clientY);
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (!full || x < 0 || y < 0 || x >= full.w || y >= full.h) {
        els.xy.textContent = '—';
        els.rgba.textContent = '—';
        els.hex.textContent = '—';
        els.float.textContent = '—';
        return;
      }
      const d = full.ctx.getImageData(x, y, 1, 1).data;
      els.xy.textContent = `${x}, ${y}`;
      els.rgba.textContent = `${d[0]}, ${d[1]}, ${d[2]}, ${d[3]}`;
      els.hex.textContent = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      els.float.textContent = `${(d[0] / 255).toFixed(3)} ${(d[1] / 255).toFixed(3)} ${(d[2] / 255).toFixed(3)}`;
    });
  }

  /* ================= Histogramme ================= */

  function computeHistogram() {
    const ctx = els.hist.getContext('2d');
    ctx.clearRect(0, 0, els.hist.width, els.hist.height);
    els.clip.textContent = '';
    if (!full) return;
    const s = Math.min(1, 1024 / Math.max(full.w, full.h));
    const w = Math.max(1, Math.round(full.w * s));
    const h = Math.max(1, Math.round(full.h * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d');
    cctx.drawImage(full.canvas, 0, 0, w, h);
    const d = cctx.getImageData(0, 0, w, h).data;
    const hr = new Uint32Array(256);
    const hg = new Uint32Array(256);
    const hb = new Uint32Array(256);
    const hl = new Uint32Array(256);
    let clipLo = 0;
    let clipHi = 0;
    const total = w * h;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      hr[r] += 1;
      hg[g] += 1;
      hb[b] += 1;
      const l = Math.round(luma(r, g, b));
      hl[l] += 1;
      if (r === 0 && g === 0 && b === 0) clipLo += 1;
      if (r === 255 || g === 255 || b === 255) clipHi += 1;
    }
    const W = els.hist.width;
    const H = els.hist.height;
    ctx.fillStyle = cssVar('--chart-bg', '#131318');
    ctx.fillRect(0, 0, W, H);
    let max = 1;
    for (let i = 0; i < 256; i += 1) max = Math.max(max, hl[i], hr[i], hg[i], hb[i]);
    const plot = (histo, style, fill) => {
      ctx.beginPath();
      for (let i = 0; i < 256; i += 1) {
        const x = (i / 255) * (W - 2) + 1;
        const y = H - 1 - (Math.sqrt(histo[i] / max)) * (H - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (fill) {
        ctx.lineTo(W - 1, H - 1);
        ctx.lineTo(1, H - 1);
        ctx.closePath();
        ctx.fillStyle = style;
        ctx.fill();
      } else {
        ctx.strokeStyle = style;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    plot(hl, cssVar('--chart-luma', 'rgba(230, 230, 235, 0.35)'), true);
    plot(hr, 'rgba(255, 90, 90, 0.9)', false);
    plot(hg, 'rgba(90, 220, 120, 0.9)', false);
    plot(hb, 'rgba(110, 160, 255, 0.9)', false);
    const pc = (n) => ((100 * n) / total).toFixed(n ? 2 : 0);
    els.clip.textContent = `Écrêtage — noirs : ${pc(clipLo)} % · blancs : ${pc(clipHi)} %`;
  }

  /* ================= Canaux / fausse couleur ================= */

  let heatLut = null;

  function buildHeatLut() {
    if (heatLut) return heatLut;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 1;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#0d0887');
    g.addColorStop(0.25, '#7e03a8');
    g.addColorStop(0.5, '#cc4778');
    g.addColorStop(0.75, '#f89441');
    g.addColorStop(1, '#f0f921');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 1);
    heatLut = ctx.getImageData(0, 0, 256, 1).data;
    return heatLut;
  }

  async function setChannel(mode) {
    channelMode = mode;
    for (const b of els.chan.querySelectorAll('button')) {
      b.classList.toggle('is-active', b.dataset.ch === mode);
    }
    if (image.hidden) return;
    if (mode === 'rgb') {
      if (channelUrl) URL.revokeObjectURL(channelUrl);
      channelUrl = null;
      if (baseSrc && image.src !== baseSrc) {
        pendingView = { zoom: state.zoom, panX: state.panX, panY: state.panY, fit: state.fit };
        image.src = baseSrc;
      }
      return;
    }
    await ensureFull();
    if (!full) return;
    if (!baseSrc) baseSrc = image.src;
    const id = full.ctx.getImageData(0, 0, full.w, full.h);
    const d = id.data;
    if (mode === 'heat') {
      const lut = buildHeatLut();
      for (let i = 0; i < d.length; i += 4) {
        const l = Math.round(luma(d[i], d[i + 1], d[i + 2]));
        d[i] = lut[l * 4];
        d[i + 1] = lut[l * 4 + 1];
        d[i + 2] = lut[l * 4 + 2];
        d[i + 3] = 255;
      }
    } else {
      const idx = { r: 0, g: 1, b: 2, a: 3 }[mode];
      for (let i = 0; i < d.length; i += 4) {
        const v = idx === undefined ? Math.round(luma(d[i], d[i + 1], d[i + 2])) : d[i + idx];
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    const c = document.createElement('canvas');
    c.width = full.w;
    c.height = full.h;
    c.getContext('2d').putImageData(id, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob || channelMode !== mode) return;
    if (channelUrl) URL.revokeObjectURL(channelUrl);
    channelUrl = URL.createObjectURL(blob);
    pendingView = { zoom: state.zoom, panX: state.panX, panY: state.panY, fit: state.fit };
    image.src = channelUrl;
  }

  /* ================= Grille, mesure, overlay ================= */

  function toggleGrid(force) {
    gridOn = force === undefined ? !gridOn : force;
    els.gridBtn.classList.toggle('is-active', gridOn);
    drawOverlay();
  }

  function toggleLock(force) {
    lockView = force === undefined ? !lockView : force;
    els.lockBtn.classList.toggle('is-active', lockView);
  }

  function toggleMeasure(force) {
    measureMode = force === undefined ? !measureMode : force;
    els.measureBtn.classList.toggle('is-active', measureMode);
    if (!measureMode) {
      measureLine = null;
      drawOverlay();
      updateProfile();
    }
    stage.style.cursor = measureMode ? 'crosshair' : '';
  }

  function drawOverlay() {
    if (!built) return;
    const ctx = els.overlay.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
    if (!on || image.hidden || compareState.mode !== 'off') return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (gridOn && image.naturalWidth) {
      let step = Math.max(2, Number(els.gridStep.value) || 100);
      while (step * state.zoom < 8) step *= 2; // garde une grille lisible
      ctx.strokeStyle = 'rgba(110, 168, 255, 0.3)';
      ctx.lineWidth = 1;
      const tl = imageToScreen(0, 0);
      const br = imageToScreen(image.naturalWidth, image.naturalHeight);
      ctx.beginPath();
      for (let x = 0; x <= image.naturalWidth; x += step) {
        const sx = imageToScreen(x, 0).x;
        if (sx < -2 || sx > stage.clientWidth + 2) continue;
        ctx.moveTo(sx, Math.max(0, tl.y));
        ctx.lineTo(sx, Math.min(stage.clientHeight, br.y));
      }
      for (let y = 0; y <= image.naturalHeight; y += step) {
        const sy = imageToScreen(0, y).y;
        if (sy < -2 || sy > stage.clientHeight + 2) continue;
        ctx.moveTo(Math.max(0, tl.x), sy);
        ctx.lineTo(Math.min(stage.clientWidth, br.x), sy);
      }
      ctx.stroke();
    }

    /* Valeurs des pixels au fort zoom — mêmes seuils que Studio :
       grille de pixels à partir de 1600 %, valeurs R V B lisibles dans
       chaque pixel à partir de 3200 % (seulement les pixels visibles). */
    if (full && state.zoom >= 16 && image.naturalWidth) {
      const sc = state.zoom;
      const o = imageToScreen(0, 0); // origine de l'image en px écran
      const x0 = Math.max(0, Math.floor(-o.x / sc));
      const y0 = Math.max(0, Math.floor(-o.y / sc));
      const x1 = Math.min(full.w, Math.ceil((stage.clientWidth - o.x) / sc));
      const y1 = Math.min(full.h, Math.ceil((stage.clientHeight - o.y) / sc));
      if (x1 > x0 && y1 > y0) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 1) {
          ctx.moveTo(o.x + x * sc, o.y + y0 * sc);
          ctx.lineTo(o.x + x * sc, o.y + y1 * sc);
        }
        for (let y = y0; y <= y1; y += 1) {
          ctx.moveTo(o.x + x0 * sc, o.y + y * sc);
          ctx.lineTo(o.x + x1 * sc, o.y + y * sc);
        }
        ctx.stroke();

        if (sc >= 32) {
          // valeurs de l'image d'origine, même si un canal isolé est affiché
          const data = full.ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
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
              const px = o.x + (x + 0.5) * sc;
              const py = o.y + (y + 0.5) * sc;
              ctx.fillText(String(r), px, py - sc * 0.24);
              ctx.fillText(String(g), px, py);
              ctx.fillText(String(b), px, py + sc * 0.24);
            }
          }
        }
      }
    }

    if (measureLine) {
      const a = imageToScreen(measureLine.ax, measureLine.ay);
      const b = imageToScreen(measureLine.bx, measureLine.by);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#ffd166';
      ctx.stroke();
      for (const pt of [a, b]) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const dx = measureLine.bx - measureLine.ax;
      const dy = measureLine.by - measureLine.ay;
      const len = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      els.measureInfo.textContent =
        `L ${len.toFixed(1)} px · Δx ${Math.abs(dx).toFixed(0)} · Δy ${Math.abs(dy).toFixed(0)} · ${ang.toFixed(1)}°`;
    }
  }

  function updateProfile() {
    const ctx = els.profile.getContext('2d');
    const W = els.profile.width;
    const H = els.profile.height;
    ctx.clearRect(0, 0, W, H);
    if (!full || !measureLine) return;
    ctx.fillStyle = cssVar('--chart-bg', '#131318');
    ctx.fillRect(0, 0, W, H);
    const N = 220;
    const rs = [];
    const gs = [];
    const bs = [];
    const ls = [];
    for (let i = 0; i < N; i += 1) {
      const t = i / (N - 1);
      const x = Math.max(0, Math.min(full.w - 1, Math.round(measureLine.ax + (measureLine.bx - measureLine.ax) * t)));
      const y = Math.max(0, Math.min(full.h - 1, Math.round(measureLine.ay + (measureLine.by - measureLine.ay) * t)));
      const d = full.ctx.getImageData(x, y, 1, 1).data;
      rs.push(d[0]);
      gs.push(d[1]);
      bs.push(d[2]);
      ls.push(luma(d[0], d[1], d[2]));
    }
    const plot = (arr, style, width) => {
      ctx.beginPath();
      for (let i = 0; i < N; i += 1) {
        const x = (i / (N - 1)) * (W - 2) + 1;
        const y = H - 1 - (arr[i] / 255) * (H - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    plot(rs, 'rgba(255, 90, 90, 0.7)', 1);
    plot(gs, 'rgba(90, 220, 120, 0.7)', 1);
    plot(bs, 'rgba(110, 160, 255, 0.7)', 1);
    plot(ls, cssVar('--chart-line', 'rgba(240, 240, 245, 0.95)'), 1.6);
  }

  /* ================= Notes & drapeaux ================= */

  function tagOf(file) {
    return (file && tags.data[file.name]) || null;
  }

  function ratingOf(file) {
    const t = tagOf(file);
    return (t && t.r) || 0;
  }

  function flagOf(file) {
    const t = tagOf(file);
    return (t && t.f) || null;
  }

  function saveTags() {
    if (tags.timer) clearTimeout(tags.timer);
    tags.timer = setTimeout(() => {
      tags.timer = null;
      if (tags.anchor) {
        window.viewer.writeFolderMeta({ filePath: tags.anchor, json: JSON.stringify(tags.data, null, 1) });
      }
    }, 400);
  }

  function mutateTag(file, fn) {
    if (!file) return;
    const t = tags.data[file.name] || {};
    fn(t);
    if (!t.r && !t.f) delete tags.data[file.name];
    else tags.data[file.name] = t;
    saveTags();
    refreshTagUI();
    decorateTiles();
  }

  function setRating(n) {
    mutateTag(currentFile(), (t) => {
      if (n) t.r = n;
      else delete t.r;
    });
  }

  function setFlag(v) {
    mutateTag(currentFile(), (t) => {
      if (v) t.f = v;
      else delete t.f;
    });
  }

  function refreshTagUI() {
    const f = currentFile();
    const r = ratingOf(f);
    const fl = flagOf(f);
    els.stars.querySelectorAll('.pro-star').forEach((b, i) => {
      b.classList.toggle('is-active', i < r);
      b.innerHTML = starSvg(i < r);
    });
    els.pick.classList.toggle('is-active', fl === 'pick');
    els.reject.classList.toggle('is-active', fl === 'reject');
  }

  function decorateTiles() {
    if (!on) return;
    for (const tile of filmstrip.querySelectorAll('.thumb')) {
      const file = state.files[Number(tile.dataset.index)];
      if (!file) continue;
      const r = ratingOf(file);
      const fl = flagOf(file);
      tile.classList.toggle('pro-pick', fl === 'pick');
      tile.classList.toggle('pro-reject', fl === 'reject');
      let badge = tile.querySelector('.pro-badge');
      if (r > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'pro-badge';
          tile.appendChild(badge);
        }
        badge.innerHTML = `${starSvg(true)}<span>${r}</span>`;
      } else if (badge) {
        badge.remove();
      }
    }
  }

  /* ================= Tri / filtre de la galerie ================= */

  /** Les tailles ne sont plus lues à l'ouverture du dossier (trop coûteux
      sur un NAS) : elles sont récupérées ici, une seule fois, au premier
      tri par taille — avec un parallélisme borné côté processus principal. */
  async function ensureSizes() {
    const files = master;
    const sizes = await window.viewer.statSizes(files.map((f) => f.path));
    if (master !== files) return; // le dossier a changé entre-temps
    files.forEach((f, i) => {
      f.size = sizes[i] || 0;
    });
    sizesLoaded = true;
  }

  function applyGallery() {
    if (!master) return;
    if (els.sort.value === 'size' && !sizesLoaded && master.length) {
      els.galleryCount.textContent = 'Lecture des tailles…';
      ensureSizes().then(() => applyGallery());
      return;
    }
    let files = master.slice();
    const fv = els.filter.value;
    if (fv === 'pick' || fv === 'reject') files = files.filter((f) => flagOf(f) === fv);
    else if (fv.startsWith('r')) {
      const n = Number(fv.slice(1));
      files = files.filter((f) => ratingOf(f) >= n);
    }
    if (!files.length) {
      els.galleryCount.textContent = '0 image pour ce filtre — filtre ignoré.';
      return;
    }
    const sv = els.sort.value;
    files.sort((a, b) => {
      if (sv === 'size') return (a.size || 0) - (b.size || 0);
      if (sv === 'rating') return ratingOf(a) - ratingOf(b);
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    if (!sortAsc) files.reverse();
    const cur = currentFile();
    let idx = files.indexOf(cur);
    if (idx < 0) idx = 0;
    els.galleryCount.textContent = `${files.length} / ${master.length} image${master.length > 1 ? 's' : ''}`;
    reorderContext(files, idx);
  }

  /* ================= Comparaison ================= */

  function setCompare(mode) {
    compareState.mode = mode;
    els.cmpSide.classList.toggle('is-active', mode === 'side');
    els.cmpDiff.classList.toggle('is-active', mode === 'diff');
    for (const u of compareState.urls) URL.revokeObjectURL(u);
    compareState.urls = [];
    if (mode === 'off') {
      compareToken += 1; // annule tout rendu en cours
      els.compare.hidden = true;
      els.compare.innerHTML = '';
      image.style.visibility = '';
      drawOverlay();
      return;
    }
    if (compareState.aIndex == null || !state.files[compareState.aIndex]) {
      compareState.aIndex = state.index;
    }
    buildCompare();
  }

  /** Ctrl + clic sur une vignette : choisit l'image B. */
  function setCompareIndex(i) {
    compareState.bIndex = i;
    if (compareState.mode === 'off') setCompare('side');
    else buildCompare();
  }

  async function srcFor(file) {
    if (isPsdFile(file)) {
      const decoded = await decodeCurrentFile(file).catch(() => null);
      if (!decoded) return null;
      compareState.urls.push(decoded.url);
      return decoded.url;
    }
    return file.url;
  }

  function cmpIconBtn(title, svgInner, onClick) {
    const b = document.createElement('button');
    b.className = 'pro-btn pro-cmp-icon';
    b.title = title;
    b.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      svgInner +
      '</svg>';
    b.addEventListener('click', onClick);
    return b;
  }

  /** Barre de choix des images comparées : A [select] ⇄ B [select] ✕. */
  function buildCompareBar() {
    const bar = document.createElement('div');
    bar.className = 'pro-cmp-bar';

    const mkTag = (t) => {
      const s = document.createElement('span');
      s.className = 'pro-cmp-tag';
      s.textContent = t;
      return s;
    };
    const mkSelect = (which) => {
      const sel = document.createElement('select');
      sel.title = which === 'a' ? 'Choisir l’image A' : 'Choisir l’image B';
      state.files.forEach((f, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = f.name;
        sel.appendChild(opt);
      });
      sel.value = String(which === 'a' ? compareState.aIndex : compareState.bIndex);
      sel.addEventListener('change', () => {
        const v = Number(sel.value);
        if (which === 'a') compareState.aIndex = v;
        else compareState.bIndex = v;
        buildCompare();
      });
      return sel;
    };

    bar.append(
      mkTag('A'),
      mkSelect('a'),
      cmpIconBtn(
        'Échanger A et B',
        '<polyline points="17 4 21 8 17 12" /><line x1="21" y1="8" x2="7" y2="8" />' +
          '<polyline points="7 12 3 16 7 20" /><line x1="3" y1="16" x2="17" y2="16" />',
        () => {
          const t = compareState.aIndex;
          compareState.aIndex = compareState.bIndex;
          compareState.bIndex = t;
          buildCompare();
        }
      ),
      mkTag('B'),
      mkSelect('b'),
      cmpIconBtn(
        'Fermer la comparaison',
        '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
        () => setCompare('off')
      )
    );
    return bar;
  }

  async function buildCompare() {
    if (compareState.mode === 'off' || state.files.length < 2) return;
    const n = state.files.length;
    if (compareState.aIndex == null || !state.files[compareState.aIndex]) {
      compareState.aIndex = Math.max(0, state.index);
    }
    if (
      compareState.bIndex == null ||
      compareState.bIndex === compareState.aIndex ||
      !state.files[compareState.bIndex]
    ) {
      compareState.bIndex = (compareState.aIndex - 1 + n) % n;
    }
    const a = state.files[compareState.aIndex];
    const b = state.files[compareState.bIndex];
    const token = ++compareToken;

    els.compare.hidden = false;
    image.style.visibility = 'hidden';
    els.compare.innerHTML = '';
    els.compare.appendChild(buildCompareBar());
    const body = document.createElement('div');
    body.className = 'pro-cmp-body';
    els.compare.appendChild(body);
    drawOverlay();

    if (compareState.mode === 'side') {
      for (const [file, tag] of [[a, 'A'], [b, 'B']]) {
        const fig = document.createElement('div');
        fig.className = 'pro-cmp-cell';
        const img = document.createElement('img');
        img.src = await srcFor(file);
        if (token !== compareToken) return; // sélection changée entre-temps
        const cap = document.createElement('span');
        cap.textContent = `${tag} — ${file.name}`;
        fig.append(img, cap);
        body.appendChild(fig);
      }
      return;
    }

    // Différence |A − B| amplifiée ×4
    const [da, db] = await Promise.all([decodeCurrentFile(a).catch(() => null), decodeCurrentFile(b).catch(() => null)]);
    if (!da || !db) return;
    if (token !== compareToken) {
      URL.revokeObjectURL(da.url);
      URL.revokeObjectURL(db.url);
      return;
    }
    const w = Math.min(da.img.naturalWidth, db.img.naturalWidth, 1400);
    const ratio = w / Math.min(da.img.naturalWidth, db.img.naturalWidth);
    const h = Math.round(Math.min(da.img.naturalHeight, db.img.naturalHeight) * ratio);
    const mk = (img) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.getContext('2d').getImageData(0, 0, w, h);
    };
    const ia = mk(da.img);
    const ib = mk(db.img);
    URL.revokeObjectURL(da.url);
    URL.revokeObjectURL(db.url);
    const out = ia;
    for (let i = 0; i < out.data.length; i += 4) {
      const dr = Math.abs(ia.data[i] - ib.data[i]);
      const dg = Math.abs(ia.data[i + 1] - ib.data[i + 1]);
      const dbl = Math.abs(ia.data[i + 2] - ib.data[i + 2]);
      const v = Math.min(255, ((dr + dg + dbl) / 3) * 4);
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').putImageData(out, 0, 0);
    const cell = document.createElement('div');
    cell.className = 'pro-cmp-cell';
    const cap = document.createElement('span');
    cap.textContent = `Différence ×4 — A : ${a.name} · B : ${b.name}`;
    cell.append(c, cap);
    body.appendChild(cell);
  }

  /* ================= Métadonnées : format, ICC, EXIF ================= */

  function ratioLabel(w, h) {
    const gcd = (x, y) => (y ? gcd(y, x % y) : x);
    const g = gcd(w, h);
    const a = w / g;
    const b = h / g;
    if (a <= 50 && b <= 50) return `${a}:${b}`;
    return `${(w / h).toFixed(2)}:1`;
  }

  function parseJpeg(u8) {
    const out = { bits: 8, sub: null, prog: false, icc: false, iccName: null, exif: null, xmp: false };
    let o = 2;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    while (o + 4 < u8.length) {
      if (u8[o] !== 0xff) break;
      const marker = u8[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      if (marker === 0xda) break; // début des données compressées
      const len = view.getUint16(o + 2);
      const seg = o + 4;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        out.bits = u8[seg];
        out.prog = marker === 0xc2;
        const n = u8[seg + 5];
        if (n >= 3) {
          const hv = u8[seg + 7];
          const hs = hv >> 4;
          const vs = hv & 15;
          out.sub = hs === 2 && vs === 2 ? '4:2:0' : hs === 2 && vs === 1 ? '4:2:2' : hs === 1 && vs === 2 ? '4:4:0' : '4:4:4';
        } else {
          out.sub = 'niveaux de gris';
        }
      } else if (marker === 0xe1) {
        const head = String.fromCharCode(...u8.slice(seg, seg + 6));
        if (head.startsWith('Exif')) out.exif = u8.slice(seg + 6, o + 2 + len);
        else if (String.fromCharCode(...u8.slice(seg, seg + 20)).includes('ns.adobe.com')) out.xmp = true;
      } else if (marker === 0xe2) {
        const head = String.fromCharCode(...u8.slice(seg, seg + 11));
        if (head.startsWith('ICC_PROFILE')) {
          out.icc = true;
          const prof = u8.slice(seg + 14, o + 2 + len);
          out.iccName = iccDescription(prof) || out.iccName;
        }
      }
      o += 2 + len;
    }
    return out;
  }

  function iccDescription(prof) {
    try {
      const view = new DataView(prof.buffer, prof.byteOffset, prof.byteLength);
      const count = view.getUint32(128);
      for (let i = 0; i < count; i += 1) {
        const e = 132 + i * 12;
        const sig = String.fromCharCode(prof[e], prof[e + 1], prof[e + 2], prof[e + 3]);
        if (sig !== 'desc') continue;
        const off = view.getUint32(e + 4);
        const type = String.fromCharCode(prof[off], prof[off + 1], prof[off + 2], prof[off + 3]);
        if (type === 'desc') {
          const len = view.getUint32(off + 8);
          return String.fromCharCode(...prof.slice(off + 12, off + 12 + Math.min(len - 1, 60)));
        }
        if (type === 'mluc') {
          const strLen = view.getUint32(off + 20);
          const strOff = view.getUint32(off + 24);
          let s = '';
          for (let j = 0; j < Math.min(strLen, 120); j += 2) s += String.fromCharCode(view.getUint16(off + strOff + j));
          return s;
        }
      }
    } catch {
      // profil illisible : pas de nom
    }
    return null;
  }

  function parsePng(u8) {
    const out = { bits: 8, colorType: null, srgb: false, icc: false, iccName: null, gamma: null };
    let o = 8;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const types = { 0: 'niveaux de gris', 2: 'RVB', 3: 'palette', 4: 'gris + alpha', 6: 'RVBA' };
    while (o + 8 < u8.length) {
      const len = view.getUint32(o);
      const type = String.fromCharCode(...u8.slice(o + 4, o + 8));
      if (type === 'IHDR') {
        out.bits = u8[o + 16];
        out.colorType = types[u8[o + 17]] || null;
      } else if (type === 'sRGB') out.srgb = true;
      else if (type === 'gAMA') out.gamma = view.getUint32(o + 8) / 100000;
      else if (type === 'iCCP') {
        out.icc = true;
        let e = o + 8;
        let name = '';
        while (u8[e] !== 0 && e < o + 8 + 79) {
          name += String.fromCharCode(u8[e]);
          e += 1;
        }
        out.iccName = name;
      } else if (type === 'IDAT') break;
      o += 12 + len;
    }
    return out;
  }

  const EXIF_TAGS = {
    271: 'Fabricant',
    272: 'Appareil',
    305: 'Logiciel',
    306: 'Date de modification',
    274: 'Orientation',
    33434: 'Exposition',
    33437: 'Ouverture',
    34855: 'ISO',
    36867: 'Prise de vue',
    37386: 'Focale',
    41989: 'Focale (équiv. 35 mm)',
    42036: 'Objectif',
  };

  function parseExif(u8) {
    try {
      const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const le = String.fromCharCode(u8[0], u8[1]) === 'II';
      const u16 = (o) => view.getUint16(o, le);
      const u32 = (o) => view.getUint32(o, le);
      const rows = [];
      const readIfd = (off) => {
        const n = u16(off);
        let exifPtr = null;
        for (let i = 0; i < n; i += 1) {
          const e = off + 2 + i * 12;
          const tag = u16(e);
          const type = u16(e + 2);
          const count = u32(e + 4);
          const voff = e + 8;
          const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 }[type] || 1;
          const dataOff = count * size > 4 ? u32(voff) : voff;
          if (tag === 34665) {
            exifPtr = u32(voff);
            continue;
          }
          const label = EXIF_TAGS[tag];
          if (!label) continue;
          let value = null;
          if (type === 2) {
            value = String.fromCharCode(...u8.slice(dataOff, dataOff + count - 1)).trim();
          } else if (type === 3) {
            value = u16(dataOff);
          } else if (type === 4) {
            value = u32(dataOff);
          } else if (type === 5 || type === 10) {
            const num = u32(dataOff);
            const den = u32(dataOff + 4) || 1;
            if (tag === 33434) value = num < den ? `1/${Math.round(den / num)} s` : `${(num / den).toFixed(1)} s`;
            else if (tag === 33437) value = `f/${(num / den).toFixed(1)}`;
            else if (tag === 37386) value = `${(num / den).toFixed(1)} mm`;
            else value = (num / den).toFixed(2);
          }
          if (tag === 34855) value = `ISO ${value}`;
          if (tag === 41989) value = `${value} mm`;
          if (value !== null && value !== '') rows.push([label, String(value)]);
        }
        return exifPtr;
      };
      const ifd0 = u32(4);
      const exifPtr = readIfd(ifd0);
      if (exifPtr) readIfd(exifPtr);
      return rows;
    } catch {
      return [];
    }
  }

  function fillGrid(el, rows) {
    el.innerHTML = '';
    for (const [k, v] of rows) {
      const kk = document.createElement('span');
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.textContent = v;
      vv.title = v;
      el.append(kk, vv);
    }
    if (!rows.length) {
      const none = document.createElement('span');
      none.className = 'pro-mini';
      none.textContent = 'Aucune donnée.';
      el.appendChild(none);
    }
  }

  async function computeInfo() {
    const f = currentFile();
    fillGrid(els.info, []);
    fillGrid(els.exif, []);
    if (!f || image.hidden) return;
    const ext = extOf(f.name);
    // seuls les premiers octets sont lus (les en-têtes JPEG/PNG y vivent) :
    // pas de rapatriement d'un fichier de 30 Mo depuis le NAS pour ça
    const head = await window.viewer.readFileHead(f.path, 2 * 1024 * 1024);
    if (!head || !head.data || currentFile() !== f) return;
    const data = head.data;
    const fileSize = head.size;
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const rows = [
      ['Dimensions', `${w} × ${h} px`],
      ['Ratio', ratioLabel(w, h)],
      ['Mégapixels', `${((w * h) / 1e6).toFixed(2)} Mpx`],
      ['Poids', formatBytes(fileSize)],
      ['Format', ext.toUpperCase()],
    ];
    let bits = 8;
    let channels = 3;
    let exifRows = [];
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') {
      const j = parseJpeg(data);
      bits = j.bits;
      rows.push(['Bits / canal', `${j.bits} bits`]);
      if (j.sub) rows.push(['Chroma', j.sub === 'niveaux de gris' ? j.sub : `sous-échantillonnage ${j.sub}`]);
      rows.push(['Encodage', j.prog ? 'JPEG progressif' : 'JPEG baseline']);
      rows.push(['Espace couleur', j.icc ? j.iccName || 'Profil ICC intégré' : 'sRGB (présumé, sans profil)']);
      if (j.xmp) rows.push(['XMP', 'présent']);
      if (j.exif) exifRows = parseExif(j.exif);
    } else if (ext === 'png') {
      const p = parsePng(data);
      bits = p.bits;
      channels = p.colorType === 'RVBA' || p.colorType === 'gris + alpha' ? 4 : 3;
      rows.push(['Bits / canal', `${p.bits} bits`]);
      if (p.colorType) rows.push(['Type', p.colorType]);
      rows.push([
        'Espace couleur',
        p.icc ? p.iccName || 'Profil ICC intégré' : p.srgb ? 'sRGB (chunk sRGB)' : p.gamma ? `gamma ${p.gamma.toFixed(2)}` : 'sRGB (présumé)',
      ]);
    } else {
      rows.push(['Bits / canal', '8 bits (décodage)']);
      rows.push(['Espace couleur', 'sRGB (présumé)']);
    }
    const raw = w * h * channels * (bits / 8);
    if (raw > 0 && fileSize > 0) {
      rows.push(['Compression', `≈ ${(raw / fileSize).toFixed(1)}:1 (${(fileSize / (w * h)).toFixed(2)} o/px)`]);
    }
    fillGrid(els.info, rows);
    fillGrid(els.exif, exifRows);
  }

  /* ================= Clavier ================= */

  function handleKey(e) {
    if (!currentFile() || Paint.isOpen() || studioIsOpen()) return false;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') {
      setRating(Number(k));
      return true;
    }
    if (k === '0') {
      setRating(0);
      return true;
    }
    if (k === 'p') {
      setFlag(flagOf(currentFile()) === 'pick' ? null : 'pick');
      return true;
    }
    if (k === 'x') {
      setFlag(flagOf(currentFile()) === 'reject' ? null : 'reject');
      return true;
    }
    if (k === 'u') {
      setFlag(null);
      return true;
    }
    if (k === 'g') {
      toggleGrid();
      return true;
    }
    if (k === 'k') {
      toggleLock();
      return true;
    }
    if (k === 'm') {
      toggleMeasure();
      return true;
    }
    if (k === 'escape' && (measureLine || measureMode)) {
      toggleMeasure(false);
      return true;
    }
    return false;
  }

  /* ================= Cycle de vie ================= */

  async function onContext() {
    if (!on) return;
    // nouveau dossier : les indices A/B de la comparaison n'ont plus de sens
    compareState.aIndex = null;
    compareState.bIndex = null;
    if (compareState.mode !== 'off') setCompare('off');
    master = state.files.slice();
    sizesLoaded = false;
    tags.data = {};
    tags.anchor = master.length ? master[0].path : null;
    els.filter.value = 'all';
    els.sort.value = 'name';
    sortAsc = true;
    els.sortDir.textContent = 'Asc';
    els.galleryCount.textContent = master.length ? `${master.length} / ${master.length} images` : '';
    if (tags.anchor) {
      const json = await window.viewer.readFolderMeta(tags.anchor);
      if (json) {
        try {
          tags.data = JSON.parse(json) || {};
        } catch {
          tags.data = {};
        }
      }
    }
    refreshTagUI();
    decorateTiles();
  }

  async function onImageShown() {
    if (!on) return;
    layoutPanel();
    // état par image — mais le canal choisi est CONSERVÉ d'une image à
    // l'autre (réappliqué plus bas), pour inspecter tout un dataset sur
    // le même canal sans le re-sélectionner à chaque fois
    if (channelUrl) {
      URL.revokeObjectURL(channelUrl);
      channelUrl = null;
    }
    baseSrc = null;
    for (const b of els.chan.querySelectorAll('button')) {
      b.classList.toggle('is-active', b.dataset.ch === channelMode);
    }
    measureLine = null;
    els.measureInfo.textContent = 'Glisser sur l’image pour mesurer un segment.';
    updateProfile();
    refreshTagUI();
    decorateTiles();
    drawOverlay();
    const f = currentFile();
    if (!f) {
      full = null;
      computeHistogram();
      fillGrid(els.info, []);
      fillGrid(els.exif, []);
      return;
    }
    computeInfo();
    await ensureFull();
    computeHistogram();
    if (channelMode !== 'rgb' && currentFile() === f) await setChannel(channelMode);
    if (compareState.mode !== 'off') {
      compareState.aIndex = state.index; // la navigation pilote l'image A
      buildCompare();
    }
  }

  /** Appelé quand l'élément <img> vient de charger. Retourne true si le mode
      Pro a géré la vue (restauration après bascule de canal, ou verrou). */
  function onImageElementLoad() {
    if (!on) return false;
    if (pendingView) {
      const pv = pendingView;
      pendingView = null;
      if (pv.fit) {
        // vue ajustée : recalculée (l'image affichée peut avoir changé)
        setFit();
      } else {
        state.zoom = pv.zoom;
        state.panX = pv.panX;
        state.panY = pv.panY;
        state.fit = false;
        applyTransform();
      }
      return true;
    }
    if (lockView && !state.fit) {
      applyTransform();
      return true;
    }
    return false;
  }

  function onViewChanged() {
    if (!on) return;
    drawOverlay();
  }

  /** Changement de thème clair/sombre : redessine les canvas du panneau. */
  function onTheme() {
    if (!on) return;
    computeHistogram();
    updateProfile();
    drawOverlay();
  }

  function enable() {
    build();
    on = true;
    els.panel.hidden = false;
    els.overlay.hidden = false;
    layoutPanel();
    if (master === null || master[0] !== state.files[0]) onContext();
    onImageShown();
  }

  function disable() {
    if (!built) return;
    on = false;
    setCompare('off');
    toggleMeasure(false);
    if (channelUrl) {
      // revient à l'image d'origine
      const f = currentFile();
      if (f && baseSrc) image.src = baseSrc;
      URL.revokeObjectURL(channelUrl);
      channelUrl = null;
    }
    baseSrc = null;
    full = null;
    els.panel.hidden = true;
    els.overlay.hidden = true;
    stage.style.cursor = '';
  }

  return {
    enable,
    disable,
    active: () => on,
    handleKey,
    onImageShown,
    onImageElementLoad,
    onViewChanged,
    onContext,
    onFilmstrip: decorateTiles,
    onTheme,
    setCompareIndex,
  };
})();
