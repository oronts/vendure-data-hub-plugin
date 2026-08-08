#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/dev-server/infrastructure/docker-compose.redis.yml"
project_name="datahub-redis-integration-$(id -u)-$$"

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

export REDIS_TEST_UID="${REDIS_TEST_UID:-$(id -u)}"
export REDIS_TEST_GID="${REDIS_TEST_GID:-$(id -g)}"

docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    up --detach --wait redis

docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    run --rm redis-integration
