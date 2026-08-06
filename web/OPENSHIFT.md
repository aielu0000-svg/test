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
- Daily backup, queued manual operation worker, and retention CronJobs

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
- Backup: 220 GiB, RWX
- MariaDB: 20 GiB, RWO

The backup CronJob runs at 02:00 Asia/Tokyo and retains two completed backup directories. The operation worker processes administrator-requested backups and restores. The retention job commits database deletion first and removes files through the retryable cleanup queue.

## External MariaDB

To use a managed or externally operated MariaDB, remove the MariaDB StatefulSet, Service and `mariadb-data` PVC from the rendered resources, then patch `the-test-config` with the external `DB_HOST`, `DB_PORT`, `DB_NAME` and `DB_USER`. Keep `DB_PASSWORD` in `the-test-db`.

## Operational checks

```bash
oc get pods,pvc,route
oc logs deployment/the-test-web
oc logs statefulset/mariadb
oc get cronjob
oc create job --from=cronjob/the-test-daily-backup backup-manual-$(date +%s)
oc logs cronjob/the-test-operation-worker
oc get route the-test-web -o jsonpath='https://{.spec.host}{"\n"}'
```

The Web container root filesystem is read-only. `/tmp` is an `emptyDir`, and evidence is written only to `/var/lib/the-test/evidence` on the PVC. `TRUST_PROXY=true` is enabled because requests arrive through the OpenShift router; this preserves client-IP-based login rate limiting.

# 日本語

### OpenShiftリソース

以下を追加・更新しました。

* `BuildConfig`
* `ImageStream`
* Web `Deployment`
* Web `Service`
* HTTPS `Route`
* MariaDB 10.11 `StatefulSet`
* MariaDB用ヘッドレス`Service`
* Web、MariaDB、証跡、バックアップ用PVC
* `ConfigMap`
* `Secret`運用
* `NetworkPolicy`
* startup、readiness、liveness probe
* CPU・メモリーrequests／limits
* 日次バックアップCronJob
* 保持期限処理CronJob
* バックアップ最新3世代保持

Routeはedge TLS終端とHTTPからHTTPSへのリダイレクトを設定しています。([Red Hat Documentation][2])

MariaDBはRed Hat RegistryのMariaDB 10.11イメージを使用する構成です。([Red Hat Ecosystem Catalog][3])

### アプリ側対応

OpenShift Router配下で正しく動くよう、次も対応しました。

* `TRUST_PROXY=true`
* Secure Cookie有効化
* Router転送ヘッダーによるクライアントIP取得
* `SIGTERM`／`SIGINT`時にHTTPサーバーとDB接続を終了
* 起動時Migration
* Migration競合を避けるためWebは1 replica・`Recreate`戦略
* ServiceAccount tokenの自動マウントを無効化
* capabilityをすべてdrop
* seccomp `RuntimeDefault`

## デプロイ方法

まずブランチを取得します。

```bash
cd ~/dev/the-test
git switch agent/folder-explorer-p2
git pull --ff-only
```

OpenShiftへログインし、対象プロジェクトを選択します。

```bash
oc login https://api.example.openshift.com:6443
oc project <namespace>
```

Secret値を環境変数へ設定します。

```bash
export DB_PASSWORD='十分に長いDBパスワード'
export MARIADB_ROOT_PASSWORD='別の十分に長いrootパスワード'
export INITIAL_ADMIN_USERNAME='admin'
export INITIAL_ADMIN_PASSWORD='初期管理者パスワード'
```

デプロイスクリプトを実行します。

```bash
bash web/scripts/openshift/deploy.sh
```

このスクリプトは以下を実行します。

1. OpenShift Secretの作成・更新
2. `BuildConfig`と`ImageStream`の作成
3. ローカルソースをOpenShiftへ送ってコンテナをビルド
4. Kustomizeマニフェストの適用
5. MariaDBとWebの起動待機
6. HTTPS RouteのURL表示

Secret値はリポジトリファイルへ保存しません。詳細な手動手順、外部MariaDBを使用する場合の変更方法、運用確認コマンドも記載済みです。

## クラスター側の前提

デプロイ前に次を確認してください。

* `registry.redhat.io/rhel9/mariadb-1011:1`をpullできること
* 証跡用にRWX対応StorageClassがあること
* バックアップ用にRWX対応StorageClassがあること
* MariaDB用にRWO対応StorageClassがあること
* `BuildConfig`、`ImageStream`、`StatefulSet`、`Route`、`PVC`、`CronJob`、`NetworkPolicy`を作成できる権限があること

既定容量は以下です。

| 用途      |      容量 | Access Mode |
| ------- | ------: | ----------- |
| 証跡      | 100 GiB | RWX         |
| バックアップ  | 150 GiB | RWX         |
| MariaDB |  20 GiB | RWO         |

クラスターのStorageClassに合わせ、必要に応じて`storageClassName`と容量を変更してください。

### PV作成
```bash
cat > the-test-nfs-pv.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: test-manage-the-test-evidence
spec:
  capacity:
    storage: 100Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  mountOptions:
    - vers=3
    - hard
    - timeo=600
    - retrans=2
    - rsize=1048576
    - wsize=1048576
  claimRef:
    namespace: test-manage
    name: the-test-evidence
  nfs:
    server: 10.224.0.10
    path: /exports/test-manage/evidence
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: test-manage-the-test-backups
spec:
  capacity:
    storage: 150Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  mountOptions:
    - vers=3
    - hard
    - timeo=600
    - retrans=2
    - rsize=1048576
    - wsize=1048576
  claimRef:
    namespace: test-manage
    name: the-test-backups
  nfs:
    server: 10.224.0.10
    path: /exports/test-manage/backups
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: test-manage-mariadb-data
spec:
  capacity:
    storage: 20Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  mountOptions:
    - vers=3
    - hard
    - timeo=600
    - retrans=2
    - rsize=1048576
    - wsize=1048576
  claimRef:
    namespace: test-manage
    name: mariadb-data
  nfs:
    server: 10.224.0.10
    path: /exports/test-manage/mariadb
EOF

oc apply -f the-test-nfs-pv.yaml

```
