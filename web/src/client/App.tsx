import { useEffect, useState } from "react";
import type { AuthUser, ProjectSummary } from "../shared/types.js";
import { api, RequestError } from "./api.js";
import { Workspace } from "./Workspace.js";

function LoginForm({ onLogin, notice }: { onLogin: (user: AuthUser) => void; notice?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try { onLogin((await api.login(username, password)).user); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ログインに失敗しました。"); }
  }
  return <main className="center-page"><section className="panel auth-panel"><p className="eyebrow">THE TEST WEB</p><h1>ザ・テスト</h1><p className="muted">テスト管理Web版へログイン</p>{notice && <p className="error-message" role="alert">{notice}</p>}<form onSubmit={submit} className="stack-form"><label>ユーザー名<input required value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>パスワード<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="error-message">{error}</p>}<button className="primary">ログイン</button></form></section></main>;
}

function ChangePassword({ onChanged }: { user: AuthUser; onChanged: (user: AuthUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try { onChanged((await api.changePassword(currentPassword, newPassword, confirmation)).user); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "パスワード変更に失敗しました。"); }
  }
  return <main className="center-page"><section className="panel auth-panel"><p className="eyebrow">初回ログイン</p><h1>パスワードを変更してください</h1><form onSubmit={submit} className="stack-form"><label>現在のパスワード<input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>新しいパスワード<input required type="password" minLength={4} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>確認入力<input required type="password" minLength={4} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <p className="error-message">{error}</p>}<button className="primary">変更して続ける</button></form></section></main>;
}

