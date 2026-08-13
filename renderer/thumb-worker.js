'use strict';

/**
 * Worker de vignettes : décode une image (bytes bruts) et produit une
 * miniature JPEG 256 px — entièrement hors du thread d'interface.
 * Le renderer reste fluide même pendant le décodage d'une photo de 25 Mpx.
 */

self.onmessage = async (e) => {
  const { id, buf, type } = e.data;
  try {
    const blob = new Blob([buf], { type });
    const bmp = await createImageBitmap(blob, { resizeWidth: 256, resizeQuality: 'low' });
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close();
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const jpeg = await out.arrayBuffer();
    self.postMessage({ id, ok: true, jpeg }, [jpeg]);
  } catch {
    self.postMessage({ id, ok: false });
  }
};
