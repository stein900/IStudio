'use strict';

/**
 * Studio — registre des outils.
 *
 * Chaque outil est un objet à interface commune ; en ajouter un nouveau se
 * résume à appeler `register(...)` — la barre d'outils, les raccourcis et la
 * barre d'options se construisent tout seuls.
 *
 *   {
 *     id, key, icon, label, cursor, hint,
 *     onDown(ed, p, e), onMove(ed, p, e), onUp(ed, p, e), onDblClick?(ed, p),
 *     options?(ed) -> HTMLElement   // contenu de la barre d'options
 *   }
 *
 * `ed` est la façade éditeur fournie par studio.js (accès au document, à la
 * couleur, aux tailles, à la sélection, à l'historique, au rendu…) ;
 * `p` est la position du pointeur en pixels document.
 */

window.StudioTools = (() => {
  const C = window.StudioCore;
  const registry = new Map();
  const order = [];

  function register(tool) {
    registry.set(tool.id, tool);
    order.push(tool.id);
  }

  /* ---------- Déplacement / sélection ---------- */

  register({
    id: 'move',
    key: 'v',
    icon: 'pointer',
    label: 'Déplacement (V) — sélectionner, déplacer, redimensionner, pivoter, déformer',
    cursor: 'default',
    hint: 'Cliquer : sélectionner · glisser : déplacer · poignées : redimensionner (Maj = libre, Alt = depuis le centre, Ctrl = déformer / incliner) · poignée du haut : pivoter (Maj = 15°)',
    drag: null,
    transforming: false,
    onDown(ed, p) {
      // Poignées du cadre de transformation d'abord (échelle / rotation).
      const handle = ed.transformHandleAt(p);
      if (handle) {
        this.transforming = ed.beginTransform(handle, p);
        if (this.transforming) return;
      }
      const doc = ed.doc();
      const hit = C.layerAtPoint(doc, p.x, p.y);
      if (hit && hit.id !== doc.activeLayerId) {
        doc.activeLayerId = hit.id;
        ed.layersChanged();
      }
      const l = C.activeLayer(doc);
      if (!l) return;
      this.drag = { before: ed.snapshot(), l, ox: l.x, oy: l.y, sx: p.x, sy: p.y, moved: false };
    },
    onMove(ed, p, e) {
      if (this.transforming) {
        ed.updateTransform(p, e.shiftKey, e.altKey, e.ctrlKey);
        return;
      }
      if (!this.drag) {
        // survol : curseur selon la poignée sous le pointeur
        const handle = ed.transformHandleAt(p);
        ed.setCursor(handle ? handle.cursor : ed.insideActiveFrame(p) ? 'move' : 'default');
        return;
      }
      const d = this.drag;
      const dx = p.x - d.sx;
      const dy = p.y - d.sy;
      if (dx || dy) d.moved = true;
      d.l.x = Math.round(d.ox + dx);
      d.l.y = Math.round(d.oy + dy);
      ed.applyMoveSnap(d.l); // aimantation sur les axes médians du document
      ed.requestRender();
    },
    onUp(ed) {
      if (this.transforming) {
        ed.endTransform();
        this.transforming = false;
        return;
      }
      if (this.drag && this.drag.moved) ed.commit(this.drag.before);
      this.drag = null;
      ed.clearSnapGuides();
    },
    onDblClick(ed, p) {
      const hit = C.layerAtPoint(ed.doc(), p.x, p.y);
      if (hit && hit.kind === 'text') ed.startTextEdit(hit);
    },
  });

  /* ---------- Sélections : rectangle, ellipse ---------- */

  function makeMarqueeTool({ id, key, icon, label, ellipse }) {
    register({
      id,
      key,
      icon,
      label,
      cursor: 'crosshair',
      hint: 'Glisser pour sélectionner · Maj : ajouter à la sélection · Ctrl+A tout, Ctrl+Maj+I inverser, Ctrl+D désélectionner',
      draft: null,
      onDown(ed, p, e) {
        this.draft = { a: p, b: p, additive: e.shiftKey };
        ed.setSelectionDraft({ kind: ellipse ? 'ellipse' : 'rect', a: p, b: p });
      },
      onMove(ed, p) {
        if (!this.draft) return;
        this.draft.b = p;
        ed.setSelectionDraft({ kind: ellipse ? 'ellipse' : 'rect', a: this.draft.a, b: p });
      },
      onUp(ed) {
        if (!this.draft) return;
        const { a, b, additive } = this.draft;
        this.draft = null;
        ed.setSelectionDraft(null);
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        if (w < 2 || h < 2) {
          if (!additive) ed.deselect();
          return;
        }
        const path = new Path2D();
        if (ellipse) path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else path.rect(x, y, w, h);
        ed.finishSelection({ path, bounds: { x, y, w, h } }, additive);
      },
      options(ed) {
        return ed.buildSelectionActions();
      },
    });
  }

  makeMarqueeTool({
    id: 'select-rect',
    key: 'm',
    icon: 'selectRect',
    label: 'Sélection rectangle (M)',
    ellipse: false,
  });
  makeMarqueeTool({
    id: 'select-ellipse',
    key: 'o',
    icon: 'selectEllipse',
    label: 'Sélection ellipse (O)',
    ellipse: true,
  });

  /* ---------- Baguette magique (sélection par couleur) ---------- */

  register({
    id: 'wand',
    key: 'a',
    icon: 'wandSelect',
    label: 'Baguette magique (A) — sélectionner par couleur',
    cursor: 'crosshair',
    hint: 'Cliquer : sélectionne la couleur semblable sur le calque actif · Maj : ajouter · Contigu : zone connexe seulement',
    onDown(ed, p, e) {
      ed.wandSelect(p, e.shiftKey);
    },
    onMove() {},
    onUp() {},
    options(ed) {
      return ed.buildWandOptions();
    },
  });

  /* ---------- Lasso ---------- */

  register({
    id: 'lasso',
    key: 'l',
    icon: 'lasso',
    label: 'Lasso (L) — sélection à main levée',
    cursor: 'crosshair',
    hint: 'Entourer une zone (Maj : ajouter à la sélection) puis : copier/couper en calque, effacer, ou peindre dedans',
    pts: null,
    additive: false,
    onDown(ed, p, e) {
      this.pts = [p];
      this.additive = e.shiftKey;
      ed.setLassoPreview(this.pts);
    },
    onMove(ed, p) {
      if (!this.pts) return;
      this.pts.push(p);
      ed.setLassoPreview(this.pts);
    },
    onUp(ed) {
      if (!this.pts) return;
      if (this.pts.length >= 3) ed.finishSelection(C.buildSelection(this.pts), this.additive);
      else if (!this.additive) ed.deselect();
      this.pts = null;
      ed.setLassoPreview(null);
      ed.updateOptionsBar();
    },
    options(ed) {
      return ed.buildSelectionActions();
    },
  });

  /* ---------- Pipette ---------- */

  register({
    id: 'picker',
    key: 'i',
    icon: 'dropper',
    label: 'Pipette (I) — prélever une couleur',
    cursor: 'crosshair',
    hint: 'Survoler : aperçu de la couleur en direct · cliquer : la prélever',
    active: false,
    onDown(ed, p) {
      this.active = true;
      ed.pickColor(p);
    },
    onMove(ed, p) {
      if (this.active) ed.pickColor(p);
      else ed.previewColor(p); // retour en direct au survol
    },
    onUp() {
      this.active = false;
    },
    options(ed) {
      return ed.buildPickerReadout();
    },
  });

  /* ---------- Pinceau (brosse paramétrable) ---------- */

  register({
    id: 'pencil',
    key: 'b',
    icon: 'pencil',
    label: 'Pinceau (B) — peindre sur le calque actif',
    cursor: 'crosshair',
    hint: 'Peint sur le calque actif (raster) · Alt + clic : pipette · clic droit : réglages de la brosse · une sélection borne le trait',
    stroke: null,
    last: null,
    onDown(ed, p, e) {
      if (e.altKey) {
        ed.pickColor(p);
        return;
      }
      const l = ed.requireRaster();
      if (!l) return;
      this.stroke = ed.beginBrushStroke(l, { toolId: 'pencil', erase: false });
      ed.brushStampSegment(this.stroke, p, p);
      this.last = p;
    },
    onMove(ed, p) {
      if (!this.stroke) return;
      ed.brushStampSegment(this.stroke, this.last, p);
      this.last = p;
    },
    onUp(ed) {
      if (this.stroke) ed.endBrushStroke(this.stroke);
      this.stroke = null;
    },
    options(ed) {
      return ed.buildBrushOptions('pencil');
    },
  });

  /* ---------- Tampon de duplication ---------- */

  register({
    id: 'clone',
    key: 's',
    icon: 'stamp',
    label: 'Tampon de duplication (S) — cloner une zone de l’image',
    cursor: 'crosshair',
    hint: 'Alt + clic : définir la source · puis peindre pour dupliquer la source (retouche, suppression de défauts)',
    src: null,
    stroke: null,
    last: null,
    onDown(ed, p, e) {
      if (e.altKey) {
        this.src = p;
        ed.status('Source du tampon définie — peignez pour dupliquer depuis ce point.');
        return;
      }
      if (!this.src) {
        ed.status('Alt + clic d’abord, pour définir la source à dupliquer.');
        return;
      }
      const l = ed.requireRaster();
      if (!l) return;
      this.stroke = ed.beginCloneStroke(l, this.src, p);
      ed.cloneStampSegment(this.stroke, p, p);
      this.last = p;
    },
    onMove(ed, p) {
      if (!this.stroke) return;
      ed.cloneStampSegment(this.stroke, this.last, p);
      this.last = p;
    },
    onUp(ed) {
      if (this.stroke) ed.endBrushStroke(this.stroke);
      this.stroke = null;
    },
    options(ed) {
      return ed.buildBrushOptions('clone');
    },
  });

  /* ---------- Retouche (flou, netteté, doigt, éclaircir, assombrir) ---------- */

  register({
    id: 'retouch',
    key: 'r',
    icon: 'droplet',
    label: 'Retouche (R) — flou, netteté, doigt, éclaircir, assombrir',
    cursor: 'crosshair',
    hint: 'Peindre pour retoucher localement · le mode et l’intensité se choisissent dans la barre d’options · clic droit : réglages de la brosse',
    stroke: null,
    last: null,
    onDown(ed, p) {
      const l = ed.requireRaster();
      if (!l) return;
      this.stroke = ed.beginRetouchStroke(l);
      ed.retouchStampSegment(this.stroke, p, p);
      this.last = p;
    },
    onMove(ed, p) {
      if (!this.stroke) return;
      ed.retouchStampSegment(this.stroke, this.last, p);
      this.last = p;
    },
    onUp(ed) {
      if (this.stroke) ed.endBrushStroke(this.stroke);
      this.stroke = null;
    },
    options(ed) {
      return ed.buildRetouchOptions();
    },
  });

  /* ---------- Correcteur de tons directs ---------- */

  register({
    id: 'heal',
    key: 'j',
    icon: 'bandage',
    label: 'Correcteur de tons directs (J) — effacer une imperfection',
    cursor: 'crosshair',
    hint: 'Peindre sur le défaut : au relâcher, la zone est reconstruite depuis son voisinage · clic droit : réglages de la brosse',
    stroke: null,
    last: null,
    onDown(ed, p) {
      const l = ed.requireRaster();
      if (!l) return;
      this.stroke = ed.beginHealStroke(l);
      ed.healStampSegment(this.stroke, p, p);
      this.last = p;
    },
    onMove(ed, p) {
      if (!this.stroke) return;
      ed.healStampSegment(this.stroke, this.last, p);
      this.last = p;
    },
    onUp(ed) {
      if (this.stroke) ed.endHealStroke(this.stroke);
      this.stroke = null;
    },
    options(ed) {
      return ed.buildBrushOptions('heal');
    },
  });

  /* ---------- Gomme (même moteur de brosse) ---------- */

  register({
    id: 'eraser',
    key: 'e',
    icon: 'eraser',
    label: 'Gomme (E) — effacer sur le calque actif',
    cursor: 'crosshair',
    hint: 'Efface le calque actif (raster) · clic droit sur la scène : réglages de la brosse (douceur, taille, forme) · une sélection borne la gomme',
    stroke: null,
    last: null,
    onDown(ed, p) {
      const l = ed.requireRaster();
      if (!l) return;
      this.stroke = ed.beginBrushStroke(l, { toolId: 'eraser', erase: true });
      ed.brushStampSegment(this.stroke, p, p);
      this.last = p;
    },
    onMove(ed, p) {
      if (!this.stroke) return;
      ed.brushStampSegment(this.stroke, this.last, p);
      this.last = p;
    },
    onUp(ed) {
      if (this.stroke) ed.endBrushStroke(this.stroke);
      this.stroke = null;
    },
    options(ed) {
      return ed.buildBrushOptions('eraser');
    },
  });

  /* ---------- Gomme magique ---------- */

  register({
    id: 'magic',
    key: 'w',
    icon: 'wand',
    label: 'Gomme magique (W) — retirer un fond ou détourer un objet',
    cursor: 'crosshair',
    hint: 'Cliquer une couleur : elle devient transparente · Contigu coché = zone connexe seulement (détourage), décoché = tout le calque (fond) · Tolérance et Adoucir règlent la finesse',
    onDown(ed, p) {
      ed.magicErase(p);
    },
    onMove() {},
    onUp() {},
    options(ed) {
      return ed.buildMagicOptions();
    },
  });

  /* ---------- Pot de peinture ---------- */

  register({
    id: 'bucket',
    key: 'g',
    icon: 'bucket',
    label: 'Pot de peinture (G) — remplir une zone de couleur',
    cursor: 'crosshair',
    hint: 'Cliquer : remplit la zone de couleur semblable avec la couleur active · réglages : tolérance, opacité, contigu · une sélection borne le remplissage',
    onDown(ed, p) {
      ed.bucketFill(p);
    },
    onMove() {},
    onUp() {},
    options(ed) {
      return ed.buildBucketOptions();
    },
  });

  /* ---------- Dégradé ---------- */

  register({
    id: 'gradient',
    key: 'd',
    icon: 'gradient',
    label: 'Dégradé (D) — de la couleur active vers la seconde couleur ou le transparent',
    cursor: 'crosshair',
    hint: 'Glisser du départ à l’arrivée · linéaire ou radial · vers la seconde couleur ou le transparent · une sélection borne le dégradé',
    drag: null,
    onDown(ed, p) {
      this.drag = { a: p, b: p };
      ed.setGradientPreview(this.drag);
    },
    onMove(ed, p) {
      if (!this.drag) return;
      this.drag.b = p;
      ed.setGradientPreview(this.drag);
    },
    onUp(ed) {
      if (!this.drag) return;
      const { a, b } = this.drag;
      this.drag = null;
      ed.setGradientPreview(null);
      if (Math.hypot(b.x - a.x, b.y - a.y) >= 2) ed.applyGradient(a, b);
    },
    options(ed) {
      return ed.buildGradientOptions();
    },
  });

  /* ---------- Formes (rectangle, ellipse, ligne, flèche) ---------- */

  register({
    id: 'shape',
    key: 'u',
    icon: 'shapes',
    label: 'Formes (U) — rectangle, ellipse, ligne, flèche',
    cursor: 'crosshair',
    hint: 'Glisser pour tracer la forme (Maj : carré / cercle / ligne à 45°) · contour ou rempli, épaisseur réglable · dessine avec la couleur active',
    drag: null,
    constrain(a, p, shiftKey, kind) {
      if (!shiftKey) return p;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      if (kind === 'line' || kind === 'arrow') {
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const d = Math.hypot(dx, dy);
        return { x: a.x + Math.cos(angle) * d, y: a.y + Math.sin(angle) * d };
      }
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m };
    },
    onDown(ed, p) {
      this.drag = { a: p, b: p };
      ed.setShapeDraft(this.drag);
    },
    onMove(ed, p, e) {
      if (!this.drag) return;
      this.drag.b = this.constrain(this.drag.a, p, e.shiftKey, ed.shapeKind());
      ed.setShapeDraft(this.drag);
    },
    onUp(ed) {
      if (!this.drag) return;
      const { a, b } = this.drag;
      this.drag = null;
      ed.setShapeDraft(null);
      if (Math.hypot(b.x - a.x, b.y - a.y) >= 2) ed.applyShape(a, b);
    },
    options(ed) {
      return ed.buildShapeOptions();
    },
  });

  /* ---------- Texte ---------- */

  register({
    id: 'text',
    key: 't',
    icon: 'type',
    label: 'Texte (T) — ajouter ou éditer un calque de texte',
    cursor: 'text',
    hint: 'Cliquer pour créer un calque de texte · cliquer un texte existant pour l’éditer',
    onDown(ed, p) {
      const hit = C.layerAtPoint(ed.doc(), p.x, p.y);
      if (hit && hit.kind === 'text') ed.startTextEdit(hit);
      else ed.startTextEdit(null, p);
    },
    onMove() {},
    onUp() {},
    options(ed) {
      return ed.buildTextOptions();
    },
  });

  /* ---------- Repères de mesure (règle, compas, cercle) ---------- */

  register({
    id: 'guides',
    key: 'k',
    icon: 'compass',
    label: 'Repères de mesure (K) — règle, compas, cercle (hors rendu)',
    cursor: 'default',
    hint: 'Ajoutez une règle, un compas ou un cercle via la barre d’options · glissez leurs poignées pour mesurer · ces repères ne font jamais partie de l’image',
    dragging: false,
    onDown(ed, p) {
      this.dragging = ed.guideDown(p);
    },
    onMove(ed, p) {
      if (this.dragging) {
        ed.guideMove(p);
        return;
      }
      ed.setCursor(ed.guideHitAt(p) ? 'pointer' : 'default');
    },
    onUp(ed) {
      if (this.dragging) ed.guideUp();
      this.dragging = false;
    },
    options(ed) {
      return ed.buildGuideOptions();
    },
  });

  return {
    all: () => order.map((id) => registry.get(id)),
    get: (id) => registry.get(id) || null,
    register,
  };
})();
