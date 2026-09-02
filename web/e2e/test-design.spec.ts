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

test("確認項目一覧を右クリックして複製と削除ができる", async ({ page }) => {
  await login(page);
  const projectName = await createProject(page);
  await createTestDesign(page, 2);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await expect(page.getByText("既存からコピー", { exact: true })).toHaveCount(0);

  const firstCase = page.locator(".design-case-card").first();
  await firstCase.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "複製" }).click();
  await expect(page.locator(".design-case-card")).toHaveCount(3);

  await page.locator(".design-case-card").last().click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "削除" }).click();
  await expect(page.locator(".design-case-card")).toHaveCount(2);
  await archiveProject(page, projectName);
});
