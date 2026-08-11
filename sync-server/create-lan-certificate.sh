#!/usr/bin/env bash
set -euo pipefail

LAN_IP="${1:-}"
DNS_NAME="${2:-kedu.local}"
if [[ -z "$LAN_IP" ]]; then
  echo "Usage: ./create-lan-certificate.sh <Windows-LAN-IP> [DNS-name]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/certs"
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

if [[ ! -f "$CERT_DIR/kedu-ca.key" || ! -f "$CERT_DIR/kedu-ca.crt" ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
    -keyout "$CERT_DIR/kedu-ca.key" -out "$CERT_DIR/kedu-ca.crt" \
    -subj "/CN=Kedu Personal LAN CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
fi

cat > "$CERT_DIR/server.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:${LAN_IP},DNS:${DNS_NAME},DNS:localhost,IP:127.0.0.1
EOF

openssl req -new -newkey rsa:3072 -sha256 -nodes \
  -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" \
  -subj "/CN=${LAN_IP}"
openssl x509 -req -sha256 -days 825 \
  -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/kedu-ca.crt" -CAkey "$CERT_DIR/kedu-ca.key" \
  -CAcreateserial -out "$CERT_DIR/server.crt" -extfile "$CERT_DIR/server.ext"
chmod 600 "$CERT_DIR"/*.key
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/server.ext"

echo "Created server certificate for ${LAN_IP}."
echo "Install $CERT_DIR/kedu-ca.crt as a trusted CA on the Windows PC and Android phone."
