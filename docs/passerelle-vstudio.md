# Passerelle IStudio → VStudio

Quand une **vidéo** est affichée dans IStudio, deux boutons de la barre
d'outils passent le relais à VStudio (l'éditeur vidéo) au lieu d'agir
localement :

| Bouton IStudio | Module demandé |
|---|---|
| Agrandir avec l'IA (étoile) | `enhance` |
| Studio (montage) | `edit` |

## Contrat : la route

IStudio lance l'exécutable VStudio avec **un seul argument**, une route :

```
vstudio://open?module=<enhance|edit>&file=<chemin encodé URI>&from=istudio
```

Exemple réel :

```
VStudio.exe "vstudio://open?module=enhance&file=C%3A%5CUsers%5CFlowUP%5CVideos%5Cclip.mp4&from=istudio"
```

- `module` — le module à ouvrir (`enhance` : amélioration IA, `edit` : montage).
  D'autres valeurs pourront s'ajouter plus tard ; une valeur inconnue devrait
  ouvrir l'accueil avec le fichier chargé.
- `file` — chemin absolu Windows du fichier vidéo, encodé avec
  `encodeURIComponent` (donc `C%3A%5C…`). `URL.searchParams` le décode tout seul.
- `from` — origine de l'appel (`istudio`), utile pour la télémétrie ou un
  bouton « revenir ».

## Localisation de l'exécutable (côté IStudio)

`main.js` (fonction `resolveVStudioExe`) essaie dans l'ordre :

1. la variable d'environnement `VSTUDIO_PATH` (chemin complet de l'exe) ;
2. `%LOCALAPPDATA%\Programs\VStudio\VStudio.exe` (installation NSIS par défaut) ;
3. `C:\Program Files\VStudio\VStudio.exe`.

Introuvable → un dialogue propose de **télécharger VStudio** ; « Télécharger
VStudio » ouvre l'installeur dans le navigateur par défaut :

```
http://stein-ind.fr/apps/download/VStudio-Setup-0.1.0.exe
```

(URL dans `main.js`, constante `VSTUDIO_DOWNLOAD_URL`.)

## À implémenter côté VStudio (process main)

```ts
function routeFromArgv(argv: string[]): URL | null {
  const raw = argv.find((a) => a.startsWith('vstudio://'))
  try { return raw ? new URL(raw) : null } catch { return null }
}

// au démarrage
const route = routeFromArgv(process.argv)
if (route) {
  const module = route.searchParams.get('module') // 'enhance' | 'edit'
  const file = route.searchParams.get('file')     // chemin déjà décodé
  // → ouvrir le module demandé avec ce fichier
}

// instance déjà ouverte : IStudio lance un second processus — le verrou
// mono-instance doit relayer la route à la fenêtre existante
app.requestSingleInstanceLock()
app.on('second-instance', (_e, argv) => {
  const route = routeFromArgv(argv)
  // → même traitement, puis mainWindow.focus()
})
```
