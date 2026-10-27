# Instalación del Sistema de Asistencia con Verificación Facial

Guía paso a paso para dejar el sistema funcionando en Windows. Hay dos modos:

- **A. Instalación local**: la app corre con Node en el equipo y la base de datos en Docker. Sirve para desarrollo, pruebas o un kiosco en el mismo equipo.
- **B. Servidor con Docker**: app, base de datos y nginx con HTTPS, todo en contenedores. Es el modo para producción.

## Instalación automática

El script `scripts\instalar.ps1` hace todos los pasos de esta guía. Con los requisitos instalados y Docker Desktop abierto:

```powershell
.\scripts\instalar.ps1                                         # modo A, local
.\scripts\instalar.ps1 -Modo servidor -Direccion 192.168.1.50  # modo B, servidor (IP o dominio)
```

- Si `.env` no existe, lo crea con secretos aleatorios.
- Se detiene si `prisma/schema.prisma` tiene cambios locales.
- En modo servidor, genera un certificado autofirmado si no hay uno en `certs\` y crea la regla de firewall (para eso, ejecútalo como administrador).
- Se puede ejecutar varias veces sin perder datos ni claves.

Si Windows bloquea la ejecución de scripts, ejecuta antes, en esa misma consola: `Set-ExecutionPolicy -Scope Process Bypass`.

El resto de la guía explica los mismos pasos a mano.

---

## Requisitos

| Programa | Versión | Comprobar con |
|---|---|---|
| Node.js | 20 o superior (probado también con 26) | `node -v` |
| Docker Desktop | con Docker Compose v2 | `docker compose version` |
| Git | cualquiera | `git --version` |

Además, el equipo del kiosco necesita una **cámara web**.

Puertos que usa el sistema: **3000** (app), **5433** (PostgreSQL en el host), **80/443** (nginx, solo en el modo B).

---

## A. Instalación local

Todos los comandos se ejecutan en PowerShell, desde la carpeta del proyecto.

### 1. Obtener el código

```powershell
git clone <url-del-repo> Sistema-Asistencia-Verificacion-facial
cd Sistema-Asistencia-Verificacion-facial
```

### 2. Crear el archivo `.env`

```powershell
Copy-Item .env.example .env
```

Edita `.env` y cambia como mínimo:

- `NEXTAUTH_SECRET`: una cadena larga y aleatoria. Para generarla:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `API_KIOSCO_KEY` y `NEXT_PUBLIC_API_KIOSCO_KEY`: la clave del kiosco. **Las dos deben tener el mismo valor.**

`DATABASE_URL` ya apunta a la base de datos del paso 3 (`localhost:5433`); no hace falta tocarla.

### 3. Levantar la base de datos

```powershell
docker compose up -d db
```

Esto crea el contenedor `asistencia-db-1` (PostgreSQL 16) en el puerto 5433. Para comprobar que está listo:

```powershell
docker exec asistencia-db-1 pg_isready -U asistencia
```

Debe responder `accepting connections`.

### 4. Instalar dependencias

```powershell
npm ci --legacy-peer-deps
```

> Usa `--legacy-peer-deps`. Sin esa opción, npm falla con un error `ERESOLVE` porque `vitest` pide `@types/node` 22 o superior y el proyecto usa la 20. El conflicto es solo de tipos de desarrollo y no afecta al sistema.
>
> Con npm 11 o superior verás el aviso `install-scripts ... not yet covered by allowScripts`. Puedes ignorarlo: Prisma descarga sus motores en el paso siguiente.

### 5. Preparar la base de datos

```powershell
npx prisma generate        # genera el cliente de base de datos
npx prisma migrate deploy  # crea las tablas
npx prisma db seed         # crea los usuarios iniciales
```

El último comando debe mostrar `✅ Usuarios: admin, rrhh`.

### 6. (Opcional) Verificar

```powershell
npx tsc --noEmit   # no debe mostrar errores
npx vitest run     # todas las pruebas deben pasar
```

### 7. Arrancar el sistema

```powershell
npm run dev
```

La primera carga de cada página tarda unos segundos mientras se compila. Al arrancar, los modelos de reconocimiento facial se copian solos a `public/models`.

- Panel de administración: http://localhost:3000
- Kiosco de fichaje: http://localhost:3000/kiosco

Para una instalación estable en lugar del modo desarrollo:

```powershell
npm run build
npm start
```

### 8. Primer ingreso

| Usuario | Clave inicial | Rol |
|---|---|---|
| `admin` | `Admin1234!` | Administrador |
| `rrhh` | `Rrhh1234!` | Recursos Humanos |

En el primer ingreso, el sistema **obliga a cambiar la clave**.

### 9. Configuración inicial (desde el panel)

1. Crear las **gerencias**.
2. Revisar las **reglas de asistencia**: hora de entrada, hora límite, hora de referencia y tiempo de espera entre fichajes.
3. Crear los **usuarios** de gerentes y coordinadores, si se van a usar.
4. Registrar a los **empleados** y capturar su rostro.
5. Probar un fichaje en `/kiosco`.

---

## B. Servidor de producción con Docker

En el servidor necesitas Docker Desktop (o Docker Engine), Git y Node.js 20 o superior. Node solo se usa para crear las tablas y los usuarios.

En los ejemplos, `192.168.1.50` es la IP del servidor; reemplázala por la tuya.

### 1. Código y `.env`

```powershell
git clone <url-del-repo> C:\asistencia
cd C:\asistencia
Copy-Item .env.example .env
```

Cambia en `.env`:

- `NEXTAUTH_URL`: la dirección con la que los usuarios entrarán, con `https`. Por ejemplo `https://192.168.1.50` o `https://asistencia.miempresa.com`. Si no coincide, el login falla.
- `NEXTAUTH_SECRET`: una cadena aleatoria. **No uses el valor de ejemplo.**
- `API_KIOSCO_KEY` y `NEXT_PUBLIC_API_KIOSCO_KEY`: una clave nueva, la misma en las dos.

