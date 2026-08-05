from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


# Client API
path = Path("web/src/client/api.ts")
text = path.read_text(encoding="utf-8")
old = '''  restoreProject: (id: string, version: number) => request<{ ok: true }>(`/api/projects/${id}/restore`, { method: "POST", body: JSON.stringify({ version }) }),
'''
new = old + '''  deleteProject: (id: string, version: number, confirmationName: string, reason: string) =>
    request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE", body: JSON.stringify({ version, confirmationName, reason }) }),
'''
text = replace_once(text, old, new, "project delete client")
old = '''  createUser: (input: { username: string; password: string; confirmation: string; role: string; displayName: string }) => request<{ id: string }>("/api/users", { method: "POST", body: JSON.stringify(input) }),
'''
new = old + '''  updateUser: (id: string, input: { version: number; username: string; displayName: string; role: string; enabled: boolean }) =>
    request<{ ok: true }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  resetUserPassword: (id: string, password: string, confirmation: string) =>
    request<{ ok: true }>(`/api/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password, confirmation }) }),
  unlockUser: (id: string) => request<{ ok: true }>(`/api/users/${id}/unlock`, { method: "POST" }),
'''
text = replace_once(text, old, new, "user admin client")
path.write_text(text, encoding="utf-8")


# Project deletion API
path = Path("web/src/server/app.ts")
text = path.read_text(encoding="utf-8-sig")
marker = '''  app.post("/api/projects/:id/assignments", async (request) => {
'''
route = '''  app.delete("/api/projects/:id", async (request) => {
    const actor = await requireUser(request, db, config);
    requireRole(actor, "admin");
    const id = routeId(request);
    const access = await projectAccess(db, actor, id);
    const input = body(request);
    const version = versionFrom(input.version);
    const confirmationName = typeof input.confirmationName === "string" ? input.confirmationName.trim() : "";
    const reason = text(input.reason);
    if (access.project.status !== "archived") throw badRequest("プロジェクトを削除する前にアーカイブしてください。");
    if (confirmationName !== access.project.name) throw badRequest("確認用プロジェクト名が一致しません。");
    if (!reason) throw badRequest("削除理由を入力してください。");
    const result = await db.execute(
      `UPDATE projects SET deleted_at = UTC_TIMESTAMP(6), version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND version = ? AND status = 'archived' AND deleted_at IS NULL`,
      [id, version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict();
    await db.execute("DELETE FROM project_assignments WHERE project_id = ?", [id]);
    await writeAudit(db, request, actor, {
      action: "project_deleted",
      entityType: "project",
      entityId: id,
      projectId: id,
      before: { name: access.project.name, status: access.project.status },
      after: { deleted: true, reason },
    });
    return { ok: true };
  });

'''
if route not in text:
    text = replace_once(text, marker, route + marker, "project delete server route")
path.write_text(text, encoding="utf-8")


# Dashboard/project/user UI
path = Path("web/src/client/App.tsx")
text = path.read_text(encoding="utf-8")
start = text.index("function ProjectCard(")
end = text.index("function AssignmentPanel(", start)
replacement = r'''function ProjectCard({ project, user, onOpen, onRefresh }: { project: ProjectSummary; user: AuthUser; onOpen: () => void; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (deleteName !== project.name || !deleteReason.trim()) return;
    setBusy(true); setError("");
    try {
      await api.deleteProject(project.id, project.version, deleteName, deleteReason.trim());
      setDeleteOpen(false); onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "削除に失敗しました。"); }
    finally { setBusy(false); }
  }
  return <>
    <article className="project-card">{editing ? <><label>プロジェクト名<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>説明<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></> : <><div className="card-heading"><h3>{project.name}</h3><span className={"status " + project.status}>{project.status === "active" ? "有効" : "アーカイブ済み"}</span></div><p>{project.description || "説明はありません。"}</p></>}<div className="card-meta"><span>{user.role === "admin" ? "管理者（編集可）" : project.assigned ? "編集権限あり" : "閲覧権限のみ"}</span><span>version {project.version}</span></div>{error && <p className="error-message">{error}</p>}<div className="button-row">{editing ? <><button className="primary small" disabled={busy} onClick={() => void save()}>保存</button><button className="small" disabled={busy} onClick={() => setEditing(false)}>キャンセル</button></> : <><button className="primary small" disabled={busy} onClick={onOpen}>開く</button>{canEdit && <button className="small" disabled={busy} onClick={() => setEditing(true)}>プロジェクト設定</button>}{user.role === "admin" && project.status === "active" && <button className="small danger" disabled={busy} onClick={() => void changeArchive(false)}>アーカイブ</button>}{user.role === "admin" && project.status === "archived" && <><button className="small" disabled={busy} onClick={() => void changeArchive(true)}>アーカイブ解除</button><button className="small danger" disabled={busy} onClick={() => { setDeleteName(""); setDeleteReason(""); setDeleteOpen(true); }}>削除</button></>}<a className="small link-button" href={"/api/projects/" + project.id + "/export"} download>JSONエクスポート</a></>}</div></article>
    {deleteOpen && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="プロジェクト削除"><section className="panel destructive-modal"><div className="section-heading"><div><p className="eyebrow">DELETE PROJECT</p><h2>プロジェクトを削除</h2></div><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>閉じる</button></div><p className="warning-message">削除後は通常画面から復元できません。監査記録は保持されます。</p><label>確認のため「{project.name}」と入力<input autoFocus value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /></label><label>削除理由<textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label><div className="button-row"><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>取消</button><button type="button" className="danger" disabled={busy || deleteName !== project.name || !deleteReason.trim()} onClick={() => void removeProject()}>削除する</button></div></section></div>}
  </>;
}

type AdminUser = {
  id: string; username: string; displayName: string | null; role: string; enabled: boolean; version: number;
  mustChangePassword?: boolean; failedLoginCount?: number; lockedUntil?: string | null;
  projects: Array<{ id: string; name: string; status: "active" | "archived" }>;
};
'''
text = text[:start] + replacement + text[end:]

