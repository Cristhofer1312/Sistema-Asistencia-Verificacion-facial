# scripts/instalar.ps1
# Instala el sistema de asistencia facial de punta a punta (ver INSTALACION.md).
#
# Uso (PowerShell, desde la carpeta del proyecto):
#   .\scripts\instalar.ps1                                    # instalación local (npm run dev)
#   .\scripts\instalar.ps1 -Modo servidor -Direccion 192.168.1.50
#   .\scripts\instalar.ps1 -Modo servidor -Direccion asistencia.miempresa.com
#
# Si PowerShell bloquea la ejecución de scripts:
#   powershell -ExecutionPolicy Bypass -File .\scripts\instalar.ps1
#
# Es seguro volver a ejecutarlo: no sobrescribe un .env existente, ni los
# certificados, ni las claves de usuarios ya creados (el seed hace upsert).

param (
    [ValidateSet("local", "servidor")]
    [string]$Modo = "local",

    # Servidor: IP o dominio con el que los usuarios entrarán (https://<Direccion>)
    [string]$Direccion,

    # Servidor: no intentar crear la regla de firewall para 80/443
    [switch]$SinFirewall
)

# "Continue" a propósito: en PowerShell 5.1 con "Stop", cualquier línea que docker/npm
# escriban en stderr (aunque terminen bien) aborta el script si la salida está redirigida.
# Cada paso comprueba $LASTEXITCODE y corta con Fallar.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$ContenedorDb = "asistencia-db-1"
$Utf8SinBom = New-Object System.Text.UTF8Encoding $false

function Paso($texto)  { Write-Host ""; Write-Host "==> $texto" -ForegroundColor Cyan }
function Ok($texto)    { Write-Host "    OK  $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "    !!  $texto" -ForegroundColor Yellow }
function Fallar($texto) {
    Write-Host ""
    Write-Host "ERROR: $texto" -ForegroundColor Red
    exit 1
}

# Ejecuta un comando nativo y corta la instalación si devuelve error.
function Ejecutar([string]$descripcion, [scriptblock]$comando) {
    & $comando
    if ($LASTEXITCODE -ne 0) { Fallar "$descripcion falló (código $LASTEXITCODE). Revise la salida de arriba." }
}

function Nuevo-Secreto([int]$bytes) {
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    -join ($b | ForEach-Object { $_.ToString("x2") })
}

function Leer-Env([string]$ruta) {
    $vars = @{}
    foreach ($linea in Get-Content $ruta) {
        if ($linea -match '^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$') {
            $vars[$Matches[1]] = $Matches[2].Trim().Trim('"')
        }
    }
    $vars
}

if ($Modo -eq "servidor" -and -not $Direccion) {
    Fallar "En modo servidor indique la dirección: -Direccion 192.168.1.50 (o el dominio)."
}

Write-Host "Instalación del Sistema de Asistencia Facial — modo $Modo" -ForegroundColor White

# ─────────────────────────────────────────────────────────────
# 1. Requisitos
# ─────────────────────────────────────────────────────────────
Paso "Comprobando requisitos"

foreach ($programa in @("node", "npm", "npx", "docker")) {
    if (-not (Get-Command $programa -ErrorAction SilentlyContinue)) {
        Fallar "No se encontró '$programa'. Instale Node.js 20+ y Docker Desktop."
    }
}
$versionNode = (& node -v).TrimStart("v")
if ([int]($versionNode.Split(".")[0]) -lt 20) { Fallar "Se requiere Node.js 20 o superior (instalado: $versionNode)." }
Ok "Node.js $versionNode"

& docker info --format "{{.ServerVersion}}" | Out-Null
if ($LASTEXITCODE -ne 0) { Fallar "Docker no responde. Abra Docker Desktop, espere a que inicie y vuelva a ejecutar." }
Ok "Docker en ejecución"

# ─────────────────────────────────────────────────────────────
# 2. Schema de Prisma sin modificar
# ─────────────────────────────────────────────────────────────
# Un `prisma db pull` reescribe el schema con nombres de relación distintos
# (Gerencia, LogAuditoria) y rompe el login. Mejor detenerse que instalar así.
if ((Test-Path .git) -and (Get-Command git -ErrorAction SilentlyContinue)) {
    & git diff --quiet -- prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) {
        Fallar ("prisma/schema.prisma tiene cambios locales (¿se ejecutó 'npx prisma db pull'?).`n" +
                "Para restaurarlo:  git checkout -- prisma/schema.prisma`n" +
                "Luego vuelva a ejecutar este script.")
    }
    Ok "prisma/schema.prisma coincide con el repositorio"
}

