/* Worker du rendu des très grandes images (voir bigView dans renderer.js).
   Tout le travail lourd se fait ici, hors du fil de l'interface :
    1. décodage complet du fichier (la seule étape incompressible) ;
    2. réduction (mip) pour les zooms faibles — renvoyée dès qu'elle est
       prête, l'affichage devient net sans attendre les tuiles ;
    3. découpe du plein format en tuiles (textures GPU raisonnables) ;
    4. sur demande, encodage PNG de la réduction pour le cache disque :
       la prochaine ouverture du même fichier est nette instantanément.
   Les ImageBitmap sont transférés au renderer sans copie. */

self.onmessage = async (e) => {
  const { id, buf, byteOffset, byteLength, mime, mipEdge, tileSize, wantMipData, filePath } =
    e.data;
  try {
    const bytes = new Uint8Array(buf, byteOffset || 0, byteLength || buf.byteLength);
    const full = await createImageBitmap(new Blob([bytes], { type: mime || '' }));
    const w = full.width;
    const h = full.height;

    const ratio = Math.min(1, mipEdge / Math.max(w, h));
    const mip = await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(w * ratio)),
      resizeHeight: Math.max(1, Math.round(h * ratio)),
      resizeQuality: 'high',
    });
    // copie pour le cache disque AVANT le transfert (qui neutralise le bitmap)
    let cacheCv = null;
    if (wantMipData) {
      cacheCv = new OffscreenCanvas(mip.width, mip.height);
      cacheCv.getContext('2d').drawImage(mip, 0, 0);
    }
    self.postMessage({ id, kind: 'mip', bmp: mip }, [mip]);

    const tiles = [];
    const transfers = [];
    for (let ty = 0; ty < h; ty += tileSize) {
      for (let tx = 0; tx < w; tx += tileSize) {
        // 1 px de marge partagée entre voisines : aucune jointure visible
        const x0 = Math.max(0, tx - 1);
        const y0 = Math.max(0, ty - 1);
        const x1 = Math.min(w, tx + tileSize + 1);
        const y1 = Math.min(h, ty + tileSize + 1);
        const bmp = await createImageBitmap(full, x0, y0, x1 - x0, y1 - y0);
        tiles.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, bmp });
        transfers.push(bmp);
      }
    }
    self.postMessage({ id, kind: 'tiles', tiles }, transfers);

    full.close();

    if (cacheCv) {
      const blob = await cacheCv.convertToBlob({ type: 'image/png' });
      const data = await blob.arrayBuffer();
      self.postMessage({ id, kind: 'mipdata', filePath, data }, [data]);
    }
  } catch {
    self.postMessage({ id, kind: 'error' });
  }
};
