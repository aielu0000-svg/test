import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createStartedRun } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("実行を作成して開始する", async ({ page }) => {
  const run = await createStartedRun(page, 1, true);
  await expect(page.locator(".focused-run-case").getByLabel("担当者")).toHaveValue(run.assigneeId!);
  await expect(page.getByRole("heading", { name: run.caseNames[0]!, exact: true })).toBeVisible();
  await archiveProject(page, run.projectName);
});
