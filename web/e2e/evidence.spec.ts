import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createStartedRun, pngBase64, uploadPngEvidence } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("証跡追加が独立実行で成功する", async ({ page }) => {
  const run = await createStartedRun(page);
  await uploadPngEvidence(page);

  const evidencePanel = page.locator(".evidence-panel");
  const evidenceCard = page.locator(".evidence-grid article");
  const successMessage = page.locator(".evidence-panel > .success-message");
  await expect(evidenceCard).toHaveCount(1);
  await expect(successMessage).toBeVisible();
  expect(await evidencePanel.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
  expect(await evidenceCard.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");

  const [cardBox, successBox] = await Promise.all([evidenceCard.boundingBox(), successMessage.boundingBox()]);
  if (!cardBox || !successBox) throw new Error("証跡カードと成功メッセージの配置を取得できませんでした。");
  expect(successBox.y - (cardBox.y + cardBox.height)).toBeGreaterThanOrEqual(12);

  // 500応答の一般向け失敗文でも、文言に依存せずエラー表示と同じ余白になることを確認する。
  await page.route(/\/api\/evidence\?.*$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "forced server failure" } }) });
      return;
    }
    await route.continue();
  });
  const execution = page.locator(".focused-run-case");
  await execution.locator('input[type="file"]').setInputFiles({
    name: "evidence-error.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64"),
  });
  await execution.getByRole("button", { name: "ファイルを追加" }).click();
  const errorMessage = page.locator(".evidence-panel > .error-message");
  await expect(errorMessage).toHaveText("アップロードに失敗しました。");
  const errorBox = await errorMessage.boundingBox();
  if (!errorBox) throw new Error("証跡エラーメッセージの配置を取得できませんでした。");
  expect(errorBox.y - (cardBox.y + cardBox.height)).toBeGreaterThanOrEqual(12);

  await archiveProject(page, run.projectName);
});
