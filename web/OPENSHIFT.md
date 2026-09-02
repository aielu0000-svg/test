# OpenShift 配備手順

この文書は、現在の `web/` 配備定義を使って The Test を OpenShift へ新規配備・更新するための実行手順です。

実際のSecret値、社内のホスト名、StorageClass名、NFSサーバー名/IP/パスなど環境固有情報は、このリポジトリへ保存しません。

## 1. 配備される構成

`oc apply -k web` で主に次を適用します。

- Binary Docker `BuildConfig` / `ImageStream`
- Web `Deployment` / `Service` / HTTPS `Route`
- MariaDB 10.11 `StatefulSet` / headless `Service`
- 証跡、MariaDB、バックアップ用PVC
- Web/MariaDB用 `ConfigMap` / `Secret` 参照
- startup / readiness / liveness probe
- Route→Web、Web→MariaDB の `NetworkPolicy`
- 日次バックアップ、手動操作worker、保持期限処理の `CronJob`

Webは **1 replica + `Recreate`** です。アプリ起動時にDB Migrationとschema validationを実行するため、複数Podで同時起動する前提にはしていません。

既定のストレージ要求は次のとおりです。

| 用途 | 容量 | Access Mode |
|---|---:|---|
| 証跡 | 100 GiB | RWX (`ReadWriteMany`) |
| バックアップ | 220 GiB | RWX (`ReadWriteMany`) |
| MariaDB | 20 GiB | RWO (`ReadWriteOnce`) |

バックアップは通常 **正常2世代** を保持します。

## 2. 事前条件

### CLI・権限

- `oc` CLIで対象クラスターへログイン済みであること
- 配備先project/namespaceを選択できること
- 次のリソースを作成・更新できること
  - `BuildConfig`
  - `ImageStream`
  - `StatefulSet`
  - `Deployment`
  - `Service`
  - `Route`
  - `PVC`
  - `CronJob` / `Job`
  - `ConfigMap` / `Secret`
  - `NetworkPolicy`
- `registry.redhat.io/rhel9/mariadb-1011:1` をpullできること

権限確認例:

```bash
oc auth can-i create buildconfig
oc auth can-i create imagestream
oc auth can-i create statefulset
oc auth can-i create deployment
oc auth can-i create route
oc auth can-i create persistentvolumeclaim
oc auth can-i create cronjob
oc auth can-i create networkpolicy
```

この構成のために `anyuid` や `privileged` SCCを付与しないでください。Webコンテナは任意UID、read-only root filesystemで動作する前提です。

### ストレージ

最初に利用可能なStorageClassを確認します。

```bash
oc get storageclass
```

- 証跡とバックアップにはRWXを提供できるストレージが必要です。
- MariaDBにはRWOストレージが必要です。
- デフォルトStorageClassが必要なAccess Modeを提供しない場合は、クラスター用Kustomize overlay/patchで `storageClassName` を指定してください。
- 静的PVやNFSを使う場合のサーバー、export path、mount option、reclaim policyはクラスター管理者と決めてください。環境固有の固定IP・固定パスをこのリポジトリへ書き込みません。

適用前にrender結果を確認できます。

```bash
oc kustomize web > /tmp/the-test-openshift.yaml
```

## 3. 配備対象ソースを固定する

配備時は「現在たまたま開いているbranch」ではなく、配備するcommitまたはtagを明示してください。

```bash
cd /path/to/the-test
git fetch --all --prune
git switch --detach <deploy-ref>
git rev-parse HEAD
```

`<deploy-ref>` にはレビュー・CI確認済みのcommit SHAまたはtagを指定します。

## 4. Secretを準備する

`web/scripts/openshift/deploy.sh` は次の環境変数を必須とします。

- `DB_PASSWORD`
- `MARIADB_ROOT_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`

`INITIAL_ADMIN_USERNAME` は省略すると `admin` です。

新規環境では、組織のSecret管理方法に従って十分に強い値を用意します。

