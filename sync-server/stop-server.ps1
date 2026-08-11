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

if (Test-Path -LiteralPath $pidFile) {
    $savedPid = 0
    [void][int]::TryParse((Get-Content -Raw -LiteralPath $pidFile).Trim(), [ref]$savedPid)
    if ($savedPid -gt 0) { $candidatePids += $savedPid }
}

$candidatePids += Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$stopped = @()
foreach ($processId in ($candidatePids | Sort-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $processId) -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ($process.Name -notlike 'python*.exe' -or $process.CommandLine.IndexOf($expectedScript, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
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
