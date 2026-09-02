import { useEffect, useState } from "react";
import type { AuthUser, ProjectSummary } from "../shared/types.js";
import { api, RequestError } from "./api.js";
import { Workspace } from "./Workspace.js";

function LoginForm({ onLogin, notice }: { onLogin: (user: AuthUser) => void; notice?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { onLogin((await api.login(username, password)).user); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ログインに失敗しました。"); }
    finally { setBusy(false); }
  }
  return <main className="center-page"><section className="panel auth-panel"><p className="eyebrow">THE TEST WEB</p><h1>ザ・テスト</h1><p className="muted">テスト管理Web版へログイン</p>{notice && <p className="error-message" role="alert">{notice}</p>}<form onSubmit={submit} className="stack-form"><label>ユーザー名<input required disabled={busy} value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>パスワード<input required disabled={busy} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="error-message">{error}</p>}<button className="primary" disabled={busy}>{busy ? "ログイン中…" : "ログイン"}</button></form></section></main>;
}

function ChangePassword({ onChanged }: { user: AuthUser; onChanged: (user: AuthUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { onChanged((await api.changePassword(currentPassword, newPassword, confirmation)).user); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "パスワード変更に失敗しました。"); }
    finally { setBusy(false); }
  }
  return <main className="center-page"><section className="panel auth-panel"><p className="eyebrow">初回ログイン</p><h1>パスワードを変更してください</h1><form onSubmit={submit} className="stack-form"><label>現在のパスワード<input required disabled={busy} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>新しいパスワード<input required disabled={busy} type="password" minLength={4} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>確認入力<input required disabled={busy} type="password" minLength={4} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <p className="error-message">{error}</p>}<button className="primary" disabled={busy}>{busy ? "変更中…" : "変更して続ける"}</button></form></section></main>;
}

function ProjectCard({ project, user, onOpen, onRefresh }: { project: ProjectSummary; user: AuthUser; onOpen: () => void; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!editing) { setName(project.name); setDescription(project.description || ""); } }, [project.name, project.description, editing]);
  const canEdit = user.role === "admin" || project.assigned;
  async function save() {
    setBusy(true); setError("");
    try { await api.updateProject(project.id, project.version, name, description); setEditing(false); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存に失敗しました。"); }
    finally { setBusy(false); }
  }
  async function changeArchive(restore: boolean) {
    setBusy(true); setError("");
    try { restore ? await api.restoreProject(project.id, project.version) : await api.archiveProject(project.id, project.version); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "アーカイブ操作に失敗しました。"); }
    finally { setBusy(false); }
  }
  async function removeProject() {
    if (deleteName !== project.name) return;
    setBusy(true); setError("");
    try {
      await api.deleteProject(project.id, project.version, deleteName, deleteReason.trim());
      setDeleteOpen(false); onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "削除に失敗しました。"); }
    finally { setBusy(false); }
  }
  return <>
    <article className="project-card">{editing ? <><label>プロジェクト名<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>説明<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></> : <><div className="card-heading"><h3>{project.name}</h3><span className={"status " + project.status}>{project.status === "active" ? "有効" : "アーカイブ済み"}</span></div><p>{project.description || "説明はありません。"}</p></>}<div className="card-meta"><span>{user.role === "admin" ? "管理者（編集可）" : project.assigned ? "編集権限あり" : "閲覧権限のみ"}</span><span>version {project.version}</span></div>{error && <p className="error-message">{error}</p>}<div className="button-row">{editing ? <><button className="primary small" disabled={busy} onClick={() => void save()}>保存</button><button className="small" disabled={busy} onClick={() => setEditing(false)}>キャンセル</button></> : <><button className="primary small" disabled={busy} onClick={onOpen}>開く</button>{canEdit && <button className="small" disabled={busy} onClick={() => setEditing(true)}>プロジェクト設定</button>}{user.role === "admin" && project.status === "active" && <button className="small danger" disabled={busy} onClick={() => void changeArchive(false)}>アーカイブ</button>}{user.role === "admin" && project.status === "archived" && <><button className="small" disabled={busy} onClick={() => void changeArchive(true)}>アーカイブ解除</button><button className="small danger" disabled={busy} onClick={() => { setDeleteName(""); setDeleteReason(""); setDeleteOpen(true); }}>完全削除</button></>}<a className="small link-button" href={"/api/projects/" + project.id + "/export"} download>JSONエクスポート</a></>}</div></article>
    {deleteOpen && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="プロジェクト削除"><section className="panel destructive-modal"><div className="section-heading"><div><p className="eyebrow">DELETE PROJECT</p><h2>プロジェクトを完全削除</h2></div><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>閉じる</button></div><p className="warning-message">この操作はプロジェクト本体、テスト定義、実行結果、証跡を完全に削除します。復元できません。監査記録は保持されます。</p><label>確認のため「{project.name}」と入力<input autoFocus value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /></label><label>削除理由（任意）<textarea maxLength={500} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label><div className="button-row"><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>取消</button><button type="button" className="danger" disabled={busy || deleteName !== project.name} onClick={() => void removeProject()}>完全削除する</button></div></section></div>}
  </>;
}

