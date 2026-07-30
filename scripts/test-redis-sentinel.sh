#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/dev-server/infrastructure/docker-compose.redis-sentinel.yml"
project_name="datahub-redis-sentinel-$(id -u)-$$"

if [ ! -x "$repository_root/node_modules/.bin/vitest" ]; then
    echo "Vitest is not installed; run npm ci before infrastructure tests" >&2
    exit 1
fi

cleanup() {
    docker compose \
        --project-name "$project_name" \
        --file "$compose_file" \
        down --volumes --remove-orphans
}

trap cleanup EXIT INT TERM

export REDIS_SENTINEL_TEST_UID="${REDIS_SENTINEL_TEST_UID:-$(id -u)}"
export REDIS_SENTINEL_TEST_GID="${REDIS_SENTINEL_TEST_GID:-$(id -g)}"

docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    up --detach --wait \
    redis-primary redis-replica sentinel-1 sentinel-2 sentinel-3

docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    run --rm sentinel-integration
