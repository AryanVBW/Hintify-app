#!/usr/bin/env bash
set -euo pipefail

# Create a local self-signed code signing certificate for development ONLY.
# Note: This certificate cannot be used for Apple notarization and will still
# show Gatekeeper warnings on first launch. For production, you need an Apple
# Developer ID Application certificate and notarization.

CERT_NAME="Hintify Developer"
KEYCHAIN="login.keychain"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[cert] Creating self-signed code signing certificate: $CERT_NAME"

cat >"$WORKDIR/openssl.cnf" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no

[dn]
CN = Hintify Developer

[ext]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout "$WORKDIR/key.pem" \
  -out "$WORKDIR/cert.pem" \
  -config "$WORKDIR/openssl.cnf" >/dev/null 2>&1

openssl pkcs12 -export -inkey "$WORKDIR/key.pem" -in "$WORKDIR/cert.pem" \
  -out "$WORKDIR/hintify_codesign.p12" -password pass: >/dev/null 2>&1

echo "[cert] Importing certificate into login keychain"
security import "$WORKDIR/hintify_codesign.p12" -k "$KEYCHAIN" -P "" -T /usr/bin/codesign >/dev/null

# Ensure codesign tools can use the key non-interactively
security set-key-partition-list -S apple-tool:,apple: -s -k "" "$KEYCHAIN" >/dev/null || true

echo "[cert] Verifying installation..."
if security find-identity -v -p codesigning | grep -q "$CERT_NAME"; then
  echo "[cert] Certificate installed: $CERT_NAME"
  echo "[cert] You can build using this identity by setting: CSC_NAME=\"$CERT_NAME\""
else
  echo "[cert] Warning: Certificate not visible to codesign. You may need to trust it in Keychain Access."
fi