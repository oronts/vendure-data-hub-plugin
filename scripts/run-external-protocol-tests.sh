#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/dev-server/infrastructure/docker-compose.external.yml"
CERTIFICATE_SCRIPT="$ROOT_DIR/scripts/generate-external-test-certificates.sh"
PROJECT_NAME="datahub-external-$(id -u)-$$"
VITEST_BIN="$ROOT_DIR/node_modules/.bin/vitest"

if [[ ! -x "$VITEST_BIN" ]]; then
    echo "Vitest is not installed; run npm ci before infrastructure tests" >&2
    exit 1
fi

allocate_port() {
    node -e "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
}

compose() {
    docker compose \
        --project-name "$PROJECT_NAME" \
        --file "$COMPOSE_FILE" \
        "$@"
}

cleanup() {
    local exit_code=$?
    if [[ "$exit_code" -ne 0 ]]; then
        compose logs --no-color postgres mysql || true
    fi
    compose down --volumes --remove-orphans || true
    if [[ -n "${CERTIFICATE_DIRECTORY:-}" ]]; then
        rm -rf "${CERTIFICATE_DIRECTORY:?}"
    fi
}

wait_for_port() {
    local port="$1"
    local attempts=60

    until (echo >"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; do
        attempts=$((attempts - 1))
        if [[ "$attempts" -eq 0 ]]; then
            echo "Timed out waiting for port $port" >&2
            return 1
        fi
        sleep 1
    done
}

export DATAHUB_TEST_S3_PORT="${DATAHUB_TEST_S3_PORT:-$(allocate_port)}"
export DATAHUB_TEST_POSTGRES_PORT="${DATAHUB_TEST_POSTGRES_PORT:-$(allocate_port)}"
export DATAHUB_TEST_MYSQL_PORT="${DATAHUB_TEST_MYSQL_PORT:-$(allocate_port)}"
export DATAHUB_TEST_FTP_PORT="${DATAHUB_TEST_FTP_PORT:-$(allocate_port)}"
export DATAHUB_TEST_SFTP_PORT="${DATAHUB_TEST_SFTP_PORT:-$(allocate_port)}"
export DATAHUB_TEST_FTP_PASSIVE_MIN="${DATAHUB_TEST_FTP_PASSIVE_MIN:-$((20000 + ($$ % 800) * 11))}"
export DATAHUB_TEST_FTP_PASSIVE_MAX="${DATAHUB_TEST_FTP_PASSIVE_MAX:-$((DATAHUB_TEST_FTP_PASSIVE_MIN + 10))}"
CERTIFICATE_DIRECTORY="$(mktemp -d)"
export DATAHUB_EXTERNAL_CERT_DIR="$CERTIFICATE_DIRECTORY"

trap cleanup EXIT

bash "$CERTIFICATE_SCRIPT" "$CERTIFICATE_DIRECTORY"
compose up --detach --wait
wait_for_port "$DATAHUB_TEST_FTP_PORT"
wait_for_port "$DATAHUB_TEST_SFTP_PORT"

export DATAHUB_TEST_S3_ENDPOINT="http://127.0.0.1:$DATAHUB_TEST_S3_PORT"
export DATAHUB_TEST_S3_ACCESS_KEY="datahub"
export DATAHUB_TEST_S3_SECRET_KEY="datahub-secret-key"
export DATAHUB_TEST_S3_BUCKET="data-hub-integration"
export DATAHUB_TEST_FTP_HOST="127.0.0.1"
export DATAHUB_TEST_FTP_USERNAME="datahub"
export DATAHUB_TEST_FTP_PASSWORD="datahub-password"
export DATAHUB_TEST_SFTP_HOST="127.0.0.1"
export DATAHUB_TEST_SFTP_USERNAME="datahub"
export DATAHUB_TEST_SFTP_PASSWORD="datahub-password"
export DATAHUB_TEST_POSTGRES_URL="postgresql://datahub:datahub-password@localhost:$DATAHUB_TEST_POSTGRES_PORT/datahub"
export DATAHUB_TEST_MYSQL_URL="mysql://datahub:datahub-password@localhost:$DATAHUB_TEST_MYSQL_PORT/datahub"
export DATAHUB_TEST_DATABASE_CA_FILE="$CERTIFICATE_DIRECTORY/ca.pem"
export DATAHUB_TEST_DATABASE_CLIENT_CERT_FILE="$CERTIFICATE_DIRECTORY/client-cert.pem"
export DATAHUB_TEST_DATABASE_CLIENT_KEY_FILE="$CERTIFICATE_DIRECTORY/client-key.pem"
export DATAHUB_TEST_DATABASE_UNTRUSTED_CA_FILE="$CERTIFICATE_DIRECTORY/untrusted-ca.pem"

cd "$ROOT_DIR"
"$ROOT_DIR/node_modules/.bin/ts-node" \
    --transpile-only \
    --project "$ROOT_DIR/tsconfig.dev.json" \
    "$ROOT_DIR/scripts/verify-postgres-migrations.ts"
"$VITEST_BIN" run \
    src/extractors/s3/s3-transport.integration.spec.ts \
    src/extractors/ftp/ftp-transport.integration.spec.ts \
    src/extractors/database/database-transport.integration.spec.ts \
    connectors/pimcore/pimcore-graphql.transport.integration.spec.ts \
    dev-server/mock/mock-contracts.spec.ts
