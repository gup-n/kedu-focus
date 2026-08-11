$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script from an Administrator PowerShell window."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ca = Join-Path $scriptDir "certs\kedu-ca.crt"

if (-not (Test-Path -LiteralPath $ca)) {
    throw "CA certificate not found: $ca"
}

Import-Certificate -FilePath $ca -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null

$profile = Get-NetConnectionProfile |
    Where-Object { $_.InterfaceAlias -eq "WLAN" -and $_.IPv4Connectivity -ne "Disconnected" } |
    Select-Object -First 1
if (-not $profile) {
    throw "Active WLAN connection was not found. Connect to Wi-Fi and try again."
}

$ruleName = "Kedu LAN Sync 8443 (WLAN)"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) { $existingRule | Remove-NetFirewallRule }
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 8443 `
    -Action Allow `
    -Profile $profile.NetworkCategory `
    -InterfaceAlias $profile.InterfaceAlias `
    -RemoteAddress LocalSubnet | Out-Null

Write-Host "Windows CA trust and $($profile.NetworkCategory) WLAN firewall access are configured."
