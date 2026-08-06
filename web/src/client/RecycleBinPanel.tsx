import { useEffect, useState } from "react";

type TrashType = "test-cases" | "folders" | "scenarios" | "data-sets" | "test-runs" | "evidence" | "procedures";
interface TrashItem { id: string; label: string; deletedAt?: string | null; reason?: string | null }

const labels: Record<TrashType, string> = {
  "test-cases": "テストケース",
  folders: "フォルダ",
  scenarios: "シナリオ",
  "data-sets": "データセット",
  "test-runs": "テスト実行",
  evidence: "証跡",
  procedures: "手順書",
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-The-Test-Request", "1");
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "通信に失敗しました。");
  return payload as T;
}

function rows(value: Record<string, unknown>, key: string, labelKey: string): TrashItem[] {
  const source = Array.isArray(value[key]) ? value[key] as Array<Record<string, unknown>> : [];
  return source.map((item) => ({
    id: String(item.id),
    label: String(item[labelKey] ?? item.original_filename ?? item.id),
    deletedAt: String(item.deletedAt ?? item.deleted_at ?? ""),
    reason: String(item.deleteReason ?? item.delete_reason ?? ""),
  }));
}
async function allDeletedEvidence(projectId: string): Promise<Record<string, unknown>> {
  const evidence: Array<Record<string, unknown>> = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await api<{ evidence: Array<Record<string, unknown>> }>(
      `/api/evidence/deleted?projectId=${encodeURIComponent(projectId)}&limit=${limit}&offset=${offset}`,
    );
    evidence.push(...page.evidence);
    if (page.evidence.length < limit) return { evidence };
  }
}


export function RecycleBinPanel({ projectId, canEdit, onChanged }: {
  projectId: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<Record<TrashType, TrashItem[]>>({
    "test-cases": [], folders: [], scenarios: [], "data-sets": [], "test-runs": [], evidence: [], procedures: [],
  });
  const [message, setMessage] = useState("");

  async function refresh() {
    const query = `projectId=${encodeURIComponent(projectId)}&includeDeleted=true`;
    const results = await Promise.all([
      api<Record<string, unknown>>(`/api/test-cases?${query}`),
      api<Record<string, unknown>>(`/api/folders?${query}`),
      api<Record<string, unknown>>(`/api/scenarios?${query}`),
      api<Record<string, unknown>>(`/api/data-sets?${query}`),
      api<Record<string, unknown>>(`/api/test-runs?${query}`),
      allDeletedEvidence(projectId),
      api<Record<string, unknown>>(`/api/procedures?${query}`),
    ]);
    setItems({
      "test-cases": rows(results[0], "cases", "title"),
      folders: rows(results[1], "folders", "name"),
      scenarios: rows(results[2], "scenarios", "title"),
      "data-sets": rows(results[3], "dataSets", "name"),
      "test-runs": rows(results[4], "runs", "name"),
      evidence: rows(results[5], "evidence", "original_filename"),
      procedures: rows(results[6], "procedures", "title"),
    });
  }

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "ごみ箱を読み込めませんでした。"));
  }, [projectId]);

  async function restore(type: TrashType, item: TrashItem) {
    setMessage("復元中…");
    try {
      await api(`/api/${type}/${item.id}/restore`, { method: "POST", body: JSON.stringify({ projectId }) });
      setMessage(`${labels[type]}「${item.label}」を復元しました。`);
      await Promise.all([refresh(), onChanged()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "復元に失敗しました。");
    }
  }

  const total = Object.values(items).reduce((sum, group) => sum + group.length, 0);
  return <section className="panel">
    <div className="section-heading"><div><h2>ごみ箱</h2><p className="muted">通常業務データと証跡は削除後30日以内に復元できます。</p></div><span>{total}件</span></div>
    {!canEdit && <p className="muted">復元にはプロジェクトの編集権限が必要です。</p>}
    <div className="trash-groups">
      {(Object.keys(labels) as TrashType[]).map((type) => <section key={type}>
        <h3>{labels[type]} <small>{items[type].length}件</small></h3>
        {!items[type].length ? <p className="muted">削除済みデータはありません。</p> : items[type].map((item) =>
          <article className="trash-row" key={item.id}>
            <div><strong>{item.label}</strong><small>{item.deletedAt ? new Date(item.deletedAt).toLocaleString("ja-JP") : "削除日時不明"}{item.reason ? ` / ${item.reason}` : ""}</small></div>
            <button disabled={!canEdit} onClick={() => void restore(type, item)}>復元</button>
          </article>)}
      </section>)}
    </div>
    {message && <p className={message.includes("復元しました") ? "success-message" : message === "復元中…" ? "muted" : "error-message"}>{message}</p>}
  </section>;
}
