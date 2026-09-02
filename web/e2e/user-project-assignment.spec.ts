import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createProject, e2eUsername, login } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("ユーザーとプロジェクトを画面で割当・解除できる", async ({ page }) => {
  await login(page);
  const projectName = await createProject(page);
  await page.getByRole("button", { name: "← プロジェクト" }).click();
  await page.getByRole("button", { name: "ユーザー管理", exact: true }).click();
  await page.locator("select[multiple]").selectOption({ label: e2eUsername! });
  await page.locator("fieldset.assignment-projects").getByText(projectName, { exact: true }).click();
  await page.getByRole("button", { name: "選択内容を割り当て" }).click();
  await expect(page.getByText(/割当を.*件追加しました/)).toBeVisible();
  await page.getByRole("button", { name: "選択内容を解除" }).click();
  await expect(page.getByText(/割当を.*件解除しました/)).toBeVisible();
  await archiveProject(page, projectName);
});