# scripts/backup.ps1
# Realiza un volcado (dump) completo de la base de datos desde el contenedor Docker
# Los respaldos se guardan en el volumen montado ./backups

$ContainerName = "asistencia-db-1"
$DbUser = "asistencia"
$DbName = "asistencia"
$DateStr = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$FileName = "asistencia_backup_$DateStr.sql.gz"

Write-Host "Iniciando respaldo de base de datos..." -ForegroundColor Cyan

# Verifica si el contenedor está corriendo
$ContainerStatus = docker inspect -f '{{.State.Running}}' $ContainerName 2>$null
if ($ContainerStatus -ne "true") {
    Write-Host "❌ Error: El contenedor '$ContainerName' no está corriendo." -ForegroundColor Red
    exit 1
}

# Asegura que exista el directorio ./backups en el host
$BackupsDir = "$PSScriptRoot\..\backups"
if (!(Test-Path $BackupsDir)) {
    New-Item -ItemType Directory -Force -Path $BackupsDir | Out-Null
}

# Ejecuta pg_dump comprimido (usando gzip) dentro del contenedor 
# y redirige la salida al directorio /backups mapeado.
Write-Host "Generando dump en: ./backups/$FileName" -ForegroundColor Yellow

# Usamos docker exec directo para ejecutar pg_dump > gzip > /backups/...
$Command = "pg_dump -U $DbUser -d $DbName -F c -b -v -f /backups/$FileName"
docker exec $ContainerName sh -c $Command

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Respaldo completado con éxito." -ForegroundColor Green
} else {
    Write-Host "❌ Ocurrió un error al realizar el respaldo." -ForegroundColor Red
}
