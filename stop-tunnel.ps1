# Stop Cloudflare tunnels started by start-tunnel.ps1
$ErrorActionPreference = 'SilentlyContinue'
$tmpDir = Join-Path $env:TEMP 'courtzon-tunnels'
$pidFile = Join-Path $tmpDir 'tunnel-pids.txt'

if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object {
        if ($_ -match '^\d+$') {
            Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item $pidFile -Force
    Write-Host 'Tunnels stopped (by PID).' -ForegroundColor Yellow
}

# Belt-and-suspenders: kill any cloudflared processes
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Done.' -ForegroundColor Green
