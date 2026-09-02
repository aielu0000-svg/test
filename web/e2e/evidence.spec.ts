import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createStartedRun, uploadPngEvidence } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("証跡追加が独立実行で成功する", async ({ page }) => {
  const run = await createStartedRun(page);
  await uploadPngEvidence(page);

  const evidenceCard = page.locator(".evidence-grid article");
  const successMessage = page.locator(".evidence-panel > .success-message");
  await expect(evidenceCard).toHaveCount(1);
  await expect(successMessage).toBeVisible();
  expect(await evidenceCard.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");

  const [cardBox, messageBox] = await Promise.all([evidenceCard.boundingBox(), successMessage.boundingBox()]);
  if (!cardBox || !messageBox) throw new Error("証跡カードと成功メッセージの配置を取得できませんでした。");
  expect(messageBox.y - (cardBox.y + cardBox.height)).toBeGreaterThanOrEqual(12);

  await archiveProject(page, run.projectName);
});