```bash
export DB_PASSWORD='<db-password>'
export MARIADB_ROOT_PASSWORD='<mariadb-root-password>'
export INITIAL_ADMIN_USERNAME='admin'
export INITIAL_ADMIN_PASSWORD='<initial-admin-password>'
```

実値をshell history、Markdown、YAML、Issue、PR本文へ貼り付けないでください。`web/openshift-secrets.example.yaml` はキー名確認用であり、実Secretファイルとして適用・commitしません。

既存環境を更新する場合は、DB実体と現在のSecretが不一致にならないよう **既存のDBパスワードを意図なく変更しない** でください。必要ならSecret managerまたは現在のOpenShift Secretから値を安全に取得して環境変数へ設定します。

例（値を標準出力へ表示しない）:

```bash
export DB_PASSWORD="$(oc get secret the-test-db -o jsonpath='{.data.DB_PASSWORD}' | base64 -d)"
export MARIADB_ROOT_PASSWORD="$(oc get secret the-test-db -o jsonpath='{.data.MARIADB_ROOT_PASSWORD}' | base64 -d)"
export INITIAL_ADMIN_USERNAME="$(oc get secret the-test-admin -o jsonpath='{.data.INITIAL_ADMIN_USERNAME}' | base64 -d)"
export INITIAL_ADMIN_PASSWORD="$(oc get secret the-test-admin -o jsonpath='{.data.INITIAL_ADMIN_PASSWORD}' | base64 -d)"
```

## 5. 新規配備

### 5.1 OpenShiftへログイン・project選択

```bash
oc login <cluster-api-url>
oc project <namespace>
```

現在の対象を確認します。

```bash
oc project
```

### 5.2 配備スクリプトを実行

Repository rootから実行します。

```bash
bash web/scripts/openshift/deploy.sh
```

スクリプトは次の順に処理します。

1. `the-test-db` Secretを作成/更新
2. `the-test-admin` Secretを作成/更新
3. `web/openshift-build.yaml` の `BuildConfig` / `ImageStream` を適用
4. ローカルsource treeをBinary Buildへ送信し、`the-test-web:latest` をbuild
5. `oc apply -k web` でアプリ、DB、PVC、Route、CronJob、NetworkPolicy等を適用
6. MariaDB `StatefulSet` rollout完了を待機
7. Web `Deployment` rollout完了を待機
8. HTTPS Route URLを表示

### 5.3 配備直後の確認

```bash
oc get pods
oc get pvc
oc get route the-test-web
oc get cronjob
oc rollout status statefulset/mariadb --timeout=10m
oc rollout status deployment/the-test-web --timeout=10m
```

PVCはすべて `Bound`、Web/MariaDB PodはReadyになっていることを確認します。

HTTP endpointを確認します。

```bash
ROUTE_URL="https://$(oc get route the-test-web -o jsonpath='{.spec.host}')"
curl -fsS "$ROUTE_URL/healthz"
curl -fsS "$ROUTE_URL/readyz"
```

- `/healthz`: HTTPプロセスの生存確認
- `/readyz`: DB Migrationとschema validationを含め、利用可能状態になったことの確認

## 6. 初回ログイン・管理者運用ガイド

### 6.1 初回ログイン確認

1. `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` でログインする
2. 初回パスワード変更を完了する
3. ダッシュボードが表示されることを確認する
4. 初回利用ガイドが表示されることを確認する
5. 任意のプロジェクトを開き、ガイドを最後まで進められることを確認する
6. 再ログイン時に完了済みガイドが再表示されないことを確認する

初期管理者Secretはユーザーが1人も存在しないときのbootstrap用です。既存ユーザーのパスワードを再設定する用途ではありません。

初回構築後は、組織のSecret運用に従って `the-test-admin` のbootstrapパスワード値を新しいランダム値へローテーションし、必要ならWebを再起動してください。Secret自体を削除するとPodの `envFrom` 参照が成立しなくなるため、削除ではなくローテーションを基本とします。

```bash
oc rollout restart deployment/the-test-web
oc rollout status deployment/the-test-web --timeout=10m
```

配備作業後はローカルshellのSecret環境変数を解除します。

