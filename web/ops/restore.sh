#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: restore.sh YYYYMMDDTHHMMSSZ" >&2
  exit 2
fi

generation="$1"
case "${generation}" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
  *) echo "invalid generation" >&2; exit 2 ;;
esac

backup_root="${BACKUP_ROOT:-/var/lib/the-test/backups}"
evidence_root="${EVIDENCE_STORAGE_PATH:-/var/lib/the-test/evidence}"
source="${backup_root}/${generation}"

test -f "${source}/database.sql"
test -f "${source}/evidence.tar.gz"
(
  cd "${source}"
  sha256sum -c SHA256SUMS
)

mariadb \
  --host="${DB_HOST}" \
  --port="${DB_PORT:-3306}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  "${DB_NAME}" < "${source}/database.sql"

mkdir -p "${evidence_root}"
tar -C "${evidence_root}" -xzf "${source}/evidence.tar.gz"
printf '{"ok":true,"restored_generation":"%s"}\n' "${generation}"
