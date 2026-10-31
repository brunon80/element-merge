# Varre a rajada de UMA espécie procurando o PROJÉTIL/ESTILHAÇO: pixels
# claros e azulados agrupados em células de 40px. Células enormes são o corpo
# da própria criatura -> descartadas; células médias são farpa em voo/cacos.
# Salva zoom 3x no centróide nos frames mais prováveis.
# Uso: powershell -File qa/find-particles.ps1 <prefixoDaEspecie> [saidaDir]
Add-Type -AssemblyName System.Drawing
# Filtro de cor por "família" do projétil: gelo/água = claro azulado; brasa =
# quente; seiva/folha = verde; areia/pedra = quente-claro. Ajuste fino por
# espécie é feito no cellMax (célula acima disso = corpo da criatura).
$sp = if ($args.Count -gt 0) { $args[0] } else { 'gelo' }
$dir = if ($args.Count -gt 1) { $args[1] } else { 'C:\Users\bruno\AppData\Local\Temp\opencode\shots' }
$kind = if ($args.Count -gt 2) { $args[2] } else { 'ice' }
$cell = 40; $z = 3; $cw = 300; $ch = 220; $cellMax = 150
$hot = { param($p) $p.R -gt 200 -and ($p.R - $p.B) -ge 40 }
switch ($kind) {
  'ice' { $hit = { param($p) $p.R -gt 190 -and $p.G -gt 200 -and $p.B -gt 210 -and ($p.B - $p.R) -ge 4 } }
  'hot' { $hit = $hot }
  'leaf' { $hit = { param($p) $p.G - $p.R -ge 12 -and $p.G - $p.B -ge 10 -and $p.G -gt 150 } }
  'bright' { $hit = { param($p) $p.R -gt 205 -and $p.G -gt 205 -and $p.B -gt 205 } }
  default { $hit = { param($p) $p.R -gt 180 -and $p.G -gt 160 -and $p.B -gt 120 -and ($p.R - $p.B) -ge 20 } }
}
$rows = @()
foreach ($f in (Get-ChildItem "$dir\$sp-b-*.png")) {
  $bmp = [System.Drawing.Bitmap]::new($f.FullName)
  $grid = @{}
  for ($y = 100; $y -lt 900; $y += 2) {
    for ($x = 40; $x -lt 1170; $x += 2) { # corpo golemado = célula lotada (>150),
      # que o filtro abaixo descarta; o que sobra é farpa em voo / cacos / geada
      $p = $bmp.GetPixel($x, $y)
      if (& $hit $p) {
        $k = "$([int]($x / $cell))_$([int]($y / $cell))"
        $grid[$k] = 1 + $grid[$k]
      }
    }
  }
  $bmp.Dispose()
  $score = 0; $sx = 0; $sy = 0; $n = 0
  foreach ($k in $grid.Keys) {
    $c = $grid[$k]
    if ($c -lt 6 -or $c -gt $cellMax) { continue } # corpo = célula lotada
    $p = $k.Split('_'); $cx = ([int]$p[0] + 0.5) * $cell; $cy = ([int]$p[1] + 0.5) * $cell
    $score += $c; $sx += $cx * $c; $sy += $cy * $c; $n++
  }
  if ($n -ge 1 -and $score -gt 0) {
    $rows += [pscustomobject]@{ Name = $f.BaseName; Hit = $score; Cells = $n; CX = [int]($sx / $score); CY = [int]($sy / $score) }
  }
}
$rows | Sort-Object Hit -Descending | Select-Object -First 8 | Format-Table -AutoSize
$top = $rows | Sort-Object Hit -Descending | Select-Object -First 4
# pulos p/ o recorte sair centrado no aglomerado MAIS denso do dia (nunca o
# mesmo canto repetido de frames vizinhos)
$last = -9999
$done = 0
foreach ($t in $top) {
  if ([Math]::Abs($t.CX - $last) -lt 80) { continue }
  $last = $t.CX
  $done++
  $rx = [int][Math]::Max(0, [Math]::Min(1180 - $cw, $t.CX - $cw / 2))
  $ry = [int][Math]::Max(0, [Math]::Min(950 - $ch, $t.CY - $ch / 2))
  $src = [System.Drawing.Bitmap]::new("$dir\$($t.Name).png")
  $crop = [System.Drawing.Bitmap]::new($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $cw, $ch), $rx, $ry, $cw, $ch, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $src.Dispose()
  $big = [System.Drawing.Bitmap]::new($cw * $z, $ch * $z)
  $g2 = [System.Drawing.Graphics]::FromImage($big)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g2.DrawImage($crop, 0, 0, $cw * $z, $ch * $z)
  $g2.Dispose(); $crop.Dispose()
  $big.Save("$dir\auto-$($t.Name).png", [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose()
}
"zooms: auto-<esp>-b-NN.png na pasta de saida"
