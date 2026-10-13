$ErrorActionPreference = 'Stop'
$collectorRoot = Split-Path -Parent $PSScriptRoot
$nodeCandidates = @(
  (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),
  (Join-Path $collectorRoot 'runtime\node.exe')
)
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeCandidates += $nodeCommand.Source }
$nodePath = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $nodePath) { exit 2 }
Set-Location -LiteralPath $collectorRoot
# Bounded log contains counts/error codes only. No titles or credentials.
$logPath = Join-Path $collectorRoot 'private\collector\service.log'
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 1048576) {
  Move-Item -LiteralPath $logPath -Destination ($logPath + '.previous') -Force
}
& $nodePath (Join-Path $collectorRoot 'collector\sync.mjs') 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
exit $LASTEXITCODE
