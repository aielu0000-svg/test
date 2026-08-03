import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { assertE2EConfiguration, createProject, login, unique } from "./helpers.js";

test.beforeEach(() => assertE2EConfiguration());

test("公式Excelテンプレートを検証して確定できる", async ({ page }, testInfo) => {
  await login(page);
  const projectName = unique("E2E Excel取込");
  await createProject(page, projectName);

  const projectsResponse = await page.request.get("/api/projects");
  expect(projectsResponse.ok()).toBe(true);
  const projectsPayload = await projectsResponse.json() as { projects: Array<{ id: string; name: string }> };
  const project = projectsPayload.projects.find((item) => item.name === projectName);
  expect(project).toBeTruthy();

  await page.getByRole("button", { name: "Excelから追加・エクスポート" }).click();
  const templateResponse = await page.request.get("/api/imports/excel/template");
  expect(templateResponse.ok()).toBe(true);
  const templatePath = testInfo.outputPath("the-test-cases-template.xlsx");
  await writeFile(templatePath, await templateResponse.body());

  await page.locator('input[type="file"][name="file"]').setInputFiles(templatePath);
  await page.getByRole("button", { name: "アップロードして検証" }).click();
  await expect(page.getByRole("heading", { name: "検証結果" })).toBeVisible();
  await expect(page.getByText("1ケース", { exact: true })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "追加を確定" });
  await expect(confirmButton).toBeEnabled();

  const confirmResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && /\/api\/imports\/excel\/[^/]+\/confirm$/.test(new URL(response.url()).pathname),
  );
  await confirmButton.click();
  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "検証結果" })).toHaveCount(0);

  const casesResponse = await page.request.get(`/api/test-cases?projectId=${encodeURIComponent(project!.id)}`);
  expect(casesResponse.ok()).toBe(true);
  const casesPayload = await casesResponse.json() as { cases: Array<{ title: string }> };
  expect(casesPayload.cases.some((item) => item.title === "正常ログイン")).toBe(true);
});
