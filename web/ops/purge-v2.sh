#!/bin/sh
set -eu

evidence_root="${EVIDENCE_STORAGE_PATH:-/var/lib/the-test/evidence}"

mariadb --batch --skip-column-names \
  --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" \
  -e "SELECT stored_path FROM evidence_versions v JOIN evidence_files e ON e.id = v.evidence_file_id JOIN projects p ON p.id = e.project_id LEFT JOIN run_case_snapshots rc ON rc.id = e.run_case_snapshot_id LEFT JOIN test_runs r ON r.id = rc.test_run_id WHERE e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY) OR r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY) OR p.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 90 DAY)
      UNION SELECT thumbnail_path FROM evidence_versions v JOIN evidence_files e ON e.id = v.evidence_file_id JOIN projects p ON p.id = e.project_id LEFT JOIN run_case_snapshots rc ON rc.id = e.run_case_snapshot_id LEFT JOIN test_runs r ON r.id = rc.test_run_id WHERE thumbnail_path IS NOT NULL AND (e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY) OR r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY) OR p.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 90 DAY))" \
  | while IFS= read -r stored_path; do
      case "${stored_path}" in
        "${evidence_root}"/*) rm -f -- "${stored_path}" ;;
        *) echo "skip unsafe evidence path: ${stored_path}" >&2 ;;
      esac
    done

mariadb \
  --host="${DB_HOST}" --port="${DB_PORT:-3306}" --user="${DB_USER}" --password="${DB_PASSWORD}" "${DB_NAME}" \
  < /operations/purge.sql



