import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createStartedRun, uploadPngEvidence } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("証跡追加が独立実行で成功する", async ({ page }) => {
  const run = await createStartedRun(page);
  await uploadPngEvidence(page);
  await expect(page.locator(".evidence-grid article")).toHaveCount(1);
  await archiveProject(page, run.projectName);
});