import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { archiveProject, assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("ユーザー作成をモーダルで開き、アーカイブ済みプロジェクトを確認付きで完全削除できる", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "ユーザー管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ユーザー管理", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "ユーザー作成" })).toHaveCount(0);
  await page.getByRole("button", { name: "＋ ユーザー作成", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "ユーザー作成" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("button", { name: "閉じる" }).click();
  await expect(createDialog).toHaveCount(0);

  const projectName = unique("E2E 削除対象");
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await createProject(page, projectName);
  await archiveProject(page, projectName);
  const project = page.locator("article.project-card").filter({ has: page.getByRole("heading", { name: projectName, exact: true }) });
  await project.getByRole("button", { name: "完全削除", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "プロジェクト削除" });
  await expect(deleteDialog.getByRole("button", { name: "削除する" })).toBeDisabled();
  await deleteDialog.getByLabel(new RegExp(`確認のため.*${projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).fill(projectName);
  await deleteDialog.getByRole("button", { name: "完全削除する" }).click();
  await expect(project).toHaveCount(0);
  const projectList = await page.request.get("/api/projects");
  expect(projectList.ok()).toBeTruthy();
  const projectPayload = await projectList.json() as { projects: Array<{ id: string; name: string }> };
  expect(projectPayload.projects.some((item) => item.name === projectName)).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toHaveCount(0);
});

test("選択フォルダへ新規テストを配置し、複数手順を一覧で確認できる", async ({ page }) => {
  await login(page);
  await createProject(page, unique("E2E 設計改善"));
  const folderName = unique("選択フォルダ");
  await page.getByRole("button", { name: "＋ フォルダ" }).click();
  await page.getByLabel("作成するフォルダ名").fill(folderName);
  await page.getByLabel("作成するフォルダ名").press("Enter");
  const folder = page.getByRole("treeitem", { name: `フォルダ ${folderName}`, exact: true });
  const folderId = await folder.getAttribute("data-item-id");
  expect(folderId).toBeTruthy();
  await folder.click();
  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByRole("tab", { name: "基本情報", exact: true }).click();
  await expect(page.locator("label").filter({ hasText: /^フォルダ/ }).locator("select").first()).toHaveValue(folderId!);

  const testName = unique("フォルダ内テスト");
  const caseName = unique("複数手順ケース");
  await page.getByLabel("テスト名").fill(testName);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await page.getByLabel("確認項目名 1").fill(caseName);
  const operation = page.getByLabel("詳細操作 1", { exact: true });
  const initialSize = await operation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  await operation.fill("画面を開く\n入力内容が長い場合も横幅を変えずに折り返して表示する");
  const expandedSize = await operation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(expandedSize.height).toBeGreaterThan(initialSize.height);
  expect(Math.abs(expandedSize.width - initialSize.width)).toBeLessThan(1);
  await page.getByLabel("詳細期待結果 1", { exact: true }).fill("画面が表示される");
  await page.getByRole("button", { name: "＋ 操作手順" }).click();
  await page.getByLabel("詳細操作 2", { exact: true }).fill("保存する");
  await page.getByLabel("詳細期待結果 2", { exact: true }).fill("保存完了になる");
  await page.getByRole("button", { name: "テスト全体を保存" }).click();
  await expect(page.getByText("テスト全体を保存しました。")).toBeVisible();

  const testTreeItem = page.getByRole("treeitem", { name: `テスト ${testName}`, exact: true });
  await expect(testTreeItem).toHaveAttribute("data-parent-id", folderId!);
  const operationSummary = page.getByLabel("操作手順 1");
  await expect(operationSummary).toContainText("2手順");
  await expect(operationSummary).toContainText("画面を開く");
  await expect(operationSummary).toContainText("保存する");
  await expect(page.getByText(/↑↓で移動、Enterで開く/)).toHaveCount(0);
  await expect(page.getByText("所属フォルダ（複数選択可）")).toHaveCount(0);
});

test("実行時にデータと画像を確認・編集し、証跡画像入りExcelを出力できる", async ({ page }) => {
  await login(page);
  await createProject(page, unique("E2E 実行改善"));
  const suffix = unique("run-data");
  const testName = `データ表示テスト ${suffix}`;
  const caseName = `データ確認項目 ${suffix}`;
  const runName = `証跡出力実行 ${suffix}`;
  const validPng = await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 38, g: 105, b: 189, alpha: 1 } } }).png().toBuffer();

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByRole("tab", { name: "基本情報", exact: true }).click();
  await page.getByLabel("テスト名").fill(testName);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await page.getByLabel("確認項目名 1").fill(caseName);
  await page.getByLabel("詳細操作 1", { exact: true }).fill("対象を確認する");
  await page.getByLabel("詳細期待結果 1", { exact: true }).fill("値が一致する");
  await page.getByLabel("テストデータ 1").fill("ケース固有値 123");
  await page.locator(".design-image-actions input[type=file]").setInputFiles({ name: "view.png", mimeType: "image/png", buffer: validPng });
  await expect(page.locator(".design-image-grid img")).toBeVisible();

  await page.getByRole("tab", { name: "共通データ", exact: true }).click();
  const common = page.locator("details.design-common-data");
  await common.getByText("テスト共通データを設定する（任意）").click();
  await common.getByLabel("名前", { exact: true }).fill("E2E共通データ");
  await common.getByRole("button", { name: "＋ データ項目" }).click();
  await common.getByLabel("共通データ名 1").fill("共通キー");
  await common.getByLabel("共通データ値 1").fill("共通値 ABC");
  await page.getByRole("button", { name: "保存して実行を作成" }).click();

  await page.getByLabel("実行名").fill(runName);
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await page.getByRole("button", { name: "実行を開始" }).click();
  const execution = page.locator(".focused-run-case");
  await expect(execution.getByRole("heading", { name: caseName, exact: true })).toBeVisible();
  await expect(execution.locator(".run-test-data")).toContainText("ケース固有値 123");
  await expect(execution.locator(".run-test-data")).toContainText("共通キー");
  await expect(execution.locator(".run-test-data")).toContainText("共通値 ABC");

  await execution.getByRole("button", { name: "この実行用に編集" }).click();
  const editor = page.getByRole("dialog", { name: "見る場所画像編集" });
  await expect(editor).toBeVisible();
  await expect(editor.locator("canvas")).toHaveJSProperty("width", 32);
  await expect(editor.locator("canvas")).toHaveJSProperty("height", 24);
  await editor.getByRole("button", { name: "編集後の画像を保存" }).click();
  await expect(editor).toHaveCount(0);
  await execution.locator(".run-reference-preview").click();
  const lightbox = page.getByRole("dialog", { name: "見る場所画像の拡大表示" });
  await expect(lightbox).toBeVisible();
  await lightbox.getByRole("button", { name: "閉じる" }).click();

  await execution.getByRole("button", { name: "合格", exact: true }).click();
  await execution.getByRole("button", { name: "保存", exact: true }).click();
  await expect(execution.locator(".save-state")).toContainText("保存済み");
  await expect(execution.getByRole("button", { name: "保存して次の未実行へ →", exact: true })).toBeDisabled();

  await execution.locator('input[type="file"]').setInputFiles({ name: "evidence.png", mimeType: "image/png", buffer: validPng });
  await execution.getByRole("button", { name: "ファイルを追加" }).click();
  await expect(execution.getByText("証跡を登録しました。")).toBeVisible();

  await page.getByRole("button", { name: "Excelから追加・エクスポート" }).click();
  await page.getByRole("radio", { name: /テスト実行/ }).check();
  await page.locator(".export-options label").filter({ hasText: /^テスト実行/ }).locator("select").selectOption({ label: `${runName}（実行中）` });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "選択した内容をダウンロード" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("実行結果.xlsx");
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(downloadPath!);
  expect(workbook.getWorksheet("実行概要")).toBeTruthy();
  expect(workbook.getWorksheet("実行結果")).toBeTruthy();
  expect(workbook.getWorksheet("テストデータ")).toBeTruthy();
  const evidenceSheet = workbook.getWorksheet("証跡");
  expect(evidenceSheet).toBeTruthy();
  expect(evidenceSheet!.getImages().length).toBeGreaterThan(0);
});