```bash
unset DB_PASSWORD MARIADB_ROOT_PASSWORD INITIAL_ADMIN_USERNAME INITIAL_ADMIN_PASSWORD
```

### 6.2 ユーザー管理ガイド

ユーザー管理は管理者だけが実施できます。画面上部の **「ユーザー管理」** を開いて操作します。

#### ユーザーを作成する

1. **「＋ ユーザー作成」** を押す
2. ユーザー名を入力する
3. 必要なら表示名を入力する
4. 権限を **実行者** または **管理者** から選ぶ
5. 仮パスワードと確認入力を設定する
6. **「作成」** を押す

仮パスワードは4文字以上です。作成されたユーザーは、初回ログイン時に本人がパスワードを変更する必要があります。

#### ユーザー情報・利用状態を変更する

対象ユーザーの **「編集」** から、次を変更できます。

- ユーザー名
- 表示名
- 権限（管理者 / 実行者）
- アカウントの有効 / 無効

自分自身を無効化することはできません。また、最後の有効な管理者を無効化または実行者へ変更することはできません。

#### パスワードを再設定する

1. 対象ユーザーの **「パスワード再設定」** を押す
2. 新しい仮パスワードと確認入力を設定する
3. **「設定」** を押す

再設定後は対象ユーザーの既存セッションが破棄され、次回ログイン時に本人がパスワードを変更する必要があります。bootstrap用の `INITIAL_ADMIN_PASSWORD` を既存ユーザーの再設定には使いません。

#### ロックを解除する

ログイン失敗などで **「ロック中」** になっているユーザーには **「ロック解除」** が表示されます。本人確認や誤入力の状況を確認した後に解除してください。

#### プロジェクトを割り当てる / 解除する

画面下部の **「ユーザーへのプロジェクト割当」** では、複数ユーザーと複数プロジェクトをまとめて処理できます。

1. 有効なユーザーを1人以上選ぶ
2. 有効なプロジェクトを1件以上選ぶ
3. **「選択内容を割り当て」** または **「選択内容を解除」** を押す
4. 処理件数と結果メッセージを確認する

権限の基本は次のとおりです。

- **管理者**: ユーザー・プロジェクト・割当を管理し、すべてのプロジェクトを編集できる
- **実行者**: 割り当てられたプロジェクトを編集し、テストを実行できる
- **未割当プロジェクト**: 実行者は閲覧のみ

新規ユーザー作成後は、そのユーザーでログインし、初回パスワード変更、対象プロジェクトの表示、編集権限が意図どおりか確認してください。

### 6.3 バックアップ・復元ガイド

バックアップと復元は管理者だけが実施できます。画面上部の **「バックアップ・復元」** を開きます。

#### 手動バックアップを要求する

1. 保留中または実行中の運用要求がないことを確認する
2. **「手動バックアップ」** を押す
3. 「運用要求」でバックアップが処理待ち → 処理中 → 成功へ進むことを確認する
4. 「バックアップ世代」に成功したバックアップIDが追加されることを確認する

手動要求は `operation_requests` に登録され、`the-test-operation-worker` が通常2分間隔で処理します。

#### 復元を要求する

復元はDBと証跡を置き換える操作です。対象バックアップ、影響範囲、アプリとのschema互換性を確認してから実施してください。

1. **成功済み** のバックアップ世代から復元対象を選ぶ
2. 選択したバックアップIDを控える
3. 「確認のためバックアップIDを入力」へ **完全一致** で入力する
4. 保留中または実行中の別の運用要求がないことを確認する
5. **「復元を要求」** を押す
6. 「運用要求」で復元が処理待ち → 処理中 → 成功へ進むことを確認する

workerは復元元を検証した後、現在状態を自動バックアップしてから更新を停止し、DBと証跡を **同じバックアップID** から復元します。復元後は、復元元と復元前退避の2世代を保持します。要求、開始、終了、失敗、復元元、復元前退避世代はDBと監査ログへ記録されます。

復元中は更新操作が一時停止されます。処理状態は画面の「運用要求」とOpenShift側のworkerログの両方で確認できます。

