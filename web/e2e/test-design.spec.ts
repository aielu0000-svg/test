import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createProject, createTestDesign, login } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("テスト設計を独立プロジェクトへ保存する", async ({ page }) => {
  await login(page);
  const projectName = await createProject(page);
  const design = await createTestDesign(page, 2);
  await expect(page.getByText(design.caseNames[1]!, { exact: true })).toBeVisible();
  await archiveProject(page, projectName);
});