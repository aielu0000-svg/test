#!/usr/bin/env bash
set -euo pipefail

base_url="${E2E_BASE_URL:-http://127.0.0.1:3000}"
username="${E2E_USERNAME:?E2E_USERNAME is required}"
password="${E2E_PASSWORD:?E2E_PASSWORD is required}"
cookie_jar="${RUNNER_TEMP:-/tmp}/the-test-e2e-cookie.txt"
login_json="${RUNNER_TEMP:-/tmp}/the-test-e2e-login.json"
change_json="${RUNNER_TEMP:-/tmp}/the-test-e2e-change-password.json"

cleanup() {
  rm -f "$cookie_jar" "$login_json" "$change_json"
}
trap cleanup EXIT

login_status="$({ curl --silent --show-error \
  --output "$login_json" \
  --write-out '%{http_code}' \
  --cookie-jar "$cookie_jar" \
  --header 'content-type: application/json' \
  --data "$(printf '{\"username\":\"%s\",\"password\":\"%s\"}' "$username" "$password")" \
  "$base_url/api/auth/login"; } || true)"

if [[ "$login_status" != "200" ]]; then
  echo "E2E bootstrap login failed with HTTP $login_status" >&2
  cat "$login_json" >&2 || true
  exit 1
fi

must_change="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(Boolean(body.user?.mustChangePassword)));' "$login_json")"

if [[ "$must_change" == "true" ]]; then
  change_status="$({ curl --silent --show-error \
    --output "$change_json" \
    --write-out '%{http_code}' \
    --cookie "$cookie_jar" \
    --header 'content-type: application/json' \
    --data "$(printf '{\"currentPassword\":\"%s\",\"newPassword\":\"%s\",\"confirmation\":\"%s\"}' "$password" "$password" "$password")" \
    "$base_url/api/auth/change-password"; } || true)"

  if [[ "$change_status" != "200" ]]; then
    echo "E2E password bootstrap failed with HTTP $change_status" >&2
    cat "$change_json" >&2 || true
    exit 1
  fi
fi

me_status="$(curl --silent --show-error \
  --output /dev/null \
  --write-out '%{http_code}' \
  --cookie "$cookie_jar" \
  "$base_url/api/auth/me")"

if [[ "$me_status" != "200" ]]; then
  echo "E2E bootstrap session verification failed with HTTP $me_status" >&2
  exit 1
fi

echo "E2E account is ready."
