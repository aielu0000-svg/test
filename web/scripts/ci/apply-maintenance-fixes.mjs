import fs from "node:fs";
import { fileURLToPath } from "node:url";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Found multiple ${label} matches`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const sourcePath = "web/src/client/OperationsWorkspaceV2.tsx";
let source = fs.readFileSync(sourcePath, "utf8");
source = replaceOnce(
  source,
  '  const [selectedCaseId, setSelectedCaseId] = useState(runCases[0]?.id ?? "");\n  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);',
  '  const [selectedCaseId, setSelectedCaseId] = useState(runCases[0]?.id ?? "");\n  const activeCaseId = runCases.some((item) => item.id === selectedCaseId) ? selectedCaseId : runCases[0]?.id ?? "";\n  const refreshSequence = useRef(0);\n  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);',
  "evidence case selection state",
);

const refreshPattern = /  async function refresh\(\) \{[\s\S]*?  useEffect\(\(\) => \{ void refresh\(\); \}, \[projectId, runId, selectedCaseId\]\);\n/;
const refreshReplacement = `  async function refresh() {
    const sequence = ++refreshSequence.current;
    if (!activeCaseId) { setEvidence([]); setMessage(""); return; }
    try {
      const scopeQuery = \`projectId=\${encodeURIComponent(projectId)}&testRunId=\${encodeURIComponent(runId)}&runCaseId=\${encodeURIComponent(activeCaseId)}\`;
      const data = await request<{ evidence: EvidenceRow[] }>(\`/api/evidence?\${scopeQuery}\`);
      if (sequence !== refreshSequence.current) return;
      setEvidence(data.evidence);
      setMessage("");
    } catch (error) {
      if (sequence !== refreshSequence.current) return;
      setMessage(errorText(error, "証跡を取得できませんでした。"));
    }
  }
  useEffect(() => {
    if (selectedCaseId !== activeCaseId) setSelectedCaseId(activeCaseId);
  }, [activeCaseId, selectedCaseId]);
  useEffect(() => { void refresh(); }, [projectId, runId, activeCaseId]);
`;
if (!refreshPattern.test(source)) throw new Error("Could not find evidence refresh block");
source = source.replace(refreshPattern, refreshReplacement);
source = replaceOnce(
  source,
  "      const runCaseId = runCases.length === 1 ? runCases[0]!.id : selectedCaseId;",
  "      const runCaseId = activeCaseId;",
  "evidence upload run case selection",
);
source = replaceOnce(source, "    if (!item.file || !selectedCaseId) return;", "    if (!item.file || !activeCaseId) return;", "clipboard case guard");
source = replaceOnce(source, '      form.append("runCaseId", selectedCaseId);', '      form.append("runCaseId", activeCaseId);', "clipboard case form field");
source = replaceOnce(source, "<select value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>", "<select value={activeCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>", "evidence case select");
source = source.replaceAll("disabled={!selectedCaseId || uploading}", "disabled={!activeCaseId || uploading}");
source = replaceOnce(source, "disabled={!description.trim() || !selectedCaseId || uploading}", "disabled={!description.trim() || !activeCaseId || uploading}", "clipboard upload button state");
fs.writeFileSync(sourcePath, source);

const e2ePath = "web/e2e/completed-run-evidence.spec.ts";
fs.writeFileSync(e2ePath, `import { expect, test } from "@playwright/test";
import { archiveProject, assertE2EConfiguration, completeRun, createStartedRun, savePass, unique } from "./helpers";

test.beforeAll(assertE2EConfiguration);

test("完了済み実行を切り替えても以前の実行ケースで証跡を取得しない", async ({ page }) => {
  const first = await createStartedRun(page);
  await savePass(page, first.caseNames[0]!);
  await completeRun(page);

  const secondRunName = unique("E2E 完了済み証跡切替");
  await page.getByRole("button", { name: "＋ 新しい実行" }).click();
  await page.getByLabel("実行名").fill(secondRunName);
  await page.getByLabel(first.testName).check();
  await page.getByRole("button", { name: "実行準備を保存" }).click();
  await expect(page.getByRole("heading", { name: secondRunName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "実行を開始" }).click();
  await savePass(page, first.caseNames[0]!);
  await completeRun(page);

  const failedEvidenceRequests = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/evidence" && response.status() >= 400) {
      failedEvidenceRequests.push(\`${response.status()} \${url.search}\`);
    }
  });

  const runList = page.locator(".run-list");
  await runList.getByRole("button").filter({ hasText: first.runName }).click();
  await expect(page.getByRole("heading", { name: "証跡" })).toBeVisible();
  await page.waitForTimeout(400);
  await runList.getByRole("button").filter({ hasText: secondRunName }).click();
  await expect(page.getByRole("heading", { name: "証跡" })).toBeVisible();
  await page.waitForTimeout(400);

  await expect(page.getByText("実行ケースがプロジェクトに存在しません。", { exact: false })).toHaveCount(0);
  expect(failedEvidenceRequests).toEqual([]);
  await archiveProject(page, first.projectName);
});
`);

const packagePath = "web/package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
delete packageJson.overrides?.minimatch;
delete packageJson.overrides?.["brace-expansion"];
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const workflowPath = ".github/workflows/web-ci.yaml";
let workflow = fs.readFileSync(workflowPath, "utf8");
workflow = workflow.replace("permissions:\n  contents: write", "permissions:\n  contents: read");
workflow = workflow.replace(/      # ONE_OFF_PATCH_START[\s\S]*?      # ONE_OFF_PATCH_END\n\n/, "");
workflow = workflow.replace(/      # ONE_OFF_COMMIT_START[\s\S]*?      # ONE_OFF_COMMIT_END\n\n/, "");
fs.writeFileSync(workflowPath, workflow);

fs.rmSync(".github/workflows/apply-maintenance-fixes.yml", { force: true });
fs.rmSync(fileURLToPath(import.meta.url), { force: true });
