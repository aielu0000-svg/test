import { test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, createStartedRun, savePass } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("結果保存は独立実行で保存済みになる", async ({ page }) => {
  const run = await createStartedRun(page);
  await savePass(page, run.caseNames[0]!);
  await archiveProject(page, run.projectName);
});