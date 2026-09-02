import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("フォルダ選択時に重複操作を表示せず削除ダイアログが画面全体を覆う", async ({ page }) => {
  await login(page);
  await createProject(page, unique("E2E フォルダ表示"));

  const folderName = unique("削除対象フォルダ");
  await page.getByRole("button", { name: "＋ フォルダ" }).click();
  await page.getByLabel("作成するフォルダ名").fill(folderName);
  await page.getByLabel("作成するフォルダ名").press("Enter");

  const folder = page.getByRole("treeitem", { name: `フォルダ ${folderName}`, exact: true });
  await expect(folder).toBeVisible();
  await folder.click();
  await expect(page.locator(".design-selection-toolbar")).toHaveCount(0);

  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "削除" }).click();
  const dialog = page.getByRole("dialog", { name: "選択項目を削除" });
  await expect(dialog).toBeVisible();

  const backdropCoversEditor = await page.evaluate(() => {
    const target = document.elementFromPoint(window.innerWidth - 20, Math.floor(window.innerHeight / 2));
    return Boolean(target?.closest(".design-modal-backdrop"));
  });
  expect(backdropCoversEditor).toBe(true);

  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
});
