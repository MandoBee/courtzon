# Apply all 128 archived migrations to a fresh database
# Tolerant of "Duplicate column/key/entry" errors (state already correct)
# Reports "Unknown column/table" as hard errors (dependency issues)

param(
    [string]$SchemaDir = "C:\Users\mniaz\Desktop\CourtZon-V2\archive\database\schema",
    [string]$DbName = "courtzon_v3_cert",
    [string]$MySql = "C:\xampp\mysql\bin\mysql.exe",
    [string]$User = "root",
    [string]$Pass = "CourtZon2026",
    [string]$LogDir = "C:\Users\mniaz\Desktop\CourtZon-V2\database\baseline"
)

$softErrors = @(
    'Duplicate column name',
    'Duplicate entry',
    'Duplicate key name',
    'Duplicate index',
    'already exists',
    'Duplicate',
    '42S21'  # Duplicate column
    '23000'  # Duplicate entry / FK
)

$files = Get-ChildItem -Path "$SchemaDir\*.sql" | Sort-Object Name
$total = $files.Count
$i = 0
$hardErrors = @()
$warnings = @()
$log = @()

Write-Host "Applying $total migrations to '$DbName'..." -ForegroundColor Cyan

foreach ($file in $files) {
    $i++
    $name = $file.Name
    Write-Progress -Activity "Applying migrations" -Status "$name ($i/$total)" -PercentComplete (($i/$total)*100)

    $content = Get-Content -Path $file.FullName -Raw
    $content = $content -replace 'courtzon_v2', $DbName
    $content = $content -replace '(?s)CREATE DATABASE IF NOT EXISTS \w+\s*CHARACTER SET utf8mb4\s*COLLATE utf8mb4_unicode_ci;\s*', ''

    $tmpFile = [System.IO.Path]::GetTempFileName() + ".sql"
    Set-Content -Path $tmpFile -Value $content -Encoding UTF8

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = cmd /c "`"$MySql`" -u $User -p$Pass $DbName < `"$tmpFile`" 2>&1"
    $sw.Stop()
    $ms = $sw.ElapsedMilliseconds

    $isSoft = $false
    if ($LASTEXITCODE -ne 0 -or $result) {
        foreach ($pattern in $softErrors) {
            if ($result -match $pattern) {
                $isSoft = $true
                break
            }
        }
        if ($isSoft) {
            $warnings += "$name : $result"
            $log += "$name|WARN|$ms ms|$result"
            Write-Host "WARN: $name - $($result.Substring(0, [Math]::Min(80, $result.Length)))" -ForegroundColor Yellow
        } else {
            $hardErrors += "$name : $result"
            $log += "$name|ERROR|$ms ms|$result"
            Write-Host "ERROR: $name - $result" -ForegroundColor Red
        }
    } else {
        $log += "$name|OK|$ms ms|"
        Write-Host "OK: $name ($ms ms)" -ForegroundColor Green
    }

    Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
}

# Save log
$logPath = "$LogDir\migration-apply-log.txt"
$log | Out-File -FilePath $logPath -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  MIGRATION APPLY SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Total:    $total"
Write-Host " OK:       $($log.Count - $warnings.Count - $hardErrors.Count)"
Write-Host " Warnings: $($warnings.Count)"
Write-Host " Errors:   $($hardErrors.Count)"

if ($warnings.Count -gt 0) {
    Write-Host "`nWarnings (tolerated):" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

if ($hardErrors.Count -gt 0) {
    Write-Host "`nHard Errors (need investigation):" -ForegroundColor Red
    $hardErrors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host "`nLog saved: $logPath" -ForegroundColor Cyan

if ($hardErrors.Count -eq 0) {
    Write-Host "`n✅ All migrations applied (or tolerated)." -ForegroundColor Green
} else {
    Write-Host "`n⚠️  $($hardErrors.Count) hard errors remain." -ForegroundColor Red
}

exit $hardErrors.Count
