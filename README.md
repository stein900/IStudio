# IStudio — Images Studio

**IStudio** est une application Windows autonome (Electron) pensée comme un **couteau suisse de l'image** : tout ce qu'on attend autour d'une photo — voir, organiser, analyser, annoter, monter, agrandir, extraire — réuni dans un seul logiciel rapide et élégant, **100 % local** (aucune connexion requise, aucune donnée ne quitte la machine) :

- une **visionneuse d'images** rapide et épurée, utilisable comme application par défaut de Windows — multi-onglets, galerie du dossier, bandeau de miniatures triable, thème clair/sombre, interface en **11 langues** ;
- un **agrandissement par IA** (upscale ×2 à ×8) exécuté localement sur la carte graphique — Real-ESRGAN embarqué, comparaison avant/après au curseur ;
- un **OCR intégré** : le texte d'une image devient sélectionnable et copiable, comme dans un PDF — moteur natif de Windows, zéro dépendance ;
- un **export SVG** : vectorisation d'une image en sans-perte pixel-perfect ou en version simplifiée à N couleurs ;
- un **mode Pro d'analyse** pour les puristes de l'image et le travail sur datasets (vision par ordinateur, imagerie scientifique, contrôle qualité, annotation) : histogramme, inspecteur de pixels, canaux, métadonnées EXIF/ICC, notes et tri ;
- **Paint**, un éditeur d'annotation rapide (croquis, flèches, formes, texte) ;
- **Studio**, un éditeur de montage multi-calques type Photoshop/Photopea : sélections, pinceaux, retouche, calques avec modes de fusion et styles, ouverture et export **PSD**, format de projet propre `.istudio`.

Le principe directeur : **léger par défaut, puissant à la demande**. Au lancement, seule la visionneuse est chargée ; le mode Pro, Paint, Studio, l'OCR, l'upscale et le décodeur PSD ne sont chargés en mémoire que lorsqu'on les sollicite.

---

## Sommaire

