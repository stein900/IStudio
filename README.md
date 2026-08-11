# IStudio Viewer

Visionneuse d'images standalone construite avec Electron.

## Fonctionnalités

- Ouvre les images (`jpg`, `jpeg`, `jfif`, `png`, `gif`, `bmp`, `webp`, `ico`, `svg`, `tif`, `tiff`, `avif`)
- Navigation image précédente / suivante dans le dossier (boutons, flèches ← →, Début/Fin)
- Bandeau de miniatures en bas avec l'image courante mise en évidence
  - repliable/dépliable avec la flèche flottante au-dessus du bandeau
  - ou via le bouton pellicule de la barre d'outils (préférence enregistrée)
- Zoom quasi illimité (0,1 % à 100 000 %) centré sur le curseur : molette, boutons, `+` / `-`, `0` = ajusté, `1` = 100 %, double-clic pour basculer
- Déplacement libre de l'image à la souris (glisser), sans contrainte de bord
- Plein écran (bouton dédié, touche `F` ou `F11`, `Échap` pour sortir) : n'affiche que l'image, sans barre d'outils ni miniatures
- Rotation par quarts de tour (`R` horaire, `Maj+R` antihoraire) — appliquée directement au fichier
- Rognage : sélection avec poignées et grille des tiers (`Entrée` applique, `Échap` annule) — écrit directement dans le fichier
- Les formats non ré-encodables (BMP, TIFF, GIF, SVG, AVIF, ICO) sont convertis en PNG lors d'une édition ; l'original part à la corbeille
- Éditeur Paint intégré (bouton pinceau) : annotation de l'image courante — crayon avec lissage réglable, ligne, flèche, rectangle, ellipse, texte, gomme d'objet, calques, sélection avec poignées, annuler/rétablir, grille, copie presse-papiers ; « Enregistrer » aplatit les annotations dans le fichier (sources d'origine du module : `docs/paint-reference/`)
- Éditeur Studio intégré (bouton baguette) : montage type Photoshop/Photopea, **chargé à la demande** (la visionneuse reste légère) — calques raster et texte (déplacer, dupliquer, masquer/afficher, opacité, réordonner), outils déplacement/sélection, lasso (copier/couper en calque, effacer, borne le pinceau et la gomme), pipette, pinceau, gomme, texte ; annuler/rétablir ; « Enregistrer » aplatit le montage dans le fichier. Architecture extensible dans `renderer/studio/` : `core.js` (modèle pur), `tools.js` (registre d'outils), `studio.js` (interface)
  - Import d'images : coller (Ctrl+V) ou glisser-déposer des fichiers sur la scène — chaque image devient un calque indépendant, centré, avec l'outil Déplacement activé
  - Copier/coller de calques : Ctrl+C copie le calque actif, Ctrl+V le colle (duplication rapide)
  - Transformation libre **non destructive** : avec l'outil Déplacement, le calque actif porte un cadre à 8 poignées (échelle, Maj = libre) et une poignée de rotation (Maj = pas de 15°) ; Ctrl+T / Ctrl+Alt+T y mènent directement. Les pixels natifs sont conservés (réduire puis agrandir ne floute pas) ; la transformation n'est rasterisée qu'au moment de peindre sur le calque
  - Recentrage magnétique : en déplaçant un calque, son centre s'aimante sur les axes médians du document (guides roses)
  - Calques réordonnables par glisser-déposer dans le panneau (en plus des flèches monter/descendre)
  - Texte : gras, contour (épaisseur + couleur), et choix de la police parmi les polices système courantes — appliqués aux nouveaux textes et au calque texte sélectionné
  - Pipette avec retour en direct : pastille + code hexa dans la barre d'options, mis à jour au survol
  - Moteur de brosse partagé pinceau/gomme : taille, dureté (bord doux par dégradé), forme (rondeur + angle), galerie de préréglages — popup de réglages via le bouton d'aperçu de pointe dans la barre d'options ou le clic droit sur la scène
- Nom, résolution et poids du fichier affichés au centre de la barre d'outils
- Popup d'informations complète (bouton « i » ou touche `I`) : fichier, image, dates, position
- Suppression vers la corbeille (bouton poubelle ou touche `Suppr`, avec confirmation)
- Impression directe (bouton imprimante ou `Ctrl+P`)
- Interface sombre, icônes vectorielles SVG (aucun emoji)
- Instance unique : ouvrir une autre image réutilise la fenêtre existante
- Association de fichiers : l'installateur enregistre l'application pour les extensions d'images ; on peut ensuite la choisir comme application par défaut dans Windows (« Ouvrir avec » → « Toujours »)

## Développement

```bash
npm install
npm run dev              # lance l'application
npm run dev -- chemin\vers\image.jpg   # lance en ouvrant une image
```

## Distribution

```bash
npm run dist
```

Produit un installateur Windows (NSIS) dans `dist/`, par ex. `IStudio Viewer Setup 1.0.0.exe`.
L'installateur enregistre les associations de fichiers images ; après installation, faire clic droit sur une image → « Ouvrir avec » → « Choisir une autre application » → IStudio Viewer → « Toujours » pour la définir par défaut.
