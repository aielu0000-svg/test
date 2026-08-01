export type RunResultStatus = "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "skip";
export type RunLifecycleStatus = "draft" | "in_progress" | "completed";

export function requiresActualResult(status: RunResultStatus): boolean {
  return status === "fail" || status === "blocked" || status === "skip";
}

export function calculatePassRate(counts: Partial<Record<RunResultStatus, number>>): number | null {
  const passed = Math.max(0, Number(counts.pass ?? 0));
  const failed = Math.max(0, Number(counts.fail ?? 0));
  const denominator = passed + failed;
  return denominator === 0 ? null : passed / denominator;
}

export function isRunMutable(status: RunLifecycleStatus): boolean {
  return status !== "completed";
}

export function completionBlocker(total: number, incomplete: number, missingActual: number): string | null {
  if (total <= 0) return "確認項目がない実行は完了できません。";
  if (incomplete > 0) return `未実行または実行中の確認項目が${incomplete}件あります。`;
  if (missingActual > 0) return `実績結果が必要な確認項目が${missingActual}件あります。`;
  return null;
}

export function withoutScenarioCases(caseIds: string[], scenarioCaseIds: Iterable<string>): string[] {
  const covered = new Set(scenarioCaseIds);
  return caseIds.filter((caseId) => !covered.has(caseId));
}
