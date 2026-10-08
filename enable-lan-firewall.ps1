# Run once in an Administrator PowerShell if LAN clients cannot connect.
# This adds one rule for this Python executable and TCP 5000 from LocalSubnet.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$pythonPath = (& python -c 'import sys; print(sys.executable)').Trim()
$ruleName = 'AI-mini-H5-LAN-5000'
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $ruleName -DisplayName 'AI-mini H5 LAN port 5000' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5000 `
        -RemoteAddress LocalSubnet -Program $pythonPath -Profile Private,Public | Out-Null
}
Write-Host 'LAN access is allowed for this Python server on TCP 5000.'
