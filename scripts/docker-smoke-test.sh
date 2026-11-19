#!/bin/sh
# Start a built image and check that it serves and that the plugin is loaded.
#
# Usage: scripts/docker-smoke-test.sh <image>
#
# Checks, in this order:
#   1. the container reaches the "healthy" state of the image's HEALTHCHECK;
#   2. verdaccio answers /-/ping;
#   3. the gitlab plugin logged its startup configuration;
#   4. a login is answered by the plugin: the default conf/docker.yaml points
#      at http://gitlab, which does not resolve here, so the plugin rejects it
#      with "error authenticating user" (verdaccio's own htpasswd would not).
set -eu

image="${1:?usage: $0 <image>}"
name="verdaccio-gitlab-smoke-$$"
port="${SMOKE_PORT:-4873}"
timeout_seconds="${SMOKE_TIMEOUT:-60}"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "smoke: failed, container log follows" >&2
    docker logs "$name" >&2 2>&1 || true
  fi
  docker rm -f "$name" > /dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "smoke: $*" >&2
  exit 1
}

docker run -d --name "$name" -p "127.0.0.1:$port:4873" "$image" > /dev/null

elapsed=0
while :; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")"
  case "$health" in
    healthy) break ;;
    none) fail "the image defines no HEALTHCHECK" ;;
  esac
  if [ "$(docker inspect --format '{{.State.Running}}' "$name")" != true ]; then
    fail "the container exited"
  fi
  if [ "$elapsed" -ge "$timeout_seconds" ]; then
    fail "the container is not healthy after ${timeout_seconds}s (status: $health)"
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
echo "smoke: container healthy after ${elapsed}s"

curl -fsS "http://127.0.0.1:$port/-/ping" > /dev/null || fail "/-/ping did not answer 200"
echo "smoke: /-/ping answers"

docker logs "$name" 2>&1 | grep -q '\[gitlab\] publish control level' || fail "the gitlab plugin did not log its configuration"
echo "smoke: gitlab plugin loaded"

body="$(curl -sS -o - -w '\n%{http_code}' -X PUT \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke","password":"not-a-token"}' \
  "http://127.0.0.1:$port/-/user/org.couchdb.user:smoke")"
code="$(printf '%s' "$body" | tail -n 1)"
[ "$code" = 401 ] || fail "login answered $code, expected 401: $body"
printf '%s' "$body" | grep -q 'error authenticating user' || fail "login was not answered by the gitlab plugin: $body"
echo "smoke: login answered by the gitlab plugin"
