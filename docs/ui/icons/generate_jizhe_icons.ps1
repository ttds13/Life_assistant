$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$brand = [string]([char]0x5409) + [string]([char]0x5586)

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$W,
    [float]$H,
    [float]$R
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $R * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Color {
  param([string]$Hex, [int]$Alpha = 255)

  $clean = $Hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    $Alpha,
    [Convert]::ToInt32($clean.Substring(0, 2), 16),
    [Convert]::ToInt32($clean.Substring(2, 2), 16),
    [Convert]::ToInt32($clean.Substring(4, 2), 16)
  )
}

function Draw-BrandText {
  param(
    [System.Drawing.Graphics]$G,
    [string]$Text,
    [System.Drawing.Brush]$Brush,
    [float]$Y,
    [float]$Size,
    [string]$FontName = 'Microsoft YaHei UI'
  )

  $font = [System.Drawing.Font]::new($FontName, $Size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = [System.Drawing.RectangleF]::new(112, $Y - 220, 800, 440)
  $G.DrawString($Text, $font, $Brush, $rect, $format)
  $font.Dispose()
  $format.Dispose()
}

function Draw-Sparkle {
  param(
    [System.Drawing.Graphics]$G,
    [float]$Cx,
    [float]$Cy,
    [float]$R,
    [System.Drawing.Brush]$Brush
  )

  $points = @(
    [System.Drawing.PointF]::new($Cx, $Cy - $R),
    [System.Drawing.PointF]::new($Cx + $R * 0.24, $Cy - $R * 0.24),
    [System.Drawing.PointF]::new($Cx + $R, $Cy),
    [System.Drawing.PointF]::new($Cx + $R * 0.24, $Cy + $R * 0.24),
    [System.Drawing.PointF]::new($Cx, $Cy + $R),
    [System.Drawing.PointF]::new($Cx - $R * 0.24, $Cy + $R * 0.24),
    [System.Drawing.PointF]::new($Cx - $R, $Cy),
    [System.Drawing.PointF]::new($Cx - $R * 0.24, $Cy - $R * 0.24)
  )
  $G.FillPolygon($Brush, $points)
}

function Draw-HouseLine {
  param(
    [System.Drawing.Graphics]$G,
    [System.Drawing.Pen]$Pen,
    [float]$X,
    [float]$Y,
    [float]$Scale
  )

  $pts = @(
    [System.Drawing.PointF]::new($X + 0 * $Scale, $Y + 90 * $Scale),
    [System.Drawing.PointF]::new($X + 150 * $Scale, $Y - 25 * $Scale),
    [System.Drawing.PointF]::new($X + 300 * $Scale, $Y + 90 * $Scale),
    [System.Drawing.PointF]::new($X + 300 * $Scale, $Y + 250 * $Scale),
    [System.Drawing.PointF]::new($X + 0 * $Scale, $Y + 250 * $Scale),
    [System.Drawing.PointF]::new($X + 0 * $Scale, $Y + 90 * $Scale)
  )
  $G.DrawLines($Pen, $pts)
}

function Save-Icon {
  param(
    [string]$FileName,
    [scriptblock]$Painter
  )

  $bmp = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  & $Painter $g
  $path = Join-Path $outDir $FileName
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output $path
}

Save-Icon 'jizhe-icon-01-blue-home.png' {
  param($g)
  $rect = [System.Drawing.Rectangle]::new(0, 0, 1024, 1024)
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (New-Color '#1677FF'), (New-Color '#0958D9'), 45)
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()

  $linePen = [System.Drawing.Pen]::new((New-Color '#FFFFFF' 54), 15)
  $linePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  Draw-HouseLine $g $linePen 302 185 1.4
  $linePen.Dispose()

  $sparkBrush = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF' 150))
  Draw-Sparkle $g 775 286 42 $sparkBrush
  Draw-Sparkle $g 244 685 30 $sparkBrush
  $sparkBrush.Dispose()

  $white = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF'))
  Draw-BrandText $g $brand $white 550 300
  $white.Dispose()

  $bar = New-RoundedRectPath 315 774 394 12 6
  $barBrush = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF' 105))
  $g.FillPath($barBrush, $bar)
  $barBrush.Dispose()
  $bar.Dispose()
}

