import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createProject, createTestDesign, login } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("テスト設計を独立プロジェクトへ保存する", async ({ page }) => {
  await login(page);
  const projectName = await createProject(page);
  const design = await createTestDesign(page, 2);
  await expect(page.getByRole("textbox", { name: "確認項目名 2", exact: true })).toHaveValue(design.caseNames[1]!);
  await archiveProject(page, projectName);
});
