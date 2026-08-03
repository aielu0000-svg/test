param(
  [string]$Output
)

$ErrorActionPreference = "Stop"

function Convert-ToWslPath([string]$Path) {
  $clean = $Path -replace '^Microsoft\.PowerShell\.Core\\?FileSystem::', ''
  $match = [regex]::Match($clean, '^\\\\wsl(?:\.localhost)?\\(?<distro>[^\\]+)(?<linux>\\.*)$')
  if ($match.Success) {
    return @{ Distro = $match.Groups['distro'].Value; Path = ($match.Groups['linux'].Value -replace '\\', '/') }
  }
  return @{ Distro = 'Ubuntu'; Path = (& wsl.exe -d Ubuntu -- wslpath -u $clean).Trim() }
}

$repo = Convert-ToWslPath $PSScriptRoot
if (-not $Output) {
  $Output = Join-Path $PSScriptRoot ("the-test-source-{0}.tar.gz" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$archive = Convert-ToWslPath $Output
$tempArchive = "/tmp/the-test-source-$PID.tar.gz"
$maxBytes = 512MB

$exclude = @(
  '--exclude=.git',
  '--exclude=node_modules',
  '--exclude=release',
  '--exclude=win-unpacked',
  '--exclude=dist-web',
  '--exclude=out',
  '--exclude=*.exe',
  '--exclude=*.blockmap',
  '--exclude=*.asar',
  '--exclude=*.tar.gz',
  '--exclude=*.zip',
  '--exclude=.cache',
  '--exclude=.vite',
  '--exclude=coverage',
  '--exclude=the-test-source-*'
)

& wsl.exe -d $repo.Distro -- tar -czf $tempArchive -C $repo.Path @exclude .
if ($LASTEXITCODE -ne 0) { throw "Source compression failed." }

$size = [int64]((& wsl.exe -d $repo.Distro -- stat -c '%s' $tempArchive).Trim())
if ($size -gt $maxBytes) {
  & wsl.exe -d $repo.Distro -- rm -f $tempArchive
  throw ("Archive is larger than 512 MB: {0:N0} bytes" -f $size)
}

& wsl.exe -d $repo.Distro -- mv -f $tempArchive $archive.Path
if ($LASTEXITCODE -ne 0) { throw "Could not move the archive to the output path." }

Write-Host ("Created: {0}" -f $Output)
Write-Host ("Size: {0:N2} MB / limit: 512 MB" -f ($size / 1MB))
