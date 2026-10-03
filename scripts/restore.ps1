# scripts/restore.ps1
# Restaura un volcado (dump) de la base de datos generado con backup.ps1

param (
    [Parameter(Mandatory=$true, HelpMessage="Nombre del archivo de backup (ej: asistencia_backup_2026-10-02_15-00-00.sql.gz)")]
    [string]$FileName
)

$ContainerName = "asistencia-db-1"
$DbUser = "asistencia"
$DbName = "asistencia"

Write-Host "Iniciando restauración de base de datos desde $FileName..." -ForegroundColor Cyan

# Verifica si el contenedor está corriendo
$ContainerStatus = docker inspect -f '{{.State.Running}}' $ContainerName 2>$null
if ($ContainerStatus -ne "true") {
    Write-Host "❌ Error: El contenedor '$ContainerName' no está corriendo." -ForegroundColor Red
    exit 1
}

# Verifica que el archivo exista localmente
$FilePath = "$PSScriptRoot\..\backups\$FileName"
if (!(Test-Path $FilePath)) {
    Write-Host "❌ Error: No se encontró el archivo $FilePath" -ForegroundColor Red
    exit 1
}

Write-Host "¡ADVERTENCIA! Esto reemplazará los datos actuales en la base de datos '$DbName'." -ForegroundColor Yellow
$Confirmation = Read-Host "¿Estás seguro de continuar? (S/N)"
if ($Confirmation -notmatch "^[sS]$") {
    Write-Host "Restauración cancelada." -ForegroundColor Cyan
    exit 0
}

Write-Host "Restaurando..." -ForegroundColor Yellow

# Ejecuta pg_restore
$Command = "pg_restore -U $DbUser -d $DbName -v -c --if-exists /backups/$FileName"
docker exec $ContainerName sh -c $Command

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Restauración completada con éxito." -ForegroundColor Green
} else {
    Write-Host "❌ Ocurrió un error (o advertencias) al restaurar. Revisa el log de salida." -ForegroundColor Red
}
