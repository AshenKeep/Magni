#!/usr/bin/env bash
# gen-certs.sh — Generate a self-signed TLS certificate for local Magni HTTPS
#
# Usage:
#   ./scripts/gen-certs.sh                   # auto-detects LAN IP
#   ./scripts/gen-certs.sh YOUR_SERVER_IP        # specify your server's LAN IP
#   ./scripts/gen-certs.sh 192.168.x.x 10.0.x.x  # multiple IPs
#
# Outputs:
#   certs/ca.crt     — install this on phones/tablets to trust the cert
#   certs/cert.pem   — server certificate (used by uvicorn)
#   certs/key.pem    — private key (used by uvicorn)
#
# The cert is valid for 10 years — fine for local/LAN use.
# Re-run if your LAN IP changes or you add more devices with different IPs.

set -euo pipefail

CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$CERTS_DIR"

# ── Collect IPs ──────────────────────────────────────────────────────────────

EXTRA_IPS=("$@")

# Auto-detect LAN IP if none given
if [ ${#EXTRA_IPS[@]} -eq 0 ]; then
  if command -v ip &>/dev/null; then
    AUTO_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
  elif command -v ifconfig &>/dev/null; then
    AUTO_IP=$(ifconfig | awk '/inet / && !/127\.0\.0\.1/{print $2}' | head -1)
  fi
  if [ -n "${AUTO_IP:-}" ]; then
    EXTRA_IPS=("$AUTO_IP")
    echo "→ Auto-detected LAN IP: $AUTO_IP"
  fi
fi

# ── Build SAN list ───────────────────────────────────────────────────────────

SAN="DNS:localhost,IP:127.0.0.1"
for ip in "${EXTRA_IPS[@]}"; do
  SAN="${SAN},IP:${ip}"
done

echo "→ Generating cert for SANs: $SAN"

# ── Write OpenSSL config ─────────────────────────────────────────────────────

cat > "$CERTS_DIR/openssl.conf" <<EOF
[req]
default_bits       = 4096
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = ZZ
ST = Local
L  = Local
O  = Magni Local Dev
OU = Magni
CN = magni.local

[v3_req]
subjectAltName    = ${SAN}
keyUsage          = digitalSignature, keyEncipherment
extendedKeyUsage  = serverAuth
basicConstraints  = CA:TRUE
EOF

# ── Generate certificate ─────────────────────────────────────────────────────

openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$CERTS_DIR/key.pem" \
  -out    "$CERTS_DIR/cert.pem" \
  -days   3650 \
  -config "$CERTS_DIR/openssl.conf" \
  2>/dev/null

# CA cert is the same as the server cert (self-signed)
cp "$CERTS_DIR/cert.pem" "$CERTS_DIR/ca.crt"

chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem" "$CERTS_DIR/ca.crt"

# ── Print instructions ───────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║            Magni local TLS cert generated                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Files created in ./certs/"
echo "  cert.pem — server certificate"
echo "  key.pem  — private key"
echo "  ca.crt   — install this on devices to trust the cert"
echo ""
echo "──────────────────────────────────────────────────────────"
echo "Next step: set these in your .env file:"
echo ""
echo "  HTTPS_PORT=8443"
echo "  SSL_CERTFILE=/certs/cert.pem"
echo "  SSL_KEYFILE=/certs/key.pem"
echo ""
echo "Then restart: docker compose up -d"
echo ""
echo "──────────────────────────────────────────────────────────"
echo "To trust the cert on each device:"
echo ""
echo "  BROWSER (desktop):"
echo "    Open https://$(echo ${EXTRA_IPS[0]:-localhost}):8443"
echo "    Click 'Advanced' → 'Proceed' (Chrome)"
echo "    Or import certs/ca.crt into browser trust store"
echo ""
echo "  iOS / iPadOS:"
echo "    1. AirDrop or serve certs/ca.crt to the device"
echo "       (e.g. python3 -m http.server 9000 --directory certs)"
echo "       then open http://$(echo ${EXTRA_IPS[0]:-localhost}):9000/ca.crt on the iPhone"
echo "    2. Settings → Downloaded Profile → Install"
echo "    3. Settings → General → About → Certificate Trust Settings"
echo "       → Enable full trust for Magni Local Dev"
echo ""
echo "  Android:"
echo "    1. Transfer certs/ca.crt to the phone"
echo "    2. Settings → Security → Install certificates"
echo "       → CA certificate → choose ca.crt"
echo "    (Exact path varies by Android version)"
echo ""
echo "──────────────────────────────────────────────────────────"
