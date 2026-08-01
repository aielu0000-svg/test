#!/bin/sh
set -eu

backup_root="${BACKUP_ROOT:-/var/lib/the-test/backups}"
evidence_root="${EVIDENCE_STORAGE_PATH:-/var/lib/the-test/evidence}"
generation="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${backup_root}/${generation}"
temporary="${backup_root}/.${generation}.creating"

mkdir -p "${temporary}"
mariadb-dump \
  --single-transaction \
  --skip-lock-tables \
  --host="${DB_HOST}" \
  --port="${DB_PORT:-3306}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  "${DB_NAME}" > "${temporary}/database.sql"

if [ -d "${evidence_root}" ]; then
  tar -C "${evidence_root}" -czf "${temporary}/evidence.tar.gz" .
else
  tar -czf "${temporary}/evidence.tar.gz" --files-from /dev/null
fi

(
  cd "${temporary}"
  sha256sum database.sql evidence.tar.gz > SHA256SUMS
)
mv "${temporary}" "${destination}"

find "${backup_root}" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' \
  | sort -r \
  | awk 'NR > 3' \
  | while IFS= read -r expired; do
      case "${expired}" in
        [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z)
          rm -rf -- "${backup_root:?}/${expired}"
          ;;
      esac
    done

printf '{"ok":true,"generation":"%s"}\n' "${generation}"
