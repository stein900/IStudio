/**
 * Upscale minimal : une entrée -> une sortie upscalée (x4).
 * Utilise le moteur upscayl-bin (Real-ESRGAN / NCNN Vulkan) fourni dans bin/.
 *
 * Usage :
 *     node upscale.js photo.jpg photo_upscaled.png
 */
const { execFile } = require("node:child_process");
const path = require("node:path");

const BINAIRE = path.join(__dirname, "bin", "upscayl-bin.exe");
const MODELES = path.join(__dirname, "models");

/**
 * @param {string} entree  chemin de l'image source (jpg/png/webp)
 * @param {string} sortie  chemin de l'image upscalée à produire
 * @param {string} [modele] "upscayl-standard-4x" (qualité) ou "upscayl-lite-4x" (rapide)
 * @param {number} [echelle] 2, 3 ou 4
 * @returns {Promise<void>}
 */
function upscale(entree, sortie, modele = "upscayl-standard-4x", echelle = 4) {
  return new Promise((resolve, reject) => {
    execFile(
      BINAIRE,
      ["-i", entree, "-o", sortie, "-m", MODELES, "-n", modele, "-s", String(echelle)],
      (err, _stdout, stderr) => (err ? reject(new Error(`Echec de l'upscale : ${stderr}`)) : resolve())
    );
  });
}

module.exports = { upscale };

if (require.main === module) {
  const [entree, sortie, modele, echelle] = process.argv.slice(2);
  if (!entree || !sortie) {
    console.error("Usage : node upscale.js <entree> <sortie> [modele] [echelle]");
    process.exit(1);
  }
  upscale(entree, sortie, modele, echelle ? Number(echelle) : undefined)
    .then(() => console.log(`OK : ${sortie}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
