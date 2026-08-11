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
    label: 'Déplacement (V) — sélectionner, déplacer, redimensionner, pivoter',
    cursor: 'default',
    hint: 'Cliquer : sélectionner · glisser : déplacer · poignées : redimensionner (Maj = libre) · poignée du haut : pivoter (Maj = pas de 15°)',
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
        ed.updateTransform(p, e.shiftKey);
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

  /* ---------- Lasso ---------- */

  register({
    id: 'lasso',
    key: 'l',
    icon: 'lasso',
    label: 'Lasso (L) — sélection à main levée',
    cursor: 'crosshair',
    hint: 'Entourer une zone puis : copier/couper en calque, effacer, ou peindre dedans (la sélection borne crayon et gomme)',
    pts: null,
    onDown(ed, p) {
      ed.setSelection(null);
      this.pts = [p];
      ed.setLassoPreview(this.pts);
    },
    onMove(ed, p) {
      if (!this.pts) return;
      this.pts.push(p);
      ed.setLassoPreview(this.pts);
    },
    onUp(ed) {
      if (!this.pts) return;
      if (this.pts.length >= 3) ed.setSelection(C.buildSelection(this.pts));
      this.pts = null;
      ed.setLassoPreview(null);
      ed.updateOptionsBar();
    },
    options(ed) {
      const box = document.createElement('div');
      box.className = 'studio-opt-group';
      const has = Boolean(ed.selection());
      const mk = (label, title, fn, primary) => {
        const b = document.createElement('button');
        b.className = primary ? 'studio-btn studio-btn-primary' : 'studio-btn';
        b.textContent = label;
        b.title = title;
        b.disabled = !has;
        b.addEventListener('click', fn);
        return b;
      };
      box.append(
        mk('Copier en calque', 'Duplique la zone sélectionnée sur un nouveau calque (Ctrl+J)', () => ed.selectionToLayer(false), true),
        mk('Couper en calque', 'Déplace la zone sélectionnée sur un nouveau calque', () => ed.selectionToLayer(true)),
        mk('Effacer', 'Efface les pixels de la sélection sur le calque actif (Suppr)', () => ed.eraseSelection()),
        mk('Désélectionner', 'Abandonne la sélection (Ctrl+D)', () => ed.deselect())
      );
      return box;
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
    hint: 'Peint sur le calque actif (raster) · clic droit sur la scène : réglages de la brosse · une sélection borne le trait',
    stroke: null,
    last: null,
    onDown(ed, p) {
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

  return {
    all: () => order.map((id) => registry.get(id)),
    get: (id) => registry.get(id) || null,
    register,
  };
})();
