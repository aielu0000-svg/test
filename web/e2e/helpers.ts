import { expect, type Page } from "@playwright/test";

export const e2eUsername = process.env.E2E_USERNAME;
export const e2ePassword = process.env.E2E_PASSWORD;
export const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=";

export function assertE2EConfiguration(): void {
  const missing = [["E2E_USERNAME", e2eUsername], ["E2E_PASSWORD", e2ePassword]]
    .filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`E2Eを実行するには ${missing.join("、")} が必要です。skipせず設定不備として失敗します。`);
}

export function unique(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await page.getByLabel("ユーザー名").fill(e2eUsername!);
  await page.getByLabel("パスワード").fill(e2ePassword!);
  await page.getByRole("button", { name: "ログイン" }).click();
  if (await page.getByRole("heading", { name: "パスワードを変更してください" }).isVisible()) {
    throw new Error("E2E用ユーザーは初回パスワード変更を完了した専用アカウントにしてください。単独specの認証情報を変更しません。");
  }
  await expect(page.getByRole("button", { name: "プロジェクト", exact: true })).toBeVisible();
}

export async function createProject(page: Page, projectName = unique("E2E プロジェクト")): Promise<string> {
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.getByRole("button", { name: "＋ プロジェクト作成" }).click();
  await page.getByLabel("プロジェクト名").fill(projectName);
  await page.getByRole("button", { name: "作成する" }).click();
  const project = page.locator("article.project-card").filter({ has: page.getByRole("heading", { name: projectName, exact: true }) });
  await expect(project).toBeVisible();
  await project.getByRole("button", { name: "開く" }).click();
  return projectName;
}

export interface StartedRun {
  projectName: string;
  testName: string;
  runName: string;
  caseNames: string[];
}

export async function createTestDesign(page: Page, caseCount = 1): Promise<{ testName: string; caseNames: string[] }> {
  const suffix = unique("data");
  const testName = `E2E テスト ${suffix}`;
  const caseNames = Array.from({ length: caseCount }, (_, index) => `E2E 確認項目 ${index + 1} ${suffix}`);
  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByRole("tab", { name: "基本情報", exact: true }).click();
  await page.getByLabel("テスト名").fill(testName);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await page.getByLabel("確認項目名 1").fill(caseNames[0]!);
  await page.getByLabel("詳細操作 1", { exact: true }).fill("対象画面を開く");
  await page.getByLabel("詳細期待結果 1", { exact: true }).fill("対象画面が表示される");
  for (let index = 1; index < caseCount; index += 1) {
    await page.getByRole("button", { name: "＋ 確認項目", exact: true }).click();
    await page.getByLabel(`確認項目名 ${index + 1}`).fill(caseNames[index]!);
    await page.getByLabel("詳細操作 1", { exact: true }).fill(`操作 ${index + 1}`);
    await page.getByLabel("詳細期待結果 1", { exact: true }).fill(`期待結果 ${index + 1}`);
  }
  await page.locator(".design-action-save").click();
  await expect(page.getByText("テスト全体を保存しました。")).toBeVisible();
  return { testName, caseNames };
}

export async function createStartedRun(page: Page, caseCount = 1): Promise<StartedRun> {
  await login(page);
  const projectName = await createProject(page);
  const { testName, caseNames } = await createTestDesign(page, caseCount);
  const runName = unique("E2E 実行");
  await page.getByRole("button", { name: "このテストで実行を作成" }).click();
  await page.getByLabel("実行名").fill(runName);
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await expect(page.getByRole("heading", { name: runName })).toBeVisible();
  await page.getByRole("button", { name: "実行を開始" }).click();
  await expect(page.locator(".focused-run-case").getByRole("heading", { name: caseNames[0]!, exact: true })).toBeVisible();
  return { projectName, testName, runName, caseNames };
}

export async function savePass(page: Page, caseName: string, next = false): Promise<void> {
  const execution = page.locator(".focused-run-case");
  await expect(execution.getByRole("heading", { name: caseName, exact: true })).toBeVisible();
  await execution.getByRole("button", { name: "合格", exact: true }).click();
  await execution.getByRole("button", { name: next ? "保存して次の未実行へ →" : "保存", exact: true }).click();
  await expect(execution.locator(".save-state")).toContainText("保存済み");
}

export async function uploadPngEvidence(page: Page, filename = "evidence.png"): Promise<void> {
  const execution = page.locator(".focused-run-case");
  await execution.locator('input[type="file"]').setInputFiles({
    name: filename, mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64"),
  });
  await execution.getByRole("button", { name: "ファイルを追加" }).click();
  await expect(execution.getByText("証跡を登録しました。")).toBeVisible();
}

export async function completeRun(page: Page): Promise<void> {
  const execution = page.locator(".focused-run-case");
  await execution.getByRole("button", { name: "完了内容を確認", exact: true }).click();
  const review = page.getByRole("dialog", { name: "完了前チェック" });
  await expect(review).toBeVisible();
  const complete = review.getByRole("button", { name: "テストを完了", exact: true });
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(page.getByText(/この実行は完了済みです/)).toBeVisible();
}

export async function archiveProject(page: Page, projectName: string): Promise<void> {
  const back = page.getByRole("button", { name: "← プロジェクト" });
  if (await back.isVisible()) await back.click();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  const project = page.locator("article.project-card").filter({ has: page.getByRole("heading", { name: projectName, exact: true }) });
  await project.getByRole("button", { name: "アーカイブ" }).click();
  await expect(project.getByText("アーカイブ済み")).toBeVisible();
}
