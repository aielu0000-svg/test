import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, login, unique } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("初回ガイドは主要機能を順に案内し、完了後は同じユーザーへ再表示しない", async ({ page }) => {
  await login(page);

  const suffix = Date.now().toString(36);
  const username = `guide-admin-${suffix}`;
  const temporaryPassword = `temp-${suffix}`;
  const newPassword = `new-${suffix}`;
  const projectName = unique("初回ガイド確認");
  const headers = { "X-The-Test-Request": "1" };

  const createUser = await page.request.post("/api/users", {
    headers,
    data: { username, password: temporaryPassword, confirmation: temporaryPassword, role: "admin", displayName: "初回ガイド管理者" },
  });
  expect(createUser.ok()).toBeTruthy();
  const createProject = await page.request.post("/api/projects", { headers, data: { name: projectName, description: "初回ガイドE2E用" } });
  expect(createProject.ok()).toBeTruthy();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.getByLabel("ユーザー名").fill(username);
  await page.getByLabel("パスワード").fill(temporaryPassword);
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page.getByRole("heading", { name: "パスワードを変更してください" })).toBeVisible();
  await page.getByLabel("現在のパスワード").fill(temporaryPassword);
  await page.getByLabel("新しいパスワード").fill(newPassword);
  await page.getByLabel("確認入力").fill(newPassword);
  await page.getByRole("button", { name: "変更して続ける" }).click();

  const guide = page.locator(".first-use-guide-card");
  await expect(guide.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  await guide.getByRole("button", { name: "次へ" }).click();
  await expect(guide.getByRole("heading", { name: "プロジェクト" })).toBeVisible();
  await guide.getByRole("button", { name: "次へ" }).click();
  await expect(guide.getByRole("heading", { name: "ユーザー管理" })).toBeVisible();
  await guide.getByRole("button", { name: "次へ" }).click();
  await expect(guide.getByRole("heading", { name: "バックアップ・復元" })).toBeVisible();
  await guide.getByRole("button", { name: "プロジェクトを開いて続ける" }).click();

  await expect(page.getByText("初回ガイドの続き")).toBeVisible();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  const project = page.locator("article.project-card").filter({ has: page.getByRole("heading", { name: projectName, exact: true }) });
  await expect(project).toBeVisible();
  await project.getByRole("button", { name: "開く" }).click();

  await expect(guide.getByRole("heading", { name: "テスト設計" })).toBeVisible();
  await guide.getByRole("button", { name: "次へ" }).click();
  await expect(guide.getByRole("heading", { name: "テスト実行" })).toBeVisible();
  await guide.getByRole("button", { name: "次へ" }).click();
  await expect(guide.getByRole("heading", { name: "Excelから追加・エクスポート" })).toBeVisible();
  await guide.getByRole("button", { name: "次へ" }).click();
  await expect(guide.getByRole("heading", { name: "削除済み" })).toBeVisible();
  await guide.getByRole("button", { name: "OK・ガイドを完了" }).click();
  await expect(guide).toHaveCount(0);

  const me = await page.request.get("/api/auth/me");
  expect(me.ok()).toBeTruthy();
  expect((await me.json()).user.onboardingCompleted).toBe(true);

  await page.reload();
  await expect(page.locator(".first-use-guide-card")).toHaveCount(0);
});
