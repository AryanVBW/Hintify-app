#!/bin/bash

# Create a self-signed certificate for code signing
# This script creates a certificate that can be used for local development

CERT_NAME="Hintify Developer"
KEYCHAIN="login"

echo "Creating self-signed certificate: $CERT_NAME"

# Create a self-signed certificate
security create-certificate \
  -a \
  -n "$CERT_NAME" \
  -r \
  -k "$KEYCHAIN" \
  -C codesigning \
  -c codeSign \
  -c digitalSignature \
  -c keyAgreement \
  -c keyEncipherment \
  -c nonRepudiation \
  -t leaf \
  -e 365

echo "Certificate created successfully!"
echo "You can now use this certificate name in your build configuration: '$CERT_NAME'"

# Verify the certificate was created
echo "Verifying certificate..."
security find-identity -v -p codesigning | grep "$CERT_NAME"