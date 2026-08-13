# code_source_upscale — upscale d'image minimal

Le strict minimum pour upscaler une image (entrée → sortie ×4), extrait de
l'installation d'Upscayl. Le vrai moteur est un exécutable autonome,
`bin/upscayl-bin.exe` (Real-ESRGAN via NCNN/Vulkan) : le « code source » à
intégrer dans votre logiciel se résume donc à un appel de processus, fourni
ici en trois langages au choix.

## Contenu

```
code_source_upscale/
├── bin/
│   ├── upscayl-bin.exe        # moteur d'upscale (autonome, GPU via Vulkan)
│   └── vcomp140.dll           # dépendance runtime (OpenMP), à garder à côté
├── models/
│   ├── upscayl-standard-4x.*  # modèle qualité (33 Mo)
│   └── upscayl-lite-4x.*      # modèle rapide/léger (2,4 Mo)
├── upscale.py                 # wrapper Python
├── upscale.js                 # wrapper Node.js
├── Upscaler.cs                # wrapper C#
└── README.md
```

## Test rapide (sans écrire de code)

```powershell
.\bin\upscayl-bin.exe -i entree.jpg -o sortie.png -m .\models -n upscayl-standard-4x -s 4
```

## Intégration

Choisissez le fichier correspondant à votre langage et copiez-le avec les
dossiers `bin/` et `models/` dans votre projet. L'API est identique partout :

```
upscale(entree, sortie, modele = "upscayl-standard-4x", echelle = 4)
```

- **entree** : jpg / png / webp
- **sortie** : l'extension détermine le format (`.png` recommandé)
- **modele** : `upscayl-standard-4x` (qualité) ou `upscayl-lite-4x` (rapide)
- **echelle** : 2, 3 ou 4

Options supplémentaires du binaire (`-h` pour tout voir) : `-w largeur` pour
redimensionner la sortie, `-c 0..100` compression, `-g id` choix du GPU,
`-t taille` taille des tuiles si mémoire GPU limitée.

D'autres modèles (remacri, ultrasharp, digital-art…) sont disponibles dans
`C:\Program Files\Upscayl\resources\models` — copiez les paires
`.bin`/`.param` dans `models/` et passez leur nom via le paramètre `modele`.

## Licence — important

Upscayl et son moteur `upscayl-ncnn` sont sous licence **AGPL-3.0**.
Intégrer ce binaire à un logiciel distribué implique de respecter cette
licence (grosso modo : publier le code source de votre logiciel sous une
licence compatible). Si c'est bloquant, l'alternative est le moteur d'origine
[Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan)
(licence MIT, mêmes options en ligne de commande, modèles `realesrgan-x4plus`).

Le code source C++ complet du moteur, si vous voulez le compiler vous-même ou
le lier en bibliothèque : https://github.com/upscayl/upscayl-ncnn
