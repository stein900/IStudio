'use strict';

// Signale au processus principal (via le titre) que l'image est prête à imprimer.
const img = document.getElementById('print-image');
const src = new URLSearchParams(location.search).get('src');

img.addEventListener('load', () => {
  document.title = 'ready';
});
img.addEventListener('error', () => {
  document.title = 'ready';
});

if (src) {
  img.src = src;
} else {
  document.title = 'ready';
}
