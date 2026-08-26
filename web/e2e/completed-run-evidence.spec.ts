import { expect, test, type Page } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, completeRun, createStartedRun, savePass, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

function evidenceHeading(page: Page) {
  return page.locator(".evidence-panel").getByRole("heading", { name: "証跡", exact: true });
}

async function expectEvidenceUploadLayout(page: Page) {
  const panel = page.locator(".evidence-panel");
  await expect(panel.locator(".evidence-heading .muted")).toBeHidden();
  await expect(panel.locator(".evidence-entry-heading")).toBeHidden();
  await expect(panel.getByText("任意", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("必須", { exact: true })).toHaveCount(0);

  const fileField = panel.locator('label:has(input[name="file"])');
  const descriptionField = panel.locator('label:has(input[name="description"])');
  const clipboardButton = panel.getByRole("button", { name: "クリップボードから貼り付け" });
  await expect(fileField).toBeVisible();
  await expect(descriptionField).toBeVisible();
  await expect(clipboardButton).toBeVisible();

  const [fileBox, descriptionBox, clipboardBox] = await Promise.all([
    fileField.boundingBox(), descriptionField.boundingBox(), clipboardButton.boundingBox(),
  ]);
  if (!fileBox || !descriptionBox || !clipboardBox) throw new Error("証跡アップロードUIの配置を取得できませんでした。");

  const uploadLeft = Math.min(fileBox.x, clipboardBox.x);
  const uploadRight = Math.max(fileBox.x + fileBox.width, clipboardBox.x + clipboardBox.width);
  expect(Math.abs((uploadRight - uploadLeft) - descriptionBox.width)).toBeLessThanOrEqual(3);
  expect(Math.abs(fileBox.y - clipboardBox.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(fileBox.height - clipboardBox.height)).toBeLessThanOrEqual(2);
  expect(descriptionBox.y).toBeGreaterThanOrEqual(fileBox.y + fileBox.height + 8);
}

test("完了済み実行を切り替えても以前の実行ケースで証跡を取得しない", async ({ page }) => {
  const first = await createStartedRun(page);
  await savePass(page, first.caseNames[0]!);
  await completeRun(page);
  await expectEvidenceUploadLayout(page);

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
  await expect(evidenceHeading(page)).toBeVisible();
  await page.waitForTimeout(400);
  await runList.getByRole("button").filter({ hasText: secondRunName }).click();
  await expect(evidenceHeading(page)).toBeVisible();
  await page.waitForTimeout(400);

  await expect(page.getByText("実行ケースがプロジェクトに存在しません。", { exact: false })).toHaveCount(0);
  expect(failedEvidenceRequests).toEqual([]);
  await archiveProject(page, first.projectName);
});
