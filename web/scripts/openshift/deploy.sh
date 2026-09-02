#!/usr/bin/env bash
set -euo pipefail

for required in oc DB_PASSWORD MARIADB_ROOT_PASSWORD INITIAL_ADMIN_PASSWORD; do
  if [[ "${required}" == "oc" ]]; then
    command -v oc >/dev/null 2>&1 || { echo "oc CLI is required." >&2; exit 1; }
  elif [[ -z "${!required:-}" ]]; then
    echo "${required} must be set." >&2
    exit 1
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/../.." && pwd)"
repo_root="$(cd "${web_dir}/.." && pwd)"
admin_username="${INITIAL_ADMIN_USERNAME:-admin}"

oc create secret generic the-test-db \
  --from-literal=DB_PASSWORD="${DB_PASSWORD}" \
  --from-literal=MARIADB_ROOT_PASSWORD="${MARIADB_ROOT_PASSWORD}" \
  --dry-run=client -o yaml | oc apply -f -

oc create secret generic the-test-admin \
  --from-literal=INITIAL_ADMIN_USERNAME="${admin_username}" \
  --from-literal=INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD}" \
  --dry-run=client -o yaml | oc apply -f -

oc apply -f "${web_dir}/openshift-build.yaml"
oc start-build the-test-web --from-dir="${repo_root}" --follow --wait
oc apply -k "${web_dir}"
oc rollout status statefulset/mariadb --timeout=10m
oc rollout status deployment/the-test-web --timeout=10m
oc get route the-test-web -o jsonpath='https://{.spec.host}{"\n"}'
