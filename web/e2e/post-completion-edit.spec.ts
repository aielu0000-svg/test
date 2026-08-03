import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, completeRun, createStartedRun, savePass, uploadPngEvidence } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("完了後は許可済みの結果と証跡だけを更新できる", async ({ page }) => {
  const run = await createStartedRun(page);
  await savePass(page, run.caseNames[0]!);
  await completeRun(page);
  const execution = page.locator(".focused-run-case");
  await execution.getByRole("button", { name: "不合格" }).click();
  await execution.getByLabel("実績結果（必須）").fill("完了後の差異");
  await execution.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText(/最終更新:/)).toBeVisible();
  await expect(execution.getByLabel("担当者")).toBeDisabled();
  await expect(execution.locator('input[type="datetime-local"]')).toBeDisabled();
  await uploadPngEvidence(page, "post-completion-evidence.png");
  await archiveProject(page, run.projectName);
});