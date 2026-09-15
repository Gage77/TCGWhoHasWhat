# Simple Local Docker Hosting Plan

## Goal

Run TCG Who Has What on the same model as Garcon and Gather Them:

- one small Docker image that clones and builds the app when the container starts;
- one ignored, machine-specific Compose file;
- one host folder outside OneDrive for the SQLite database;
- restart the container to pull the latest `main` branch;
- expose the app on the local Docker host for friends reaching the LAN through Tailscale.

This is a personal deployment on a trusted machine. The shared group password, Tailscale access,
and the host firewall are the security boundary. The design protects against ordinary mistakes and
data loss, not a malicious Docker administrator or a compromised host.

## Explicit non-goals

Do not build any of the following for this deployment:

- custom release journals or multi-phase promotion;
- image or script attestation;
- pinned image digests or package mirrors;
- candidate containers, network sandboxes, or custom rollback orchestration;
- encrypted/signed scheduled-backup infrastructure;
- cross-process deployment locks;
- Playwright as a production deployment gate;
- zero-downtime updates.

A broken commit may cause downtime until it is reverted or fixed. That is acceptable for this
project and matches the operating model of the sibling apps.

## Files to add or change

- Add `Dockerfile.autoupdate`.
- Add `scripts/entrypoint-autoupdate.sh`.
- Add `docker-compose.autoupdate.example.yml`.
- Ignore the machine-specific `docker-compose.autoupdate.yml`.
- Add `AUTH_COOKIE_SECURE` handling to `src/app/api/session/route.ts` and its tests.
- Document setup, update, backup, restore, and troubleshooting in `README.md`.
- Add or update `.dockerignore` so local data, environment files, build output, and dependencies are
  not sent to Docker.

Before implementation, read the relevant Next.js 16.3.1 guidance in the installed
`node_modules/next/dist/docs/`, as required by `AGENTS.md`.

## 1. Auto-update image

Follow Garcon's `Dockerfile.autoupdate`, using this app's Node/npm versions:

```dockerfile
FROM node:22-alpine

RUN apk add --no-cache git
RUN mkdir -p /app/src /data

WORKDIR /app

COPY scripts/entrypoint-autoupdate.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
```

No source code is baked into this image. Rebuilding the image is necessary only when the
Dockerfile or entrypoint changes.

## 2. Startup script

Follow the Garcon/Gather Them clone-build-start flow:

```sh
#!/bin/sh
set -e

echo "=== TCG Who Has What Auto-Update Startup ==="

if [ -d /app/src ]; then
  echo "[STARTUP] Removing previous source..."
  rm -rf /app/src
fi

echo "[STARTUP] Cloning repository..."
git clone --depth 1 \
  --branch "${GIT_BRANCH:-main}" \
  "${GIT_REPO_URL:-https://github.com/Gage77/TCGWhoHasWhat.git}" \
  /app/src

cd /app/src

echo "[STARTUP] Preparing temporary build data directory..."
mkdir -p /app/src/data

echo "[STARTUP] Installing dependencies..."
npm ci --include=dev

echo "[STARTUP] Building application..."
npm run build

echo "[STARTUP] Linking persistent database directory..."
rm -rf /app/src/data
ln -s /data /app/src/data

echo "[STARTUP] Starting application..."
exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port 3000
```

The build gets a normal temporary `data` directory because Next.js/Turbopack cannot compile a
database symlink that points outside the project. After the build, the symlink places the real
runtime database in the host-mounted `/data` directory. The application already creates and
migrates `data/collections.db` on first use.

The script intentionally tracks a branch rather than implementing a release manager. If `main`
is broken, revert/fix it and restart the container. Logs must clearly show whether clone, install,
build, or startup failed.

For testing uncommitted changes on the host that owns the deployment, the ignored local Compose
file may set `LOCAL_SOURCE_DIR=/workspace` and mount the repository at `/workspace:ro`. The startup
script copies that working tree instead of cloning it; the tracked example leaves this switch unset.

## 3. Compose template

Add a tracked example parallel to Garcon:

```yaml
services:
  tcg-who-has-what:
    build:
      context: .
      dockerfile: Dockerfile.autoupdate
    container_name: tcg-who-has-what
    ports:
      - "4008:3000"
    volumes:
      # Keep this outside OneDrive.
      - C:/tcg-who-has-what-data:/data
    env_file:
      # Keep the group password outside the repository and OneDrive.
      - C:/tcg-who-has-what-config/runtime.env
    environment:
      - NODE_ENV=production
      - ALLOW_LOCAL_DB=1
      - AUTH_COOKIE_SECURE=0
      - GIT_BRANCH=main
      - GIT_REPO_URL=https://github.com/Gage77/TCGWhoHasWhat.git
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "--quiet", "http://127.0.0.1:3000/login"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10m
```

