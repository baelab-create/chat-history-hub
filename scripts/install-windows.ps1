param([string]$Source = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$Source = [IO.Path]::GetFullPath($Source)
$target = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ChatHistoryHub'))
$taskName = 'ChatHistoryHub-TitleSync'
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
$configSource = Join-Path $Source 'private\collector\config.json'
$configTarget = Join-Path $target 'private\collector\config.json'
if (Test-Path -LiteralPath $configTarget) { $config = Get-Content -LiteralPath $configTarget -Raw | ConvertFrom-Json }
elseif (Test-Path -LiteralPath $configSource) { $config = Get-Content -LiteralPath $configSource -Raw | ConvertFrom-Json }
else {
  $recipient = Get-Content -LiteralPath (Join-Path $Source 'setup\recipient.json') -Raw | ConvertFrom-Json
  $config = [pscustomobject]@{deviceName=$env:COMPUTERNAME;recipient=$recipient.publicKey;repository='baelab-create/chat-history-hub';python=(Get-Command python.exe -ErrorAction Stop).Source;gh=(Get-Command gh.exe -ErrorAction Stop).Source}
}
if (-not $config.recipient -or -not $config.deviceName) { throw 'Collector configuration is missing.' }
# Confirm the intended GitHub account without reading its access token.
$account = & $config.gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $account.Trim() -ne 'baelab-create') { throw 'Sign GitHub CLI into baelab-create before installing.' }
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne 'Chat History Hub title-only sync; no AI calls') { throw 'A different task uses this name; it was not changed.' }
if ($existing) {
 Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}
foreach ($dir in @('collector','scripts','runtime','private\collector')) {
 New-Item -ItemType Directory -Path (Join-Path $target $dir) -Force | Out-Null
}
$files=@('device-crypto.mjs','device-catalog.mjs','collector\metadata.mjs','collector\read-local.py','collector\app-source.mjs','collector\publish.mjs','collector\lock.mjs','collector\sync.mjs','scripts\run-windows.ps1')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $Source $file) -Destination (Join-Path $target $file) -Force }
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $target 'runtime\node.exe') -Force
[IO.File]::WriteAllText($configTarget, ($config | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
foreach ($file in @('identity.json','snapshot.json','projects.json','connection.json','last-success.json')) {
 $from=Join-Path $Source ('private\collector\' + $file); $to=Join-Path $target ('private\collector\' + $file)
 if ((Test-Path -LiteralPath $from) -and -not (Test-Path -LiteralPath $to)) { Copy-Item -LiteralPath $from -Destination $to }
}
$runner = Join-Path $target 'scripts\run-windows.ps1'
$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $shell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '"') -WorkingDirectory $target
$triggers = @(
 (New-ScheduledTaskTrigger -AtLogOn -User $userId),
 (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Chat History Hub title-only sync; no AI calls' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'Automatic title sync installed for this Windows user. Verify last-success.json after the first run.'
