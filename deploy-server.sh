#!/usr/bin/env bash
set -Eeuo pipefail

# Run this file directly from the repository on the system.db.inblackm server.

DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-/etc/default/deploy-server}"
if [ -r "$DEPLOY_ENV_FILE" ]; then
  set -a
  # The file is root-managed and uses shell-compatible KEY=value entries.
  # shellcheck source=/dev/null
  . "$DEPLOY_ENV_FILE"
  set +a
fi

APP_DIR="${DEPLOY_APP_DIR:-/www/wwwroot/system.db.inblackm}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO_URL="${DEPLOY_REPO_URL:-git@github.com:InblackM/system.db.inblackm.git}"
DEPLOY_KEY="${DEPLOY_SSH_KEY:-/root/.ssh/github_gamedb}"
NODE_VERSION="${DEPLOY_NODE_VERSION:-22}"
NVM_DIR="${NVM_DIR:-/www/server/nvm}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:5589/api/health}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/run/lock/gamedb-deploy.lock}"
REQUESTED_SHA="${DEPLOY_SHA:-}"
SKIP_VERIFY=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: /deploy-server.sh [options] [commit-sha]

Options:
  --sha SHA       Deploy this commit (must belong to origin/main).
  --skip-verify   Skip tests and lint; npm ci, build, restart, and health check still run.
  --dry-run       Print and validate configuration without changing the checkout.
  -h, --help      Show this help.

Overrides are loaded automatically from /etc/default/deploy-server.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --sha)
      [ "$#" -ge 2 ] || { echo "ERROR: --sha requires a value" >&2; exit 2; }
      REQUESTED_SHA="$2"
      shift 2
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -* )
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      [ -z "$REQUESTED_SHA" ] || { echo "ERROR: commit SHA supplied more than once" >&2; exit 2; }
      REQUESTED_SHA="$1"
      shift
      ;;
  esac
done

if [ "$DRY_RUN" -eq 0 ] && [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "ERROR: deploy must run as root because PM2_HOME is /root/.pm2" >&2
  exit 1
fi

for command_name in git curl flock; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $command_name" >&2
    exit 127
  }
done

[ -d "$APP_DIR/.git" ] || { echo "ERROR: git checkout not found at $APP_DIR" >&2; exit 1; }
[ -f "$APP_DIR/.env" ] || { echo "ERROR: $APP_DIR/.env not found" >&2; exit 1; }

echo "App:        $APP_DIR"
echo "Branch:     $BRANCH"
echo "Repository: $REPO_URL"
echo "Node:       $NODE_VERSION via $NVM_DIR"
echo "Health:     $HEALTH_URL"
echo "Verify:     $([ "$SKIP_VERIFY" -eq 1 ] && echo skipped || echo enabled)"
[ -n "$REQUESTED_SHA" ] && echo "Commit:     $REQUESTED_SHA"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run OK; no files or processes were changed."
  exit 0
fi

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "ERROR: another gamedb deployment is already running" >&2
  exit 75
fi

export PM2_HOME="${PM2_HOME:-/root/.pm2}"
unset PREFIX NPM_CONFIG_PREFIX npm_config_prefix NPM_CONFIG_GLOBALCONFIG npm_config_globalconfig

set +e
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
elif [ -s "${HOME:-/root}/.nvm/nvm.sh" ]; then
  NVM_DIR="${HOME:-/root}/.nvm"
  export NVM_DIR
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
set -e

command -v nvm >/dev/null 2>&1 || { echo "ERROR: NVM not found" >&2; exit 127; }
if [ -f "${HOME:-/root}/.npmrc" ] &&
   grep -Eq '^[[:space:]]*(prefix|globalconfig)[[:space:]]*=' "${HOME:-/root}/.npmrc"; then
  echo "ERROR: ${HOME:-/root}/.npmrc contains prefix/globalconfig, which conflicts with NVM" >&2
  exit 1
fi

# Some aaPanel NVM releases reference optional variables such as ALIAS while
# selecting an already-installed runtime. Keep strict mode everywhere else,
# but do not let NVM internals abort the deployment on an unset optional value.
set +u
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"
set -u

PM2="$(npm prefix -g)/bin/pm2"
if [ ! -x "$PM2" ]; then
  echo "PM2 not found for Node $(node --version); installing it..."
  npm install --global pm2@latest
  hash -r
  PM2="$(npm prefix -g)/bin/pm2"
fi
[ -x "$PM2" ] || { echo "ERROR: PM2 installation failed" >&2; exit 127; }

if [ -f "$DEPLOY_KEY" ]; then
  chmod 600 "$DEPLOY_KEY"
  export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
elif [[ "$REPO_URL" == git@* || "$REPO_URL" == ssh://* ]]; then
  echo "ERROR: SSH deploy key not found at $DEPLOY_KEY" >&2
  echo "Set DEPLOY_SSH_KEY or DEPLOY_REPO_URL in /etc/default/deploy-server." >&2
  exit 1
fi

cd "$APP_DIR"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: tracked files in $APP_DIR have local changes; refusing to overwrite them" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

echo "Fetching $BRANCH..."
git fetch --prune "$REPO_URL" "$BRANCH"
BRANCH_SHA="$(git rev-parse FETCH_HEAD)"
TARGET_SHA="$BRANCH_SHA"

if [ -n "$REQUESTED_SHA" ]; then
  git rev-parse --verify "${REQUESTED_SHA}^{commit}" >/dev/null 2>&1 || {
    echo "ERROR: commit not found after fetching $BRANCH: $REQUESTED_SHA" >&2
    exit 1
  }
  TARGET_SHA="$(git rev-parse "${REQUESTED_SHA}^{commit}")"
  git merge-base --is-ancestor "$TARGET_SHA" "$BRANCH_SHA" || {
    echo "ERROR: requested commit is not part of $BRANCH" >&2
    exit 1
  }
fi

echo "Deploying $TARGET_SHA"
git checkout -f -B "$BRANCH" "$TARGET_SHA"

npm ci
if [ "$SKIP_VERIFY" -eq 0 ]; then
  npm run lint
  npm test
fi
npm run build

"$PM2" startOrRestart ecosystem.config.cjs --only system.db.inblackm --update-env

ready=""
for _ in $(seq 1 45); do
  if curl --fail --silent --output /dev/null "$HEALTH_URL"; then
    ready=1
    break
  fi
  sleep 2
done

if [ -z "$ready" ]; then
  echo "ERROR: health check failed after 90 seconds: $HEALTH_URL" >&2
  "$PM2" list || true
  "$PM2" logs system.db.inblackm --lines 80 --nostream || true
  exit 1
fi

"$PM2" save
echo "Deployed: $TARGET_SHA"
