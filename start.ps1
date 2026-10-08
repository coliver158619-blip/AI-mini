$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $env:HOST) { $env:HOST = '0.0.0.0' }
if (-not $env:PORT) { $env:PORT = '5000' }
function Show-MusicAddresses {
    Write-Host "This computer: http://127.0.0.1:$($env:PORT)"
    try {
        $network = Invoke-RestMethod -Uri "http://127.0.0.1:$($env:PORT)/api/network" -TimeoutSec 2
        foreach ($address in $network.urls) { Write-Host "Same Wi-Fi / LAN: $address" }
    } catch { }
}
try {
    $runningService = Invoke-RestMethod -Uri "http://127.0.0.1:$($env:PORT)/api/health" -TimeoutSec 2
    if ($runningService.status -eq 'ok' -and $runningService.database -eq 'sqlite') {
        Write-Host 'Music room is already running.'
        Show-MusicAddresses
        return
    }
} catch { }
if (Test-Path -LiteralPath "$PSScriptRoot\.python-deps\flask") {
    $env:PYTHONPATH = "$PSScriptRoot\.python-deps"
}
if (-not (Test-Path -LiteralPath "$PSScriptRoot\node_modules\.bin\vite.cmd")) {
    Write-Host 'Installing frontend dependencies...'
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
}
& python -c 'import flask'
if ($LASTEXITCODE -ne 0) {
    & python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
Write-Host "This computer: http://127.0.0.1:$($env:PORT)"
& python -c 'from backend.network import lan_access; [print("Same Wi-Fi / LAN: " + url) for url in lan_access()["urls"]]'
& python -m backend.app
