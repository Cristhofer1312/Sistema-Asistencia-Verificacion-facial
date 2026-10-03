# scripts/setup-https.ps1
# Script para generar certificados locales usando mkcert
# Requiere mkcert instalado (https://github.com/FiloSottile/mkcert)
# En Windows, instalar con choco: choco install mkcert

$CertsDir = "$PSScriptRoot\..\certs"
$Hostname = [System.Net.Dns]::GetHostName()
$IPs = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object { $_.IPAddress -match "^192\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\." } | Select-Object -ExpandProperty IPAddress)

Write-Host "Verificando mkcert..." -ForegroundColor Cyan
if (!(Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: 'mkcert' no está instalado o no está en el PATH." -ForegroundColor Red
    Write-Host "Instrucciones de instalación:" -ForegroundColor Yellow
    Write-Host "1. Abre PowerShell como Administrador"
    Write-Host "2. Ejecuta: choco install mkcert"
    Write-Host "   (O descárgalo desde https://github.com/FiloSottile/mkcert/releases)"
    Write-Host "3. Cierra y vuelve a abrir PowerShell"
    exit 1
}

Write-Host "Instalando CA local..." -ForegroundColor Cyan
mkcert -install

if (!(Test-Path $CertsDir)) {
    New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null
}

$Domains = @("localhost", "127.0.0.1", "::1", $Hostname) + $IPs

Write-Host "Generando certificado para: $($Domains -join ', ')" -ForegroundColor Cyan

Set-Location $CertsDir
mkcert -key-file key.pem -cert-file cert.pem $Domains

Write-Host "✅ Certificados generados en ./certs/cert.pem y ./certs/key.pem" -ForegroundColor Green
Write-Host "Ya puedes levantar el servidor proxy con:" -ForegroundColor Yellow
Write-Host "docker compose up -d"
