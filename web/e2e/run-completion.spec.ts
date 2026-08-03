import { test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, completeRun, createStartedRun, savePass } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("全ケース保存後に実行を完了できる", async ({ page }) => {
  const run = await createStartedRun(page);
  await savePass(page, run.caseNames[0]!);
  await completeRun(page);
  await archiveProject(page, run.projectName);
});