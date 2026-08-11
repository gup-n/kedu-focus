$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing $envFile. Create it from .env.example first."
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $separator = $line.IndexOf("=")
        if ($separator -gt 0) {
            $name = $line.Substring(0, $separator).Trim()
            $value = $line.Substring($separator + 1).Trim()
            if (($value.Length -ge 2) -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            Set-Item -Path ("Env:" + $name) -Value $value
        }
    }
}

Set-Location -LiteralPath $scriptDir

$port = [int]$env:KEDU_SYNC_PORT
$dataDir = [System.IO.Path]::GetFullPath($env:KEDU_SYNC_DATA_DIR)
$pidFile = Join-Path $dataDir "kedu-sync.pid"
if (Test-Path -LiteralPath $pidFile) {
    $savedPid = 0
    [void][int]::TryParse((Get-Content -Raw -LiteralPath $pidFile).Trim(), [ref]$savedPid)
    $savedProcess = if ($savedPid -gt 0) { Get-CimInstance Win32_Process -Filter ("ProcessId=" + $savedPid) -ErrorAction SilentlyContinue }
    if ($savedProcess -and $savedProcess.CommandLine -like '*server.py*') {
        throw "Kedu sync server is already running (PID $savedPid). Use stop-windows.bat before starting it again."
    }
    Remove-Item -LiteralPath $pidFile -Force
}

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port $port is already in use. Stop the existing service or change KEDU_SYNC_PORT."
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    & $python.Source -u (Join-Path $scriptDir "server.py")
    exit $LASTEXITCODE
}

$bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (Test-Path -LiteralPath $bundledPython) {
    & $bundledPython -u (Join-Path $scriptDir "server.py")
    exit $LASTEXITCODE
}

throw "Python was not found. Install Python 3 or set the Python executable path in start-server.ps1."