type AdminUser = {
  id: string; username: string; displayName: string | null; role: string; enabled: boolean; version: number;
  mustChangePassword?: boolean; failedLoginCount?: number; lockedUntil?: string | null;
  projects: Array<{ id: string; name: string; status: "active" | "archived" }>;
};
function AssignmentPanel({ projects, users, onChanged }: { projects: ProjectSummary[]; users: AdminUser[]; onChanged: () => Promise<void> }) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const availableProjects = projects.filter((project) => project.status === "active");
  async function assign() {
    if (!selectedUsers.length || !selectedProjects.length) {
      setMessage("ユーザーとプロジェクトを1件以上選択してください。");
      return;
    }
    try {
      const result = await api.bulkAssignUsers(selectedUsers, selectedProjects);
      setMessage(`割当を${result.changed}件追加しました（要求${result.requested}件、変更なし${result.skipped}件）。`);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "一括割当に失敗しました。");
    }
  }
  async function unassign() {
    if (!selectedUsers.length || !selectedProjects.length) {
      setMessage("ユーザーとプロジェクトを1件以上選択してください。");
      return;
    }
    try {
      const result = await api.bulkUnassignUsers(selectedUsers, selectedProjects);
      setMessage(`割当を${result.changed}件解除しました（要求${result.requested}件、変更なし${result.skipped}件）。`);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "一括解除に失敗しました。");
    }
  }

  return <section className="panel assignment-panel">
    <h2>ユーザーへのプロジェクト割当</h2>
    <p className="muted">1. ユーザーを選び、2. プロジェクトを選び、割り当てまたは解除を確定します。複数ユーザー・複数プロジェクトを一度に処理できます。</p>
    <div className="assignment-editor-grid">
      <label>ユーザーを選択
        <select multiple size={Math.min(8, Math.max(3, users.filter((item) => item.enabled).length))} value={selectedUsers} onChange={(event) => setSelectedUsers([...event.target.selectedOptions].map((option) => option.value))}>
          {users.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.displayName || item.username}</option>)}
        </select>
      </label>
      <fieldset className="assignment-projects"><legend>プロジェクトを選択</legend>{availableProjects.map((project) => <label className="check-label" key={project.id}><input type="checkbox" checked={selectedProjects.includes(project.id)} onChange={(event) => setSelectedProjects(event.target.checked ? [...selectedProjects, project.id] : selectedProjects.filter((id) => id !== project.id))} />{project.name}</label>)}{!availableProjects.length && <p className="muted">割り当て可能なプロジェクトはありません。</p>}</fieldset>
    </div>
    <p className="assignment-count">処理対象: {selectedUsers.length}人 × {selectedProjects.length}プロジェクト = {selectedUsers.length * selectedProjects.length}件</p>
    <div className="button-row"><button className="primary" type="button" disabled={!selectedUsers.length || !selectedProjects.length} onClick={() => void assign()}>選択内容を割り当て</button><button className="danger" type="button" disabled={!selectedUsers.length || !selectedProjects.length} onClick={() => void unassign()}>選択内容を解除</button></div>
    {message && <p className={message.includes("失敗") ? "error-message" : "success-message"}>{message}</p>}
  </section>;
}

