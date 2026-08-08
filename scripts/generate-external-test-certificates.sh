#!/usr/bin/env bash

set -euo pipefail

TARGET_DIRECTORY="${1:?Certificate target directory is required}"
CERTIFICATE_HOSTNAME="${2:-localhost}"

mkdir -p "$TARGET_DIRECTORY"
umask 077

openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -keyout "$TARGET_DIRECTORY/ca-key.pem" \
    -out "$TARGET_DIRECTORY/ca.pem" \
    -days 1 \
    -sha256 \
    -subj "/CN=Data Hub External Test CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req \
    -newkey rsa:2048 \
    -nodes \
    -keyout "$TARGET_DIRECTORY/server-key.pem" \
    -out "$TARGET_DIRECTORY/server.csr" \
    -sha256 \
    -subj "/CN=$CERTIFICATE_HOSTNAME" \
    -addext "subjectAltName=DNS:$CERTIFICATE_HOSTNAME" \
    -addext "extendedKeyUsage=serverAuth"

openssl x509 \
    -req \
    -in "$TARGET_DIRECTORY/server.csr" \
    -CA "$TARGET_DIRECTORY/ca.pem" \
    -CAkey "$TARGET_DIRECTORY/ca-key.pem" \
    -CAcreateserial \
    -out "$TARGET_DIRECTORY/server-cert.pem" \
    -days 1 \
    -sha256 \
    -copy_extensions copy

openssl req \
    -newkey rsa:2048 \
    -nodes \
    -keyout "$TARGET_DIRECTORY/client-key.pem" \
    -out "$TARGET_DIRECTORY/client.csr" \
    -sha256 \
    -subj "/CN=datahub" \
    -addext "extendedKeyUsage=clientAuth"

openssl x509 \
    -req \
    -in "$TARGET_DIRECTORY/client.csr" \
    -CA "$TARGET_DIRECTORY/ca.pem" \
    -CAkey "$TARGET_DIRECTORY/ca-key.pem" \
    -CAcreateserial \
    -out "$TARGET_DIRECTORY/client-cert.pem" \
    -days 1 \
    -sha256 \
    -copy_extensions copy

openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -keyout "$TARGET_DIRECTORY/untrusted-ca-key.pem" \
    -out "$TARGET_DIRECTORY/untrusted-ca.pem" \
    -days 1 \
    -sha256 \
    -subj "/CN=Data Hub Untrusted Test CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"

rm \
    "$TARGET_DIRECTORY/server.csr" \
    "$TARGET_DIRECTORY/client.csr" \
    "$TARGET_DIRECTORY/ca.srl"
