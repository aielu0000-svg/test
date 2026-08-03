import { expect, test } from "@playwright/test";
import { assertE2EConfiguration } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("スキーマ検証済みのWebサーバーだけがreadyになる", async ({ page }) => {
  const response = await page.request.get("/readyz");
  expect(response.status()).toBe(200);
  await expect.poll(async () => (await page.request.get("/healthz")).status()).toBe(200);
});