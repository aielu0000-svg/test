import { expect, test, type Page } from "@playwright/test";
import { assertE2EConfiguration, createProject, createTestDesign, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

async function dispatchExplorerDrag(page: Page, sourceType: "folder" | "scenario", sourceId: string, targetFolderId: string | null): Promise<void> {
  await page.evaluate(({ sourceType, sourceId, targetFolderId }) => {
    const source = document.querySelector<HTMLElement>(`[data-item-type="${sourceType}"][data-item-id="${sourceId}"]`);
    const target = targetFolderId
      ? document.querySelector<HTMLElement>(`[data-item-type="folder"][data-item-id="${targetFolderId}"]`)
      : document.querySelector<HTMLElement>(".design-root-label");
    if (!source || !target) throw new Error("DnD source or target was not found.");
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
  }, { sourceType, sourceId, targetFolderId });
}

test("フォルダをエクスプローラー操作で作成・選択・移動・名前変更・削除できる", async ({ page }) => {
  await login(page);
  await createProject(page, unique("E2E フォルダ操作"));

  const rootName = unique("親フォルダ");
  const childName = unique("子フォルダ");
  const renamedChild = `${childName} 変更後`;
  const deleteName = unique("削除フォルダ");

  await page.getByRole("button", { name: "＋ フォルダ" }).click();
  await page.getByLabel("作成するフォルダ名").fill(rootName);
  await page.getByLabel("作成するフォルダ名").press("Enter");
  const rootFolder = page.getByRole("treeitem", { name: `フォルダ ${rootName}`, exact: true });
  await expect(rootFolder).toBeVisible();
  await expect(rootFolder).toHaveAttribute("aria-expanded", "true");

  await rootFolder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "新しいサブフォルダ" }).click();
  await page.getByLabel("作成するフォルダ名").fill(childName);
  await page.getByLabel("作成するフォルダ名").press("Enter");
  const childFolder = page.getByRole("treeitem", { name: `フォルダ ${childName}`, exact: true });
  await expect(childFolder).toBeVisible();

  await childFolder.click();
  await childFolder.press("F2");
  await page.getByLabel("フォルダ名を変更").fill(renamedChild);
  await page.getByLabel("フォルダ名を変更").press("Enter");
  const renamedFolder = page.getByRole("treeitem", { name: `フォルダ ${renamedChild}`, exact: true });
  await expect(renamedFolder).toBeVisible();

  await rootFolder.click();
  await rootFolder.press("F2");
  await page.getByLabel("フォルダ名を変更").fill(`${rootName} 取消確認`);
  await page.getByLabel("フォルダ名を変更").press("Escape");
  await expect(page.getByRole("treeitem", { name: `フォルダ ${rootName}`, exact: true })).toBeVisible();

  const first = await createTestDesign(page);
  const second = await createTestDesign(page);
  const firstRow = page.getByRole("treeitem", { name: `テスト ${first.testName}`, exact: true });
  const secondRow = page.getByRole("treeitem", { name: `テスト ${second.testName}`, exact: true });
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();

  await firstRow.click();
  await secondRow.click({ modifiers: ["Control"] });
  await expect(page.getByText("2件選択", { exact: true })).toBeVisible();
  await page.getByLabel("選択項目の移動先").selectOption({ label: `${rootName} / ${renamedChild}` });
  await page.getByRole("button", { name: "選択項目を移動" }).click();
  await expect(page.getByText("2件を移動しました。", { exact: true })).toBeVisible();

  const rootId = await rootFolder.getAttribute("data-item-id");
  const childId = await renamedFolder.getAttribute("data-item-id");
  const firstId = await firstRow.getAttribute("data-item-id");
  expect(rootId).toBeTruthy();
  expect(childId).toBeTruthy();
  expect(firstId).toBeTruthy();
  await expect(firstRow).toHaveAttribute("data-parent-id", childId!);
  await expect(secondRow).toHaveAttribute("data-parent-id", childId!);

  await renamedFolder.click();
  const breadcrumb = page.getByRole("navigation", { name: "フォルダのパンくず" });
  await expect(breadcrumb).toContainText("プロジェクト直下");
  await expect(breadcrumb).toContainText(rootName);
  await expect(breadcrumb).toContainText(renamedChild);

  await renamedFolder.press("Enter");
  await expect(renamedFolder).toHaveAttribute("aria-expanded", "false");
  await renamedFolder.press("Enter");
  await expect(renamedFolder).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "選択解除" }).click();
  await dispatchExplorerDrag(page, "scenario", firstId!, null);
  await expect(firstRow).toHaveAttribute("data-parent-id", "");
  await expect(secondRow).toHaveAttribute("data-parent-id", childId!);

  await dispatchExplorerDrag(page, "folder", rootId!, childId!);
  await expect(rootFolder).toHaveAttribute("data-parent-id", "");

  await firstRow.press("Enter");
  await expect(page.getByLabel("テスト名")).toHaveValue(first.testName);

  await page.locator(".design-root-label").click({ button: "right" });
  await page.getByRole("menuitem", { name: "新しいフォルダ" }).click();
  await page.getByLabel("作成するフォルダ名").fill(deleteName);
  await page.getByLabel("作成するフォルダ名").press("Enter");
  const deleteFolder = page.getByRole("treeitem", { name: `フォルダ ${deleteName}`, exact: true });
  await expect(deleteFolder).toBeVisible();
  await deleteFolder.click();
  await deleteFolder.press("Delete");
  await expect(page.getByRole("dialog", { name: "選択項目を削除" })).toBeVisible();
  await page.getByLabel("削除理由").fill("E2Eフォルダ削除確認");
  await page.getByRole("button", { name: "削除する" }).click();
  await expect(deleteFolder).toHaveCount(0);
});
