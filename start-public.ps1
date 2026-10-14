param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskData = Join-Path $PSScriptRoot 'backend/data'
$taskRuntime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force -Path $taskData,$taskRuntime | Out-Null
$taskTail = (Get-Command tailscale -ErrorAction Stop).Source
$taskState = (& $taskTail status --json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $taskState.BackendState -ne 'Running') { throw 'Connect Tailscale on this computer first.' }
$taskDomain = $taskState.Self.DNSName.TrimEnd('.')
$taskUrl = "https://$taskDomain/"
$taskCaddy = Join-Path $taskRuntime 'caddy.exe'
if (-not (Test-Path -LiteralPath $taskCaddy)) {
    $taskSource = Join-Path (Split-Path $PSScriptRoot -Parent) 'Musicdemo/caddy_windows_amd64.exe'
    if (-not (Test-Path -LiteralPath $taskSource)) { throw "Caddy missing. Place caddy.exe in $taskRuntime" }
    Copy-Item -LiteralPath $taskSource -Destination $taskCaddy
}
$env:PYTHONPATH = Join-Path $PSScriptRoot '.python-deps'
$env:HOST = '127.0.0.1'
$env:PORT = '5000'
$env:APP_DATABASE_PATH = Join-Path $taskData 'companion.sqlite3'
& python -c 'import flask, waitress'
if ($LASTEXITCODE -ne 0) {
    & python -m pip install --target $env:PYTHONPATH -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
}
if (-not $SkipBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
if (-not (Test-Path -LiteralPath 'dist/index.html')) { throw 'Run npm run build first.' }

# Reuse the same credentials on subsequent starts, never print passwords in logs.
$taskCredentialsPath = Join-Path $taskData 'public-access.json'
if (-not (Test-Path -LiteralPath $taskCredentialsPath)) {
    $taskBytes = New-Object byte[] 18
    $taskRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
    $taskRandom.GetBytes($taskBytes)
    $taskRandom.Dispose()
    $taskPassword = [Convert]::ToBase64String($taskBytes).Replace('+','-').Replace('/','_')
    @{username='companion';password=$taskPassword;url=$taskUrl} | ConvertTo-Json | Set-Content -LiteralPath $taskCredentialsPath -Encoding UTF8
    $taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $taskCredentialsPath /inheritance:r /grant:r "${taskUser}:(F)" 'SYSTEM:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect the credential file.' }
}
$taskCredentials = Get-Content -Raw -LiteralPath $taskCredentialsPath | ConvertFrom-Json
if ($taskCredentials.username -cnotmatch '^[A-Za-z0-9_-]{1,64}$') { throw 'Invalid username in credentials file.' }
# Caddy expects an LF-terminated line; Windows pipelines append CRLF.
if (-not $taskCredentials.hash -or $taskCredentials.hashVersion -ne 2) {
    $taskHashInfo = New-Object System.Diagnostics.ProcessStartInfo
    $taskHashInfo.FileName = $taskCaddy
    $taskHashInfo.Arguments = 'hash-password --algorithm bcrypt'
    $taskHashInfo.UseShellExecute = $false
    $taskHashInfo.CreateNoWindow = $true
    $taskHashInfo.RedirectStandardInput = $true
    $taskHashInfo.RedirectStandardOutput = $true
    $taskHashInfo.RedirectStandardError = $true
    $taskHasher = [System.Diagnostics.Process]::Start($taskHashInfo)
    $taskHasher.StandardInput.Write($taskCredentials.password + "`n")
    $taskHasher.StandardInput.Close()
    $taskHash = $taskHasher.StandardOutput.ReadToEnd().Trim()
    $taskHasher.WaitForExit()
    if ($taskHasher.ExitCode -ne 0 -or -not $taskHash.StartsWith('$2')) { throw 'Password hashing failed.' }
    $taskHasher.Dispose()
    $taskCredentials | Add-Member -NotePropertyName hash -NotePropertyValue $taskHash -Force
    $taskCredentials | Add-Member -NotePropertyName hashVersion -NotePropertyValue 2 -Force
    $taskCredentials | ConvertTo-Json | Set-Content -LiteralPath $taskCredentialsPath -Encoding UTF8
}
$env:AI_MINI_PASSWORD_HASH = $taskCredentials.hash
$env:AI_MINI_USERNAME = $taskCredentials.username
& $taskCaddy validate --config "$PSScriptRoot/Caddyfile" --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration is invalid.' }

