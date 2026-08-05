# OpenShift deployment

## Included resources

`oc apply -k web` renders and applies the following resources.

- Binary Docker `BuildConfig` and `ImageStream`
- OpenShift-compatible Web image running with an arbitrary UID
- MariaDB 10.11 `StatefulSet` using the Red Hat unprivileged image
- Web `Deployment`, `Service`, edge-terminated HTTPS `Route`
- Evidence, MariaDB and backup PVCs
- Startup, readiness and liveness probes
- NetworkPolicies for Route-to-Web and application-to-MariaDB traffic
- Daily backup and retention CronJobs

The deployment uses one Web replica and `Recreate` strategy because schema migration runs during application startup. Evidence and backup storage use `ReadWriteMany`; select a storage class that supports RWX or patch the claims for the cluster storage design.

## Prerequisites

- OpenShift project selected with `oc project <namespace>`
- Permission to create BuildConfig, ImageStream, StatefulSet, Deployment, Route, PVC, CronJob and NetworkPolicy resources
- Cluster pull secret able to pull `registry.redhat.io/rhel9/mariadb-1011:1`
- RWX storage class for evidence and backups, and RWO storage for MariaDB
- `oc` CLI logged in

No `anyuid` SCC grant is required. Do not add the service account to `anyuid` or `privileged` for this deployment.

## Deploy from the local source tree

Set secrets in the shell. They are passed directly to `oc create secret` and are not written to a repository file.

```bash
export DB_PASSWORD='replace-with-a-long-random-value'
export MARIADB_ROOT_PASSWORD='replace-with-another-long-random-value'
export INITIAL_ADMIN_USERNAME='admin'
export INITIAL_ADMIN_PASSWORD='replace-with-initial-admin-password'

bash web/scripts/openshift/deploy.sh
```

The script performs a binary Docker build in OpenShift, creates or updates Secrets, applies the manifests, waits for MariaDB and Web rollout, and prints the HTTPS Route URL.

After the initial administrator signs in and changes the password, rotate or remove `INITIAL_ADMIN_PASSWORD` from `the-test-admin`. It is only used when no user exists.

## Manual deployment

```bash
oc create secret generic the-test-db \
  --from-literal=DB_PASSWORD='...' \
  --from-literal=MARIADB_ROOT_PASSWORD='...'

oc create secret generic the-test-admin \
  --from-literal=INITIAL_ADMIN_USERNAME='admin' \
  --from-literal=INITIAL_ADMIN_PASSWORD='...'

oc apply -f web/openshift-build.yaml
oc start-build the-test-web --from-dir=. --follow --wait
oc apply -k web
oc rollout status statefulset/mariadb --timeout=10m
oc rollout status deployment/the-test-web --timeout=10m
oc get route the-test-web
```

`web/openshift-secrets.example.yaml` is a reference only and is not included in Kustomize. Do not apply it without replacing every placeholder.

## Storage customization

Inspect available storage classes before deployment.

```bash
oc get storageclass
```

Set `storageClassName` and required sizes in `openshift.yaml` and `openshift-operations.yaml` when the default class does not provide the required access mode. The default requests are:

- Evidence: 100 GiB, RWX
- Backup: 150 GiB, RWX
- MariaDB: 20 GiB, RWO

The backup CronJob retains the latest three completed backup directories. The retention job uses the checked-in purge script and SQL.

## External MariaDB

To use a managed or externally operated MariaDB, remove the MariaDB StatefulSet, Service and `mariadb-data` PVC from the rendered resources, then patch `the-test-config` with the external `DB_HOST`, `DB_PORT`, `DB_NAME` and `DB_USER`. Keep `DB_PASSWORD` in `the-test-db`.

## Operational checks

```bash
oc get pods,pvc,route
oc logs deployment/the-test-web
oc logs statefulset/mariadb
oc get cronjob
oc create job --from=cronjob/the-test-daily-backup backup-manual-$(date +%s)
oc get route the-test-web -o jsonpath='https://{.spec.host}{"\n"}'
```

The Web container root filesystem is read-only. `/tmp` is an `emptyDir`, and evidence is written only to `/var/lib/the-test/evidence` on the PVC. `TRUST_PROXY=true` is enabled because requests arrive through the OpenShift router; this preserves client-IP-based login rate limiting.