function UserManagementPanel({ projects, users, onChanged }: { projects: ProjectSummary[]; users: AdminUser[]; onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled" | "admin" | "locked">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState({ username: "", displayName: "", password: "", confirmation: "", role: "executor" });
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editValues, setEditValues] = useState({ username: "", displayName: "", role: "executor", enabled: true });
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [resetValues, setResetValues] = useState({ password: "", confirmation: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const locked = (item: AdminUser) => Boolean(item.lockedUntil && new Date(item.lockedUntil).getTime() > now);
  const normalized = query.trim().toLocaleLowerCase("ja");
  const filtered = users.filter((item) => {
    const matches = !normalized || item.username.toLocaleLowerCase("ja").includes(normalized) || (item.displayName ?? "").toLocaleLowerCase("ja").includes(normalized) || item.projects.some((project) => project.name.toLocaleLowerCase("ja").includes(normalized));
    if (!matches) return false;
    if (filter === "enabled") return item.enabled;
    if (filter === "disabled") return !item.enabled;
    if (filter === "admin") return item.role === "admin";
    if (filter === "locked") return locked(item);
    return true;
  });
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await api.createUser(createValues);
      setCreateValues({ username: "", displayName: "", password: "", confirmation: "", role: "executor" });
      setCreateOpen(false); setMessage("ユーザーを作成しました。"); await onChanged();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "ユーザーを作成できませんでした。"); }
    finally { setBusy(false); }
  }
  function openEdit(item: AdminUser) {
    setEditing(item); setEditValues({ username: item.username, displayName: item.displayName ?? "", role: item.role, enabled: item.enabled }); setMessage("");
  }
  async function saveEdit(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return; setBusy(true); setMessage("");
    try {
      await api.updateUser(editing.id, { version: editing.version, ...editValues });
      setEditing(null); setMessage("ユーザー情報を更新しました。"); await onChanged();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "ユーザー情報を更新できませんでした。"); }
    finally { setBusy(false); }
  }
  async function resetPassword(event: React.FormEvent) {
    event.preventDefault(); if (!resetting) return; setBusy(true); setMessage("");
    try {
      await api.resetUserPassword(resetting.id, resetValues.password, resetValues.confirmation);
      setResetting(null); setResetValues({ password: "", confirmation: "" }); setMessage("仮パスワードを設定しました。対象ユーザーは次回ログイン時に変更が必要です。"); await onChanged();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "パスワードを再設定できませんでした。"); }
    finally { setBusy(false); }
  }
  async function unlock(item: AdminUser) {
    setBusy(true); setMessage("");
    try { await api.unlockUser(item.id); setMessage(`${item.displayName || item.username}のログインロックを解除しました。`); await onChanged(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "ロックを解除できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div className="user-management-page">
    <section className="intro"><div><p className="eyebrow">ADMINISTRATION</p><h2>ユーザー管理</h2><p className="muted">利用状態と担当プロジェクトを確認し、必要な操作だけを開きます。</p></div><button type="button" className="primary" onClick={() => { setCreateOpen(true); setMessage(""); }}>＋ ユーザー作成</button></section>
    <div className="user-metric-grid"><article><span>全ユーザー</span><strong>{users.length}</strong></article><article><span>有効</span><strong>{users.filter((item) => item.enabled).length}</strong></article><article><span>管理者</span><strong>{users.filter((item) => item.role === "admin").length}</strong></article><article><span>ロック中</span><strong>{users.filter(locked).length}</strong></article></div>
    <section className="panel user-directory"><div className="user-directory-tools"><label>検索<input type="search" placeholder="名前・ユーザー名・プロジェクト" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>表示<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">すべて</option><option value="enabled">有効</option><option value="disabled">無効</option><option value="admin">管理者</option><option value="locked">ロック中</option></select></label><span>{filtered.length}件</span></div>
      <div className="user-management-list">{filtered.map((item) => <article className="user-management-card" key={item.id}><div className="user-avatar" aria-hidden="true">{(item.displayName || item.username).slice(0, 1).toUpperCase()}</div><div className="user-identity"><strong>{item.displayName || item.username}</strong><span>@{item.username}</span><div className="user-badges"><span className={item.role === "admin" ? "admin" : "executor"}>{item.role === "admin" ? "管理者" : "実行者"}</span><span className={item.enabled ? "enabled" : "disabled"}>{item.enabled ? "有効" : "無効"}</span>{locked(item) && <span className="locked">ロック中</span>}{item.mustChangePassword && <span>初回変更待ち</span>}</div></div><div className="user-project-column"><small>担当プロジェクト</small><div className="user-projects">{item.projects.length ? item.projects.map((project) => <span key={project.id}>{project.name}</span>) : <span>未割当</span>}</div></div><div className="user-card-actions"><button type="button" disabled={busy} onClick={() => openEdit(item)}>編集</button><button type="button" disabled={busy} onClick={() => { setResetting(item); setResetValues({ password: "", confirmation: "" }); setMessage(""); }}>パスワード再設定</button>{locked(item) && <button type="button" disabled={busy} onClick={() => void unlock(item)}>ロック解除</button>}</div></article>)}{!filtered.length && <p className="muted">条件に一致するユーザーはいません。</p>}</div>
    </section>
    {message && <p className={message.includes("しました") || message.includes("設定しました") ? "success-message" : "error-message"} role="status">{message}</p>}
    <details className="panel permission-help"><summary>権限の見方</summary><p><strong>管理者</strong>：ユーザー・プロジェクト・割当を管理し、すべてのプロジェクトを編集できます。</p><p><strong>実行者</strong>：割り当てられたプロジェクトを編集し、テストを実行できます。</p><p><strong>閲覧のみ</strong>：割り当てられていないプロジェクトは内容の確認だけできます。</p></details>
    <AssignmentPanel projects={projects} users={users} onChanged={onChanged} />
    {createOpen && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="ユーザー作成"><section className="panel user-admin-modal"><div className="section-heading"><div><p className="eyebrow">NEW USER</p><h2>ユーザー作成</h2></div><button type="button" disabled={busy} onClick={() => setCreateOpen(false)}>閉じる</button></div><form className="stack-form" onSubmit={create}><label>ユーザー名<input autoFocus required value={createValues.username} onChange={(event) => setCreateValues({ ...createValues, username: event.target.value })} /></label><label>表示名<input value={createValues.displayName} onChange={(event) => setCreateValues({ ...createValues, displayName: event.target.value })} /></label><label>権限<select value={createValues.role} onChange={(event) => setCreateValues({ ...createValues, role: event.target.value })}><option value="executor">実行者</option><option value="admin">管理者</option></select></label><label>仮パスワード<input required minLength={4} type="password" value={createValues.password} onChange={(event) => setCreateValues({ ...createValues, password: event.target.value })} /></label><label>確認入力<input required minLength={4} type="password" value={createValues.confirmation} onChange={(event) => setCreateValues({ ...createValues, confirmation: event.target.value })} /></label><div className="button-row"><button type="button" disabled={busy} onClick={() => setCreateOpen(false)}>取消</button><button className="primary" disabled={busy}>作成</button></div></form></section></div>}
    {editing && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="ユーザー編集"><section className="panel user-admin-modal"><div className="section-heading"><div><p className="eyebrow">USER SETTINGS</p><h2>ユーザー編集</h2></div><button type="button" disabled={busy} onClick={() => setEditing(null)}>閉じる</button></div><form className="stack-form" onSubmit={saveEdit}><label>ユーザー名<input required value={editValues.username} onChange={(event) => setEditValues({ ...editValues, username: event.target.value })} /></label><label>表示名<input value={editValues.displayName} onChange={(event) => setEditValues({ ...editValues, displayName: event.target.value })} /></label><label>権限<select value={editValues.role} onChange={(event) => setEditValues({ ...editValues, role: event.target.value })}><option value="executor">実行者</option><option value="admin">管理者</option></select></label><label className="check-label"><input type="checkbox" checked={editValues.enabled} onChange={(event) => setEditValues({ ...editValues, enabled: event.target.checked })} />アカウントを有効にする</label><div className="button-row"><button type="button" disabled={busy} onClick={() => setEditing(null)}>取消</button><button className="primary" disabled={busy}>保存</button></div></form></section></div>}
    {resetting && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="パスワード再設定"><section className="panel user-admin-modal"><div className="section-heading"><div><p className="eyebrow">RESET PASSWORD</p><h2>仮パスワードを設定</h2><p className="muted">{resetting.displayName || resetting.username}</p></div><button type="button" disabled={busy} onClick={() => setResetting(null)}>閉じる</button></div><form className="stack-form" onSubmit={resetPassword}><label>仮パスワード<input autoFocus required minLength={4} type="password" value={resetValues.password} onChange={(event) => setResetValues({ ...resetValues, password: event.target.value })} /></label><label>確認入力<input required minLength={4} type="password" value={resetValues.confirmation} onChange={(event) => setResetValues({ ...resetValues, confirmation: event.target.value })} /></label><div className="button-row"><button type="button" disabled={busy} onClick={() => setResetting(null)}>取消</button><button className="primary" disabled={busy}>設定</button></div></form></section></div>}
  </div>;
}


type BackupRecord = { backupId: string; status: string; manifest: Record<string, unknown> | null; createdAt: string; completedAt: string | null; createdBy: string | null };
type OperationRecord = { id: string; operationType: "backup" | "restore"; backupId: string | null; status: string; output: Record<string, unknown> | null; errorMessage: string | null; requestedAt: string; startedAt: string | null; completedAt: string | null };

function OperationsPanel() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    try {
      const [backupResult, operationResult] = await Promise.all([api.backups(), api.operationRequests()]);
      setBackups(backupResult.backups);
      setOperations(operationResult.operations);
      setSelectedBackupId((current) => current || backupResult.backups[0]?.backupId || "");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "運用状態を読み込めませんでした。");
    }
  }
  useEffect(() => { void load(); }, []);
  async function requestBackup() {
    if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try { await api.requestBackup(); setMessage("手動バックアップを受け付けました。運用ジョブが順次処理します。"); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "バックアップを要求できませんでした。"); }
    finally { setBusy(false); }
  }
  async function requestRestore() {
    if (busy || !selectedBackupId || confirmation !== selectedBackupId) return;
    setBusy(true); setMessage(""); setError("");
    try {
      await api.requestRestore(selectedBackupId, confirmation);
      setConfirmation("");
      setMessage("復元を受け付けました。復元前バックアップの後、指定世代を復元します。");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "復元を要求できませんでした。"); }
    finally { setBusy(false); }
  }
  const statusLabel: Record<string, string> = { pending: "処理待ち", running: "処理中", succeeded: "成功", failed: "失敗" };
  return <div className="dashboard-page operations-page">
    <section className="intro"><div><p className="eyebrow">OPERATIONS</p><h2>バックアップ・復元</h2><p className="muted">日次バックアップは毎日02:00に実行し、正常な2世代を保持します。</p></div><div className="button-row"><button type="button" disabled={busy} onClick={() => void load()}>再読み込み</button><button type="button" className="primary" disabled={busy || operations.some((item) => item.status === "pending" || item.status === "running")} onClick={() => void requestBackup()}>手動バックアップ</button></div></section>
    {message && <p className="success-message" role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    <section className="panel"><h3>復元</h3><p className="warning-message">復元前に現在状態を追加バックアップし、DBと証跡を同じバックアップIDから復元します。処理中は更新操作が停止します。</p><div className="stack-form"><label>バックアップID<select value={selectedBackupId} onChange={(event) => { setSelectedBackupId(event.target.value); setConfirmation(""); }}><option value="">選択してください</option>{backups.filter((item) => item.status === "succeeded").map((item) => <option key={item.backupId} value={item.backupId}>{item.backupId}</option>)}</select></label><label>確認のためバックアップIDを入力<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button type="button" className="danger" disabled={busy || !selectedBackupId || confirmation !== selectedBackupId || operations.some((item) => item.status === "pending" || item.status === "running")} onClick={() => void requestRestore()}>復元を要求</button></div></section>
    <section className="panel"><div className="section-heading"><h3>バックアップ世代</h3><span>{backups.length}件</span></div>{backups.length ? <div className="user-management-list">{backups.map((item) => <article className="user-management-card" key={item.backupId}><div className="user-identity"><strong>{item.backupId}</strong><span>{new Date(item.createdAt).toLocaleString("ja-JP")}</span></div><div className="user-badges"><span className={item.status === "succeeded" ? "enabled" : "disabled"}>{statusLabel[item.status] || item.status}</span></div></article>)}</div> : <p className="muted">登録済みバックアップはありません。</p>}</section>
    <section className="panel"><div className="section-heading"><h3>運用要求</h3><span>{operations.length}件</span></div>{operations.length ? <div className="user-management-list">{operations.map((item) => <article className="user-management-card" key={item.id}><div className="user-identity"><strong>{item.operationType === "backup" ? "バックアップ" : "復元"}{item.backupId ? ` / ${item.backupId}` : ""}</strong><span>{new Date(item.requestedAt).toLocaleString("ja-JP")}</span>{item.errorMessage && <small className="error-message">{item.errorMessage}</small>}</div><div className="user-badges"><span className={item.status === "succeeded" ? "enabled" : item.status === "failed" ? "disabled" : "locked"}>{statusLabel[item.status] || item.status}</span></div></article>)}</div> : <p className="muted">運用要求はありません。</p>}</section>
  </div>;
}

