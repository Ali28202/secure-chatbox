#!/usr/bin/env bash
#
# Deploy from this machine, with no CI and no registry in the middle.
#
#   bun run prod:deploy
#
# Overrides, if the defaults do not fit:
#
#   SSH_HOST=QUT              a Host from ~/.ssh/config, or user@address
#   DEPLOY_DIR=secure-chatbox the directory on the server, relative to $HOME
#
#   SSH_HOST=root@1.2.3.4 bun run prod:deploy
#
# Images are built here and streamed straight into the server's Docker daemon
# over SSH. The server still has 3.8 GB of RAM and no swap, so building there is
# not an option — and this way nothing needs a GHCR token, on either end.
#
# Everything after the transfer is the same `infra/deploy.sh` that CI runs, so
# the health check and the automatic rollback behave identically.
set -Eeuo pipefail

SSH_HOST=${SSH_HOST:-QUT}
DEPLOY_DIR=${DEPLOY_DIR:-secure-chatbox}
REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

cd "$REPO_DIR"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ tag -----
# A dirty tree gets a tag that says so. Labelling uncommitted work with a clean
# commit hash is how you end up unable to tell what is actually running.
SHA=$(git rev-parse --short HEAD 2>/dev/null) || fail 'Not a git repository.'

if [ -n "$(git status --porcelain)" ]; then
  TAG="${SHA}-dirty-$(date +%s)"
  printf '\033[33mWorking tree is dirty — deploying as %s\033[0m\n' "$TAG"
else
  TAG="$SHA"
fi

API_IMAGE="secure-chatbox-api:${TAG}"
WEB_IMAGE="secure-chatbox-web:${TAG}"

# ------------------------------------------------------------- preflight ----
log "Checking both ends"

docker info >/dev/null 2>&1 || fail 'Docker is not running on this machine.'

ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" true 2>/dev/null ||
  fail "Cannot reach '$SSH_HOST' over SSH. Check your ~/.ssh/config."

ssh "$SSH_HOST" "test -f '$DEPLOY_DIR/.env'" ||
  fail "No $DEPLOY_DIR/.env on the server. Secrets live there and only there."

printf '  host: %s\n  dir:  %s\n  tag:  %s\n' "$SSH_HOST" "$DEPLOY_DIR" "$TAG"

# ----------------------------------------------------------------- build ----
log "Building the API image"
docker build -f apps/api/Dockerfile -t "$API_IMAGE" .

log "Building the web image"
# Empty on purpose: the browser reaches the API through nginx on the same
# origin, so the client is built with relative URLs. Matches compose.prod.yml.
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL= -t "$WEB_IMAGE" .

# -------------------------------------------------------------- transfer ----
# One `docker save` for both, gzipped, straight into `docker load` on the far
# end. Layers the server already has still travel — this is a plain stream, not
# a registry — so expect a few hundred megabytes on the first run and less after
# only if the base images change.
log "Sending the images to $SSH_HOST"
docker save "$API_IMAGE" "$WEB_IMAGE" | gzip -1 | ssh "$SSH_HOST" 'gunzip | docker load'

# --------------------------------------------------------------- deliver ----
log "Sending compose file, nginx config and the deploy script"
tar czf - compose.prod.yml infra/ |
  ssh "$SSH_HOST" "mkdir -p '$DEPLOY_DIR' && tar xzf - -C '$DEPLOY_DIR'"

# ---------------------------------------------------------------- deploy ----
log "Deploying on $SSH_HOST"
ssh "$SSH_HOST" "cd '$DEPLOY_DIR' \
  && chmod +x infra/deploy.sh \
  && SKIP_PULL=1 API_IMAGE='$API_IMAGE' WEB_IMAGE='$WEB_IMAGE' ./infra/deploy.sh"