Save-Icon 'jizhe-icon-02-green-clean.png' {
  param($g)
  $rect = [System.Drawing.Rectangle]::new(0, 0, 1024, 1024)
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (New-Color '#21B66F'), (New-Color '#0FA77A'), 35)
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()

  $circleBrush = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF' 34))
  $g.FillEllipse($circleBrush, 642, 118, 245, 245)
  $g.FillEllipse($circleBrush, 115, 709, 230, 230)
  $circleBrush.Dispose()

  $pen = [System.Drawing.Pen]::new((New-Color '#FFFFFF' 95), 16)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawArc($pen, 278, 204, 470, 470, 210, 225)
  $g.DrawLine($pen, 659, 251, 729, 183)
  $pen.Dispose()

  $white = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF'))
  Draw-BrandText $g $brand $white 520 312
  $small = [System.Drawing.SolidBrush]::new((New-Color '#E9FFF5'))
  Draw-Sparkle $g 736 660 44 $small
  Draw-Sparkle $g 292 355 28 $small
  $small.Dispose()
  $white.Dispose()
}

Save-Icon 'jizhe-icon-03-white-service.png' {
  param($g)
  $bg = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF'))
  $g.FillRectangle($bg, 0, 0, 1024, 1024)
  $bg.Dispose()

  $border = [System.Drawing.Pen]::new((New-Color '#1677FF'), 18)
  $borderPath = New-RoundedRectPath 32 32 960 960 172
  $g.DrawPath($border, $borderPath)
  $border.Dispose()
  $borderPath.Dispose()

  $soft = [System.Drawing.SolidBrush]::new((New-Color '#EAF3FF'))
  $softPath = New-RoundedRectPath 148 148 728 728 142
  $g.FillPath($soft, $softPath)
  $soft.Dispose()
  $softPath.Dispose()

  $tileColors = @('#20C997', '#FF7A59', '#F5A623', '#8B5CF6')
  $tilePos = @(@(206, 225), @(732, 234), @(225, 719), @(738, 720))
  for ($i = 0; $i -lt 4; $i++) {
    $brush = [System.Drawing.SolidBrush]::new((New-Color $tileColors[$i]))
    $path = New-RoundedRectPath $tilePos[$i][0] $tilePos[$i][1] 86 86 24
    $g.FillPath($brush, $path)
    $path.Dispose()
    $brush.Dispose()
  }

  $blue = [System.Drawing.SolidBrush]::new((New-Color '#1677FF'))
  Draw-BrandText $g $brand $blue 515 316
  $blue.Dispose()
}

Save-Icon 'jizhe-icon-04-warm-spark.png' {
  param($g)
  $rect = [System.Drawing.Rectangle]::new(0, 0, 1024, 1024)
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (New-Color '#FF7A59'), (New-Color '#F5A623'), 30)
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()

  $panel = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF' 40))
  $panelPath = New-RoundedRectPath 132 178 760 668 145
  $g.FillPath($panel, $panelPath)
  $panelPath.Dispose()
  $panel.Dispose()

  $whiteSoft = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF' 145))
  Draw-Sparkle $g 246 260 50 $whiteSoft
  Draw-Sparkle $g 790 733 56 $whiteSoft
  Draw-Sparkle $g 776 282 27 $whiteSoft
  $whiteSoft.Dispose()

  $pen = [System.Drawing.Pen]::new((New-Color '#FFFFFF' 120), 17)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawBezier($pen, 220, 713, 360, 796, 650, 792, 800, 678)
  $pen.Dispose()

  $white = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF'))
  Draw-BrandText $g $brand $white 520 315
  $white.Dispose()
}

Save-Icon 'jizhe-icon-05-premium-mark.png' {
  param($g)
  $rect = [System.Drawing.Rectangle]::new(0, 0, 1024, 1024)
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (New-Color '#1F2937'), (New-Color '#111827'), 90)
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()

  $green = [System.Drawing.SolidBrush]::new((New-Color '#2C8D3A'))
  $red = [System.Drawing.SolidBrush]::new((New-Color '#D14328'))
  $g.FillEllipse($green, 164, 154, 250, 250)
  $g.FillEllipse($red, 674, 626, 206, 206)
  $green.Dispose()
  $red.Dispose()

  $ringPen = [System.Drawing.Pen]::new((New-Color '#FFFFFF' 58), 14)
  $g.DrawEllipse($ringPen, 186, 176, 206, 206)
  $g.DrawEllipse($ringPen, 693, 645, 168, 168)
  $ringPen.Dispose()

  $white = [System.Drawing.SolidBrush]::new((New-Color '#FFFFFF'))
  Draw-BrandText $g $brand $white 518 314
  $white.Dispose()

  $accent = [System.Drawing.Pen]::new((New-Color '#20C997'), 13)
  $accent.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $accent.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($accent, 340, 774, 684, 774)
  $accent.Dispose()
}
