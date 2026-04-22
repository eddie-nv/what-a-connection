#!/usr/bin/env bash
# Local smoke test — boots server, hits /api/health, sends invalid body to /api/research,
# then shuts down. No API credits burned.

set -eo pipefail

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"

echo "==> starting server on :${PORT}"
npm run dev > /tmp/wac-smoke.log 2>&1 &
SERVER_PID=$!

cleanup() {
  echo "==> stopping server (pid=${SERVER_PID})"
  kill "${SERVER_PID}" 2>/dev/null || true
  wait "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> waiting for server to be ready"
for i in $(seq 1 30); do
  if curl -fsS "${BASE}/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo
echo "==> GET /api/health"
curl -fsS "${BASE}/api/health" | tee /dev/stderr
echo

echo
echo "==> POST /api/research (invalid body, expect 400)"
STATUS=$(curl -s -o /tmp/wac-err.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d '{"prospectUrl":"file:///etc/passwd","sender":{"name":"Ann"}}' \
  "${BASE}/api/research")
echo "status: ${STATUS}"
cat /tmp/wac-err.json
echo

if [ "${STATUS}" != "400" ]; then
  echo "EXPECTED 400, got ${STATUS}"
  exit 1
fi

echo
echo "==> smoke test PASSED"
