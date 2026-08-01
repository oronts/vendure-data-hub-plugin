#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/dev-server/infrastructure/docker-compose.redis-sentinel.yml"
project_name="datahub-redis-sentinel-$(id -u)-$$"
test_run_id="$(id -u)-$$"
test_container="datahub-redis-sentinel-test-$test_run_id"
ready_key="datahub:sentinel-test:ready:$test_run_id"
container_id=''

if [ ! -x "$repository_root/node_modules/.bin/vitest" ]; then
    echo "Vitest is not installed; run npm ci before infrastructure tests" >&2
    exit 1
fi

cleanup() {
    if [ -n "$container_id" ]; then
        docker rm --force "$container_id" >/dev/null 2>&1 || true
    fi
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
    redis-primary redis-replica-1 redis-replica-2 sentinel-1 sentinel-2 sentinel-3

container_id=$(docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    run --detach --no-deps \
    --name "$test_container" \
    --env "DATAHUB_REDIS_SENTINEL_TEST_RUN_ID=$test_run_id" \
    sentinel-integration)

attempt=0
while [ "$attempt" -lt 120 ]; do
    readiness=$(docker compose \
        --project-name "$project_name" \
        --file "$compose_file" \
        exec -T redis-primary redis-cli --raw GET "$ready_key" 2>/dev/null || true)
    if [ "$readiness" = 'ready' ]; then
        break
    fi
    attempt=$((attempt + 1))
    sleep 0.25
done

if [ "$readiness" != 'ready' ]; then
    docker logs "$container_id" || true
    echo "Sentinel integration did not become ready" >&2
    exit 1
fi

docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    kill --signal SIGKILL redis-primary

test_exit=$(docker wait "$container_id")
docker logs "$container_id"
docker rm "$container_id" >/dev/null
container_id=''

if [ "$test_exit" -ne 0 ]; then
    docker compose \
        --project-name "$project_name" \
        --file "$compose_file" \
        logs --no-color \
        redis-primary redis-replica-1 redis-replica-2 \
        sentinel-1 sentinel-2 sentinel-3 >&2 || true
    exit "$test_exit"
fi