# ─────────────────────────────────────────────────────────────
# 3. Archivo .env
# ─────────────────────────────────────────────────────────────
Paso "Configurando .env"

if (-not (Test-Path .env)) {
    if (-not (Test-Path .env.example)) { Fallar "No existe .env.example; actualice el repositorio (git pull)." }

    $claveKiosco = Nuevo-Secreto 24
    $contenido = Get-Content .env.example -Raw
    $contenido = $contenido -replace '(?m)^NEXTAUTH_SECRET=.*$', ("NEXTAUTH_SECRET=" + (Nuevo-Secreto 32))
    $contenido = $contenido -replace '(?m)^API_KIOSCO_KEY=.*$', "API_KIOSCO_KEY=$claveKiosco"
    $contenido = $contenido -replace '(?m)^NEXT_PUBLIC_API_KIOSCO_KEY=.*$', "NEXT_PUBLIC_API_KIOSCO_KEY=$claveKiosco"
    if ($Modo -eq "servidor") {
        $contenido = $contenido -replace '(?m)^NEXTAUTH_URL=.*$', "NEXTAUTH_URL=https://$Direccion"
    }
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $contenido, $Utf8SinBom)
    Ok ".env creado con secretos aleatorios"
} else {
    Ok ".env ya existe; se conserva"
}

