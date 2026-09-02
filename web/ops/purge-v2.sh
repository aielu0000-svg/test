#!/bin/sh
set -eu

evidence_root="${EVIDENCE_STORAGE_PATH:-/var/lib/the-test/evidence}"

mysql() {
  mariadb --batch --skip-column-names \
    --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" "$@"
}

# Commit DB state first. File deletion is retryable through file_cleanup_queue.
mysql < /operations/purge.sql

mysql -e "SELECT CONCAT_WS(CHAR(9), id, stored_path) FROM file_cleanup_queue WHERE status IN ('pending','failed') ORDER BY updated_at, created_at LIMIT 5000" |
while IFS="$(printf '\t')" read -r cleanup_id stored_path; do
  [ -n "${cleanup_id}" ] || continue
  case "${stored_path}" in
    "${evidence_root}"/*)
      if rm -rf -- "${stored_path}"; then
        mysql -e "DELETE FROM file_cleanup_queue WHERE id = '${cleanup_id}'"
      else
        mysql -e "UPDATE file_cleanup_queue SET status='failed', attempts=attempts+1, last_error='filesystem removal failed', updated_at=UTC_TIMESTAMP(6) WHERE id='${cleanup_id}'"
      fi
      ;;
    *)
      mysql -e "UPDATE file_cleanup_queue SET status='failed', attempts=attempts+1, last_error='unsafe path outside evidence root', updated_at=UTC_TIMESTAMP(6) WHERE id='${cleanup_id}'"
      echo "skip unsafe evidence path: ${stored_path}" >&2
      ;;
  esac
done
