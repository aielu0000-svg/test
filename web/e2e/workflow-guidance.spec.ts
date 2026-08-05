import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeAll(() => assertE2EConfiguration());

test("業務導線から完了確認と不合格再実行まで進められる", async ({ page }) => {
  await login(page);
  await createProject(page, unique("E2E 導線改善"));

  const suffix = unique("workflow");
  const testName = `導線テスト ${suffix}`;
  const caseOne = `不合格対象 ${suffix}`;
  const caseTwo = `合格対象 ${suffix}`;
  const runName = `導線実行 ${suffix}`;

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByLabel("テスト名").fill(testName);
  await page.getByLabel("確認項目名 1").fill(caseOne);
  await page.getByLabel("操作 1", { exact: true }).fill("不合格対象を操作する");
  await page.getByLabel("期待結果 1", { exact: true }).fill("期待した結果になる");
  await page.getByRole("button", { name: "＋ 新しい確認項目" }).click();
  await page.getByLabel("確認項目名 2").fill(caseTwo);
  await page.getByLabel("操作 2", { exact: true }).fill("合格対象を操作する");
  await page.getByLabel("期待結果 2", { exact: true }).fill("正常に表示される");
  await page.getByRole("button", { name: "保存して実行を作成" }).click();

  await expect(page.getByRole("heading", { name: "実行準備" })).toBeVisible();
  await expect(page.getByLabel(testName)).toBeChecked();
  await page.getByLabel("実行名").fill(runName);
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await page.getByRole("button", { name: "実行を開始" }).click();
  await expect(page.locator(".focused-run-case").getByRole("heading", { name: caseOne, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "← プロジェクト" }).click();
  await expect(page.getByRole("heading", { name: "作業を再開" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(runName) }).click();
  await expect(page.locator(".focused-run-case").getByRole("heading", { name: caseOne, exact: true })).toBeVisible();

  const execution = page.locator(".focused-run-case");
  await execution.getByRole("button", { name: "不合格", exact: true }).click();
  await execution.getByLabel("実績結果（必須）").fill("表示が崩れた");
  await execution.getByRole("button", { name: "保存して次の未実行へ →", exact: true }).click();
  await expect(execution.getByRole("heading", { name: caseTwo, exact: true })).toBeVisible();
  await execution.getByRole("button", { name: "合格", exact: true }).click();
  await execution.getByRole("button", { name: "保存", exact: true }).click();
  await expect(execution.locator(".save-state")).toContainText("保存済み");

  await execution.getByRole("button", { name: "完了内容を確認", exact: true }).click();
  const review = page.getByRole("dialog", { name: "完了前チェック" });
  await expect(review).toBeVisible();
  await expect(review.getByText("全確認項目の結果が保存されています。")).toBeVisible();
  await review.getByRole("button", { name: "テストを完了", exact: true }).click();

  await expect(page.getByText(/この実行は完了済みです/)).toBeVisible();
  await page.getByRole("button", { name: "不合格・ブロック1件で再実行を作成" }).click();
  await expect(page.getByRole("heading", { name: `${runName} 再実行`, exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: caseOne, exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: caseTwo, exact: true })).not.toBeChecked();
});
