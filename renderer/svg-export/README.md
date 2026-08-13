# Module Export SVG

Convertit l'image affichée (png, jpg, webp, psd…) en **SVG vectoriel**, selon
deux modes :

- **Sans perte** (par défaut) : chaque zone de pixels d'une même couleur est
  fusionnée en rectangles émis comme tracés vectoriels. Rendu identique au
  pixel près (couleurs et transparence exactes). Idéal pour les logos,
  captures d'écran, dessins et pixel art.
- **Simplifié** : pour les images photographiques, où le sans perte
  dépasserait le garde-fou (`MAX_RECTS` dans le worker). L'image est réduite
  à N couleurs (quantification median cut), les zones sont consolidées
  (filtre majoritaire 3×3), puis vectorisées par le même moteur. Le nombre
  de couleurs (8 à 128) se règle dans la popup ; la bascule depuis le mode
  sans perte est automatique quand l'image est trop détaillée.

## Fichiers du module

```
renderer/svg-export/
├── svg-export.js         # bouton + popup + orchestration (window.SvgExport)
├── svg-export-worker.js  # vectorisation (hors du thread d'interface)
├── svg-export.css        # styles de la popup (préfixe svgx-)
└── README.md
```

Le module construit lui-même son bouton de barre d'outils (inséré après le
bouton upscale) et sa popup. Il ne dépend de l'hôte que par l'API passée à
`SvgExport.init()` et par les classes de thème (`btn-labeled`, variables CSS).

## Points d'intégration (à retirer pour débrancher le module)

1. **`renderer/index.html`** — deux lignes marquées « Module Export SVG » :
   la feuille de style dans `<head>`, le script avant `renderer.js`.
2. **`renderer/renderer.js`** — le bloc `if (window.SvgExport) { … }` à la
   fin du fichier (section « Modules optionnels »).
3. **`preload.js`** — l'entrée `exportSvg` (marquée « Module Export SVG »).
4. **`main.js`** — le handler `ipcMain.handle('export-svg', …)` (bloc marqué
   « Module Export SVG »).
5. Supprimer ce dossier.

Note : la boucle de `render()` qui désactive les boutons parcourt aussi
`#toolbar .module-btn` — c'est un point d'extension générique de l'hôte,
il reste en place (inoffensif) une fois le module retiré.
