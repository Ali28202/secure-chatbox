#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR=${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
COMPOSE_FILE=${COMPOSE_FILE:-compose.prod.yml}
STATE_FILE=${STATE_FILE:-$DEPLOY_DIR/.deploy-state}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-240}

cd "$DEPLOY_DIR"

: "${API_IMAGE:?set API_IMAGE to the image this deploy should run}"
: "${WEB_IMAGE:?set WEB_IMAGE to the image this deploy should run}"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

DOMAIN=$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
: "${DOMAIN:?DOMAIN is not set in .env}"

site_answers() {
  curl -fsSk -o /dev/null --max-time 5 \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health"
}

api_healthy() {
  [ "$(docker inspect -f '{{.State.Health.Status}}' chatbox-prod-api 2>/dev/null)" = healthy ]
}

wait_until_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if api_healthy && site_answers; then return 0; fi
    sleep 5
  done
  return 1
}

bring_up() {
  if [ "${SKIP_PULL:-0}" != 1 ]; then
    API_IMAGE="$1" WEB_IMAGE="$2" compose pull --quiet api web migrate
  fi

  API_IMAGE="$1" WEB_IMAGE="$2" compose up -d --no-build --remove-orphans
}

PREV_API=''; PREV_WEB=''; PREV_NGINX_HASH=''
# shellcheck source=/dev/null
[ -f "$STATE_FILE" ] && . "$STATE_FILE"

log "Deploying"
printf '  api: %s\n  web: %s\n' "$API_IMAGE" "$WEB_IMAGE"

bring_up "$API_IMAGE" "$WEB_IMAGE"

MIGRATE_CODE=$(docker inspect -f '{{.State.ExitCode}}' secure-chatbox-prod-migrate-1 2>/dev/null || echo unknown)
if [ "$MIGRATE_CODE" != 0 ] && [ "$MIGRATE_CODE" != unknown ]; then
  log "Migrations failed (exit $MIGRATE_CODE)"
  compose logs --no-color --tail 40 migrate
fi

NGINX_HASH=$(find infra/nginx -type f -exec sha256sum {} + | sort | sha256sum | cut -d' ' -f1)

if [ "$NGINX_HASH" != "${PREV_NGINX_HASH:-}" ]; then
  log "nginx config changed — recreating it"
  compose up -d --force-recreate nginx
fi

log "Waiting for the site to answer (up to ${HEALTH_TIMEOUT}s)"
if wait_until_healthy; then
  log "Healthy"
  printf "PREV_API=%q\nPREV_WEB=%q\nPREV_NGINX_HASH=%q\n" \
    "$API_IMAGE" "$WEB_IMAGE" "$NGINX_HASH" > "$STATE_FILE"
  docker image prune -f >/dev/null 2>&1 || true
  compose ps
  exit 0
fi

log "Did not become healthy — diagnostics"
compose ps -a
compose logs --no-color --tail 40 migrate api nginx || true

if [ -z "$PREV_API" ] || [ -z "$PREV_WEB" ]; then
  log "No previously-good build recorded; leaving the stack as it is for inspection"
  exit 1
fi

log "Rolling back to $PREV_API / $PREV_WEB"
bring_up "$PREV_API" "$PREV_WEB"

if wait_until_healthy; then
  log "Rolled back; the site is healthy on the previous build"
else
  log "Rollback did not recover the site — this needs a human"
fi
exit 1
