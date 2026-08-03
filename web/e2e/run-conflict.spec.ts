import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, createStartedRun } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("409競合時に再読込・入力コピー・差分確認を利用できる", async ({ page }) => {
  await createStartedRun(page, 1);
  let rejected = false;
  await page.route("**/api/run-cases/*", async (route) => {
    if (!rejected && route.request().method() === "PATCH") {
      rejected = true;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "OPTIMISTIC_LOCK_CONFLICT",
            message: "他の利用者によって更新されています。最新内容を確認してください。",
            requestId: "e2e-run-conflict",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  const execution = page.locator(".focused-run-case");
  await execution.getByLabel("備考", { exact: true }).fill("競合時に保持する入力");
  await execution.getByRole("button", { name: "保存", exact: true }).click();

  const recovery = execution.getByRole("region", { name: "競合の復旧" });
  await expect(recovery).toBeVisible();
  await expect(recovery.getByRole("button", { name: "最新状態を再読み込み" })).toBeVisible();
  await expect(recovery.getByRole("button", { name: "現在入力をコピー" })).toBeVisible();
  await expect(recovery.getByRole("button", { name: "差分を確認" })).toBeVisible();

  await recovery.getByRole("button", { name: "差分を確認" }).click();
  await expect(recovery.getByLabel("競合差分")).toContainText("競合時に保持する入力");
  await expect(recovery.getByLabel("競合差分")).toContainText("サーバー最新");

  await recovery.getByRole("button", { name: "現在入力をコピー" }).click();
  await expect(recovery.getByText("現在入力をクリップボードへコピーしました。")).toBeVisible();

  await recovery.getByRole("button", { name: "最新状態を再読み込み" }).click();
  await expect(execution.getByText("サーバーの最新状態を再読み込みしました。")).toBeVisible();
});
