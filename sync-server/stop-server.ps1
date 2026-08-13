$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing $envFile."
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $separator = $line.IndexOf("=")
        if ($separator -gt 0) {
            $name = $line.Substring(0, $separator).Trim()
            $value = $line.Substring($separator + 1).Trim()
            Set-Item -Path ("Env:" + $name) -Value $value
        }
    }
}

$expectedScript = (Resolve-Path (Join-Path $scriptDir "server.py")).Path
$dataDir = [System.IO.Path]::GetFullPath($env:KEDU_SYNC_DATA_DIR)
$pidFile = Join-Path $dataDir "kedu-sync.pid"
$port = [int]$env:KEDU_SYNC_PORT
$candidatePids = @()
$savedPid = 0

if (Test-Path -LiteralPath $pidFile) {
    [void][int]::TryParse((Get-Content -Raw -LiteralPath $pidFile).Trim(), [ref]$savedPid)
    if ($savedPid -gt 0) { $candidatePids += $savedPid }
}

$listenerPids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)
$candidatePids += $listenerPids
$stopped = @()
foreach ($processId in ($candidatePids | Sort-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $processId) -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $commandLine = [string]$process.CommandLine
    $commandMatches = -not [string]::IsNullOrWhiteSpace($commandLine) -and $commandLine.IndexOf($expectedScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $pidAndPortMatch = $processId -eq $savedPid -and $listenerPids -contains $processId
    if ($process.Name -notlike 'python*.exe' -or (-not $commandMatches -and -not $pidAndPortMatch)) {
        throw "Port $port or the PID file points to an unrelated process. Refusing to stop PID $processId."
    }
    Stop-Process -Id $processId -Force
    $stopped += $processId
}

Start-Sleep -Milliseconds 500
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is still in use after stopping the saved Kedu process."
}
if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }

if ($stopped.Count) {
    Write-Host "Kedu sync server stopped (PID $($stopped -join ', '))." -ForegroundColor Green
} else {
    Write-Host "Kedu sync server is not running." -ForegroundColor Yellow
}
