import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, completeRun, createStartedRun, savePass, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("完了済み実行を切り替えても以前の実行ケースで証跡を取得しない", async ({ page }) => {
  const first = await createStartedRun(page);
  await savePass(page, first.caseNames[0]!);
  await completeRun(page);

  const secondRunName = unique("E2E 完了済み証跡切替");
  await page.getByRole("button", { name: "＋ 新しい実行" }).click();
  await page.getByLabel("実行名").fill(secondRunName);
  await page.getByLabel(first.testName).check();
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await expect(page.getByRole("heading", { name: secondRunName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "実行を開始" }).click();
  await savePass(page, first.caseNames[0]!);
  await completeRun(page);

  const failedEvidenceRequests: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/evidence" && response.status() >= 400) {
      failedEvidenceRequests.push(response.status() + " " + url.search);
    }
  });

  const runList = page.locator(".run-list");
  await runList.getByRole("button").filter({ hasText: first.runName }).click();
  await expect(page.getByRole("heading", { name: "証跡" })).toBeVisible();
  await page.waitForTimeout(400);
  await runList.getByRole("button").filter({ hasText: secondRunName }).click();
  await expect(page.getByRole("heading", { name: "証跡" })).toBeVisible();
  await page.waitForTimeout(400);

  await expect(page.getByText("実行ケースがプロジェクトに存在しません。", { exact: false })).toHaveCount(0);
  expect(failedEvidenceRequests).toEqual([]);
  await archiveProject(page, first.projectName);
});