`DATABASE_URL` se deja como está: dentro de Docker, `compose.yml` la redirige al contenedor `db`. La clave del kiosco del navegador se toma de `API_KIOSCO_KEY` al compilar la imagen.

### 2. Certificados HTTPS

HTTPS es **obligatorio**: el navegador solo permite usar la cámara en `localhost` o con HTTPS. nginx espera estos dos archivos:

- `certs\cert.pem`: el certificado
- `certs\key.pem`: la clave privada

**Opción a, certificado de la empresa.** Si ya tienes uno, cópialo con esos nombres.

**Opción b, certificado autofirmado.** Genéralo con Docker, sin instalar nada:

```powershell
New-Item -ItemType Directory -Force certs
docker run --rm -v "${PWD}\certs:/certs" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 825 `
  -keyout /certs/key.pem -out /certs/cert.pem `
  -subj "/CN=192.168.1.50" -addext "subjectAltName=IP:192.168.1.50"
```

Con un certificado autofirmado, el navegador mostrará una advertencia de seguridad. En cada equipo kiosco, importa `certs\cert.pem` en "Entidades de certificación raíz de confianza" (`certmgr.msc`) para que la advertencia desaparezca y la cámara funcione sin problemas.

### 3. Base de datos, tablas y usuarios

Primero levanta solo la base de datos y prepárala. La imagen de la app no ejecuta las migraciones.

```powershell
docker compose up -d db
docker exec asistencia-db-1 pg_isready -U asistencia   # esperar "accepting connections"
npm ci --legacy-peer-deps
npx prisma migrate deploy
npx prisma db seed                                     # debe mostrar: ✅ Usuarios: admin, rrhh
```

Estos comandos usan la `DATABASE_URL` del `.env`, que apunta a `localhost:5433`.

### 4. Construir y levantar todo

```powershell
docker compose up -d --build
docker compose ps
```

Deben aparecer tres contenedores en estado `running`: `asistencia-app-1`, `asistencia-db-1` y `asistencia-proxy-1`. Todos tienen `restart: unless-stopped`, así que vuelven a levantarse solos al reiniciar el servidor, siempre que Docker Desktop esté configurado para iniciar con Windows.

### 5. Firewall

- Abre los puertos **80** y **443** para la red local:
  ```powershell
  New-NetFirewallRule -DisplayName "Asistencia HTTP/HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow
  ```
- **No abras el 5433.** La base de datos usa la clave por defecto `asistencia` y solo debe ser accesible desde el propio servidor.

### 6. Ingresar y probar

1. Desde otro equipo, abre `https://192.168.1.50`. Debe aparecer el login; `http://` redirige solo a `https://`.
2. Entra con `admin` / `Admin1234!` y cambia la clave.
3. Sigue la configuración inicial (paso A.9).
4. En el equipo kiosco, abre `https://192.168.1.50/kiosco`, permite la cámara y prueba un fichaje.
5. Si algo falla, revisa los registros: `docker compose logs app --tail 100`.

---

## Mantenimiento

### Respaldos

```powershell
.\scripts\backup.ps1                      # crea backups\asistencia_backup_<fecha>.sql.gz
.\scripts\restore.ps1 -FileName <nombre-del-archivo>
```

Ambos scripts trabajan sobre el contenedor `asistencia-db-1`.

### Actualizar a una versión nueva

```powershell
git pull
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
# Modo A: reiniciar npm run dev / npm start
# Modo B: docker compose up -d --build
```

### Cierre diario automático

El cierre diario marca las faltas cada 15 minutos sobre los últimos 7 días. Para desactivarlo, agrega `CIERRE_AUTOMATICO=false` en `.env`.

---

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `npm install` falla con `ERESOLVE` | Usa `npm ci --legacy-peer-deps` (paso A.4). |
| `Can't reach database server at localhost:5433` | La base de datos no está corriendo: `docker compose up -d db`. |
| Error 404 en `/models/*.json` | No se copiaron los modelos faciales: `npm run models`. |
| El kiosco responde "no autorizado" al fichar | `API_KIOSCO_KEY` y `NEXT_PUBLIC_API_KIOSCO_KEY` no coinciden. Corrígelas y reinicia la app (en el modo B, vuelve a construir con `--build`). |
| La cámara no se activa desde otro equipo | Falta HTTPS (paso B.2). |
| Usuario bloqueado | Tras 5 intentos fallidos, el usuario queda bloqueado 15 minutos. |
| Horas de fichaje desfasadas | El proceso debe correr en `TZ=America/Caracas`, que ya viene en `.env.example` y `compose.yml`. |
| `scripts/reset-db.ts` | **Borra toda la base de datos.** Úsalo solo para reiniciar desde cero. |
