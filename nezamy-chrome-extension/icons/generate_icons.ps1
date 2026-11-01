Add-Type -AssemblyName System.Drawing

$iconsDir = $PSScriptRoot
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
}

$sizes = 16, 32, 48, 128
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Emerald background circle
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(5, 150, 105))
    $g.FillEllipse($brush, 0, 0, $s, $s)

    # Gold/Amber border ring
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(245, 158, 11)), [Math]::Max(1.0, [float]($s / 24.0))
    $g.DrawEllipse($pen, 1, 1, ($s - 2), ($s - 2))

    # White letter 'ن'
    $fontFamily = New-Object System.Drawing.FontFamily "Arial"
    $fontSize = [float]($s * 0.52)
    $font = New-Object System.Drawing.Font $fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF 0, 0, $s, $s
    $g.DrawString("ن", $font, $whiteBrush, $rect, $sf)

    $outPath = Join-Path $iconsDir "icon$s.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $pen.Dispose()
    $whiteBrush.Dispose()
    $font.Dispose()
    $brush.Dispose()
    $g.Dispose()
    $bmp.Dispose()

    Write-Host "Generated: $outPath"
}
