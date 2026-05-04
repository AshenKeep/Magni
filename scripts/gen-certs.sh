#!/usr/bin/env bash
# gen-certs.sh — Generate a self-signed TLS certificate for local Magni HTTPS
#
# Usage:
#   ./scripts/gen-certs.sh YOUR_SERVER_IP
#   ./scripts/gen-certs.sh YOUR_SERVER_IP /custom/output/path
#
# The second argument (if it starts with /) sets the output directory.
# Default output: ./certs/ next to docker-compose.yml

set -euo pipefail

EXTRA_IPS=()
CERTS_DIR=""

for arg in "$@"; do
    if [[ "$arg" == /* ]]; then
        CERTS_DIR="$arg"
    else
        EXTRA_IPS+=("$arg")
    fi
done

if [ -z "$CERTS_DIR" ]; then
    CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
fi

mkdir -p "$CERTS_DIR"

if [ ${#EXTRA_IPS[@]} -eq 0 ]; then
    if command -v ip &>/dev/null; then
        AUTO_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
    elif command -v ifconfig &>/dev/null; then
        AUTO_IP=$(ifconfig | awk '/inet / && !/127\.0\.0\.1/{print $2}' | head -1)
    fi
    if [ -n "${AUTO_IP:-}" ]; then
        EXTRA_IPS=("$AUTO_IP")
        echo "→ Auto-detected IP: $AUTO_IP"
    fi
fi

SAN="DNS:localhost,IP:127.0.0.1"
for ip in "${EXTRA_IPS[@]}"; do
    SAN="${SAN},IP:${ip}"
done

echo "→ Output: $CERTS_DIR"
echo "→ SANs:   $SAN"

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

openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$CERTS_DIR/key.pem" \
    -out    "$CERTS_DIR/cert.pem" \
    -days   3650 \
    -config "$CERTS_DIR/openssl.conf" \
    2>/dev/null

cp "$CERTS_DIR/cert.pem" "$CERTS_DIR/ca.crt"
chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem" "$CERTS_DIR/ca.crt"

echo ""
echo "Done. Files in: $CERTS_DIR"
echo "  cert.pem  — server cert"
echo "  key.pem   — private key"
echo "  ca.crt    — install on devices to trust"
echo ""
echo "Next: docker compose up -d"