```bash
oc get cronjob,job,pod,pvc
oc logs cronjob/the-test-operation-worker
```

失敗した場合は同じ復元要求を連続で再実行せず、まず運用要求のエラー内容とworkerログを確認してください。

復元成功後は次を確認します。

```bash
ROUTE_URL="https://$(oc get route the-test-web -o jsonpath='{.spec.host}')"
curl -fsS "$ROUTE_URL/healthz"
curl -fsS "$ROUTE_URL/readyz"
```

さらに画面で、ログイン、対象プロジェクト、テスト設計・実行結果、証跡が期待した世代へ戻っていることを確認します。アプリ更新やDB Migrationをまたいで復元した場合は、後述のロールバック方針に従い、復元したschemaと互換なアプリversionを使用してください。

復元の正本となる意味論は `web/OPERATIONS.md` です。

## 7. 既存環境のアップグレード

DB Migrationを含む更新では、先にバックアップを取得してからWebを更新します。

### 7.1 現在状態を確認

```bash
oc get pods,pvc,route,cronjob
oc rollout status statefulset/mariadb --timeout=10m
oc rollout status deployment/the-test-web --timeout=10m
```

現在の `/readyz` が成功することを確認します。

### 7.2 配備前バックアップを作成

日次バックアップCronJobから一時Jobを作ります。

```bash
JOB="the-test-predeploy-$(date +%s)"
oc create job --from=cronjob/the-test-daily-backup "$JOB"
oc wait --for=condition=complete "job/$JOB" --timeout=30m
oc logs "job/$JOB"
```

Job失敗時は更新を続行せず、原因を解消してください。

バックアップはDB dump、証跡archive、manifest、checksumを同一世代として扱います。通常保持は正常2世代です。

### 7.3 新しいsourceを固定して配備

```bash
git fetch --all --prune
git switch --detach <new-deploy-ref>
git rev-parse HEAD
```

既存環境のSecret値を準備した後、同じ配備スクリプトを使います。

```bash
bash web/scripts/openshift/deploy.sh
```

Webは `Recreate` のため、更新中に短い停止時間が発生します。

新しいWeb Podは起動時に次を順番に実行します。

1. DB接続
2. 未適用Migrationの適用
3. schema validation
4. 初期管理者の存在確認
5. HTTP server起動

今回の初回利用ガイド用 `014_user_onboarding.sql` もこの起動Migrationで適用されます。適用済みMigrationファイルは編集・差し替えません。

### 7.4 更新後確認

```bash
oc rollout status deployment/the-test-web --timeout=10m
oc logs deployment/the-test-web --tail=200
ROUTE_URL="https://$(oc get route the-test-web -o jsonpath='{.spec.host}')"
curl -fsS "$ROUTE_URL/healthz"
curl -fsS "$ROUTE_URL/readyz"
```

さらに画面で次を確認します。

- ログインできる
- 既存プロジェクトを開ける
- テスト設計・実行画面を開ける
- 証跡を参照できる
- 管理者画面からバックアップ一覧を確認できる

## 8. ロールバック方針

Migration適用後の障害では、コンテナだけ以前へ戻せば安全とは限りません。DB schemaとアプリの互換性を必ず確認してください。

- 適用済みMigrationファイルを編集・削除して巻き戻さない
- Migration適用済みなのに `oc rollout undo` だけで旧アプリへ戻す運用を標準手順にしない
- DB変更を伴う更新で復旧が必要な場合は、配備前に取得したバックアップと `web/OPERATIONS.md` のrestore手順を使い、DB・証跡を同一世代へ戻した後、そのschemaと互換なアプリを配備する
- DB変更が発生していない障害でも、旧イメージへ戻す前に現在schemaとの互換性を確認する

復元操作はデータを置き換えるため、対象世代・影響範囲を確認してから管理者権限で実施してください。

## 9. 定常運用

既定scheduleは次のとおりです。

| 処理 | CronJob | Schedule |
|---|---|---|
| 日次バックアップ | `the-test-daily-backup` | 毎日 02:00 Asia/Tokyo |
| 手動バックアップ/復元worker | `the-test-operation-worker` | 2分ごと |
| 保持期限処理 | `the-test-retention` | 毎日 03:30 Asia/Tokyo |

