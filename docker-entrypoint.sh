#!/bin/sh
set -eu

DATA_DIR="${PINGLO_DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  chmod 700 "$DATA_DIR" 2>/dev/null || true
  export HOME=/home/node
  exec su-exec node:node "$@"
fi

exec "$@"
