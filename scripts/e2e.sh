#!/usr/bin/env bash
# End-to-end pipeline test. REQUIRES:
#   APIFY_API_KEY and ANTHROPIC_API_KEY in .env (or shell env).
#   Will burn real API credits.
#
# Usage: scripts/e2e.sh [prospect_url] [prospect_name]
# Example: scripts/e2e.sh https://twitter.com/paulg "Paul Graham"

set -eo pipefail

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
URL="${1:-https://twitter.com/paulg}"
NAME="${2:-}"

SENDER_NAME="${SENDER_NAME:-Ann Researcher}"
SENDER_REASON="${SENDER_REASON:-Exploring a collaboration between our portfolio companies}"
SENDER_TOPIC="${SENDER_TOPIC:-LLM evaluation tooling for startups}"

PAYLOAD=$(cat <<JSON
{
  "prospectUrl": "${URL}",
  "prospectName": "${NAME}",
  "sender": {
    "name": "${SENDER_NAME}",
    "reasonForConnecting": "${SENDER_REASON}",
    "discussionTopic": "${SENDER_TOPIC}"
  }
}
JSON
)

echo "==> POST /api/research (SSE stream)"
echo "URL:  ${URL}"
echo "Name: ${NAME}"
echo

curl -N -sS \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" \
  "${BASE}/api/research"
