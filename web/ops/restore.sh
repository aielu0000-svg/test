#!/bin/sh
set -eu

backup_id="${1:-}"
requested_by="${2:-}"
backup_root="${BACKUP_STORAGE_PATH:-/backups}"
evidence_root="${BACKUP_EVIDENCE_PATH:-/evidence}"
operations_dir="${OPERATIONS_DIR:-/operations}"
source_dir="${backup_root}/${backup_id}"
lock_dir="${backup_root}/.operation-lock"
lock_acquired=0
paused=0

case "${backup_id}" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
  *) echo "invalid backup id" >&2; exit 2 ;;
esac
valid_uuid() {
  printf '%s' "$1" | grep -Eq '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
}
if [ -n "${requested_by}" ] && ! valid_uuid "${requested_by}"; then
  echo "invalid requested_by" >&2
  exit 2
fi

mysql() {
  mariadb --batch --skip-column-names \
    --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" "$@"
}

resume_writes() {
  [ "${paused}" -eq 1 ] || return 0
  mysql -e "INSERT INTO system_state (state_key, state_value) VALUES ('writes_paused','0') ON DUPLICATE KEY UPDATE state_value='0', updated_at=UTC_TIMESTAMP(6)" || true
  paused=0
}

cleanup() {
  status=$?
  resume_writes
  if [ "${lock_acquired}" -eq 1 ]; then rm -rf -- "${lock_dir}" || true; fi
  trap - EXIT HUP INT TERM
  exit "${status}"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "${backup_root}" "${evidence_root}"
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

# Validate under the shared lock so retention cannot remove the source midway.
[ -d "${source_dir}" ] || { echo "backup directory not found" >&2; exit 1; }
[ -f "${source_dir}/database.sql" ] && [ -f "${source_dir}/evidence.tar.gz" ] && \
[ -f "${source_dir}/manifest.json" ] && [ -f "${source_dir}/SHA256SUMS" ] || {
  echo "backup files are incomplete" >&2; exit 1;
}
(cd "${source_dir}" && sha256sum -c SHA256SUMS)
tar -tzf "${source_dir}/evidence.tar.gz" >/dev/null

# Keep writes paused continuously from the pre-restore rollback backup through
# database and evidence restoration. The child uses the already-held lock.
paused=1
pre_restore_backup="$(
  THE_TEST_OPERATION_LOCK_HELD=1 \
  THE_TEST_KEEP_WRITES_PAUSED=1 \
  THE_TEST_RETAIN_BACKUP_ID="${backup_id}" \
  "${operations_dir}/backup.sh" "${requested_by}" | tail -n 1
)"

# Restore DB and evidence from the same verified generation.
mysql < "${source_dir}/database.sql"
mysql -e "INSERT INTO system_state (state_key, state_value) VALUES ('writes_paused','1') ON DUPLICATE KEY UPDATE state_value='1', updated_at=UTC_TIMESTAMP(6)"
find "${evidence_root}" -mindepth 1 -maxdepth 1 ! -name lost+found -exec rm -rf -- {} +
tar -C "${evidence_root}" -xzf "${source_dir}/evidence.tar.gz"

register_catalog() {
  catalog_id="$1"
  catalog_dir="${backup_root}/${catalog_id}"
  [ -f "${catalog_dir}/manifest.json" ] || return 0
  manifest_sql="$(tr -d '\n\r' < "${catalog_dir}/manifest.json" | sed "s/'/''/g")"
  created_by_sql="NULL"
  if [ -n "${requested_by}" ]; then
    exists="$(mysql -e "SELECT COUNT(*) FROM users WHERE id = '${requested_by}'")"
    [ "${exists}" = "1" ] && created_by_sql="'${requested_by}'"
  fi
  mysql -e "INSERT INTO backup_catalog (backup_id, status, manifest_json, created_at, completed_at, created_by) VALUES ('${catalog_id}', 'succeeded', '${manifest_sql}', STR_TO_DATE('${catalog_id}', '%Y%m%dT%H%i%sZ'), STR_TO_DATE('${catalog_id}', '%Y%m%dT%H%i%sZ'), ${created_by_sql}) ON DUPLICATE KEY UPDATE status='succeeded', manifest_json=VALUES(manifest_json), created_by=VALUES(created_by)"
}
register_catalog "${backup_id}"
register_catalog "${pre_restore_backup}"

resume_writes
printf '%s\t%s\n' "${backup_id}" "${pre_restore_backup}"
