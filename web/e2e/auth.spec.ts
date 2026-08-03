import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, login } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("認証・ログアウト・戻る操作でセッションを復元しない", async ({ page }) => {
  await login(page);
  await page.evaluate(() => window.history.pushState({}, "", "/?authenticated-view"));
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.goBack();
  await page.reload();
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
});

test("ログアウトAPI失敗を警告表示する", async ({ page }) => {
  await login(page);
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "intentional e2e failure", requestId: "e2e-logout" } }) }));
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByText(/クライアントのログイン状態は解除しましたが、サーバー側のセッションが残っている可能性があります。/)).toBeVisible();
});
