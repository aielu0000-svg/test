import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("公式Excelテンプレートからテスト設計全体を取り込める", async ({ page }, testInfo) => {
  await login(page);
  await createProject(page, unique("E2E Excel取込"));

  await page.getByRole("button", { name: "Excelから追加・エクスポート" }).click();
  const templateResponse = await page.request.get("/api/imports/excel/template");
  expect(templateResponse.ok()).toBe(true);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResponse.body());
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["使い方", "入力", "共通データ"]);
  const input = workbook.getWorksheet("入力")!;
  const common = workbook.getWorksheet("共通データ")!;
  expect(input.getRow(1).cellCount).toBe(4);
  expect(input.getCell("A1").text).toBe("テスト名");
  expect(input.getCell("B1").text).toBe("確認項目名");
  expect(input.getCell("C1").text).toBe("操作");
  expect(input.getCell("D1").text).toBe("期待結果");
  expect(input.getCell("E1").value).toBeNull();
  expect(input.getCell("A2").value).toBe("ログイン機能の確認");
  expect(input.getCell("D2").value).toBe("入力値が表示される");
  expect(input.getCell("C3").value).toBe("ログインボタンを押す");
  expect(common.getRow(1).cellCount).toBe(3);
  expect(common.getCell("A1").text).toBe("テスト名");
  expect(common.getCell("B1").text).toBe("項目名");
  expect(common.getCell("C1").text).toBe("値");
  expect(common.getCell("D1").value).toBeNull();
  expect(common.getCell("C2").value).toBe("https://example.test/login");

  input.getRow(2).values = ["ログイン機能の確認", "正常ログイン", "ユーザー名とパスワードを入力する", "入力値が表示される"];
  input.getRow(3).values = [null, null, "ログインボタンを押す", "ダッシュボードが表示される"];
  common.getRow(2).values = ["ログイン機能の確認", "共通URL", "https://example.test/login"];
  const templatePath = testInfo.outputPath("the-test-design-template.xlsx");
  await writeFile(templatePath, Buffer.from(await workbook.xlsx.writeBuffer()));

  await page.locator('input[type="file"][name="file"]').setInputFiles(templatePath);
  await page.getByRole("button", { name: "アップロードして検証" }).click();
  await expect(page.getByRole("heading", { name: "追加前の確認" })).toBeVisible();
  await expect(page.getByText("1テスト / 1確認項目", { exact: true })).toBeVisible();
  await expect(page.getByText("ログイン機能の確認（1確認項目）", { exact: true })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "この内容を追加" });
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
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await expect(page.getByLabel("確認項目名 1")).toHaveValue("正常ログイン");
  await expect(page.getByLabel("テストデータ 1")).toHaveValue("");
  await page.getByRole("tab", { name: "共通データ", exact: true }).click();
  await expect(page.getByLabel("共通データ名 1")).toHaveValue("共通URL");
  await expect(page.getByLabel("共通データ値 1")).toHaveValue("https://example.test/login");
});
