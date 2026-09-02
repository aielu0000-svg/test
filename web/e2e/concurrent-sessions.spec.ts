import { expect, test, type APIRequestContext } from "@playwright/test";
import { assertE2EConfiguration, login, unique } from "./helpers";

test.beforeAll(assertE2EConfiguration);

const writeHeaders = { "X-The-Test-Request": "1" };

type Folder = { id: string; name: string; version: number };

async function folders(request: APIRequestContext, projectId: string, includeDeleted = false): Promise<Folder[]> {
  const response = await request.get(`/api/folders?projectId=${encodeURIComponent(projectId)}&includeDeleted=${includeDeleted}`);
  expect(response.status()).toBe(200);
  return (await response.json() as { folders: Folder[] }).folders;
}

async function createFolder(request: APIRequestContext, projectId: string, name: string): Promise<string> {
  const response = await request.post("/api/folders", {
    headers: writeHeaders,
    data: { projectId, parentId: null, name },
  });
  expect(response.status()).toBe(200);
  return (await response.json() as { id: string }).id;
}

test("同一ユーザーと別ユーザーの同時接続でセッション分離と楽観ロックを維持する", async ({ browser, page }) => {
  await login(page);
  const origin = new URL(page.url()).origin;
  const sameUserContext = await browser.newContext({ baseURL: origin });
  const executorContext = await browser.newContext({ baseURL: origin });
  const sameUserPage = await sameUserContext.newPage();

  try {
    await login(sameUserPage);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    expect((await sameUserPage.request.get("/api/auth/me")).status()).toBe(200);

    const projectName = unique("E2E 同時接続");
    const projectResponse = await page.request.post("/api/projects", {
      headers: writeHeaders,
      data: { name: projectName, description: "concurrent-session regression" },
    });
    expect(projectResponse.status()).toBe(200);
    const projectId = (await projectResponse.json() as { id: string }).id;

    const username = `concurrent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const temporaryPassword = "temp-1234";
    const executorPassword = "executor-1234";
    const userResponse = await page.request.post("/api/users", {
      headers: writeHeaders,
      data: { username, displayName: "同時接続E2E", role: "executor", password: temporaryPassword, confirmation: temporaryPassword },
    });
    expect(userResponse.status()).toBe(200);
    const userId = (await userResponse.json() as { id: string }).id;
    const assignment = await page.request.post(`/api/projects/${projectId}/assignments`, {
      headers: writeHeaders,
      data: { userId },
    });
    expect(assignment.status()).toBe(200);

    const executorLogin = await executorContext.request.post("/api/auth/login", {
      headers: writeHeaders,
      data: { username, password: temporaryPassword },
    });
    expect(executorLogin.status()).toBe(200);
    const passwordChange = await executorContext.request.post("/api/auth/change-password", {
      headers: writeHeaders,
      data: { currentPassword: temporaryPassword, newPassword: executorPassword, confirmation: executorPassword },
    });
    expect(passwordChange.status()).toBe(200);
    expect((await executorContext.request.get("/api/auth/me")).status()).toBe(200);

    const sameUserFolderId = await createFolder(page.request, projectId, unique("same-user-folder"));
    const [firstView, secondView] = await Promise.all([
      folders(page.request, projectId),
      folders(sameUserPage.request, projectId),
    ]);
    const firstVersion = firstView.find((item) => item.id === sameUserFolderId)?.version;
    const secondVersion = secondView.find((item) => item.id === sameUserFolderId)?.version;
    expect(firstVersion).toBe(1);
    expect(secondVersion).toBe(1);

    const sameUserWrites = await Promise.all([
      page.request.patch(`/api/folders/${sameUserFolderId}`, {
        headers: writeHeaders,
        data: { projectId, version: firstVersion, name: unique("same-user-a") },
      }),
      sameUserPage.request.patch(`/api/folders/${sameUserFolderId}`, {
        headers: writeHeaders,
        data: { projectId, version: secondVersion, name: unique("same-user-b") },
      }),
    ]);
    expect(sameUserWrites.map((response) => response.status()).sort()).toEqual([200, 409]);

    const independentAdminFolder = await createFolder(sameUserPage.request, projectId, unique("admin-independent"));
    const independentExecutorFolder = await createFolder(executorContext.request, projectId, unique("executor-independent"));
    const independentWrites = await Promise.all([
      sameUserPage.request.patch(`/api/folders/${independentAdminFolder}`, {
        headers: writeHeaders,
        data: { projectId, version: 1, name: unique("admin-independent-updated") },
      }),
      executorContext.request.patch(`/api/folders/${independentExecutorFolder}`, {
        headers: writeHeaders,
        data: { projectId, version: 1, name: unique("executor-independent-updated") },
      }),
    ]);
    expect(independentWrites.map((response) => response.status())).toEqual([200, 200]);

    const staleDeleteFolderId = await createFolder(sameUserPage.request, projectId, unique("stale-delete"));
    const [adminView, executorView] = await Promise.all([
      folders(sameUserPage.request, projectId),
      folders(executorContext.request, projectId),
    ]);
    const adminSeen = adminView.find((item) => item.id === staleDeleteFolderId);
    const executorSeen = executorView.find((item) => item.id === staleDeleteFolderId);
    expect(adminSeen?.version).toBe(1);
    expect(executorSeen?.version).toBe(1);

    const executorUpdate = await executorContext.request.patch(`/api/folders/${staleDeleteFolderId}`, {
      headers: writeHeaders,
      data: { projectId, version: executorSeen!.version, name: unique("executor-newer") },
    });
    expect(executorUpdate.status()).toBe(200);

    const staleDelete = await sameUserPage.request.delete(`/api/folders/${staleDeleteFolderId}`, {
      headers: writeHeaders,
      data: { projectId, version: adminSeen!.version, reason: "stale delete must fail" },
    });
    expect(staleDelete.status()).toBe(409);
    const afterRejectedDelete = (await folders(sameUserPage.request, projectId)).find((item) => item.id === staleDeleteFolderId);
    expect(afterRejectedDelete?.version).toBe(2);

    const freshDelete = await sameUserPage.request.delete(`/api/folders/${staleDeleteFolderId}`, {
      headers: writeHeaders,
      data: { projectId, version: afterRejectedDelete!.version, reason: "fresh delete" },
    });
    expect(freshDelete.status()).toBe(200);
    const deleted = (await folders(executorContext.request, projectId, true)).find((item) => item.id === staleDeleteFolderId);
    expect(deleted?.version).toBe(3);

    const restore = await executorContext.request.post(`/api/folders/${staleDeleteFolderId}/restore`, {
      headers: writeHeaders,
      data: { projectId, version: deleted!.version },
    });
    expect(restore.status()).toBe(200);
    const staleRestore = await sameUserPage.request.post(`/api/folders/${staleDeleteFolderId}/restore`, {
      headers: writeHeaders,
      data: { projectId, version: deleted!.version },
    });
    expect(staleRestore.status()).toBe(409);
    const restored = (await folders(sameUserPage.request, projectId)).find((item) => item.id === staleDeleteFolderId);
    expect(restored?.version).toBe(4);

    const logout = await page.request.post("/api/auth/logout", { headers: writeHeaders });
    expect(logout.status()).toBe(200);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
    expect((await sameUserPage.request.get("/api/auth/me")).status()).toBe(200);
    expect((await executorContext.request.get("/api/auth/me")).status()).toBe(200);
  } finally {
    await sameUserContext.close();
    await executorContext.close();
  }
});
