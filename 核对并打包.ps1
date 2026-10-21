$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot = Split-Path -Parent $PSScriptRoot
$invitationRoot = Join-Path $taskRoot '换届大会邀请函_定稿'
$qaRoot = Join-Path $PSScriptRoot '批量检查'
$report = ConvertFrom-Json -InputObject (Get-Content -LiteralPath (Join-Path $qaRoot '检查结果.json') -Encoding UTF8 -Raw)
if ($report.Count -ne 72) { throw 'Expected 72 invitations' }
$files = @(Get-ChildItem -LiteralPath $invitationRoot -Filter '*.png' -Recurse)
if ($files.Count -ne 72) { throw 'Incorrect output count' }
foreach ($item in $report) {
    $bitmap = [Drawing.Bitmap]::FromFile($item.filepath)
    if ($bitmap.Width -ne 1080 -or $bitmap.Height -ne 1528) { throw ('Incorrect image dimensions: ' + $item.name) }
    $bitmap.Dispose()
}
$labelFont = New-Object Drawing.Font 'Microsoft YaHei',12
$labelBrush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(35,48,56))
for ($sheet = 0; $sheet -lt 2; $sheet++) {
    $contact = New-Object Drawing.Bitmap 1512,1980
    $graphics = [Drawing.Graphics]::FromImage($contact)
    $graphics.Clear([Drawing.Color]::White)
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    for ($slot = 0; $slot -lt 36; $slot++) {
        $item = $report[$sheet * 36 + $slot]
        $column = [int][Math]::Floor($slot / 18)
        $row = $slot % 18
        $x = $column * 756
        $y = $row * 110
        $graphics.DrawString(($item.kind + ' ' + $item.index),$labelFont,$labelBrush,$x+10,$y+3)
        $source = [Drawing.Bitmap]::FromFile($item.filepath)
        $destination = New-Object Drawing.Rectangle $x,($y+27),756,70
        $crop = New-Object Drawing.Rectangle 0,527,1080,100
        $graphics.DrawImage($source,$destination,$crop,[Drawing.GraphicsUnit]::Pixel)
        $source.Dispose()
    }
    $contact.Save((Join-Path $qaRoot ('称呼核对_' + ($sheet+1) + '.png')),[Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $contact.Dispose()
}
$labelBrush.Dispose()
$labelFont.Dispose()
$archivePath = Join-Path $taskRoot '换届大会邀请函_定稿.zip'
if (Test-Path -LiteralPath $archivePath) { throw 'Archive already exists; preserve it before rerunning' }
[IO.Compression.ZipFile]::CreateFromDirectory($invitationRoot,$archivePath,[IO.Compression.CompressionLevel]::Optimal,$true)
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
$pngCount = @($archive.Entries | Where-Object { $_.FullName.EndsWith('.png') }).Count
$archive.Dispose()
if ($pngCount -ne 72) { throw 'Incorrect archive count' }
Get-ChildItem -LiteralPath $invitationRoot -Directory | ForEach-Object {
    [pscustomobject]@{ Folder = $_.Name; Count = @(Get-ChildItem -LiteralPath $_.FullName -Filter '*.png').Count }
}
Get-Item -LiteralPath $archivePath | Select-Object FullName,Length
