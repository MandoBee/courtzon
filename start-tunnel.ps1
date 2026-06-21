# Start Cloudflare tunnels for backend (3000) and frontend (5173)
$ErrorActionPreference = "Stop"

$cfPath = (Get-Command cloudflared.exe -ErrorAction Stop).Source
$envFile = Join-Path $PSScriptRoot ".env"
$backendDir = $PSScriptRoot

Write-Host "Starting Cloudflare tunnels..." -ForegroundColor Cyan

function Start-TunnelJob($name, $port) {
    Start-Job -Name $name -ScriptBlock {
        param($cf, $p)
        & $cf tunnel --url "http://localhost:$p"
    } -ArgumentList $cfPath, $port
}

function Wait-TunnelUrl($name, $label) {
    $url = $null
    for ($i = 0; $i -lt 30; $i++) {
        $output = Receive-Job -Name $name 2>$null
        if ($output) {
            foreach ($line in $output) {
                if ($line -match "(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)") {
                    $url = $matches[1]
                    break
                }
            }
        }
        if ($url) { break }
        Start-Sleep -Seconds 2
    }
    if (-not $url) {
        Write-Host "ERROR: Could not get $label tunnel URL after 60 seconds" -ForegroundColor Red
        exit 1
    }
    Write-Host "$label tunnel URL: $url" -ForegroundColor Green
    return $url
}

$backendJob = Start-TunnelJob "cf-backend" 3000
$frontendJob = Start-TunnelJob "cf-frontend" 5173

$backendUrl = Wait-TunnelUrl "cf-backend" "Backend"
$frontendUrl = Wait-TunnelUrl "cf-frontend" "Frontend"

# Update .env with tunnel URLs
$content = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
if (-not $content) {
    Write-Host "ERROR: .env file not found at $envFile" -ForegroundColor Red
    exit 1
}

foreach ($entry in @(
    @{ key = "WEBHOOK_BASE_URL"; value = $backendUrl },
    @{ key = "APP_URL"; value = $frontendUrl }
)) {
    if ($content -match "$($entry.key)=") {
        $content = $content -replace "$($entry.key)=.*", "$($entry.key)=$($entry.value)"
    } else {
        $content = $content.TrimEnd() + "`n$($entry.key)=$($entry.value)`n"
    }
    Write-Host "Updated .env with $($entry.key)=$($entry.value)" -ForegroundColor Green
}
Set-Content $envFile -Value $content -NoNewline

# Restart backend
Write-Host "Restarting backend container..." -ForegroundColor Cyan
Set-Location $backendDir
docker compose up -d backend 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker compose failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Backend:  $backendUrl" -ForegroundColor Green
Write-Host "  Frontend: $frontendUrl" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Keep this window open to keep tunnels alive." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop both tunnels." -ForegroundColor Yellow

try {
    while ($true) {
        $bo = Receive-Job -Name "cf-backend" 2>$null
        $fo = Receive-Job -Name "cf-frontend" 2>$null
        if ($bo) { $bo | ForEach-Object { Write-Host "[Backend] $_" } }
        if ($fo) { $fo | ForEach-Object { Write-Host "[Frontend] $_" } }
        Start-Sleep -Seconds 5
    }
} finally {
    @("cf-backend", "cf-frontend") | ForEach-Object {
        Stop-Job -Name $_ -ErrorAction SilentlyContinue
        Remove-Job -Name $_ -ErrorAction SilentlyContinue
    }
    Write-Host "Tunnels stopped." -ForegroundColor Yellow
}
