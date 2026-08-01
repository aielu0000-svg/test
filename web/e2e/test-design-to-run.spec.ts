import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;
const projectName = process.env.E2E_PROJECT;

test.beforeAll(() => {
  const missing = [["E2E_USERNAME", username], ["E2E_PASSWORD", password], ["E2E_PROJECT", projectName]]
    .filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`E2Eを実行するには ${missing.join("、")} が必要です。skipせず設定不備として失敗します。`);
});

test("5件を連続実行し、証跡・完了後編集・ログアウトを検証する", async ({ page }) => {

  const suffix = Date.now().toString();
  const testName = `E2E テスト ${suffix}`;
  const caseNames = Array.from({ length: 5 }, (_, index) => `E2E 確認項目 ${index + 1} ${suffix}`);
  const runName = `E2E 実行 ${suffix}`;

  await page.goto("/");
  await page.getByLabel("ユーザー名").fill(username!);
  await page.getByLabel("パスワード").fill(password!);
  await page.getByRole("button", { name: "ログイン" }).click();

  const project = page.locator("article.project-card").filter({
    has: page.getByRole("heading", { name: projectName!, exact: true }),
  });
  await project.getByRole("button", { name: "開く" }).click();

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByLabel("テスト名").fill(testName);
  await page.getByLabel("確認項目名 1").fill(caseNames[0]);
  await page.getByLabel("操作 1").fill("対象画面を開く");
  await page.getByLabel("期待結果 1").fill("対象画面が表示される");
  for (let index = 1; index < caseNames.length; index += 1) {
    await page.getByRole("button", { name: "＋ 新しい確認項目" }).click();
    await page.getByLabel(`確認項目名 ${index + 1}`).fill(caseNames[index]);
    await page.getByLabel(`操作 ${index + 1}`).fill(`操作 ${index + 1}`);
    await page.getByLabel(`期待結果 ${index + 1}`).fill(`期待結果 ${index + 1}`);
  }
  await page.getByRole("button", { name: "テスト全体を保存" }).click();
  await expect(page.getByText("テスト全体を保存しました。")).toBeVisible();

  await page.getByRole("button", { name: "テスト実行へ" }).click();
  await page.getByLabel("実行名").fill(runName);
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await expect(page.getByRole("heading", { name: runName })).toBeVisible();
  await page.getByRole("button", { name: "実行を開始" }).click();

  const execution = page.locator(".focused-run-case");
  for (let index = 0; index < caseNames.length; index += 1) {
    await expect(execution.getByRole("heading", { name: caseNames[index] })).toBeVisible();
    if (index === 0) {
      await execution.locator('input[type="file"]').setInputFiles({
        name: "evidence.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9xkAAAAASUVORK5CYII=", "base64"),
      });
      await execution.getByRole("button", { name: "ファイルを追加" }).click();
      await expect(execution.getByText("証跡を登録しました。")).toBeVisible();
    }
    await execution.getByRole("button", { name: "合格" }).click();
    await execution.getByRole("button", { name: index < caseNames.length - 1 ? "保存して次へ →" : "保存", exact: true }).click();
    await expect(execution.locator(".save-state")).toContainText("保存済み");
  }
  const completeButton = execution.getByRole("button", { name: "テストを完了" });
  await expect(completeButton).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await completeButton.click();
  await expect(page.getByText(/この実行は完了済みです/)).toBeVisible();

  await execution.getByRole("button", { name: "不合格" }).click();
  await execution.getByLabel("実績結果（必須）").fill("完了後の再確認で差異を検出");
  await execution.getByRole("button", { name: "保存", exact: true }).click();
  await expect(execution.locator(".save-state")).toContainText("保存済み");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
  const meStatus = await page.evaluate(async () => (await fetch("/api/auth/me", { credentials: "same-origin" })).status);
  expect(meStatus).toBe(401);
  await page.reload();
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
});
