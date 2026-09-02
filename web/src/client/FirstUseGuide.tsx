import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AuthUser } from "../shared/types.js";
import { api } from "./api.js";
import "./first-use-guide.css";

type Surface = "dashboard" | "workspace" | null;

type GuideStep = {
  title: string;
  description: string;
  target: () => HTMLElement | null;
};

function detectSurface(): Surface {
  if (document.querySelector(".workspace-tabs")) return "workspace";
  if (document.querySelector(".dashboard-nav")) return "dashboard";
  return null;
}

function buttonByText(selector: string, label: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLButtonElement>(selector)].find((button) => button.textContent?.trim() === label) ?? null;
}

function FirstUseGuide({ steps, completeLabel, onComplete, onSkip }: {
  steps: GuideStep[];
  completeLabel: string;
  onComplete: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const step = steps[index]!;

  useLayoutEffect(() => {
    const update = () => {
      const target = step.target();
      if (!target) {
        setTargetRect(null);
        return;
      }
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      setTargetRect(target.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const timer = window.setTimeout(update, 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [index]);

  async function finish() {
    if (busy) return;
    setBusy(true);
    try { await onComplete(); } finally { setBusy(false); }
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    try { await onSkip(); } finally { setBusy(false); }
  }

  const highlightStyle = targetRect ? {
    top: Math.max(4, targetRect.top - 6),
    left: Math.max(4, targetRect.left - 6),
    width: Math.max(0, targetRect.width + 12),
    height: Math.max(0, targetRect.height + 12),
  } : undefined;

  return <div className={`first-use-guide-layer${targetRect ? "" : " no-target"}`} aria-hidden="false">
    {targetRect && <div className="first-use-guide-highlight" style={highlightStyle} aria-hidden="true" />}
    <section className="first-use-guide-card" role="dialog" aria-modal="true" aria-labelledby="first-use-guide-title" aria-describedby="first-use-guide-description">
      <div className="first-use-guide-progress" aria-label={`ガイド ${index + 1} / ${steps.length}`}>{index + 1} / {steps.length}</div>
      <h2 id="first-use-guide-title">{step.title}</h2>
      <p id="first-use-guide-description">{step.description}</p>
      <div className="first-use-guide-actions">
        <button type="button" className="small" disabled={busy} onClick={() => void skip()}>今後表示しない</button>
        <div>
          {index > 0 && <button type="button" className="small" disabled={busy} onClick={() => setIndex((current) => current - 1)}>前へ</button>}
          {index < steps.length - 1
            ? <button ref={nextButtonRef} type="button" className="primary small" disabled={busy} onClick={() => setIndex((current) => current + 1)}>次へ</button>
            : <button ref={nextButtonRef} type="button" className="primary small" disabled={busy} onClick={() => void finish()}>{busy ? "処理中…" : completeLabel}</button>}
        </div>
      </div>
    </section>
  </div>;
}

export function FirstUseGuideController() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [surface, setSurface] = useState<Surface>(null);
  const [phase, setPhase] = useState<"dashboard" | "workspace">("dashboard");
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const loadingUser = useRef(false);

  useEffect(() => {
    const sync = () => {
      const nextSurface = detectSurface();
      setSurface(nextSurface);
      if (!nextSurface) {
        if (user) {
          setUser(null);
          setPhase("dashboard");
          setCompleted(false);
          setError("");
        }
        return;
      }
      if (user || loadingUser.current) return;
      loadingUser.current = true;
      void api.me().then(({ user: current }) => {
        if (!current.mustChangePassword) {
          setUser(current);
          setCompleted(current.onboardingCompleted);
        }
      }).catch(() => undefined).finally(() => { loadingUser.current = false; });
    };
    sync();
    const timer = window.setInterval(sync, 400);
    return () => window.clearInterval(timer);
  }, [user]);

  async function completeForUser() {
    setError("");
    try {
      const result = await api.completeOnboarding();
      setUser(result.user);
      setCompleted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ガイドの完了状態を保存できませんでした。");
      throw reason;
    }
  }

  if (!user || completed || user.mustChangePassword) return null;

  const dashboardSteps: GuideStep[] = [
    { title: "ダッシュボード", description: "テストケース数、進行中のテスト、合格率、再開が必要な作業を確認する入口です。", target: () => buttonByText(".dashboard-nav button", "ダッシュボード") },
    { title: "プロジェクト", description: "テストはプロジェクト単位で管理します。ここから対象プロジェクトを開きます。", target: () => buttonByText(".dashboard-nav button", "プロジェクト") },
    ...(user.role === "admin" ? [
      { title: "ユーザー管理", description: "ユーザーの作成、権限、利用状態、プロジェクト割当を管理します。", target: () => buttonByText(".dashboard-nav button", "ユーザー管理") },
      { title: "バックアップ・復元", description: "管理者向けのバックアップ作成と復元要求を扱います。", target: () => buttonByText(".dashboard-nav button", "バックアップ・復元") },
    ] : []),
  ];

  const workspaceSteps: GuideStep[] = [
    { title: "テスト設計", description: "テスト、確認項目、フォルダなど、実行前の内容を作成・整理します。", target: () => buttonByText(".workspace-tabs button", "テスト設計") },
    { title: "テスト実行", description: "作成済みのテストから実行を作り、結果、メモ、担当者、証跡を記録します。", target: () => buttonByText(".workspace-tabs button", "テスト実行") },
    { title: "Excelから追加・エクスポート", description: "公式テンプレートからテストを追加したり、プロジェクトの内容を外部へ出力したりします。", target: () => buttonByText(".workspace-tabs button", "Excelから追加・エクスポート") },
    { title: "削除済み", description: "論理削除されたテスト関連データを確認し、復元できるものを管理します。", target: () => buttonByText(".workspace-tabs button", "削除済み") },
  ];

  return <>
    {surface === "dashboard" && phase === "dashboard" && <FirstUseGuide steps={dashboardSteps} completeLabel="プロジェクトを開いて続ける" onComplete={() => setPhase("workspace")} onSkip={completeForUser} />}
    {surface === "dashboard" && phase === "workspace" && <aside className="first-use-guide-pending" role="status"><strong>初回ガイドの続き</strong><span>「プロジェクト」から任意のプロジェクトを開くと、主要タブの説明を続けます。</span><button type="button" className="small" onClick={() => void completeForUser()}>今後表示しない</button></aside>}
    {surface === "workspace" && phase === "workspace" && <FirstUseGuide steps={workspaceSteps} completeLabel="OK・ガイドを完了" onComplete={completeForUser} onSkip={completeForUser} />}
    {error && <p className="first-use-guide-error" role="alert">{error}</p>}
  </>;
}
