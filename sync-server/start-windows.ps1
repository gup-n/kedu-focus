$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir ".env"
$certDir = Join-Path $scriptDir "certs"
$caFile = Join-Path $certDir "kedu-ca.crt"
$serverCert = Join-Path $certDir "server.crt"
$serverKey = Join-Path $certDir "server.key"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PythonWithCryptography {
    $candidates = @()
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) { $candidates += $systemPython.Source }
    $candidates += (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe")

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate) {
            & $candidate -c "import cryptography" 2>$null
            if ($LASTEXITCODE -eq 0) { return $candidate }
        }
    }
    return $null
}

if (-not (Test-IsAdministrator)) {
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`""
    )
    $elevated = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
}

$profile = Get-NetConnectionProfile |
    Where-Object { $_.InterfaceAlias -eq "WLAN" -and $_.IPv4Connectivity -ne "Disconnected" } |
    Select-Object -First 1
if (-not $profile) {
    throw "Active WLAN connection was not found. Connect to Wi-Fi and try again."
}

$ip = Get-NetIPAddress -InterfaceAlias $profile.InterfaceAlias -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) {
    throw "No usable IPv4 address was found on WLAN."
}

$pythonWithCrypto = Get-PythonWithCryptography
if (-not $pythonWithCrypto) {
    throw "Python with the cryptography package was not found. Install Python and cryptography, or run this in Codex Desktop."
}

New-Item -ItemType Directory -Path $certDir -Force | Out-Null
& $pythonWithCrypto (Join-Path $scriptDir "generate-windows-certificate.py") $ip --output $certDir

if (-not (Test-Path -LiteralPath $envFile)) {
    $password = "KeduSync-" + ([guid]::NewGuid().ToString("N"))
    $dataDir = (Join-Path $scriptDir "data").Replace("\", "/")
    @(
        "KEDU_SYNC_HOST=0.0.0.0"
        "KEDU_SYNC_PORT=8443"
        "KEDU_SYNC_DATA_DIR=$dataDir"
        "KEDU_SYNC_FILENAME=kedu-focus-backup.json"
        "KEDU_SYNC_HISTORY_LIMIT=50"
        "KEDU_SYNC_USERNAME=kedu"
        "KEDU_SYNC_PASSWORD=$password"
        "KEDU_SYNC_ALLOWED_ORIGINS=https://gup-n.github.io,http://localhost:5173,http://127.0.0.1:5173"
        "KEDU_SYNC_TLS_CERT=./certs/server.crt"
        "KEDU_SYNC_TLS_KEY=./certs/server.key"
    ) | Set-Content -LiteralPath $envFile -Encoding UTF8
    Write-Host "Created .env with username 'kedu' and password: $password" -ForegroundColor Yellow
}

$username = ((Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^KEDU_SYNC_USERNAME=' }) -replace '^KEDU_SYNC_USERNAME=', '').Trim()
$password = ((Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^KEDU_SYNC_PASSWORD=' }) -replace '^KEDU_SYNC_PASSWORD=', '').Trim()

& (Join-Path $scriptDir "install-windows-access.ps1")

Write-Host ""
Write-Host "Kedu sync server: https://$ip`:8443/" -ForegroundColor Green
Write-Host "Username: $username" -ForegroundColor Green
Write-Host "Password: $password" -ForegroundColor Green
Write-Host "Android CA file: $caFile" -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C to stop the server." -ForegroundColor Yellow
Write-Host ""

$launcher = Join-Path $scriptDir "start-server.ps1"
& $launcher
exit $LASTEXITCODE