insert_at = text.index("function Dashboard(")
user_panel = r'''function UserManagementPanel({ projects, users, onChanged }: { projects: ProjectSummary[]; users: AdminUser[]; onChanged: () => Promise<void> }) {
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

'''
text = text[:insert_at] + user_panel + text[insert_at:]
for obsolete in [
    '  const [username, setUsername] = useState("");\n',
    '  const [displayName, setDisplayName] = useState("");\n',
    '  const [password, setPassword] = useState("");\n',
    '  const [confirmation, setConfirmation] = useState("");\n',
]:
    text = text.replace(obsolete, "", 1)
text = re.sub(r'  async function createUser\(event: React\.FormEvent\) \{.*?\}\n  async function logout', '  async function logout', text, count=1, flags=re.S)
users_start = text.index('{section === "users" && user.role === "admin" &&')
users_end = text.index('</main></div>;', users_start)
text = text[:users_start] + '{section === "users" && user.role === "admin" && <UserManagementPanel projects={projects} users={users} onChanged={refresh} />}' + text[users_end:]
path.write_text(text, encoding="utf-8")


# Styles
path = Path("web/src/client/styles.css")
text = path.read_text(encoding="utf-8")
styles = r'''

/* User administration */
.destructive-modal, .user-admin-modal { width: min(580px, 96vw); display: grid; gap: 1rem; }
.user-management-page { display: grid; gap: 1.25rem; }
.user-metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .8rem; }
.user-metric-grid article { display: grid; gap: .25rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
.user-metric-grid span { color: #6b7689; font-size: .82rem; }
.user-metric-grid strong { color: #17498e; font-size: 1.65rem; }
.user-directory { padding: 0; overflow: hidden; }
.user-directory-tools { display: grid; grid-template-columns: minmax(240px, 1fr) 180px auto; gap: .8rem; align-items: end; padding: 1rem 1.25rem; border-bottom: 1px solid #e5e9f0; background: #f8faff; }
.user-directory-tools > span { align-self: center; color: #6b7689; font-size: .85rem; }
.user-management-list { display: grid; }
.user-management-card { display: grid; grid-template-columns: 44px minmax(160px, .8fr) minmax(220px, 1.2fr) auto; gap: 1rem; align-items: center; padding: 1rem 1.25rem; border-top: 1px solid #edf0f5; }
.user-management-card:first-child { border-top: 0; }
.user-management-card:hover { background: #fbfcff; }
.user-avatar { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; color: #17498e; background: #eaf2ff; font-weight: 800; }
.user-identity { display: grid; gap: .15rem; }
.user-identity > span { color: #6b7689; font-size: .82rem; }
.user-badges { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .25rem; }
.user-badges span { padding: .15rem .45rem; border-radius: 999px; color: #536075; background: #eef1f5; font-size: .72rem; }
.user-badges .admin { color: #5e3a9a; background: #f1eaff; }
.user-badges .executor { color: #17498e; background: #eaf2ff; }
.user-badges .enabled { color: #207541; background: #e9f6ed; }
.user-badges .disabled, .user-badges .locked { color: #9b3035; background: #fff0f0; }
.user-project-column { display: grid; gap: .35rem; }
.user-project-column > small { color: #6b7689; }
.user-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .4rem; }
.permission-help summary { cursor: pointer; font-weight: 750; }
@media (max-width: 900px) {
  .user-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .user-management-card { grid-template-columns: 44px 1fr; }
  .user-project-column, .user-card-actions { grid-column: 2; }
  .user-card-actions { justify-content: flex-start; }
}
@media (max-width: 620px) {
  .user-directory-tools { grid-template-columns: 1fr; }
  .user-management-card { grid-template-columns: 1fr; }
  .user-avatar { display: none; }
  .user-project-column, .user-card-actions { grid-column: 1; }
}
'''
if "/* User administration */" not in text:
    text = text.rstrip() + styles + "\n"
path.write_text(text, encoding="utf-8")
