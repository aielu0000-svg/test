export type RunWorkflowStatus = "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "skip";

export function countRunStatuses(items: Array<{ status: RunWorkflowStatus }>): Record<RunWorkflowStatus, number> {
  const counts: Record<RunWorkflowStatus, number> = { not_run: 0, in_progress: 0, pass: 0, fail: 0, blocked: 0, skip: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

export function nextPendingCaseIndex(items: Array<{ status: RunWorkflowStatus }>, currentIndex: number): number {
  if (!items.length) return -1;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const candidate = (currentIndex + offset) % items.length;
    if (items[candidate]?.status === "not_run" || items[candidate]?.status === "in_progress") return candidate;
  }
  return -1;
}
