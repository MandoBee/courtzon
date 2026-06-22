# Robust Cloudflare tunnel launcher (Phase 3.2 — replaces Start-Job approach)
# Starts two tunnels: backend (3000) and frontend (5173), waits for URLs, updates .env, restarts backend.
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$cfPath = (Get-Command cloudflared.exe -ErrorAction Stop).Source
$tmpDir = Join-Path $env:TEMP 'courtzon-tunnels'
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$backendLog = Join-Path $tmpDir 'cf-backend.err'
$frontendLog = Join-Path $tmpDir 'cf-frontend.err'
$backendOut = Join-Path $tmpDir 'cf-backend.out'
$frontendOut = Join-Path $tmpDir 'cf-frontend.out'

Write-Host 'Starting Cloudflare tunnels...' -ForegroundColor Cyan

# Kill any existing cloudflared processes from prior runs
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$backendProc = Start-Process -FilePath $cfPath -ArgumentList 'tunnel','--url','http://localhost:3000' -RedirectStandardOutput $backendOut -RedirectStandardError $backendLog -WindowStyle Hidden -PassThru
$frontendProc = Start-Process -FilePath $cfPath -ArgumentList 'tunnel','--url','http://localhost:5173' -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendLog -WindowStyle Hidden -PassThru

function Wait-TunnelUrl($logPath, $label) {
    $url = $null
    for ($i = 0; $i -lt 45; $i++) {
        if (Test-Path $logPath) {
            $content = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
            if ($content -match '(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)') {
                $url = $matches[1]
                break
            }
        }
        Start-Sleep -Seconds 2
    }
    if (-not $url) {
        Write-Host "ERROR: Could not get $label tunnel URL after 90 seconds." -ForegroundColor Red
        if (Test-Path $logPath) { Get-Content $logPath -Raw | Write-Host }
        return $null
    }
    Write-Host "$label tunnel URL: $url" -ForegroundColor Green
    return $url
}

$backendUrl = Wait-TunnelUrl $backendLog 'Backend'
$frontendUrl = Wait-TunnelUrl $frontendLog 'Frontend'

if (-not $backendUrl -or -not $frontendUrl) {
    Write-Host 'ERROR: One or both tunnels failed to start.' -ForegroundColor Red
    Get-Process -Id $backendProc.Id, $frontendProc.Id -ErrorAction SilentlyContinue | Stop-Process -Force
    exit 1
}

# Update .env with tunnel URLs
$envFile = Join-Path $root '.env'
$content = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
if (-not $content) {
    Write-Host "ERROR: .env file not found at $envFile" -ForegroundColor Red
    exit 1
}
foreach ($entry in @(
    @{ key = 'WEBHOOK_BASE_URL'; value = $backendUrl }
    @{ key = 'APP_URL'; value = $frontendUrl }
)) {
    if ($content -match "$($entry.key)=") {
        $content = $content -replace "$($entry.key)=.*", "$($entry.key)=$($entry.value)"
    } else {
        $content = $content.TrimEnd() + "`n$($entry.key)=$($entry.value)`n"
    }
    Write-Host "Updated .env: $($entry.key)=$($entry.value)" -ForegroundColor Green
}
Set-Content $envFile -Value $content -NoNewline

# Restart backend to pick up new env (scope down ErrorActionPreference so Docker's
# stderr progress lines like "Container ... Running" don't abort the script).
Write-Host 'Restarting backend container...' -ForegroundColor Cyan
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    docker compose -f (Join-Path $root 'docker-compose.yml') up -d backend 2>&1 | Out-Null
} finally {
    $ErrorActionPreference = $prevEAP
}

# Save PIDs for stop script
$pidFile = Join-Path $tmpDir 'tunnel-pids.txt'
"$($backendProc.Id)`n$($frontendProc.Id)" | Set-Content $pidFile

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host "  Backend:  $backendUrl" -ForegroundColor Green
Write-Host "  Frontend: $frontendUrl" -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green
Write-Host ''
Write-Host 'Tunnels are running in the background.' -ForegroundColor Yellow
Write-Host "To stop: .\stop-tunnel.ps1" -ForegroundColor Yellow
Write-Host "Logs: $tmpDir" -ForegroundColor Gray