$taskApiReady = $false
try { $taskHealth = Invoke-RestMethod 'http://127.0.0.1:5000/api/health' -TimeoutSec 3; $taskApiReady = $taskHealth.status -eq 'ok' -and $taskHealth.database -eq 'sqlite' } catch { }
if (-not $taskApiReady) {
    if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5000 is occupied by another service.' }
    $taskPython = (Get-Command python).Source
    $taskBackend = Start-Process -FilePath $taskPython -ArgumentList '-m','waitress','--listen=127.0.0.1:5000','--threads=8','--channel-timeout=180','--call','backend.app:create_app' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskData/public-backend.stdout.log" -RedirectStandardError "$taskData/public-backend.stderr.log"
    for ($taskTry=0; $taskTry -lt 30; $taskTry++) {
        Start-Sleep -Milliseconds 500
        if ($taskBackend.HasExited) { throw "Backend exited; see $taskData/public-backend.stderr.log" }
        try { $taskHealth=Invoke-RestMethod 'http://127.0.0.1:5000/api/health' -TimeoutSec 2; if ($taskHealth.status -eq 'ok') { $taskApiReady=$true; break } } catch { }
    }
    if (-not $taskApiReady) { throw 'Backend did not become ready.' }
}

$taskListener = Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue
if (-not $taskListener) {
    $taskProxy = Start-Process -FilePath $taskCaddy -ArgumentList 'run','--config',"`"$PSScriptRoot/Caddyfile`"",'--adapter','caddyfile' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskData/public-proxy.stdout.log" -RedirectStandardError "$taskData/public-proxy.stderr.log"
    Start-Sleep -Seconds 1
    if ($taskProxy.HasExited) { throw "Proxy exited; see $taskData/public-proxy.stderr.log" }
}
$taskUnauthenticated = 0
try { $taskUnauthenticated = (Invoke-WebRequest 'http://127.0.0.1:8088/api/health' -Headers @{Host=$taskDomain} -UseBasicParsing -TimeoutSec 5).StatusCode } catch { if ($_.Exception.Response) { $taskUnauthenticated = [int]$_.Exception.Response.StatusCode } }
if ($taskUnauthenticated -ne 401) { throw 'Public proxy must require a password before publishing.' }
$taskAuthorization = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($taskCredentials.username):$($taskCredentials.password)"))
$taskCheck = Invoke-RestMethod 'http://127.0.0.1:8088/api/health' -Headers @{Host=$taskDomain;Authorization="Basic $taskAuthorization"} -TimeoutSec 5
if ($taskCheck.status -ne 'ok') { throw 'Authenticated proxy health check failed.' }

$taskBackup = Join-Path $taskData 'tailscale-before-ai-mini.json'
if (-not (Test-Path -LiteralPath $taskBackup)) {
    $taskBefore = & $taskTail serve status --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not back up the existing Tailscale configuration.' }
    $taskBefore | Set-Content -LiteralPath $taskBackup -Encoding UTF8
}
& $taskTail funnel --bg --https=443 --yes http://127.0.0.1:8088
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Funnel could not be enabled.' }
Write-Host "Phone / public HTTPS: $taskUrl"
Write-Host "Username: $($taskCredentials.username)"
Write-Host "Password saved in: $taskCredentialsPath"
Write-Host 'Keep this computer awake and Tailscale connected. Services run in the background.'