Copy this to `docker-compose.autoupdate.yml` and edit only machine-specific paths, port, branch, or
repository URL. The local copy remains ignored, just like Garcon's.

Publishing `4008:3000` makes the app reachable through the host's LAN/Tailscale path. Tailscale
ACLs and the Windows firewall decide which remote devices can reach port 4008. Do not configure
router port forwarding for this service.

The healthcheck is deliberately simple: it proves the Next server is answering. Login and data
persistence are checked manually after an update.

## 4. Runtime configuration

Create `C:\tcg-who-has-what-config\runtime.env`:

```dotenv
GROUP_PASSWORD=replace-this-with-the-shared-passphrase
```

Compose supplies `ALLOW_LOCAL_DB=1` and `AUTH_COOKIE_SECURE=0`. Do not set Turso variables for this
local deployment.

`AUTH_COOKIE_SECURE=0` is required because friends will access the app by an HTTP IP address.
Change the session route so the cookie is secure by default in production, but allows this explicit
local override:

```ts
secure: process.env.AUTH_COOKIE_SECURE !== "0" && process.env.NODE_ENV === "production"
```

Add tests proving:

- production defaults to a Secure cookie;
- `AUTH_COOKIE_SECURE=0` allows login persistence over local HTTP;
- development remains non-Secure.

The cookie remains HTTP-only and SameSite=Lax. The shared passphrase still protects every page and
API route.

## 5. Setup and normal operation

Document these commands in `README.md`.

First setup:

```powershell
New-Item -ItemType Directory -Force C:\tcg-who-has-what-data | Out-Null
New-Item -ItemType Directory -Force C:\tcg-who-has-what-config | Out-Null
Copy-Item docker-compose.autoupdate.example.yml docker-compose.autoupdate.yml
# Create C:\tcg-who-has-what-config\runtime.env and set GROUP_PASSWORD.
docker compose -f docker-compose.autoupdate.yml up -d --build
docker compose -f docker-compose.autoupdate.yml logs -f
```

Normal update:

```powershell
docker restart tcg-who-has-what
docker logs -f tcg-who-has-what
```

The restart deletes the previous clone, pulls the latest configured branch, runs `npm ci`, builds,
and starts Next.js. Rebuild the Docker image only after changing the Dockerfile or entrypoint:

```powershell
docker compose -f docker-compose.autoupdate.yml up -d --build
```

Useful commands:

```powershell
docker compose -f docker-compose.autoupdate.yml ps
docker compose -f docker-compose.autoupdate.yml logs --tail 200
docker compose -f docker-compose.autoupdate.yml stop
docker compose -f docker-compose.autoupdate.yml start
```

## 6. Simple backup and restore

The only irreplaceable deployment data is `C:\tcg-who-has-what-data`. Keep runtime secrets in the
separate config folder and do not include them in a shared database backup.

For a consistent manual backup, stop the app, copy the entire data directory, and start it again:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "C:\tcg-who-has-what-backups\$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null
try {
  docker stop tcg-who-has-what
  Copy-Item -Recurse -Force C:\tcg-who-has-what-data (Join-Path $backup 'data')
}
finally {
  docker start tcg-who-has-what
}
```

Copy occasional backups to another machine or cloud location if the data matters. No scheduled or
encrypted backup system is part of this implementation.

To restore, stop the container, rename the current data directory instead of deleting it, copy the
chosen backup into `C:\tcg-who-has-what-data`, start the container, and verify login plus a known
collection. Keep the renamed directory until the restore is confirmed.

## 7. Verification

Before handoff:

- `npm test` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `docker compose -f docker-compose.autoupdate.yml config` succeeds.
- The container becomes healthy and `http://<host-ip>:4008` shows the login page.
- Login works over HTTP by IP and survives a page refresh.
- Upload a small collection and confirm it appears.
- Restart the container and confirm login, collections, wants, and searches still work.
- Confirm `C:\tcg-who-has-what-data\collections.db` exists outside OneDrive.
- Make one stopped-container backup and restore it once before relying on it.
- Confirm the Windows firewall/Tailscale configuration permits intended friends and that no router
  port-forward exposes port 4008 to the public internet.

## Implementation order

1. Read the local Next.js 16.3.1 docs relevant to runtime environment and cookies.
2. Add the cookie override and tests.
3. Add the Dockerfile, entrypoint, Compose example, ignore rules, and Docker build exclusions.
4. Update the README with the short setup/update/backup instructions.
5. Run the repository checks and exercise persistence through one container restart.

Implementation stops after this simple deployment works. Any future HTTPS, automated backups,
commit pinning, or stronger rollback behavior should be a separate, explicitly requested project.
