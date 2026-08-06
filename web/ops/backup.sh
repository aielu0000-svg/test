#!/bin/sh
set -eu

backup_root="${BACKUP_STORAGE_PATH:-/backups}"
evidence_root="${BACKUP_EVIDENCE_PATH:-/evidence}"
created_by="${1:-}"
retain_backup_id="${THE_TEST_RETAIN_BACKUP_ID:-}"
keep_writes_paused="${THE_TEST_KEEP_WRITES_PAUSED:-0}"
lock_dir="${backup_root}/.operation-lock"
lock_acquired=0
paused=0
temporary=""
success=0

valid_uuid() {
  printf '%s' "$1" | grep -Eq '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
}
if [ -n "${created_by}" ] && ! valid_uuid "${created_by}"; then
  echo "invalid created_by" >&2
  exit 2
fi
case "${retain_backup_id}" in
  ""|[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
  *) echo "invalid retained backup id" >&2; exit 2 ;;
esac
case "${keep_writes_paused}" in 0|1) ;; *) echo "invalid write pause option" >&2; exit 2 ;; esac

mysql() {
  mariadb --batch --skip-column-names \
    --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" "$@"
}

resume_writes() {
  [ "${paused}" -eq 1 ] || return 0
  if [ "${keep_writes_paused}" = "1" ]; then
    paused=0
    return 0
  fi
  mysql -e "INSERT INTO system_state (state_key, state_value) VALUES ('writes_paused','0') ON DUPLICATE KEY UPDATE state_value='0', updated_at=UTC_TIMESTAMP(6)" || true
  paused=0
}

cleanup() {
  status=$?
  resume_writes
  if [ "${success}" -ne 1 ] && [ -n "${temporary}" ]; then rm -rf -- "${temporary}" || true; fi
  if [ "${lock_acquired}" -eq 1 ]; then rm -rf -- "${lock_dir}" || true; fi
  trap - EXIT HUP INT TERM
  exit "${status}"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "${backup_root}"
if [ "${THE_TEST_OPERATION_LOCK_HELD:-0}" != "1" ]; then
  if ! mkdir "${lock_dir}" 2>/dev/null; then
    if find "${lock_dir}" -maxdepth 0 -mmin +1440 -print -quit 2>/dev/null | grep -q .; then
      rm -rf -- "${lock_dir}"
      mkdir "${lock_dir}"
    else
      echo "another backup or restore is running" >&2
      exit 75
    fi
  fi
  lock_acquired=1
  date -u +%Y-%m-%dT%H:%M:%SZ > "${lock_dir}/started_at"
fi

# Serialize the pause transition with application write registration.
mysql <<'SQL'
START TRANSACTION;
SELECT state_value INTO @current_write_state FROM system_state WHERE state_key = 'writes_paused' FOR UPDATE;
UPDATE system_state SET state_value = '1', updated_at = UTC_TIMESTAMP(6) WHERE state_key = 'writes_paused';
COMMIT;
SQL
paused=1

# A crashed web process may leave a stale registration. Normal writes remove their row on response.
mysql -e "DELETE FROM active_write_requests WHERE started_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE)"
waited=0
while :; do
  active="$(mysql -e "SELECT COUNT(*) FROM active_write_requests")"
  [ "${active}" = "0" ] && break
  if [ "${waited}" -ge 600 ]; then
    echo "timed out waiting for active writes: ${active}" >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

while :; do
  generation="$(date -u +%Y%m%dT%H%M%SZ)"
  [ ! -e "${backup_root}/${generation}" ] && [ ! -e "${backup_root}/.${generation}.creating" ] && break
  sleep 1
done
temporary="${backup_root}/.${generation}.creating"
destination="${backup_root}/${generation}"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_at_sql="$(date -u '+%Y-%m-%d %H:%M:%S')"
mkdir -p "${temporary}"

mariadb-dump --single-transaction --skip-lock-tables --routines --triggers \
  --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" \
  > "${temporary}/database.sql"
tar -C "${evidence_root}" -czf "${temporary}/evidence.tar.gz" .

file_count="$(find "${evidence_root}" -type f | wc -l | tr -d ' ')"
total_size="$(du -sb "${evidence_root}" | awk '{print $1}')"
schema_version="$(mysql -e "SELECT COALESCE(GROUP_CONCAT(id ORDER BY id SEPARATOR ','), '') FROM schema_migrations WHERE status = 'applied'")"
completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
completed_at_sql="$(date -u '+%Y-%m-%d %H:%M:%S')"
app_version="$(printf '%s' "${APP_VERSION:-unknown}" | tr -cd 'A-Za-z0-9._+-' | cut -c1-100)"
[ -n "${app_version}" ] || app_version="unknown"

cat > "${temporary}/manifest.json" <<MANIFEST
{
  "backup_id": "${generation}",
  "started_at": "${started_at}",
  "completed_at": "${completed_at}",
  "database_file": "database.sql",
  "evidence_file": "evidence.tar.gz",
  "evidence_file_count": ${file_count},
  "evidence_total_bytes": ${total_size},
  "status": "succeeded",
  "app_version": "${app_version}",
  "schema_versions": "${schema_version}"
}
MANIFEST
(cd "${temporary}" && sha256sum database.sql evidence.tar.gz manifest.json > SHA256SUMS)
mv "${temporary}" "${destination}"
temporary=""

created_by_sql="NULL"
if [ -n "${created_by}" ]; then created_by_sql="'${created_by}'"; fi
manifest_sql="$(tr -d '\n\r' < "${destination}/manifest.json" | sed "s/'/''/g")"
mysql -e "INSERT INTO backup_catalog (backup_id, status, manifest_json, created_at, completed_at, created_by) VALUES ('${generation}', 'succeeded', '${manifest_sql}', '${started_at_sql}', '${completed_at_sql}', ${created_by_sql}) ON DUPLICATE KEY UPDATE status='succeeded', manifest_json=VALUES(manifest_json), completed_at=VALUES(completed_at), created_by=VALUES(created_by)"
mysql -e "INSERT INTO audit_logs (id, occurred_at, user_id, username, action, entity_type, entity_id, after_json, success) VALUES (UUID(), UTC_TIMESTAMP(6), ${created_by_sql}, (SELECT username FROM users WHERE id = ${created_by_sql} LIMIT 1), 'backup_completed', 'backup', NULL, '{\"backupId\":\"${generation}\"}', 1)" || true

remove_generation() {
  expired="$1"
  case "${expired}" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z)
      rm -rf -- "${backup_root}/${expired}"
      mysql -e "DELETE FROM backup_catalog WHERE backup_id = '${expired}'" || true
      ;;
  esac
}

# Normally retain the newest two generations. During restore, retain exactly the
# selected source and the newly-created pre-restore generation.
if [ -n "${retain_backup_id}" ]; then
  find "${backup_root}" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' |
  while IFS= read -r expired; do
    [ "${expired}" = "${generation}" ] && continue
    [ "${expired}" = "${retain_backup_id}" ] && continue
    remove_generation "${expired}"
  done
else
  find "${backup_root}" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' | sort -r | awk 'NR > 2' |
  while IFS= read -r expired; do remove_generation "${expired}"; done
fi

success=1
printf '%s\n' "${generation}"
