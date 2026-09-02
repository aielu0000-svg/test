import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

function rowTexts(row: ExcelJS.Row, count: number): string[] {
  return Array.from({ length: count }, (_, index) => row.getCell(index + 1).text);
}

test("公式Excelテンプレートからテスト設計全体を取り込める", async ({ page }, testInfo) => {
  await login(page);
  await createProject(page, unique("E2E Excel取込"));

  await page.getByRole("button", { name: "Excelから追加・エクスポート" }).click();
  const templateResponse = await page.request.get("/api/imports/excel/template");
  expect(templateResponse.ok()).toBe(true);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await templateResponse.body());
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["使い方", "入力", "共通データ"]);
  expect(workbook.getWorksheet("使い方")!.state).toBe("hidden");

  const input = workbook.getWorksheet("入力")!;
  const common = workbook.getWorksheet("共通データ")!;
  expect(input.getRow(1).cellCount).toBe(8);
  expect(rowTexts(input.getRow(1), 8)).toEqual([
    "テスト項目（必須）", "確認項目（必須）", "操作（必須）", "確認観点・期待結果（必須）",
    "対象・確認箇所（任意）", "優先度（任意）", "テストデータ（任意）", "タグ（任意）",
  ]);
  expect(input.getCell("I1").value).toBeNull();
  expect(input.getCell("A2").value).toBe("ログイン機能の確認");
  expect(input.getCell("E2").value).toBe("ログイン画面");
  expect(input.getCell("F2").value).toBe("高");
  expect(input.getCell("H2").value).toBe("smoke, login");
  expect(input.getCell("C3").value).toBe("ログインボタンを押す");

  expect(common.getRow(1).cellCount).toBe(6);
  expect(rowTexts(common.getRow(1), 6)).toEqual([
    "テスト項目（必須）", "項目名（必須）", "値（任意）", "メモ（任意）", "データ名（任意）", "説明（任意）",
  ]);
  expect(common.getCell("G1").value).toBeNull();
  expect(common.getCell("F2").value).toBe("正常系ログインで使用");

  input.getRow(2).values = [
    "ログイン機能の確認", "正常ログイン", "ユーザー名とパスワードを入力する", "入力値が表示される",
    "ログイン画面", "高", "ユーザー: test-user", "smoke,login",
  ];
  input.getRow(3).values = [null, null, "ログインボタンを押す", "ダッシュボードが表示される", null, null, null, null];
  common.getRow(2).values = ["ログイン機能の確認", "共通URL", "https://example.test/login", "テスト環境", "ログイン共通データ", "ログイン確認で共通利用"];
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
  await expect(page.getByLabel("テストデータ 1")).toHaveValue("ユーザー: test-user");
  await page.getByRole("tab", { name: "共通データ", exact: true }).click();
  await expect(page.getByLabel("共通データ名 1")).toHaveValue("共通URL");
  await expect(page.getByLabel("共通データ値 1")).toHaveValue("https://example.test/login");
});
