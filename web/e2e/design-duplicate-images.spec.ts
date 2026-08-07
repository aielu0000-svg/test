import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("テスト複製で確認項目と見る場所画像を独立コピーする", async ({ page }) => {
  await login(page);
  await createProject(page, unique("E2E テスト画像複製"));
  const testName = unique("画像付きテスト");
  const validPng = await sharp({ create: { width: 24, height: 18, channels: 4, background: { r: 0, g: 122, b: 99, alpha: 1 } } }).png().toBuffer();

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
  await page.getByLabel("テスト名").fill(testName);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await page.getByLabel("確認項目名 1").fill("画像付き確認項目");
  await page.getByLabel("詳細操作 1", { exact: true }).fill("対象画面を開く");
  await page.getByLabel("詳細期待結果 1", { exact: true }).fill("対象が表示される");
  await page.locator(".design-image-actions input[type=file]").setInputFiles({ name: "source.png", mimeType: "image/png", buffer: validPng });
  const sourceImage = page.locator(".design-image-grid img");
  await expect(sourceImage).toBeVisible();
  const sourceUrl = await sourceImage.getAttribute("src");
  expect(sourceUrl).toBeTruthy();
  await page.locator(".design-action-save").click();
  await expect(page.getByText("テスト全体を保存しました。")).toBeVisible();

  const sourceTreeItem = page.getByRole("treeitem", { name: `テスト ${testName}`, exact: true });
  await sourceTreeItem.click({ button: "right" });
  await page.getByRole("menuitem", { name: "複製", exact: true }).click();

  await expect(page.getByLabel("テスト名")).toHaveValue(`${testName} のコピー`);
  await page.getByRole("tab", { name: /確認項目/ }).click();
  await expect(page.getByLabel("確認項目名 1")).toHaveValue("画像付き確認項目");
  const copiedImage = page.locator(".design-image-grid img");
  await expect(copiedImage).toBeVisible();
  const copiedUrl = await copiedImage.getAttribute("src");
  expect(copiedUrl).toBeTruthy();
  expect(copiedUrl).not.toBe(sourceUrl);
  await expect(page.getByRole("treeitem", { name: `テスト ${testName} のコピー`, exact: true })).toBeVisible();
});
