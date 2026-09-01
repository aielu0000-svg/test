import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("実行時の見る場所画像を右側に配置し、狭い画面では縦に積む", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await createProject(page, unique("E2E 見る場所配置"));

  const testName = unique("見る場所テスト");
  const caseName = unique("見る場所確認項目");
  const runName = unique("見る場所実行");
  const viewImage = await sharp({
    create: { width: 120, height: 90, channels: 4, background: { r: 38, g: 105, b: 189, alpha: 1 } },
  }).png().toBuffer();

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByRole("tab", { name: "基本情報", exact: true }).click();
  await page.getByLabel("テスト名").fill(testName);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await page.getByLabel("確認項目名 1").fill(caseName);
  await page.getByLabel("詳細操作 1", { exact: true }).fill("対象画面を確認する");
  await page.getByLabel("詳細期待結果 1", { exact: true }).fill("表示が一致する");
  await page.getByLabel("テストデータ 1").fill("配置確認データ");
  await page.locator(".design-image-actions input[type=file]").setInputFiles({
    name: "view-location.png",
    mimeType: "image/png",
    buffer: viewImage,
  });
  await expect(page.locator(".design-image-grid img")).toBeVisible();
  await page.getByRole("button", { name: "保存して実行を作成" }).click();

  await page.getByLabel("実行名").fill(runName);
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await page.getByRole("button", { name: "実行を開始" }).click();

  const execution = page.locator(".focused-run-case");
  const instructions = execution.locator(".run-instructions");
  const testData = execution.locator(".run-test-data");
  const reference = execution.locator(".run-reference-images");
  await expect(execution.getByRole("heading", { name: caseName, exact: true })).toBeVisible();
  await expect(instructions).toBeVisible();
  await expect(testData).toContainText("配置確認データ");
  await expect(reference).toBeVisible();
  await expect(reference).toHaveCSS("position", "static");
  await expect(reference.getByRole("button", { name: "この実行用に編集" })).toBeVisible();
  await expect(reference.getByText("画像を選択すると拡大表示します。")).toBeHidden();

  const [instructionBox, dataBox, referenceBox] = await Promise.all([
    instructions.boundingBox(),
    testData.boundingBox(),
    reference.boundingBox(),
  ]);
  if (!instructionBox || !dataBox || !referenceBox) throw new Error("見る場所レイアウトの計測に失敗しました。");

  expect(referenceBox.x).toBeGreaterThan(dataBox.x + dataBox.width);
  expect(Math.abs(referenceBox.y - instructionBox.y)).toBeLessThan(4);
  expect(referenceBox.width).toBeGreaterThanOrEqual(215);
  expect(referenceBox.width).toBeLessThanOrEqual(260);

  await reference.locator(".run-reference-preview").click();
  await expect(page.getByRole("dialog", { name: "見る場所画像の拡大表示" })).toBeVisible();
  await page.getByRole("dialog", { name: "見る場所画像の拡大表示" }).getByRole("button", { name: "閉じる" }).click();

  await page.setViewportSize({ width: 760, height: 900 });
  const [narrowDataBox, narrowReferenceBox] = await Promise.all([
    testData.boundingBox(),
    reference.boundingBox(),
  ]);
  if (!narrowDataBox || !narrowReferenceBox) throw new Error("狭幅の見る場所レイアウト計測に失敗しました。");

  expect(Math.abs(narrowReferenceBox.x - narrowDataBox.x)).toBeLessThan(3);
  expect(Math.abs(narrowReferenceBox.width - narrowDataBox.width)).toBeLessThan(3);
  expect(narrowReferenceBox.y).toBeGreaterThan(narrowDataBox.y + narrowDataBox.height - 1);
});