$envVars = Leer-Env ".env"
foreach ($clave in @("DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "API_KIOSCO_KEY", "NEXT_PUBLIC_API_KIOSCO_KEY")) {
    if (-not $envVars[$clave]) { Fallar "Falta $clave en .env (vea .env.example)." }
}
if ($envVars["API_KIOSCO_KEY"] -ne $envVars["NEXT_PUBLIC_API_KIOSCO_KEY"]) {
    Fallar "API_KIOSCO_KEY y NEXT_PUBLIC_API_KIOSCO_KEY deben ser iguales en .env."
}
if ($envVars["NEXTAUTH_SECRET"] -eq "cambia-este-secreto") {
    Aviso "NEXTAUTH_SECRET tiene el valor de ejemplo; cámbielo antes de usar el sistema en producción."
}
if ($Modo -eq "servidor" -and $envVars["NEXTAUTH_URL"] -ne "https://$Direccion") {
    Aviso "NEXTAUTH_URL en .env es '$($envVars["NEXTAUTH_URL"])' y no 'https://$Direccion'; el login puede fallar."
}

# ─────────────────────────────────────────────────────────────
# 4. Base de datos
# ─────────────────────────────────────────────────────────────
Paso "Levantando la base de datos (PostgreSQL en el puerto 5433)"
Ejecutar "docker compose up db" { docker compose up -d db }

$lista = $false
for ($i = 0; $i -lt 30; $i++) {
    & docker exec $ContenedorDb pg_isready -U asistencia -q 2>$null
    if ($LASTEXITCODE -eq 0) { $lista = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $lista) { Fallar "La base de datos no respondió en 60 s. Revise: docker compose logs db" }
Ok "Base de datos lista"

# ─────────────────────────────────────────────────────────────
# 5. Dependencias y tablas
# ─────────────────────────────────────────────────────────────
Paso "Instalando dependencias (puede tardar unos minutos)"
# --legacy-peer-deps: vitest pide @types/node >=22 como peer y el proyecto usa 20
Ejecutar "npm ci" { npm ci --legacy-peer-deps --no-audit --no-fund }
Ok "Dependencias instaladas"

Paso "Preparando la base de datos"
Ejecutar "prisma generate"       { npx prisma generate }
Ejecutar "prisma migrate deploy" { npx prisma migrate deploy }
Ejecutar "prisma db seed"        { npx prisma db seed }
Ok "Tablas y usuarios iniciales listos"

# ─────────────────────────────────────────────────────────────
# 6a. Modo local: listo
# ─────────────────────────────────────────────────────────────
if ($Modo -eq "local") {
    Ejecutar "copia de modelos faciales" { npm run models }

    Write-Host ""
    Write-Host "Instalación local completada." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Arrancar:   npm run dev"
    Write-Host "  Panel:      http://localhost:3000"
    Write-Host "  Kiosco:     http://localhost:3000/kiosco"
    Write-Host "  Usuarios:   admin / Admin1234!   rrhh / Rrhh1234!   (piden cambio de clave al entrar)"
    exit 0
}

# ─────────────────────────────────────────────────────────────
# 6b. Modo servidor: certificados, contenedores y firewall
# ─────────────────────────────────────────────────────────────
Paso "Certificado HTTPS"
if ((Test-Path certs\cert.pem) -and (Test-Path certs\key.pem)) {
    Ok "Se usan los certificados existentes en certs\"
} else {
    New-Item -ItemType Directory -Force certs | Out-Null
    $esIp = $Direccion -match '^\d{1,3}(\.\d{1,3}){3}$'
    if ($esIp) { $san = "IP:$Direccion" } else { $san = "DNS:$Direccion" }
    $rutaCerts = (Resolve-Path certs).Path
    Ejecutar "generación del certificado" {
        docker run --rm -v "${rutaCerts}:/certs" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 825 `
            -keyout /certs/key.pem -out /certs/cert.pem -subj "/CN=$Direccion" -addext "subjectAltName=$san"
    }
    Ok "Certificado autofirmado creado en certs\ (válido 825 días)"
    Aviso "Importe certs\cert.pem como 'Entidad de certificación raíz de confianza' en cada equipo kiosco."
}

Paso "Construyendo y levantando los contenedores (puede tardar varios minutos)"
Ejecutar "docker compose up --build" { docker compose up -d --build }

$codigo = ""
for ($i = 0; $i -lt 45; $i++) {
    $codigo = & curl.exe -k -s -o NUL -w "%{http_code}" https://localhost/
    if ($codigo -eq "200") { break }
    Start-Sleep -Seconds 2
}
if ($codigo -ne "200") { Fallar "La app no responde por HTTPS (código '$codigo'). Revise: docker compose logs app proxy" }
Ok "La app responde en https://localhost"

Paso "Firewall (puertos 80 y 443)"
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if ($SinFirewall) {
    Aviso "Omitido por -SinFirewall."
} elseif (-not $esAdmin) {
    Aviso "Sin permisos de administrador. Ejecute en una consola como administrador:"
    Write-Host '    New-NetFirewallRule -DisplayName "Asistencia HTTP/HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow'
} elseif (Get-NetFirewallRule -DisplayName "Asistencia HTTP/HTTPS" -ErrorAction SilentlyContinue) {
    Ok "La regla de firewall ya existe"
} else {
    New-NetFirewallRule -DisplayName "Asistencia HTTP/HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow | Out-Null
    Ok "Regla de firewall creada"
}
Aviso "No abra el puerto 5433 en el firewall: la base de datos usa la clave por defecto."

Write-Host ""
Write-Host "Instalación en servidor completada." -ForegroundColor Green
Write-Host ""
Write-Host "  Panel:      https://$Direccion"
Write-Host "  Kiosco:     https://$Direccion/kiosco"
Write-Host "  Usuarios:   admin / Admin1234!   rrhh / Rrhh1234!   (piden cambio de clave al entrar)"
Write-Host "  Respaldos:  .\scripts\backup.ps1"
Write-Host ""
Write-Host "  Active en Docker Desktop 'Start Docker Desktop when you sign in' para que el sistema"
Write-Host "  vuelva a levantarse solo tras reiniciar el servidor."
