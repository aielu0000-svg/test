#!/bin/sh
set -eu

operations_dir="${OPERATIONS_DIR:-/operations}"
temporary=""

mysql() {
  mariadb --batch --skip-column-names \
    --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" "$@"
}

valid_uuid() {
  printf '%s' "$1" | grep -Eq '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
}

valid_backup_id() {
  printf '%s' "$1" | grep -Eq '^[0-9]{8}T[0-9]{6}Z$'
}

cleanup() {
  status=$?
  [ -z "${temporary}" ] || rm -rf -- "${temporary}" || true
  trap - EXIT HUP INT TERM
  exit "${status}"
}
trap cleanup EXIT HUP INT TERM

# Claim exactly one request in a single MariaDB session. CronJob concurrency is
# forbidden, and the row lock also protects against an accidental second worker.
claimed="$({ mysql 2>/dev/null || true; } <<'SQL'
START TRANSACTION;
SET @operation_id := NULL;
SELECT id INTO @operation_id
  FROM operation_requests
 WHERE status = 'pending'
 ORDER BY requested_at
 LIMIT 1
 FOR UPDATE;
UPDATE operation_requests
   SET status = 'running', started_at = UTC_TIMESTAMP(6), completed_at = NULL,
       output_json = NULL, error_message = NULL
 WHERE id = @operation_id AND status = 'pending';
SELECT CONCAT_WS(CHAR(9), id, operation_type, COALESCE(backup_id, ''), requested_by,
                 DATE_FORMAT(requested_at, '%Y-%m-%d %H:%i:%s.%f'))
  FROM operation_requests
 WHERE id = @operation_id AND status = 'running';
COMMIT;
SQL
)"

[ -n "${claimed}" ] || exit 0
old_ifs=${IFS}
IFS="$(printf '\t')"
set -- ${claimed}
IFS=${old_ifs}
operation_id="${1:-}"
operation_type="${2:-}"
backup_id="${3:-}"
requested_by="${4:-}"
requested_at="${5:-}"

valid_uuid "${operation_id}" || { echo "invalid operation id" >&2; exit 2; }
valid_uuid "${requested_by}" || { echo "invalid requested_by" >&2; exit 2; }
case "${operation_type}" in backup|restore) ;; *) echo "invalid operation type" >&2; exit 2 ;; esac
if [ "${operation_type}" = "restore" ]; then
  valid_backup_id "${backup_id}" || { echo "invalid backup id" >&2; exit 2; }
fi
case "${requested_at}" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\ [0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9][0-9][0-9][0-9]) ;;
  *) echo "invalid requested timestamp" >&2; exit 2 ;;
esac

temporary="$(mktemp -d)"
stdout_file="${temporary}/stdout"
stderr_file="${temporary}/stderr"

run_status=0
if [ "${operation_type}" = "backup" ]; then
  "${operations_dir}/backup.sh" "${requested_by}" >"${stdout_file}" 2>"${stderr_file}" || run_status=$?
else
  "${operations_dir}/restore.sh" "${backup_id}" "${requested_by}" >"${stdout_file}" 2>"${stderr_file}" || run_status=$?
fi

if [ "${run_status}" -eq 0 ]; then
  result_line="$(tail -n 1 "${stdout_file}")"
  if [ "${operation_type}" = "backup" ]; then
    result_backup_id="${result_line}"
    if ! valid_backup_id "${result_backup_id}"; then
      printf '%s\n' "invalid backup result" >"${stderr_file}"
      run_status=1
    else
      output_json="{\"backupId\":\"${result_backup_id}\"}"
    fi
  else
    result_old_ifs=${IFS}
    IFS="$(printf '\t')"
    set -- ${result_line}
    IFS=${result_old_ifs}
    restored_backup_id="${1:-}"
    pre_restore_backup_id="${2:-}"
    if ! valid_backup_id "${restored_backup_id}" || ! valid_backup_id "${pre_restore_backup_id}"; then
      printf '%s\n' "invalid restore result" >"${stderr_file}"
      run_status=1
    else
      output_json="{\"restoredBackupId\":\"${restored_backup_id}\",\"preRestoreBackupId\":\"${pre_restore_backup_id}\"}"
    fi
  fi
fi

if [ "${run_status}" -eq 0 ]; then
  # Restore replaces the database, so use an upsert rather than assuming the
  # operation row from the pre-restore database still exists.
  mysql -e "INSERT INTO operation_requests (id, operation_type, backup_id, status, requested_by, requested_at, started_at, completed_at, output_json, error_message) VALUES ('${operation_id}', '${operation_type}', NULLIF('${backup_id}', ''), 'succeeded', '${requested_by}', '${requested_at}', '${requested_at}', UTC_TIMESTAMP(6), '${output_json}', NULL) ON DUPLICATE KEY UPDATE status='succeeded', completed_at=UTC_TIMESTAMP(6), output_json=VALUES(output_json), error_message=NULL"
  mysql -e "INSERT INTO audit_logs (id, occurred_at, user_id, username, action, entity_type, entity_id, after_json, success) VALUES (UUID(), UTC_TIMESTAMP(6), '${requested_by}', (SELECT username FROM users WHERE id='${requested_by}' LIMIT 1), 'operation_completed', 'operation_request', '${operation_id}', '${output_json}', 1)" || true
  exit 0
fi

error_base64="$(cat "${stderr_file}" "${stdout_file}" | head -c 60000 | base64 | tr -d '\n')"
mysql -e "INSERT INTO operation_requests (id, operation_type, backup_id, status, requested_by, requested_at, started_at, completed_at, output_json, error_message) VALUES ('${operation_id}', '${operation_type}', NULLIF('${backup_id}', ''), 'failed', '${requested_by}', '${requested_at}', '${requested_at}', UTC_TIMESTAMP(6), NULL, LEFT(CONVERT(FROM_BASE64('${error_base64}') USING utf8mb4), 65535)) ON DUPLICATE KEY UPDATE status='failed', completed_at=UTC_TIMESTAMP(6), output_json=NULL, error_message=VALUES(error_message)"
mysql -e "INSERT INTO audit_logs (id, occurred_at, user_id, username, action, entity_type, entity_id, after_json, success, error_code) VALUES (UUID(), UTC_TIMESTAMP(6), '${requested_by}', (SELECT username FROM users WHERE id='${requested_by}' LIMIT 1), 'operation_failed', 'operation_request', '${operation_id}', '{\"operationType\":\"${operation_type}\"}', 0, 'OPERATION_FAILED')" || true
# The request is durably marked failed. Do not make Kubernetes retry the same request.
exit 0