function ProjectCard({ project, user, onOpen, onRefresh }: { project: ProjectSummary; user: AuthUser; onOpen: () => void; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [error, setError] = useState("");
  const canEdit = user.role === "admin" || project.assigned;
  async function save() {
    try { await api.updateProject(project.id, project.version, name, description); setEditing(false); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存に失敗しました。"); }
  }
  async function changeArchive(restore: boolean) {
    try { restore ? await api.restoreProject(project.id, project.version) : await api.archiveProject(project.id, project.version); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "アーカイブ操作に失敗しました。"); }
  }
  return <article className="project-card">{editing ? <><label>プロジェクト名<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>説明<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></> : <><div className="card-heading"><h3>{project.name}</h3><span className={"status " + project.status}>{project.status === "active" ? "有効" : "アーカイブ済み"}</span></div><p>{project.description || "説明はありません。"}</p></>}<div className="card-meta"><span>{user.role === "admin" ? "管理者（編集可）" : project.assigned ? "編集権限あり" : "閲覧権限のみ"}</span><span>version {project.version}</span></div>{error && <p className="error-message">{error}</p>}<div className="button-row">{editing ? <><button className="primary small" onClick={() => void save()}>保存</button><button className="small" onClick={() => setEditing(false)}>キャンセル</button></> : <><button className="primary small" onClick={onOpen}>開く</button>{canEdit && <button className="small" onClick={() => setEditing(true)}>プロジェクト設定</button>}{user.role === "admin" && project.status === "active" && <button className="small danger" onClick={() => void changeArchive(false)}>アーカイブ</button>}{user.role === "admin" && project.status === "archived" && <button className="small" onClick={() => void changeArchive(true)}>アーカイブ解除</button>}<a className="small link-button" href={"/api/projects/" + project.id + "/export"} download>JSONエクスポート</a></>}</div></article>;
}

type AdminUser = { id: string; username: string; displayName: string | null; role: string; enabled: boolean; version: number; projects: Array<{ id: string; name: string; status: "active" | "archived" }> };
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

function Dashboard({ user, onOpen, onLogout }: { user: AuthUser; onOpen: (project: ProjectSummary) => void; onLogout: () => Promise<void> }) {
  const [section, setSection] = useState<"overview" | "projects" | "users">("overview");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [data, setData] = useState<{ metrics: { testCases: number; scenarios: number; runningTests: number; passRate: number | null }; recentRuns: Array<{ id: string; name: string; status: string; updatedAt: string | null; projectId: string; projectName: string }> }>({ metrics: { testCases: 0, scenarios: 0, runningTests: 0, passRate: null }, recentRuns: [] });
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  async function refresh() {
    try { const [projectResult, dashboardResult] = await Promise.all([api.projects(), api.dashboard()]); setProjects(projectResult.projects); setData(dashboardResult); if (user.role === "admin") setUsers((await api.users()).users); }
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
      setError(String(reason));
    }
  }
  async function createUser(event: React.FormEvent) { event.preventDefault(); try { await api.createUser({ username, displayName, password, confirmation, role: "executor" }); setUsername(""); setDisplayName(""); setPassword(""); setConfirmation(""); await refresh(); } catch (reason) { setError(String(reason)); } }
  async function logout() {
    setError("");
    await onLogout();
  }
  const active = projects.filter((item) => item.status === "active");
  const archived = projects.filter((item) => item.status === "archived");
  const statusLabel: Record<string, string> = { draft: "準備中", in_progress: "実行中", completed: "完了" };
  return <div className="app-shell"><header className="topbar"><div><p className="eyebrow">THE TEST WEB</p><h1>ザ・テスト</h1></div><div className="user-menu"><span>{user.displayName || user.username}</span><button className="small" onClick={() => void logout()}>ログアウト</button></div></header><nav className="dashboard-nav"><button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}>ダッシュボード</button><button className={section === "projects" ? "active" : ""} onClick={() => setSection("projects")}>プロジェクト</button>{user.role === "admin" && <button className={section === "users" ? "active" : ""} onClick={() => setSection("users")}>ユーザー管理</button>}</nav><main className="content">{error && <p className="error-message">{error}</p>}{section === "overview" && <div className="dashboard-page"><section className="intro"><div><h2>ダッシュボード</h2><p className="muted">テストの進み具合をひと目で確認できます。</p></div><button className="small" onClick={() => void refresh()}>再読み込み</button></section><div className="metric-grid">{[["テストケース数", data.metrics.testCases], ["シナリオ数", data.metrics.scenarios], ["実行中テスト数", data.metrics.runningTests], ["合格率", data.metrics.passRate === null ? "—" : Math.round(data.metrics.passRate * 100) + "%"]].map(([label, value]) => <article className="metric-card" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</div><section className="panel recent-runs"><h2>最近のテスト実行</h2>{data.recentRuns.length ? data.recentRuns.map((run) => <button className="recent-run-row" key={run.id} onClick={() => { const project = projects.find((item) => item.id === run.projectId); if (project) onOpen(project); }}><span><strong>{run.name}</strong><small>{run.projectName}</small></span><span className={"run-status " + run.status}>{statusLabel[run.status] || run.status}</span></button>) : <p className="muted">テスト実行はまだありません。</p>}</section></div>}{section === "projects" && <div className="dashboard-page"><section className="intro"><div><h2>プロジェクト一覧</h2><p className="muted">プロジェクトを開くと、シナリオを作成してテストを実行できます。権限表示も確認できます。</p></div><div className="button-row">{user.role === "admin" && <button className="primary small" onClick={() => setProjectModalOpen(true)}>＋ プロジェクト作成</button>}<button className="small" onClick={() => void refresh()}>再読み込み</button></div></section><div className="project-grid">{active.map((project) => <ProjectCard key={project.id} project={project} user={user} onOpen={() => onOpen(project)} onRefresh={() => void refresh()} />)}</div>{user.role === "admin" && projectModalOpen && <div className="definition-modal-backdrop" role="dialog" aria-modal="true" aria-label="プロジェクト作成"><section className="panel project-modal"><div className="section-heading"><div><p className="eyebrow">新しいプロジェクト</p><h2>プロジェクト作成</h2></div><button type="button" onClick={() => setProjectModalOpen(false)}>閉じる</button></div><form className="stack-form" onSubmit={createProject}><label>プロジェクト名<input required value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label>説明<textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} /></label><button className="primary">作成する</button></form></section></div>}{archived.length > 0 && <section className="archived-projects"><h2>アーカイブ済み</h2><div className="project-grid">{archived.map((project) => <ProjectCard key={project.id} project={project} user={user} onOpen={() => onOpen(project)} onRefresh={() => void refresh()} />)}</div></section>}</div>}{section === "users" && user.role === "admin" && <div className="dashboard-page"><h2>ユーザー管理</h2><div className="admin-grid"><section className="panel"><h3>ユーザー作成</h3><form className="stack-form" onSubmit={createUser}><label>ユーザー名<input required value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>表示名<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>仮パスワード<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>確認入力<input required type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary">作成</button></form></section><section className="panel user-list"><h3>ユーザー一覧</h3>{users.map((item) => <div className="user-row" key={item.id}><span><strong>{item.username}</strong><small>{item.displayName || "表示名なし"}</small><small className="user-projects">{item.projects.length ? item.projects.map((project) => <span key={project.id}>{project.name}</span>) : <span>担当プロジェクトなし</span>}</small></span><span>{item.enabled ? (item.role === "admin" ? "管理者" : "実行者") : "無効"}</span></div>)}</section></div><section className="panel permission-help"><h3>権限の見方</h3><p><strong>管理者</strong>：ユーザー・プロジェクト・割当を管理し、すべてのプロジェクトを編集できます。</p><p><strong>実行者</strong>：割り当てられたプロジェクトを編集し、テストを実行できます。</p><p><strong>閲覧のみ</strong>：割り当てられていないプロジェクトは内容の確認だけできます。</p></section><AssignmentPanel projects={projects} users={users} onChanged={refresh} /></div>}</main></div>;
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
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
        void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => undefined);
      }
    } finally {
      setSelectedProject(null);
      setUser(null);
    }
  }
  if (selectedProject) return <Workspace project={selectedProject} user={user} onBack={() => setSelectedProject(null)} onLogout={logout} />;
  return <Dashboard user={user} onOpen={setSelectedProject} onLogout={logout} />;
}
