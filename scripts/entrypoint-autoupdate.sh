#!/bin/sh
set -e

echo "=== TCG Who Has What Auto-Update Startup ==="

if [ -d /app/src ]; then
  echo "[STARTUP] Removing previous source..."
  rm -rf /app/src
fi

mkdir -p /app/src

if [ -n "${LOCAL_SOURCE_DIR:-}" ]; then
  echo "[STARTUP] Copying local working tree from ${LOCAL_SOURCE_DIR}..."
  for item in "${LOCAL_SOURCE_DIR}"/* "${LOCAL_SOURCE_DIR}"/.[!.]* "${LOCAL_SOURCE_DIR}"/..?*; do
    [ -e "$item" ] || [ -L "$item" ] || continue
    case "$item" in
      */.git|*/node_modules|*/.next|*/data) continue ;;
    esac
    cp -R "$item" /app/src/
  done
else
  echo "[STARTUP] Cloning repository..."
  git clone --depth 1 \
    --branch "${GIT_BRANCH:-main}" \
    "${GIT_REPO_URL:-https://github.com/Gage77/TCGWhoHasWhat.git}" \
    /app/src
fi

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
