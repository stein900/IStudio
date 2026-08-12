# IStudio — Images Studio

**IStudio** est une application Windows autonome (Electron) qui réunit en un seul logiciel :

- une **visionneuse d'images** rapide, épurée, utilisable comme application par défaut de Windows ;
- un **mode Pro d'analyse** pour les puristes de l'image et le travail sur datasets (vision par ordinateur, imagerie scientifique, contrôle qualité, annotation) : histogramme, inspecteur de pixels, canaux, métadonnées, notes et tri ;
- **Paint**, un éditeur d'annotation rapide (croquis, flèches, formes, texte) ;
- **Studio**, un éditeur de montage multi-calques type Photoshop/Photopea : sélections, pinceaux, retouche, calques avec modes de fusion et styles, ouverture et export **PSD**, format de projet propre `.istudio`.

Le principe directeur : **léger par défaut, puissant à la demande**. Au lancement, seule la visionneuse est chargée ; le mode Pro, Paint, Studio et le décodeur PSD ne sont chargés en mémoire que lorsqu'on les sollicite.

---

## Sommaire

1. [Installation et démarrage](#1-installation-et-démarrage)
2. [La page d'accueil](#2-la-page-daccueil)
3. [La visionneuse (mode Basic)](#3-la-visionneuse-mode-basic)
4. [Le mode Pro — analyse et datasets](#4-le-mode-pro--analyse-et-datasets)
5. [Paint — annotation rapide](#5-paint--annotation-rapide)
6. [Studio — montage multi-calques](#6-studio--montage-multi-calques)
7. [Prise en charge du PSD](#7-prise-en-charge-du-psd)
8. [Formats pris en charge](#8-formats-pris-en-charge)
9. [Fichiers annexes créés par IStudio](#9-fichiers-annexes-créés-par-istudio)
10. [Raccourcis clavier](#10-raccourcis-clavier)
11. [Développement](#11-développement)
12. [Limites connues](#12-limites-connues)

---

## 1. Installation et démarrage

```bash
npm install
npm run dev              # lance l'application en développement
npm run dev -- chemin\vers\image.jpg   # lance en ouvrant une image
npm run dist             # construit l'installateur Windows (NSIS) dans dist/
```

L'installateur (`dist/IStudio Setup 1.0.0.exe`) :

- installe **IStudio** (raccourcis Démarrer/Bureau, entrée « Applications installées ») ;
- enregistre les **associations de fichiers** pour toutes les extensions d'images prises en charge, plus le type « **Document Photoshop** » pour les `.psd`.

Windows exige que l'utilisateur confirme l'application par défaut : clic droit sur une image (ou un `.psd`) → **Ouvrir avec** → **Choisir une autre application** → *IStudio* → **Toujours**. Ensuite, tout double-clic ouvre IStudio. L'application est à **instance unique** : ouvrir une autre image réutilise la fenêtre existante.

L'icône est générée depuis `src/Logo/IStudio_logo.png` par `npx electron tools/gen-icon.js`, qui produit un `build/icon.ico` **multi-résolutions** (16 → 256 px, chaque taille rééchantillonnée en qualité maximale) — jamais d'icône floue redimensionnée à la volée par Windows.

## 2. La page d'accueil

Lancer IStudio **sans fichier** affiche une page d'accueil avec quatre actions :

| Carte | Effet |
|---|---|
| **Ouvrir une image** | Sélecteur de fichiers (jpg, png, psd…) |
| **Nouveau projet** | Popup de création puis Studio sur une toile vierge |
| **Nouveau dessin** | Paint directement sur une feuille blanche |
| **Ouvrir un projet** | Recharge un montage `.istudio` avec tous ses calques |

La popup **Nouveau projet** propose :

- **8 gabarits** avec aperçu du ratio : Full HD 16:9, Carré 1:1, Portrait 4:5, Story 9:16, 4K, A4 300 DPI (portrait/paysage), Bannière 3:1 ;
- **résolution personnalisée** (largeur/hauteur libres jusqu'à 20 000 px) ;
- **arrière-plan** : blanc, noir, **transparent** ou couleur personnalisée ;
- **DPI**, **nom du projet**, et **mode RVB / CMJN** (le CMJN est enregistré comme métadonnée du projet ; l'affichage et l'édition restent en RVB, c'est indiqué honnêtement dans la popup).

Un document créé de zéro s'enregistre par « Enregistrer sous » (PNG), puis s'ouvre dans la visionneuse.

## 3. La visionneuse (mode Basic)

L'interface par défaut : une barre d'outils, l'image, un bandeau de miniatures.

- **Navigation** dans le dossier : boutons, flèches ← →, Début/Fin — les images du dossier sont triées comme dans l'Explorateur (tri naturel).
- **Zoom quasi illimité** (0,1 % à 100 000 %) centré sur le curseur : molette, boutons, `+`/`-`, `0` = ajusté, `1` = 100 %, double-clic pour basculer. **Déplacement libre** de l'image à la souris, sans contrainte de bord.
- **Plein écran** (`F` / `F11`) : n'affiche que l'image.
- **Bandeau de miniatures** optimisé pour les gros dossiers :
  - vignettes **économes** : cache de miniatures de Windows (Explorateur) en priorité, sinon décodage réduit à 256 px (~30 Ko retenus par vignette — jamais l'image pleine résolution : des centaines de photos 25 Mpx ne pèsent rien) ;
  - chargées **à la visibilité** (IntersectionObserver), par lots de 4, paginées par 50 avec bouton « suivantes » ;
  - chaque tuile affiche l'image **dans son vrai ratio** (hauteur fixe, largeur variable bornée 34–240 px, image entière toujours visible — un panoramique se voit comme un panoramique) ;
  - repliable (flèche flottante ou bouton pellicule, préférence enregistrée).
- **Édition directe du fichier** (pas un simple rendu) :
  - **rotation** par quarts de tour (`R` / `Maj+R`) ;
  - **rognage** avec poignées et grille des tiers (`Entrée` applique) ;
  - les formats non ré-encodables (BMP, TIFF, GIF, SVG, AVIF, ICO) sont convertis en PNG, l'original part à la corbeille — **sauf les PSD, jamais touchés** (le résultat s'écrit en PNG à côté).
- **Informations** : nom, résolution et poids dans la barre d'outils ; popup complète (`I`) avec fichier, image, dates, chemin.
- **Impression** directe (`Ctrl+P`, rendu isolé dans une fenêtre cachée), **suppression** vers la corbeille (`Suppr`, avec confirmation), ouverture de fichier (`Ctrl+O`).
- Interface sombre premium, **icônes vectorielles SVG uniquement** (aucun emoji).

## 4. Le mode Pro — analyse et datasets

Un interrupteur **Basic | Pro** dans la barre d'outils (choix mémorisé, appliqué à chaque ouverture). Basic reste l'interface épurée ci-dessus ; **Pro** ajoute un panneau d'analyse latéral et des outils dataset — le module n'est chargé qu'à la première bascule.

### Analyse visuelle

- **Histogramme** RVB + luminance, avec pourcentages d'**écrêtage** dans les noirs et les blancs.
- **Inspecteur de pixel** en direct au survol : coordonnées X/Y exactes, valeurs RVBA 0-255, hex, et float 0-1.
- **Canaux isolés** : R, V, B, alpha ou luminance affichés seuls d'un clic (analyse de bruit, de masques, d'artefacts).
- **Fausse couleur** (heatmap type plasma sur la luminance) pour révéler des variations de contraste invisibles à l'œil sur du gris.
- **Profil de ligne / mesure** (`M`) : glisser un segment sur l'image → longueur, Δx/Δy et angle en overlay, et la **courbe d'intensité** R/V/B/luma le long du segment dans le panneau (gradients, contrastes, transitions).
- **Grille** en pixels image (`G`), pas réglable, densité auto-adaptée au zoom.

### Métadonnées

- **Profondeur de bits** par canal, **sous-échantillonnage chroma** JPEG (4:2:0 / 4:2:2 / 4:4:4), baseline ou progressif ;
- **profil ICC** (présence + nom du profil) ou « sRGB présumé » ; chunks sRGB/gAMA/iCCP pour le PNG ;
- **taux de compression** (≈ N:1 et octets/pixel), dimensions, ratio simplifié, mégapixels ;
- panneau **EXIF** : appareil, fabricant, exposition (1/N s), ouverture (f/), ISO, focale (+ équivalent 35 mm), objectif, dates, logiciel ; présence **XMP** signalée.

### Gestion de dataset

- **Notes et drapeaux au clavier** : `1-5` étoiles, `0` sans note, `P` à retenir, `X` à supprimer, `U` enlever le drapeau. Badges étoiles et liserés vert/rouge sur les vignettes. Le tout est **persisté dans un sidecar** `.istudio-tags.json` posé à côté des images (partageable avec le dossier).
- **Tri** de la galerie : nom, taille ou note, croissant/décroissant. **Filtre** : toutes, à retenir, à supprimer, ≥ N étoiles.
- **Comparaison** : côte à côte (A | B) ou **différence amplifiée** |A−B| ×4 — l'image B est la précédente par défaut, ou **Ctrl + clic sur une vignette** pour la choisir.
- **Zoom 1:1** d'un clic (1 pixel image = 1 pixel écran) et **verrou de vue** (`K`) : zoom et position conservés en changeant d'image, pour inspecter **la même zone sur tout le dataset**.
- Bandeau compact (48 px) pour rendre de la hauteur à l'image.

En mode Pro, les touches `0`/`1` servent aux notes (l'ajustement et le 100 % restent accessibles par boutons et double-clic).

## 5. Paint — annotation rapide

Le bouton pinceau ouvre l'image courante dans **Paint**, un éditeur d'annotation léger :

- crayon avec **lissage réglable** (suivi exponentiel + moyenne mobile + simplification), ligne, flèche, rectangle, ellipse, texte, gomme d'objet ;
- calques simples, sélection avec poignées, annuler/rétablir, grille, copie vers le presse-papiers ;
- « Enregistrer » aplatit les annotations — au choix **écraser l'original** ou **créer une copie** à côté.

Paint s'ouvre aussi **sans image** depuis l'accueil (feuille blanche).

## 6. Studio — montage multi-calques

Le bouton baguette ouvre **Studio**, l'éditeur type Photoshop/Photopea. Module, styles et outils sont chargés à la demande ; l'architecture est extensible (`renderer/studio/` : `core.js` modèle pur, `tools.js` registre d'outils, `studio.js` interface).

### Les 15 outils

| Outil | Touche | Description |
|---|---|---|
| Déplacement | `V` | sélection, déplacement, **transformation libre non destructive** |
| Sélection rectangle | `M` | sélection géométrique |
| Sélection ellipse | `O` | sélection géométrique |
| Baguette magique | `A` | sélection par couleur (tolérance, contigu) |
| Lasso | `L` | sélection à main levée |
| Pipette | `I` | prélèvement, aperçu couleur en direct |
| Pinceau | `B` | brosse paramétrable (Alt + clic = pipette) |
| Tampon de duplication | `S` | Alt + clic fixe la source, puis on clone |
| Retouche | `R` | flou, netteté, doigt, éclaircir, assombrir |
| Gomme | `E` | même moteur de brosse |
| Gomme magique | `W` | retire un fond / détoure par couleur, **sans halo** (masque gradué anti-aliasé) |
| Pot de peinture | `G` | remplissage par similarité, bords anti-aliasés |
| Dégradé | `D` | linéaire/radial, vers le transparent ou la seconde couleur |
| Formes | `U` | rectangle, ellipse, ligne, flèche — contour/rempli, Maj contraint |
| Texte | `T` | calques de texte éditables |

- **Sélections composables** : Maj = ajouter, `Ctrl+A` tout, `Ctrl+Maj+I` inverser, `Ctrl+D` désélectionner. Toute sélection **borne** pinceau, gomme, pot, dégradé, tampon, retouche, réglages et filtres.
- **Moteur de brosse** partagé : taille, dureté (bord doux gaussien), forme (rondeur + angle), préréglages — popup via le bouton d'aperçu ou clic droit sur la scène ; `[` / `]` changent la taille ; **cercle d'impact** sous le curseur (taille et forme réelles, net à tout zoom).
- **Transformation libre non destructive** : cadre à 8 poignées + rotation (Maj = 15°) ; en tirant une poignée **le côté opposé reste immobile** (Maj = libre par axe, Alt = depuis le centre). Les **pixels natifs sont conservés** — réduire puis agrandir ne floute jamais ; la rasterisation n'a lieu qu'au moment de peindre. `Ctrl+T` y mène.
- **Aimantation** : centres et bords du document (guides roses).
- **Zoom** 2 % → 8000 % (molette au curseur, `+`/`-`/`0`/`1`), pixels nets au-delà de 300 %, **grille de pixels** à partir de 1600 % et **valeurs R V B affichées dans chaque pixel** à partir de 3200 % (seuls les pixels visibles sont calculés) ; déplacement à la molette-clic ou Espace + glisser.
- **Deux couleurs** actives (`X` permute).

### Calques

- Raster et **texte** (toujours rééditable : contenu, corps, couleur, **gras/italique/souligné/barré**, police, contour avec sa couleur).
- **16 modes de fusion** (produit, écran, superposition, lumière tamisée…), opacité, masquer/afficher, dupliquer (`Ctrl+C`/`Ctrl+V` ou bouton), renommer (double-clic), réordonner par **glisser-déposer**, fusionner vers le bas (`Ctrl+E`), aplatir.
- **Styles de calque non destructifs** : ombre portée (décalage, flou, opacité, couleur), contour, lueur externe — rendus sous le contenu, suivent le calque, modifiables à tout moment.
- **Import** : coller (`Ctrl+V`) ou glisser-déposer des fichiers — chaque image devient un calque indépendant centré.

### Menus

- **Image** : recadrer selon la sélection, taille de l'image (proportions liées), rotation de la toile 90°, symétries (document et calque), styles du calque, fusionner/aplatir, **projet .istudio** (enregistrer/ouvrir), **exporter** (PNG / JPEG / WebP avec qualité, ou **PSD avec calques**).
- **Réglages** (aperçu en direct, bornés par la sélection) : luminosité/contraste, teinte/saturation, niveaux (points noir/blanc + gamma), **courbes** (éditeur interactif à points de contrôle, interpolation monotone — clic pour ajouter, clic droit pour retirer), inversion, noir et blanc.
- **Filtres** : flou gaussien, netteté, bruit, pixellisation.

### Enregistrement

- « Enregistrer » aplatit le montage : **écraser l'original ou créer une copie** (la copie s'ouvre ensuite).
- **Projet `.istudio`** : conserve **tout** — calques pleine résolution, positions, transformations non destructives, opacités, modes de fusion, styles, textes éditables, nom/DPI/mode. Pour travailler en plusieurs sessions sans jamais aplatir.
- Historique : 20 étapes d'annulation, y compris les changements de dimensions du document.

## 7. Prise en charge du PSD

- **Ouverture** : la visionneuse affiche le rendu aplati (composite) ; le bouton Studio ouvre le document **avec ses calques séparés** — position, opacité, mode de fusion, visibilité, groupes mis à plat — et **les calques de texte restent éditables** (contenu, corps, couleur, styles, police approchée depuis le nom PostScript).
- **Export** : Studio écrit de vrais `.psd` multi-calques (avec composite intégré), rouverts par Photoshop et Photopea.
- **Sécurité** : une édition d'un PSD s'enregistre **toujours en PNG à côté** — le fichier source n'est jamais écrasé ni mis à la corbeille.
- Moteur : copie embarquée d'`ag-psd` (`renderer/vendor/ag-psd.js`), **corrigée** pour lire les paramètres de masque avant le « real mask » conformément à la spec Adobe (certains PSD valides échouaient sinon avec « Invalid realMask size »). Correctif réapplicable après mise à jour du paquet : `node tools/patch-agpsd.js .` puis copie de `node_modules/ag-psd/dist/bundle.js` vers `renderer/vendor/ag-psd.js`.

## 8. Formats pris en charge

| Format | Lecture | Écriture | Notes |
|---|---|---|---|
| JPEG (`jpg`, `jpeg`, `jfif`) | oui | oui | ré-encodage qualité 0,95 ; métadonnées chroma/EXIF lues en mode Pro |
| PNG | oui | oui | format de conversion par défaut |
| WebP | oui | oui | |
| PSD | oui (calques) | oui (calques) | original jamais modifié |
| GIF, BMP, TIFF, SVG, AVIF, ICO | oui | converti en PNG à l'édition | l'original part à la corbeille (sauf visualisation simple) |
| `.istudio` | oui | oui | projet Studio complet (JSON + calques PNG) |

## 9. Fichiers annexes créés par IStudio

| Fichier | Rôle |
|---|---|
| `*.istudio` | projet Studio (montage complet, calques préservés) — créé uniquement à la demande |
| `.istudio-tags.json` | notes et drapeaux du mode Pro, posé dans le dossier d'images concerné |

Aucun autre fichier n'est écrit à l'insu de l'utilisateur ; la préférence Basic/Pro et l'affichage du bandeau sont stockés dans le profil local de l'application.

## 10. Raccourcis clavier

### Visionneuse

| Touche | Action |
|---|---|
| `←` `→`, `Début`/`Fin` | navigation |
| molette, `+`/`-`, `0`, `1`, double-clic | zoom (ajusté / 100 %) |
| `F` / `F11`, `Échap` | plein écran |
| `R` / `Maj+R` | rotation horaire / antihoraire (fichier modifié) |
| `I` | popup d'informations |
| `Suppr` | corbeille (confirmation) |
| `Ctrl+O` / `Ctrl+P` | ouvrir / imprimer |

### Mode Pro (en plus)

| Touche | Action |
|---|---|
| `1`-`5` / `0` | note / sans note |
| `P` / `X` / `U` | à retenir / à supprimer / enlever |
| `M` | mesure & profil de ligne |
| `G` | grille |
| `K` | verrou de vue entre images |

### Studio

| Touche | Action |
|---|---|
| `V M O A L I B S R E W G D U T` | outils (voir tableau §6) |
| `Ctrl+Z` / `Ctrl+Maj+Z` / `Ctrl+Y` | annuler / rétablir |
| `Ctrl+S` | enregistrer |
| `Ctrl+A` / `Ctrl+Maj+I` / `Ctrl+D` | tout sélectionner / inverser / désélectionner |
| `Ctrl+C` / `Ctrl+V` | copier / coller le calque (ou une image du presse-papiers) |
| `Ctrl+J` | sélection → nouveau calque |
| `Ctrl+E` | fusionner vers le bas |
| `Ctrl+T` | transformation |
| `[` / `]` | taille de brosse |
| `X` | permuter les couleurs |
| `+`/`-`/`0`/`1`, molette | zoom |
| Espace + glisser, molette-clic | déplacer la vue |

## 11. Développement

### Structure

```
main.js                 processus principal (fenêtres, IPC, associations, vignettes système)
preload.js              pont contextIsolation → API window.viewer
renderer/
  index.html            visionneuse + accueil + Paint (markup)
  renderer.js           logique visionneuse, bandeau, accueil, modes Basic/Pro
  styles.css            thème sombre premium
  paint.js / paint.css  module Paint
  pro.js / pro.css      module Pro (chargé à la demande)
  studio/               module Studio (chargé à la demande)
    core.js             modèle pur : calques, composition, historique, algorithmes
    tools.js            registre d'outils (en ajouter un = un register())
    studio.js           interface, menus, modales
  vendor/ag-psd.js      lecteur/écrivain PSD embarqué (patché)
tools/                  gen-icon.js (icône multi-résolutions), patch-agpsd.js
src/Logo/               logo source
```

### Tests (smoke tests automatisés)

Chaque fonctionnalité est validée par des scénarios pilotés (`webContents.executeJavaScript` + événements synthétiques + vérifications au pixel) :

```bash
npm run dev -- --smoke chemin\image.jpg              # vignettes (blob légers, ratios)
npm run dev -- --smoke --smoke-rotate image.jpg      # rotation écrite sur disque
npm run dev -- --smoke --smoke-paint image.jpg       # Paint (+ --smoke-save-copy : mode copie)
npm run dev -- --smoke --smoke-studio image.jpg      # Studio complet (~30 vérifications)
npm run dev -- --smoke --smoke-transform-erase image.jpg  # régression transformation/gomme
npm run dev -- --smoke --smoke-psd [fichier.psd]     # PSD (généré ou réel) + export
npm run dev -- --smoke --smoke-home                  # accueil + nouveau projet + Paint vierge
npm run dev -- --smoke --smoke-pro image.jpg         # mode Pro (14 vérifications)
```

### Notes techniques

- **CSP stricte** dans le renderer (`img-src 'self' file: blob:`, pas de styles inline) — les images se chargent par IPC → Blob pour éviter tout canvas « tainted » ; les data-URL sont converties en Blob.
- Les **vignettes** passent par `nativeImage.createThumbnailFromPath` (cache de l'Explorateur Windows), avec repli sur un décodage réduit `createImageBitmap`.
- L'**édition en place** suit le pipeline : lecture IPC → Blob → Image → canvas → ré-encodage → écriture IPC, avec cache-busting.
- L'icône : voir `tools/gen-icon.js` (§1).

## 12. Limites connues

- Le traitement des pixels est en **8 bits/canal** après décodage (le canvas web ne restitue pas le 16 bits natif) — la profondeur réelle du fichier est affichée dans les métadonnées Pro.
- Le mode **CMJN** d'un projet est une métadonnée d'intention : l'affichage et l'édition restent en RVB.
- PSD : les calques **vectoriels** (formes) sans pixels rasterisés n'apparaissent pas dans Studio (visibles dans l'aperçu composite) ; masques de fusion et calques de réglage Photoshop sont appliqués au rendu mais pas éditables ; le rendu des textes dépend des polices installées.
- Studio : pas encore de masques de fusion ni de groupes de calques (prochains chantiers identifiés).
