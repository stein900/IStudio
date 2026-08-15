# Module Convertir

Convertit l'image affichée vers un autre format : **PNG, JPEG, WebP, TIFF,
BMP, ICO** — et relaie vers le module « Convertir en SVG » pour le
vectoriel. Accessible depuis la barre d'outils de la visionneuse et depuis
la carte « Convertir une image » de l'accueil (choisir un fichier, la popup
s'ouvre dès que l'image est affichée — même principe que la carte upscale).

La popup encode **réellement** l'image à chaque réglage : l'aperçu et le
poids affichés sont ceux du fichier final, pas une estimation.

- **PNG / JPEG / WebP** : encodeur natif de Chromium (`canvas.toBlob`),
  qualité réglable (40–100 %) pour JPEG et WebP. Le JPEG aplatit la
  transparence sur fond blanc.
- **TIFF** : baseline non compressé écrit à la main dans le worker
  (little-endian, une bande, RGB ou RGBA selon la présence d'alpha).
  Chromium ne sachant pas l'afficher, l'aperçu montre les pixels source
  (identiques) et « Enregistrer une copie » ne recharge pas la visionneuse.
- **BMP** : 24 bits classique (compatibilité maximale) ou 32 bits
  BITMAPV4HEADER + BI_BITFIELDS quand l'image a de l'alpha. Écrit dans le
  worker.
- **ICO** : icône Windows multi-résolutions (16, 32, 48, 256 px, bornées à
  la taille de la source), chaque entrée étant un PNG réduit par moitiés
  successives, image centrée à proportions conservées.
- **SVG** : pas de doublon — la tuile renvoie au module dédié
  (`renderer/svg-export/`), masquée si celui-ci est débranché.

Deux sorties : « Enregistrer sous… » (dialogue natif, filtre adapté au
format) et « Enregistrer une copie » (« nom copie.ext » à côté de
l'original via l'IPC `save-copy` existante, puis la visionneuse ouvre la
copie). Le dernier format et la dernière qualité utilisés sont mémorisés
(`localStorage`).

## Fichiers du module

```
renderer/convert/
├── convert.js         # bouton + carte accueil + popup + orchestration (window.ImageConvert)
├── convert-worker.js  # encodeurs TIFF et BMP (hors du thread d'interface)
├── convert.css        # styles de la popup (préfixe cvt-)
└── README.md
```

Le module construit lui-même son bouton de barre d'outils (inséré après le
bouton du module Export SVG), sa carte d'accueil (après « Agrandir avec
l'IA ») et sa popup. Il ne dépend de l'hôte que par l'API passée à
`ImageConvert.init()` et par les classes de thème (`btn-labeled`,
`home-card`, variables CSS).

## Points d'intégration (à retirer pour débrancher le module)

1. **`renderer/index.html`** — deux lignes marquées « Module Convertir » :
   la feuille de style dans `<head>`, le script avant `renderer.js`.
2. **`renderer/renderer.js`** — le bloc `if (window.ImageConvert) { … }` à
   la fin du fichier (section « Modules optionnels »), ainsi que le crochet
   générique `pendingModuleOpen` (déclaré dans la même section, consommé
   dans les gestionnaires `load`/`error` de l'image) — le laisser en place
   est inoffensif, il sert à tout module ouvert depuis l'accueil.
3. **`preload.js`** — l'entrée `convertExport` (marquée « Module
   Convertir »).
4. **`main.js`** — le handler `ipcMain.handle('convert-export', …)` (bloc
   marqué « Module Convertir »).
5. Supprimer ce dossier.

Note : la boucle de `render()` qui désactive les boutons parcourt
`#toolbar .module-btn` — point d'extension générique de l'hôte, partagé
avec le module Export SVG.