function Dashboard({ user, onOpen, onLogout }: { user: AuthUser; onOpen: (project: ProjectSummary, runId?: string) => void; onLogout: () => Promise<void> }) {
  const [section, setSection] = useState<"overview" | "projects" | "users" | "operations">("overview");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [data, setData] = useState<{ metrics: { testCases: number; scenarios: number; runningTests: number; passRate: number | null }; recentRuns: Array<{ id: string; name: string; status: string; updatedAt: string | null; projectId: string; projectName: string }> }>({ metrics: { testCases: 0, scenarios: 0, runningTests: 0, passRate: null }, recentRuns: [] });
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  async function refresh() {
    try { const [projectResult, dashboardResult] = await Promise.all([api.projects(), api.dashboard()]); setProjects(projectResult.projects); setData(dashboardResult); if (user.role === "admin") setUsers((await api.users()).users); setError(""); }
    catch (reason) { if (reason instanceof RequestError && reason.status === 401) onLogout(); else setError(reason instanceof Error ? reason.message : "読み込みに失敗しました。"); }
  }
  useEffect(() => { void refresh(); }, [user.role]);
  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.createProject(projectName, projectDescription);
      setProjectName("");
      setProjectDescription("");
      setProjectModalOpen(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "プロジェクトを作成できませんでした。");
    }
  }
  async function logout() {
    setError("");
    await onLogout();
  }
  const active = projects.filter((item) => item.status === "active");
  const archived = projects.filter((item) => item.status === "archived");
  const statusLabel: Record<string, string> = { draft: "準備中", in_progress: "実行中", completed: "完了" };
  const resumeRuns = data.recentRuns.filter((run) => run.status === "draft" || run.status === "in_progress");
  return <div className="app-shell"><header className="topbar"><div><p className="eyebrow">THE TEST WEB</p><h1>ザ・テスト</h1></div><div className="user-menu"><span>{user.displayName || user.username}</span><button className="small" onClick={() => void logout()}>ログアウト</button></div></header><nav className="dashboard-nav" aria-label="主要メニュー"><button type="button" className={section === "overview" ? "active" : ""} aria-current={section === "overview" ? "page" : undefined} onClick={() => setSection("overview")}>ダッシュボード</button><button type="button" className={section === "projects" ? "active" : ""} aria-current={section === "projects" ? "page" : undefined} onClick={() => setSection("projects")}>プロジェクト</button>{user.role === "admin" && <><button type="button" className={section === "users" ? "active" : ""} aria-current={section === "users" ? "page" : undefined} onClick={() => setSection("users")}>ユーザー管理</button><button type="button" className={section === "operations" ? "active" : ""} aria-current={section === "operations" ? "page" : undefined} onClick={() => setSection("operations")}>バックアップ・復元</button></>}</nav><main className="content">{error && <p className="error-message">{error}</p>}{section === "overview" && <div className="dashboard-page"><section className="intro"><div><h2>ダッシュボード</h2><p className="muted">テストの進み具合をひと目で確認できます。</p></div><button className="small" onClick={() => void refresh()}>再読み込み</button></section><div className="metric-grid">{[["テストケース数", data.metrics.testCases], ["シナリオ数", data.metrics.scenarios], ["実行中テスト数", data.metrics.runningTests], ["合格率", data.metrics.passRate === null ? "—" : Math.round(data.metrics.passRate * 100) + "%"]].map(([label, value]) => <article className="metric-card" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</div><section className="panel recent-runs"><div className="section-heading"><div><p className="eyebrow">CONTINUE</p><h2>作業を再開</h2></div><span>{resumeRuns.length}件</span></div>{resumeRuns.length ? resumeRuns.map((run) => <button className="recent-run-row" key={run.id} onClick={() => { const project = projects.find((item) => item.id === run.projectId); if (project) onOpen(project, run.id); }}><span><strong>{run.name}</strong><small>{run.projectName} / {run.updatedAt ? new Date(run.updatedAt).toLocaleString("ja-JP") : ""}</small></span><span className={"run-status " + run.status}>{statusLabel[run.status] || run.status}</span></button>) : <p className="muted">再開が必要な実行はありません。</p>}</section></div>}{section === "projects" && <div className="dashboard-page"><section className="intro"><div><h2>プロジェクト一覧</h2><p className="muted">プロジェクトを開くと、シナリオを作成してテストを実行できます。権限表示も確認できます。</p></div><div className="button-row">{user.role === "admin" && <button className="primary small" onClick={() => setProjectModalOpen(true)}>＋ プロジェクト作成</button>}<button className="small" onClick={() => void refresh()}>再読み込み</button></div></section><div className="project-grid">{active.map((project) => <ProjectCard key={project.id} project={project} user={user} onOpen={() => onOpen(project)} onRefresh={() => void refresh()} />)}</div>{user.role === "admin" && projectModalOpen && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="プロジェクト作成"><section className="panel project-modal"><div className="section-heading"><div><p className="eyebrow">新しいプロジェクト</p><h2>プロジェクト作成</h2></div><button type="button" onClick={() => setProjectModalOpen(false)}>閉じる</button></div><form className="stack-form" onSubmit={createProject}><label>プロジェクト名<input required value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label>説明<textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} /></label><button className="primary">作成する</button></form></section></div>}{archived.length > 0 && <section className="archived-projects"><h2>アーカイブ済み</h2><div className="project-grid">{archived.map((project) => <ProjectCard key={project.id} project={project} user={user} onOpen={() => onOpen(project)} onRefresh={() => void refresh()} />)}</div></section>}</div>}{section === "users" && user.role === "admin" && <UserManagementPanel projects={projects} users={users} onChanged={refresh} />}{section === "operations" && user.role === "admin" && <OperationsPanel />}</main></div>;
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [initialRunId, setInitialRunId] = useState("");
  const [logoutWarning, setLogoutWarning] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.me().then(({ user: current }) => setUser(current)).catch(() => undefined).finally(() => setLoading(false)); }, []);
  if (loading) return <main className="center-page"><p>読み込み中…</p></main>;
  if (!user) return <LoginForm onLogin={(current) => { setLogoutWarning(""); setUser(current); }} notice={logoutWarning} />;
  if (user.mustChangePassword) return <ChangePassword user={user} onChanged={setUser} />;
  async function logout() {
    try {
      await api.logout();
    } catch (reason) {
      if (!(reason instanceof RequestError && reason.status === 401)) {
        setLogoutWarning("クライアントのログイン状態は解除しましたが、サーバー側のセッションが残っている可能性があります。");
        void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "X-The-Test-Request": "1" } }).catch(() => undefined);
      }
    } finally {
      setSelectedProject(null);
      setInitialRunId("");
      setUser(null);
    }
  }
  if (selectedProject) return <Workspace project={selectedProject} user={user} initialRunId={initialRunId} onBack={() => { setSelectedProject(null); setInitialRunId(""); }} onLogout={logout} />;
  return <Dashboard user={user} onOpen={(project, runId) => { setInitialRunId(runId ?? ""); setSelectedProject(project); }} onLogout={logout} />;
}
