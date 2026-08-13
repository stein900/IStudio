"""
Upscale minimal : une entrée -> une sortie upscalée (x4).
Utilise le moteur upscayl-bin (Real-ESRGAN / NCNN Vulkan) fourni dans bin/.

Usage :
    python upscale.py photo.jpg photo_upscaled.png
"""
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).parent
BINAIRE = RACINE / "bin" / "upscayl-bin.exe"
MODELES = RACINE / "models"


def upscale(entree: str, sortie: str, modele: str = "upscayl-standard-4x", echelle: int = 4) -> None:
    """Upscale l'image `entree` et écrit le résultat dans `sortie`.

    modele  : "upscayl-standard-4x" (qualité) ou "upscayl-lite-4x" (rapide)
    echelle : 2, 3 ou 4
    """
    resultat = subprocess.run(
        [
            str(BINAIRE),
            "-i", str(entree),
            "-o", str(sortie),
            "-m", str(MODELES),
            "-n", modele,
            "-s", str(echelle),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if resultat.returncode != 0:
        raise RuntimeError(f"Echec de l'upscale : {resultat.stderr}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage : python upscale.py <entree> <sortie> [modele] [echelle]")
        sys.exit(1)
    upscale(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3] if len(sys.argv) > 3 else "upscayl-standard-4x",
        int(sys.argv[4]) if len(sys.argv) > 4 else 4,
    )
    print(f"OK : {sys.argv[2]}")
