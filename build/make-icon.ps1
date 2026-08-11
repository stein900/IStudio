# Génère build/icon.ico (256x256, entrée PNG) pour l'application et l'installateur.
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Fond dégradé bleu nuit, coins arrondis
$bgPath = New-RoundedRectPath 8 8 240 240 44
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point 0, 0),
    (New-Object System.Drawing.Point 256, 256),
    [System.Drawing.Color]::FromArgb(255, 46, 82, 156),
    [System.Drawing.Color]::FromArgb(255, 24, 30, 52))
$g.FillPath($bgBrush, $bgPath)

# Soleil
$sunBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 205, 90))
$g.FillEllipse($sunBrush, 154, 52, 52, 52)

# Montagnes (clip dans le rectangle arrondi)
$g.SetClip($bgPath)
$mBrush1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 92, 140, 220))
$pts1 = @(
    (New-Object System.Drawing.PointF 8, 210),
    (New-Object System.Drawing.PointF 100, 96),
    (New-Object System.Drawing.PointF 178, 210)
)
$g.FillPolygon($mBrush1, $pts1)

$mBrush2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 60, 104, 178))
$pts2 = @(
    (New-Object System.Drawing.PointF 118, 210),
    (New-Object System.Drawing.PointF 190, 128),
    (New-Object System.Drawing.PointF 248, 210)
)
$g.FillPolygon($mBrush2, $pts2)

# Bande "sol"
$solBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 48, 84))
$g.FillRectangle($solBrush, 8, 208, 240, 40)
$g.ResetClip()

$g.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$ms.Dispose()
$bmp.Dispose()

# Conteneur ICO avec une seule entrée PNG (valide depuis Windows Vista)
$icoPath = Join-Path $PSScriptRoot 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0)      # réservé
$bw.Write([uint16]1)      # type: icône
$bw.Write([uint16]1)      # nombre d'images
$bw.Write([byte]0)        # largeur (0 = 256)
$bw.Write([byte]0)        # hauteur (0 = 256)
$bw.Write([byte]0)        # palette
$bw.Write([byte]0)        # réservé
$bw.Write([uint16]1)      # plans
$bw.Write([uint16]32)     # bits par pixel
$bw.Write([uint32]$png.Length)
$bw.Write([uint32]22)     # offset des données
$bw.Write($png)
$bw.Close()
$fs.Close()

Write-Host "icon.ico généré : $icoPath ($($png.Length + 22) octets)"
