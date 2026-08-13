// Upscale minimal : une entrée -> une sortie upscalée (x4).
// Utilise le moteur upscayl-bin (Real-ESRGAN / NCNN Vulkan) fourni dans bin/.
//
// Exemple :
//     Upscaler.Upscale(@"C:\images\photo.jpg", @"C:\images\photo_upscaled.png");

using System;
using System.Diagnostics;
using System.IO;

public static class Upscaler
{
    // Adapter si bin/ et models/ sont déployés ailleurs dans votre application.
    private static readonly string Racine = AppContext.BaseDirectory;
    private static readonly string Binaire = Path.Combine(Racine, "bin", "upscayl-bin.exe");
    private static readonly string Modeles = Path.Combine(Racine, "models");

    /// <param name="entree">Image source (jpg/png/webp)</param>
    /// <param name="sortie">Image upscalée à produire</param>
    /// <param name="modele">"upscayl-standard-4x" (qualité) ou "upscayl-lite-4x" (rapide)</param>
    /// <param name="echelle">2, 3 ou 4</param>
    public static void Upscale(string entree, string sortie, string modele = "upscayl-standard-4x", int echelle = 4)
    {
        var psi = new ProcessStartInfo
        {
            FileName = Binaire,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
        };
        psi.ArgumentList.Add("-i"); psi.ArgumentList.Add(entree);
        psi.ArgumentList.Add("-o"); psi.ArgumentList.Add(sortie);
        psi.ArgumentList.Add("-m"); psi.ArgumentList.Add(Modeles);
        psi.ArgumentList.Add("-n"); psi.ArgumentList.Add(modele);
        psi.ArgumentList.Add("-s"); psi.ArgumentList.Add(echelle.ToString());

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Impossible de lancer upscayl-bin.exe");
        string stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();
        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"Echec de l'upscale : {stderr}");
    }
}