確認例:

```bash
oc get cronjob
oc get jobs --sort-by=.metadata.creationTimestamp
oc logs cronjob/the-test-daily-backup
oc logs cronjob/the-test-operation-worker
oc logs cronjob/the-test-retention
```

手動バックアップ・復元の意味論、保持世代、復元前バックアップ、監査については `web/OPERATIONS.md` を正本とします。

## 10. トラブルシューティング

### PVCがPending

```bash
oc get pvc
oc describe pvc <pvc-name>
oc get storageclass
```

Access Mode、StorageClass、quota、容量を確認します。RWXが必要なPVCへRWOのみのStorageClassを割り当てないでください。

### MariaDB imageをpullできない

```bash
oc describe pod -l app.kubernetes.io/name=mariadb
```

Red Hat Registry entitlement / pull secret / network到達性を確認します。

### Web buildが失敗

```bash
oc get builds
oc logs build/<build-name>
```

Binary Buildへ送っているsourceが意図したcommitか `git rev-parse HEAD` と照合します。

### WebがReadyにならない

```bash
oc get pods
oc describe pod -l app.kubernetes.io/name=the-test
oc logs deployment/the-test-web --tail=300
oc logs statefulset/mariadb --tail=300
```

特にDB接続、Migration、schema validation、Secret不足、PVC mountを確認します。

### Routeへ接続できない

```bash
oc get route the-test-web
oc get service the-test-web
oc get endpoints the-test-web
oc get networkpolicy
```

Web Podのreadinessが成功していることも確認します。

## 11. 外部MariaDBを使う場合

管理MariaDB等を使う場合は、クラスター用overlayで次を変更します。

- 内蔵MariaDB `StatefulSet` / `Service` / `mariadb-data` PVCを対象から外す
- `the-test-config` の `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` を外部DBへ向ける
- `DB_PASSWORD` は `the-test-db` Secretで管理する
- 外部DB側でアプリユーザーの権限、接続元NetworkPolicy/Firewall、backup責任分界を確認する

base manifestを環境固有値で直接上書きするより、環境別overlayで差分を管理してください。

## 12. Go-liveチェックリスト

- [ ] 配備対象commit/tagを記録した
- [ ] 対象OpenShift project/namespaceを確認した
- [ ] Secret値をリポジトリへ保存していない
- [ ] `registry.redhat.io` からMariaDB imageをpullできる
- [ ] evidence 100Gi RWXのPVCがBound
- [ ] backup 220Gi RWXのPVCがBound
- [ ] MariaDB 20Gi RWOのPVCがBound
- [ ] MariaDB StatefulSetがReady
- [ ] Web DeploymentがReady
- [ ] `/healthz` が成功
- [ ] `/readyz` が成功
- [ ] HTTPS Routeからログインできる
- [ ] 初回管理者のパスワード変更を完了した
- [ ] 初回利用ガイドを確認した
- [ ] ユーザー作成・権限・プロジェクト割当の運用手順を確認した
- [ ] 手動バックアップJobが成功する
- [ ] 管理画面から復元対象・確認ID・運用要求の確認方法を把握した
- [ ] 日次backup / operation worker / retention CronJobを確認した
- [ ] 障害時に使う配備前バックアップ世代を把握した

## 関連ファイル

- `web/scripts/openshift/deploy.sh`: Secret作成、binary build、manifest適用、rollout待機
- `web/openshift-build.yaml`: `BuildConfig` / `ImageStream`
- `web/openshift.yaml`: Web、MariaDB、Route、基本PVC、NetworkPolicy
- `web/openshift-operations.yaml`: backup PVC、日次backup、operation worker
- `web/openshift-retention.yaml`: retention CronJob
- `web/kustomization.yaml`: OpenShift resources / operation scriptsの統合
- `web/OPERATIONS.md`: backup / restore / retention運用
- `web/openshift-secrets.example.yaml`: Secretキー名の参照用。実値は保存しない