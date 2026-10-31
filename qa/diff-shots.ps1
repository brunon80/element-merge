# Quantos pixels diferem entre duas capturas (para saber se o zoom aconteceu)
Add-Type -AssemblyName System.Drawing
$a = [System.Drawing.Bitmap]::new($args[0]); $b = [System.Drawing.Bitmap]::new($args[1])
$diff = 0
for ($y = 0; $y -lt $a.Height; $y += 4) {
  for ($x = 0; $x -lt $a.Width; $x += 4) {
    $p = $a.GetPixel($x, $y); $q = $b.GetPixel($x, $y)
    if ([Math]::Abs($p.R - $q.R) + [Math]::Abs($p.G - $q.G) + [Math]::Abs($p.B - $q.B) -gt 30) { $diff++ }
  }
}
"$($a.Width)x$($a.Height) amostrado: $diff amostras diferentes"
