import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("公式Excelテンプレートからテスト設計全体を取り込める", async ({ page }, testInfo) => {
  await login(page);
  await createProject(page, unique("E2E Excel取込"));

  await page.getByRole("button", { name: "Excelから追加・エクスポート" }).click();
  const templateResponse = await page.request.get("/api/imports/excel/template");
  expect(templateResponse.ok()).toBe(true);
  const templatePath = testInfo.outputPath("the-test-design-template.xlsx");
  await writeFile(templatePath, await templateResponse.body());

  await page.locator('input[type="file"][name="file"]').setInputFiles(templatePath);
  await page.getByRole("button", { name: "アップロードして検証" }).click();
  await expect(page.getByRole("heading", { name: "検証結果" })).toBeVisible();
  await expect(page.getByText("1テスト / 1確認項目", { exact: true })).toBeVisible();
  await expect(page.getByText("ログイン機能の確認（1確認項目）", { exact: true })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "追加を確定" });
  await expect(confirmButton).toBeEnabled();

  const confirmResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && /\/api\/imports\/excel\/[^/]+\/confirm$/.test(new URL(response.url()).pathname),
  );
  await confirmButton.click();
  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse.status()).toBe(200);

  const importedScenario = page.getByRole("treeitem", { name: "テスト ログイン機能の確認", exact: true });
  await expect(importedScenario).toBeVisible();
  await importedScenario.click();
  await expect(page.getByLabel("テスト名")).toHaveValue("ログイン機能の確認");
  await expect(page.getByLabel("確認項目名 1")).toHaveValue("正常ログイン");
  await expect(page.getByLabel("テストデータ 1")).toHaveValue("ユーザー: test-user");
  await expect(page.getByLabel("共通データ名 1")).toHaveValue("共通URL");
  await expect(page.getByLabel("共通データ値 1")).toHaveValue("https://example.test/login");
});