1. [Installation et démarrage](#1-installation-et-démarrage)
2. [La page d'accueil](#2-la-page-daccueil)
3. [La visionneuse (mode Basic)](#3-la-visionneuse-mode-basic)
4. [Onglets et galerie « Global »](#4-onglets-et-galerie--global-)
5. [OCR — sélectionner le texte d'une image](#5-ocr--sélectionner-le-texte-dune-image)
6. [Agrandir avec l'IA — upscale local](#6-agrandir-avec-lia--upscale-local)
7. [Export SVG — vectorisation](#7-export-svg--vectorisation)
8. [Le mode Pro — analyse et datasets](#8-le-mode-pro--analyse-et-datasets)
9. [Paint — annotation rapide](#9-paint--annotation-rapide)
10. [Studio — montage multi-calques](#10-studio--montage-multi-calques)
11. [Prise en charge du PSD](#11-prise-en-charge-du-psd)
12. [Formats pris en charge](#12-formats-pris-en-charge)
13. [Langues et thèmes](#13-langues-et-thèmes)
14. [Fichiers annexes créés par IStudio](#14-fichiers-annexes-créés-par-istudio)
15. [Raccourcis clavier](#15-raccourcis-clavier)
16. [Développement](#16-développement)
17. [Limites connues](#17-limites-connues)

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
- enregistre les **associations de fichiers** pour toutes les extensions d'images prises en charge, plus le type « **Document Photoshop** » pour les `.psd` ;
- embarque le moteur d'upscale (binaire + modèles, dossier `code_source_upscale`).

Windows exige que l'utilisateur confirme l'application par défaut : clic droit sur une image (ou un `.psd`) → **Ouvrir avec** → **Choisir une autre application** → *IStudio* → **Toujours**. Ensuite, tout double-clic ouvre IStudio. L'application est à **instance unique** : ouvrir une autre image depuis l'Explorateur crée une nouvelle fenêtre de la même instance (les onglets, eux, se créent avec `Ctrl+T`).

L'icône est générée depuis `src/Logo/IStudio_logo.png` par `npx electron tools/gen-icon.js`, qui produit un `build/icon.ico` **multi-résolutions** (16 → 256 px, chaque taille rééchantillonnée en qualité maximale) — jamais d'icône floue redimensionnée à la volée par Windows.

## 2. La page d'accueil

Lancer IStudio **sans fichier** affiche une page d'accueil avec cinq actions :

| Carte | Effet |
|---|---|
| **Ouvrir une image** | Sélecteur de fichiers (jpg, png, psd…) |
| **Nouveau projet** | Popup de création puis Studio sur une toile vierge |
| **Nouveau dessin** | Paint directement sur une feuille blanche |
| **Ouvrir un projet** | Recharge un montage `.istudio` avec tous ses calques |
| **Agrandir avec l'IA** | Choisir une image → le dialogue d'upscale s'ouvre directement dessus |

La popup **Nouveau projet** propose :

- **8 gabarits** avec aperçu du ratio : Full HD 16:9, Carré 1:1, Portrait 4:5, Story 9:16, 4K, A4 300 DPI (portrait/paysage), Bannière 3:1 ;
- **résolution personnalisée** (largeur/hauteur libres jusqu'à 20 000 px) ;
- **arrière-plan** : blanc, noir, **transparent** ou couleur personnalisée ;
- **DPI**, **nom du projet**, et **mode RVB / CMJN** (le CMJN est enregistré comme métadonnée du projet ; l'affichage et l'édition restent en RVB, c'est indiqué honnêtement dans la popup).

Un document créé de zéro s'enregistre par « Enregistrer sous » (PNG), puis s'ouvre dans la visionneuse.

## 3. La visionneuse (mode Basic)

L'interface par défaut : une barre d'onglets, une barre d'outils, l'image, un bandeau de miniatures.

- **Navigation** dans le dossier : boutons, flèches ← →, Début/Fin.
- **Un ordre d'affichage qui ne déstabilise pas** : par défaut, le dossier est présenté par **date de modification, les plus récentes en premier** — comme un dossier de photos trié par date dans l'Explorateur. Une **pastille discrète à gauche du bandeau** permet de passer au tri par **nom** (ordre naturel de l'Explorateur : `img2` avant `img10`) ou par **taille** ; re-clic sur le critère actif : ordre inversé. Le choix est mémorisé et réappliqué aux prochains dossiers, et le bandeau, les flèches ←/→ et le compteur restent toujours **cohérents entre eux**. Les dates et tailles sont lues en arrière-plan avec un parallélisme borné — l'affichage ne bloque jamais, même sur un dossier réseau/NAS.
- **Le bandeau suit l'image affichée** : la vignette de l'image courante est **centrée immédiatement** à l'ouverture (même au milieu d'un dossier de milliers d'images) et reste en vue pendant le chargement progressif des miniatures ; un défilement manuel du bandeau suspend ce suivi jusqu'à la prochaine navigation.
- **Zoom quasi illimité** (0,1 % à 100 000 %) centré sur le curseur : molette, boutons, `+`/`-`, `0` = ajusté, `1` = 100 %, double-clic pour basculer. **Déplacement libre** de l'image à la souris, sans contrainte de bord.
- **Plein écran** (`F` / `F11`) : n'affiche que l'image.
- **Fond quadrillé** optionnel sous l'image (bouton points) : révèle les zones transparentes d'un PNG et les bords d'une image sombre.
- **Bandeau de miniatures** optimisé pour les gros dossiers :
  - vignettes **économes** : cache de miniatures de Windows (Explorateur) en priorité, sinon décodage réduit à 256 px (~30 Ko retenus par vignette — jamais l'image pleine résolution : des centaines de photos 25 Mpx ne pèsent rien) ;
  - **garde-fou strict** : seules les **30 vignettes les plus proches** de l'image affichée existent dans le bandeau (fenêtre centrée, selon le tri actif) — jamais tout le dossier, même à 100 000 images ; des boutons « **+30 précédentes / +30 suivantes** » étendent la fenêtre à la demande, et une navigation qui en sort la recentre en repartant de 30 ;
  - chargées **à la visibilité** (IntersectionObserver), par lots de 4 ;
  - chaque tuile affiche l'image **dans son vrai ratio** (hauteur fixe, largeur variable bornée 34–240 px, image entière toujours visible — un panoramique se voit comme un panoramique) ;
  - repliable (flèche flottante ou bouton pellicule, préférence enregistrée).
- **Édition directe du fichier** (pas un simple rendu) :
  - **rotation** par quarts de tour (`R` / `Maj+R`) ;
  - **rognage** avec poignées et grille des tiers (`Entrée` applique) ;
  - les formats non ré-encodables (BMP, TIFF, GIF, SVG, AVIF, ICO) sont convertis en PNG, l'original part à la corbeille — **sauf les PSD, jamais touchés** (le résultat s'écrit en PNG à côté).
- **Informations** : nom, résolution et poids dans la barre d'outils ; popup complète (`I`) avec fichier, image, dates, chemin.
- **Impression** directe (`Ctrl+P`, rendu isolé dans une fenêtre cachée), **suppression** vers la corbeille (`Suppr`, avec confirmation), ouverture de fichier (`Ctrl+O`).
- **Préchargement** des images voisines : flèche gauche/droite quasi instantanée, même sur un dossier réseau.
- Interface premium sombre ou claire (voir §13), **icônes vectorielles SVG uniquement** (aucun emoji).

## 4. Onglets et galerie « Global »

- **Onglets** (`Ctrl+T`) : plusieurs images — ou plusieurs dossiers — ouverts côte à côte dans la même fenêtre. Chaque onglet **mémorise sa vue** (zoom et position) et la retrouve telle quelle en revenant dessus. Un nouvel onglet s'ouvre sur l'accueil.
- **Galerie « Global »** (`Ctrl+G` ou bouton grille) : vue d'ensemble du dossier courant en grille de miniatures — mêmes caches et même worker que le bandeau, donc quasi gratuite en mémoire :
  - **recherche** instantanée par nom de fichier ;
  - **tri** : nom, date de modification, taille, type — croissant/décroissant ;
  - **filtre par format** (la liste se construit d'après le contenu réel du dossier) ;
  - pagination paresseuse par blocs de 200 tuiles : des dossiers de plusieurs milliers d'images restent fluides ;
  - flèches / `Entrée` pour naviguer et ouvrir, `Échap` pour revenir à l'image.

## 5. OCR — sélectionner le texte d'une image

Un bouton dans la barre d'outils rend le **texte d'une image sélectionnable et copiable, comme dans un PDF** — captures d'écran, scans, documents photographiés, schémas annotés :

- à l'activation, l'image est analysée puis une **couche de texte transparent** est posée mot à mot exactement sur les pixels : on sélectionne à la souris, `Ctrl+A` sélectionne tout, `Ctrl+C` copie (espaces et retours à la ligne préservés), `Échap` ou re-clic désactive ;
- la sélection **suit le zoom et le déplacement** de l'image ;
- moteur **natif de Windows** (`Windows.Media.Ocr`) : aucune dépendance, aucun modèle téléchargé, aucun réseau — l'analyse prend une fraction de seconde et reconnaît toutes les **langues OCR installées dans Windows** ;
- fonctionne sur tout ce que la visionneuse affiche, **PSD compris** (l'analyse part du rendu à l'écran) ; le résultat est mis en cache, re-basculer est instantané ;
- coût **zéro tant que le bouton n'est pas activé** — l'interface reste aussi légère qu'avant.

## 6. Agrandir avec l'IA — upscale local

Le bouton étoiles (ou la carte d'accueil dédiée) ouvre le dialogue d'agrandissement :

- moteur **Real-ESRGAN** embarqué (binaire upscayl), exécuté **localement sur la carte graphique** (Vulkan) — rien n'est envoyé sur Internet ;
- facteurs **×2, ×3, ×4 ou personnalisé** (1,1 à 8, par pas de 0,1) ; deux modèles fournis (**lite**, rapide, et **standard**, plus fin) — en déposer d'autres dans `code_source_upscale/models/` (remacri, ultrasharp…) les fait apparaître dans la liste ;
- au tout premier lancement, un **bref test calibre automatiquement le GPU le plus fiable** de la machine ;
- progression en pourcentage, **annulable** à tout moment ;
- résultat présenté en **comparaison avant/après** : curseur à glisser sur l'image, zoom à la molette, déplacement au glisser ;
- enregistrement au choix : **écraser l'original** ou **créer une copie** à côté.

## 7. Export SVG — vectorisation

Le bouton SVG convertit l'image affichée en **fichier vectoriel** :

- mode **« Sans perte »** par défaut : rendu strictement identique au pixel près ;
- si l'image est trop détaillée (photo), bascule automatique en mode **« Simplifié »** : réduction à N couleurs (8 à 128, réglable) avec consolidation des zones et lissage — idéal pour logos, captures, dessins, pixel art ;
- la vectorisation tourne dans un **worker** dédié : l'interface ne gèle jamais ;
- module autonome et débranchable (`renderer/svg-export/`, voir son README).

## 8. Le mode Pro — analyse et datasets

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

## 9. Paint — annotation rapide

Le bouton pinceau ouvre l'image courante dans **Paint**, un éditeur d'annotation léger :

- crayon avec **lissage réglable** (suivi exponentiel + moyenne mobile + simplification), ligne, flèche, rectangle, ellipse, texte, gomme d'objet ;
- calques simples, sélection avec poignées, annuler/rétablir, grille, copie vers le presse-papiers ;
- « Enregistrer » aplatit les annotations — au choix **écraser l'original** ou **créer une copie** à côté.

Paint s'ouvre aussi **sans image** depuis l'accueil (feuille blanche).

## 10. Studio — montage multi-calques

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

## 11. Prise en charge du PSD

- **Ouverture** : la visionneuse affiche le rendu aplati (composite) ; le bouton Studio ouvre le document **avec ses calques séparés** — position, opacité, mode de fusion, visibilité, groupes mis à plat — et **les calques de texte restent éditables** (contenu, corps, couleur, styles, police approchée depuis le nom PostScript).
- **Export** : Studio écrit de vrais `.psd` multi-calques (avec composite intégré), rouverts par Photoshop et Photopea.
- **Sécurité** : une édition d'un PSD s'enregistre **toujours en PNG à côté** — le fichier source n'est jamais écrasé ni mis à la corbeille.
- Moteur : copie embarquée d'`ag-psd` (`renderer/vendor/ag-psd.js`), **corrigée** pour lire les paramètres de masque avant le « real mask » conformément à la spec Adobe (certains PSD valides échouaient sinon avec « Invalid realMask size »). Correctif réapplicable après mise à jour du paquet : `node tools/patch-agpsd.js .` puis copie de `node_modules/ag-psd/dist/bundle.js` vers `renderer/vendor/ag-psd.js`.

## 12. Formats pris en charge

| Format | Lecture | Écriture | Notes |
|---|---|---|---|
| JPEG (`jpg`, `jpeg`, `jfif`) | oui | oui | ré-encodage qualité 0,95 ; métadonnées chroma/EXIF lues en mode Pro |
| PNG | oui | oui | format de conversion par défaut |
| WebP | oui | oui | |
| PSD | oui (calques) | oui (calques) | original jamais modifié |
| GIF, BMP, TIFF, SVG, AVIF, ICO | oui | converti en PNG à l'édition | l'original part à la corbeille (sauf visualisation simple) |
| SVG (export) | — | oui | vectorisation sans perte ou simplifiée (§7) |
| `.istudio` | oui | oui | projet Studio complet (JSON + calques PNG) |

## 13. Langues et thèmes

- Interface traduite en **11 langues** (bouton globe) : français, anglais, japonais, espagnol, allemand, arabe, russe, chinois, italien, coréen, hindi. Les **dialogues natifs** (enregistrer, confirmer…) suivent la langue choisie. Principe gettext : toute phrase non traduite retombe proprement sur le français — l'interface ne casse jamais.
- **Thème clair / sombre** (`T` ou bouton lune/soleil), mémorisé. Studio garde volontairement son interface sombre type Photoshop quel que soit le thème.

## 14. Fichiers annexes créés par IStudio

| Fichier | Rôle |
|---|---|
| `*.istudio` | projet Studio (montage complet, calques préservés) — créé uniquement à la demande |
| `.istudio-tags.json` | notes et drapeaux du mode Pro, posé dans le dossier d'images concerné |

Aucun autre fichier n'est écrit à l'insu de l'utilisateur ; les préférences (Basic/Pro, bandeau, ordre des miniatures, langue, thème…) sont stockées dans le profil local de l'application.

## 15. Raccourcis clavier

### Visionneuse

| Touche | Action |
|---|---|
| `←` `→`, `Début`/`Fin` | navigation |
| molette, `+`/`-`, `0`, `1`, double-clic | zoom (ajusté / 100 %) |
| `F` / `F11`, `Échap` | plein écran |
| `Ctrl+T` | nouvel onglet |
| `Ctrl+G` | galerie « Global » |
| `T` | thème clair / sombre |
| `R` / `Maj+R` | rotation horaire / antihoraire (fichier modifié) |
| `I` | popup d'informations |
| `Ctrl+A` (OCR actif) | sélectionner tout le texte reconnu |
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
| `V M O A L I B S R E W G D U T` | outils (voir tableau §10) |
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

## 16. Développement

### Structure

```
main.js                 processus principal (fenêtres, IPC, associations, vignettes système,
                        OCR natif, moteur d'upscale, smoke tests)
preload.js              pont contextIsolation → API window.viewer
renderer/
  index.html            visionneuse + accueil + Paint (markup)
  renderer.js           logique visionneuse, onglets, bandeau + tri, galerie, OCR,
                        upscale, accueil, modes Basic/Pro
  styles.css            thème premium (sombre + clair)
  paint.js / paint.css  module Paint
  pro.js / pro.css      module Pro (chargé à la demande)
  i18n/                 traductions (11 langues, catalogue + locales JSON)
  svg-export/           module Export SVG (autonome, worker de vectorisation)
  studio/               module Studio (chargé à la demande)
    core.js             modèle pur : calques, composition, historique, algorithmes
    tools.js            registre d'outils (en ajouter un = un register())
    studio.js           interface, menus, modales
  vendor/ag-psd.js      lecteur/écrivain PSD embarqué (patché)
code_source_upscale/    moteur Real-ESRGAN (bin/ + models/), copié dans l'installateur
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
npm run dev -- --smoke --smoke-gallery image.jpg     # galerie Global (tri, filtre, recherche)
npm run dev -- --smoke --smoke-tabs image.jpg        # onglets (vues indépendantes)
npm run dev -- --smoke --smoke-ocr image.jpg         # OCR (couche de texte, sélection, copie)
npm run dev -- --smoke --smoke-strip image.jpg       # tri du bandeau (nom/date, inversion)
```

Les smoke OCR et bandeau écrivent en plus une **capture d'écran** de contrôle dans le dossier temporaire.

### Notes techniques

- **CSP stricte** dans le renderer (`img-src 'self' file: blob:`, pas de styles inline) — les images se chargent par IPC → Blob pour éviter tout canvas « tainted » ; les data-URL sont converties en Blob.
- Les **vignettes** passent par `nativeImage.createThumbnailFromPath` (cache de l'Explorateur Windows), avec repli sur un décodage réduit `createImageBitmap`.
- L'**édition en place** suit le pipeline : lecture IPC → Blob → Image → canvas → ré-encodage → écriture IPC, avec cache-busting.
- L'**OCR** invoque `Windows.Media.Ocr` par un script PowerShell éphémère passé en `-EncodedCommand` : rien à distribuer, résultat JSON (mots + boîtes englobantes) par fichier temporaire.
- L'**upscale** est un processus `upscayl-bin` (Real-ESRGAN/ncnn, Vulkan) supervisé par le processus principal : progression, annulation, calibration GPU persistée.
- L'icône : voir `tools/gen-icon.js` (§1).

## 17. Limites connues

- Le traitement des pixels est en **8 bits/canal** après décodage (le canvas web ne restitue pas le 16 bits natif) — la profondeur réelle du fichier est affichée dans les métadonnées Pro.
- Le mode **CMJN** d'un projet est une métadonnée d'intention : l'affichage et l'édition restent en RVB.
- L'**OCR** dépend des langues de reconnaissance installées dans Windows (Paramètres → Heure et langue → Langue) ; il est indisponible si aucune ne l'est.
- PSD : les calques **vectoriels** (formes) sans pixels rasterisés n'apparaissent pas dans Studio (visibles dans l'aperçu composite) ; masques de fusion et calques de réglage Photoshop sont appliqués au rendu mais pas éditables ; le rendu des textes dépend des polices installées.
- Studio : pas encore de masques de fusion ni de groupes de calques (prochains chantiers identifiés).
