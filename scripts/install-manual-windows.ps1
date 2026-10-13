param([string]$Source = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$Source = [IO.Path]::GetFullPath($Source)
$target = Join-Path $env:LOCALAPPDATA 'ChatHistoryHubManual'
$legacy = Join-Path $env:LOCALAPPDATA 'ChatHistoryHub'
$nodeCandidates = @((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),(Join-Path $legacy 'runtime\node.exe'))
$foundNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($foundNode) { $nodeCandidates += $foundNode.Source }
$nodePath = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $nodePath) { throw 'Node.js 22 or later is required. Open the Codex app once, then retry.' }
$pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
$pythonPath = if ($pythonCommand) { $pythonCommand.Source } else { 'python3' }
$recipient = Get-Content -LiteralPath (Join-Path $Source 'setup\recipient.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$config = [pscustomobject]@{deviceName=$env:COMPUTERNAME;recipient=$recipient.publicKey;python=$pythonPath}
$oldConfig = Join-Path $legacy 'private\collector\config.json'
if (Test-Path -LiteralPath $oldConfig) { $config = Get-Content -LiteralPath $oldConfig -Raw -Encoding UTF8 | ConvertFrom-Json }
$existingConfig = Join-Path $target 'private\collector\config.json'
if (Test-Path -LiteralPath $existingConfig) { $config = Get-Content -LiteralPath $existingConfig -Raw -Encoding UTF8 | ConvertFrom-Json }
if ((Test-Path -LiteralPath $oldConfig) -and $config.deviceName -match '[?\uFFFD]') { $config.deviceName = (Get-Content -LiteralPath $oldConfig -Raw -Encoding UTF8 | ConvertFrom-Json).deviceName }
foreach ($directory in @('collector','scripts','runtime','private\collector')) { New-Item -ItemType Directory -Path (Join-Path $target $directory) -Force | Out-Null }
$files=@('device-crypto.mjs','collector\metadata.mjs','collector\read-local.py','collector\app-source.mjs','collector\lock.mjs','collector\collect-once.mjs','collector\manual-server.mjs','scripts\manual-launcher.py')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $Source $file) -Destination (Join-Path $target $file) -Force }
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $target 'runtime\node.exe') -Force
[IO.File]::WriteAllText($existingConfig,($config | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
foreach ($name in @('identity.json','snapshot.json','connection.json')) {
 $from=Join-Path $legacy ('private\collector\'+$name);$to=Join-Path $target ('private\collector\'+$name)
 if ((Test-Path -LiteralPath $from) -and -not (Test-Path -LiteralPath $to)) { Copy-Item -LiteralPath $from -Destination $to }
}
$pythonw=Join-Path (Split-Path -Parent $config.python) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonw)) { throw 'Install Python 3 for Windows including pythonw.exe, then retry.' }
$launcher=Join-Path $target 'scripts\manual-launcher.py'
$key='HKCU:\Software\Classes\chathistoryhub'
if (Test-Path -LiteralPath $key) {
 $old=(Get-ItemProperty -LiteralPath $key).'(default)'
 if ($old -ne 'URL:Chat History Hub manual sync') { throw 'Another application owns this URL scheme.' }
}
New-Item -Path ($key+'\shell\open\command') -Force | Out-Null
Set-Item -LiteralPath $key -Value 'URL:Chat History Hub manual sync'
New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-Item -LiteralPath ($key+'\shell\open\command') -Value ('"'+$pythonw+'" "'+$launcher+'" "%1"')
# Stop the former collector if present; do not create a timer or a startup entry.
$oldTask=Get-ScheduledTask -TaskName 'ChatHistoryHub-TitleSync' -ErrorAction SilentlyContinue
if ($oldTask -and $oldTask.Description -eq 'Chat History Hub title-only sync; no AI calls') {
 Disable-ScheduledTask -InputObject $oldTask | Out-Null
 Stop-ScheduledTask -InputObject $oldTask -ErrorAction SilentlyContinue
}
Write-Output 'Manual connection installed. Nothing was collected. Use the website button when ready.'
