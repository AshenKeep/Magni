#!/bin/sh
# start.sh — Magni server startup
# Always runs HTTPS. Exits with error if certs are missing.
# Run ./scripts/gen-certs.sh once to generate certs before starting.

set -e

PORT="${BACKEND_PORT:-8443}"

echo "→ Running database migrations..."
alembic upgrade head

if [ -z "$SSL_CERTFILE" ] || [ -z "$SSL_KEYFILE" ]; then
    echo "ERROR: SSL_CERTFILE and SSL_KEYFILE must be set in .env"
    echo "  Run: ./scripts/gen-certs.sh YOUR_SERVER_IP"
    exit 1
fi

if [ ! -f "$SSL_CERTFILE" ]; then
    echo "ERROR: SSL cert not found at $SSL_CERTFILE"
    echo "  Run: ./scripts/gen-certs.sh YOUR_SERVER_IP"
    exit 1
fi

if [ ! -f "$SSL_KEYFILE" ]; then
    echo "ERROR: SSL key not found at $SSL_KEYFILE"
    echo "  Run: ./scripts/gen-certs.sh YOUR_SERVER_IP"
    exit 1
fi

echo "→ Starting HTTPS on port $PORT"
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 2 \
    --ssl-certfile "$SSL_CERTFILE" \
    --ssl-keyfile  "$SSL_KEYFILE"
