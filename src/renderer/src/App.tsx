import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./lib/utils";
import { ConfirmDialog } from "./components/ConfirmDialog";

type ProjectInfo = {
  name: string;
  path: string;
};

type TestCase = {
  id: string;
  title: string;
  objective: string;
  preconditions: string;
  priority: string;
  severity: string;
  tags: string;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
};

type TestStep = {
  id?: string;
  action: string;
  expected: string;
};

type Scenario = {
  id: string;
  title: string;
  objective: string;
  preconditions: string;
  created_at: string;
  updated_at: string;
};

type ScenarioCase = {
  case_id: string;
  position: number;
  title: string;
};

type CaseFolder = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type DataSet = {
  id: string;
  name: string;
  scope: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type DataItem = {
  id?: string;
  label: string;
  value: string;
  note?: string;
};

type DataLink = {
  entity_type: string;
  entity_id: string;
};

type DataSetDetail = {
  id: string;
  name: string;
  description: string;
  items: DataItem[];
};

type CaseDetail = {
  case: TestCase;
  steps: TestStep[];
  dataSets: DataSetDetail[];
};

type ScenarioDetail = {
  scenario: Scenario;
  cases: CaseDetail[];
};

type CaseDataLink = {
  data_set_id: string;
};

type TestRun = {
  id: string;
  name: string;
  environment: string;
  build_version: string;
  tester: string;
  status: string;
  started_at: string;
  finished_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type RunCase = {
  id: string;
  run_id: string;
  scenario_id: string;
  title: string;
  status: string;
  assignee: string;
  actual_result: string;
  notes: string;
  executed_at: string;
};

type Evidence = {
  id: string;
  run_scenario_id: string;
  file_name: string;
  stored_path: string;
  created_at: string;
};

type RunScenarioCase = {
  id: string;
  run_scenario_id: string;
  case_id: string;
  case_title: string;
  preconditions: string;
  tags: string;
  status: string;
  actual_result: string;
  notes: string;
  executed_at: string;
};

type EvidencePreview = {
  id: string;
  fileName: string;
  dataUrl: string;
  mimeType: string;
};

type RunCaseEvidenceRow = {
  id: string;
  run_scenario_case_id: string;
  file_name: string;
  mime_type?: string;
  created_at: string;
};

type CaseDraft = {
  title: string;
  objective: string;
  preconditions: string;
  priority: string;
  severity: string;
  tags: string;
  steps: TestStep[];
  dataSetIds: string[];
  folderId: string | null;
};

type ScenarioDraft = {
  title: string;
  objective: string;
  caseIds: string[];
};

type DataDraft = {
  name: string;
  scope: string;
  description: string;
  items: DataDraftItem[];
  links: DataLink[];
};

type DataDraftItem = {
  clientId: string;
  label: string;
  value: string;
  note: string;
};

type RunDraft = {
  name: string;
  environment: string;
  buildVersion: string;
  tester: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  notes: string;
};

type SectionKey = "dashboard" | "cases" | "scenarios" | "data" | "runs" | "export" | "settings";

const priorityOptions = ["高", "中", "低"] as const;
const severityOptions = ["致命的", "高", "中", "低"] as const;
const runStatusOptions = ["draft", "in_progress", "completed"] as const;
const runCaseStatusOptions = ["not_run", "pass", "fail", "blocked", "skip"] as const;
type RunCaseStatus = (typeof runCaseStatusOptions)[number];
const runCaseStatusLabels: Record<RunCaseStatus, string> = {
  not_run: "未実行",
  pass: "✅ pass",
  fail: "❌ fail",
  blocked: "⚠️ blocked",
  skip: "skip"
};
const completedRunCaseStatuses = new Set<RunCaseStatus>(["pass", "fail", "blocked"]);
const remainingRunCaseStatuses = new Set<RunCaseStatus>(["not_run", "skip"]);

const summarizeRunCaseStatuses = (entries: Array<{ status?: string }>) => {
  let total = 0;
  let completed = 0;
  let remaining = 0;

  entries.forEach((entry) => {
    total += 1;
    const status = entry.status as RunCaseStatus | undefined;
    if (status && completedRunCaseStatuses.has(status)) {
      completed += 1;
      return;
    }
    if (status && remainingRunCaseStatuses.has(status)) {
      remaining += 1;
    }
  });

  return { total, completed, remaining };
};
const dataScopes = [
  { value: "common", label: "共通初期データ" },
  { value: "case", label: "テストケース初期データ" },
  { value: "scenario", label: "シナリオ初期データ" },
  { value: "run", label: "実行初期データ" }
];

const navGroups: Array<{
  title: string;
  items: Array<{ key: SectionKey; label: string }>;
}> = [
  {
    title: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard" },
      { key: "cases", label: "Test Cases" },
      { key: "scenarios", label: "Scenarios" }
    ]
  },
  {
    title: "Execution",
    items: [
      { key: "runs", label: "Test Runs" },
      { key: "data", label: "Data Sets" }
    ]
  },
  {
    title: "Reports",
    items: [{ key: "export", label: "Export / Import" }]
  },
  {
    title: "System",
    items: [{ key: "settings", label: "Settings" }]
  }
];

const sectionMeta: Record<SectionKey, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "いまの状況を俯瞰して、作業を始めます。"
  },
  cases: {
    title: "Test Cases",
    subtitle: "テストケースの作成・編集・フォルダ整理を行います。"
  },
  scenarios: {
    title: "Scenarios",
    subtitle: "シナリオを組み立てて、実行単位にまとめます。"
  },
  runs: {
    title: "Test Runs",
    subtitle: "シナリオを実行し、結果と証跡を記録します。"
  },
  data: {
    title: "Data Sets",
    subtitle: "共通/ケース/シナリオ/実行の初期データを管理します。"
  },
  export: {
    title: "Export / Import",
    subtitle: "テスト資産をエクスポート/インポートして共有します。"
  },
  settings: {
    title: "Settings",
    subtitle: "プロジェクト名などの設定を変更します。"
  }
};

const FlaskConicalIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={cn("size-5 text-slate-200", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2h4" />
    <path d="M10 2v5l-5.6 9.7A5.5 5.5 0 0 0 9.2 22h5.6a5.5 5.5 0 0 0 4.8-5.3L14 7V2" />
    <path d="M8.7 12h6.6" />
  </svg>
);

const emptyCase = (): CaseDraft => ({
  title: "",
  objective: "",
  preconditions: "",
  priority: String(priorityOptions[1]),
  severity: String(severityOptions[2]),
  tags: "",
  steps: [{ action: "", expected: "" }],
  dataSetIds: [],
  folderId: null
});

const emptyScenario = (): ScenarioDraft => ({
  title: "",
  objective: "",
  caseIds: [] as string[]
});

const createClientId = () => {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const emptyDataSet = (): DataDraft => ({
  name: "",
  scope: "common",
  description: "",
  items: [{ clientId: createClientId(), label: "", value: "", note: "" }],
  links: [] as DataLink[]
});

const emptyRun = (): RunDraft => ({
  name: "",
  environment: "",
  buildVersion: "",
  tester: "",
  status: "draft",
  startedAt: "",
  finishedAt: "",
  notes: ""
});

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [projectName, setProjectName] = useState("the test");
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [caseQuery, setCaseQuery] = useState("");
  const [caseFolders, setCaseFolders] = useState<CaseFolder[]>([]);
  const [folderFilter, setFolderFilter] = useState("all");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDraft, setCaseDraft] = useState<CaseDraft>(emptyCase());
  const [caseDataSets, setCaseDataSets] = useState<
    Record<string, { dataSet: DataSet; items: DataItem[] }>
  >({});
  const [caseError, setCaseError] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDraft>(emptyScenario());
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenarioDetail, setScenarioDetail] = useState<ScenarioDetail | null>(null);
  const [scenarioDetailsCache, setScenarioDetailsCache] = useState<Record<string, ScenarioDetail>>({});

  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [dataQuery, setDataQuery] = useState("");
  const [dataScopeFilter, setDataScopeFilter] = useState("all");
  const [selectedDataSetId, setSelectedDataSetId] = useState<string | null>(null);
  const [dataDraft, setDataDraft] = useState<DataDraft>(emptyDataSet());
  const [dataError, setDataError] = useState<string | null>(null);

  const [runs, setRuns] = useState<TestRun[]>([]);
  const [runQuery, setRunQuery] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDraft, setRunDraft] = useState<RunDraft>(emptyRun());
  const [runScenarios, setRunScenarios] = useState<RunCase[]>([]);
  const [selectedRunScenarioId, setSelectedRunScenarioId] = useState<string | null>(null);
  const [runScenarioAddQuery, setRunScenarioAddQuery] = useState("");
  const [runScenarioAddId, setRunScenarioAddId] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [runCaseEvidenceMap, setRunCaseEvidenceMap] = useState<Record<string, EvidencePreview[]>>({});
  const [runScenarioCasesMap, setRunScenarioCasesMap] = useState<Record<string, RunScenarioCase[]>>({});
  const [evidencePreview, setEvidencePreview] = useState<EvidencePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [scenarioFolderId, setScenarioFolderId] = useState("");
  const [scenarioFromFolderTitle, setScenarioFromFolderTitle] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "case"; id: string }
    | { type: "scenario"; id: string }
    | { type: "data"; id: string }
    | { type: "run"; id: string }
    | { type: "folder"; id: string }
    | null
  >(null);

  const [exportType, setExportType] = useState<
    "test_cases" | "scenarios" | "data_sets" | "test_runs"
  >("test_cases");
  const [exportScope, setExportScope] = useState("common");
  const [exportFormat, setExportFormat] = useState<"csv" | "json" | "md">("csv");
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [importType, setImportType] = useState<"test_cases" | "scenarios" | "data_sets">(
    "test_cases"
  );
  const [importFormat, setImportFormat] = useState<"csv" | "json" | "md">("csv");
  const [importScope, setImportScope] = useState("common");
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importStagedFile, setImportStagedFile] = useState<{ fileName: string; content: string } | null>(
    null
  );
  const [importPreviewData, setImportPreviewData] = useState<{
    fileName: string;
    total: number;
    columns: string[];
    rows: string[][];
  } | null>(null);
  const [importPreviewErrorMessage, setImportPreviewErrorMessage] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [resetDatabaseOpen, setResetDatabaseOpen] = useState(false);

  const caseTitleError = caseError === "タイトルは必須です。";
  const scenarioTitleError = scenarioError === "タイトルは必須です。";
  const scenarioFolderError = scenarioError === "フォルダを選択してください。";
  const dataNameError = dataError === "データセット名は必須です。";
  const runNameError = runError === "テスト実行名は必須です。";

  const panelClass = cn(
    "rounded-none border p-5 shadow-sm",
    theme === "light"
      ? "border-[#CBCCC9] bg-white text-[#111111]"
      : "border-[#27272A] bg-[#1A1A1A] text-[#FAFAFA]"
  );

  const inputClass = cn(
    "w-full rounded-none border px-3 py-2 text-sm",
    theme === "light"
      ? "border-[#CBCCC9] bg-[#E7E8E5] text-[#111111]"
      : "border-[#27272A] bg-[#27272A] text-[#FAFAFA]"
  );

  const toLocalInput = (value?: string) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }
    // datetime-local expects local time without timezone.
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };

  const nowLocalInput = () => {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };

  const toIsoString = (value?: string) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
      return "";
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.valueOf())) {
      return trimmed;
    }
    return date.toISOString();
  };

  const isImageLike = (fileName: string, mimeType?: string) => {
    if (mimeType?.startsWith("image/")) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("the-test-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem("the-test-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!project) {
      return;
    }
    loadAll();
  }, [project]);


  const loadAll = async () => {
    await Promise.all([
      loadCases(),
      loadCaseFolders(),
      loadScenarios(),
      loadDataSets(),
      loadRuns()
    ]);
  };

  const loadCases = async () => {
    const list = (await window.api.testCases.list()) as TestCase[];
    setTestCases(list);
  };

  const loadCaseFolders = async () => {
    const list = (await window.api.caseFolders.list()) as CaseFolder[];
    setCaseFolders(list);
  };

  const loadScenarios = async () => {
    const list = (await window.api.scenarios.list()) as Scenario[];
    setScenarios(list);
  };

  const loadDataSets = async () => {
    const list = (await window.api.dataSets.list()) as DataSet[];
    setDataSets(list);
  };

  const loadRuns = async () => {
    const list = (await window.api.runs.list()) as TestRun[];
    setRuns(list);
  };

  const loadRunCaseEvidenceForIds = async (
    caseIds: string[],
    options?: { overwrite?: boolean }
  ) => {
    const uniqueIds = Array.from(new Set(caseIds));
    if (!uniqueIds.length) {
      if (options?.overwrite) {
        setRunCaseEvidenceMap({});
      }
      return;
    }
    const previewSets = await Promise.all(
      uniqueIds.map(async (caseId) => {
        const rows = (await window.api.runCaseEvidence.list(caseId)) as RunCaseEvidenceRow[];
        const previews: EvidencePreview[] = [];
        for (const row of rows) {
          const preview: EvidencePreview = {
            id: row.id,
            fileName: row.file_name,
            dataUrl: "",
            mimeType: row.mime_type ?? ""
          };

          // Only fetch base64 thumbnails for likely images; otherwise show filename card.
          if (isImageLike(row.file_name, row.mime_type)) {
            try {
              const result = (await window.api.runCaseEvidence.preview(row.id)) as
                | { base64: string; mimeType: string; tooLarge?: boolean; size?: number }
                | null;
              if (result?.base64) {
                preview.dataUrl = `data:${result.mimeType};base64,${result.base64}`;
                preview.mimeType = result.mimeType;
              }
            } catch {
              // ignore preview failures
            }
          }

          previews.push(preview);
        }
        return previews;
      })
    );
    setRunCaseEvidenceMap((prev) => {
      const next: Record<string, EvidencePreview[]> = options?.overwrite ? {} : { ...prev };
      uniqueIds.forEach((caseId, index) => {
        next[caseId] = previewSets[index];
      });
      return next;
    });
  };

  const loadRunScenarioCasesForIds = async (
    scenarioIds: string[],
    options?: { overwrite?: boolean }
  ) => {
    if (!scenarioIds.length) {
      if (options?.overwrite) {
        setRunScenarioCasesMap({});
      }
      return;
    }
    const uniqueIds = Array.from(new Set(scenarioIds));
    const results = (await Promise.all(
      uniqueIds.map((id) => window.api.runs.cases(id))
    )) as RunScenarioCase[][];
    const caseIds = results.flatMap((batch) => batch.map((entry) => entry.id));
    setRunScenarioCasesMap((prev) => {
      const next: Record<string, RunScenarioCase[]> = options?.overwrite ? {} : { ...prev };
      uniqueIds.forEach((id, index) => {
        next[id] = results[index];
      });
      return next;
    });
    await loadRunCaseEvidenceForIds(caseIds, { overwrite: options?.overwrite });
  };

  const fetchScenarioDetailFromApi = async (scenarioId: string) => {
    return (await window.api.scenarios.details(scenarioId)) as ScenarioDetail;
  };

  const ensureScenarioDetail = async (scenarioId: string) => {
    if (scenarioDetailsCache[scenarioId]) {
      return scenarioDetailsCache[scenarioId];
    }
    const detail = await fetchScenarioDetailFromApi(scenarioId);
    setScenarioDetailsCache((prev) => ({ ...prev, [scenarioId]: detail }));
    return detail;
  };

  const ensureScenarioDetailsForIds = async (scenarioIds: string[]) => {
    const missing = scenarioIds.filter((id) => !scenarioDetailsCache[id]);
    if (!missing.length) {
      return;
    }
    const details = await Promise.all(missing.map(fetchScenarioDetailFromApi));
    setScenarioDetailsCache((prev) => {
      const next = { ...prev };
      missing.forEach((id, index) => {
        next[id] = details[index];
      });
      return next;
    });
  };

  const refreshScenarioDetail = async (scenarioId: string) => {
    const detail = await fetchScenarioDetailFromApi(scenarioId);
    setScenarioDetailsCache((prev) => ({ ...prev, [scenarioId]: detail }));
    setScenarioDetail(detail);
    return detail;
  };

  const handleRemoveCaseFromScenario = async (caseId: string) => {
    const scenarioId = scenarioDetail?.scenario?.id;
    if (!scenarioId) {
      return;
    }
    setScenarioDraft((prev) => ({
      ...prev,
      caseIds: prev.caseIds.filter((id) => id !== caseId)
    }));
    setScenarioDetail((prev) =>
      prev ? { ...prev, cases: prev.cases.filter((detail) => detail.case.id !== caseId) } : prev
    );
    setScenarioDetailsCache((prev) => {
      const cached = prev[scenarioId];
      if (!cached) {
        return prev;
      }
      return {
        ...prev,
        [scenarioId]: {
          ...cached,
          cases: cached.cases.filter((detail) => detail.case.id !== caseId)
        }
      };
    });
    try {
      await window.api.scenarios.removeCase(scenarioId, caseId);
      await loadScenarios();
      await refreshScenarioDetail(scenarioId);
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : "シナリオから除外できませんでした。");
      await refreshScenarioDetail(scenarioId);
    }
  };

  const renderCaseDetails = (detail: CaseDetail, scenarioId?: string) => {
    return (
      <details
        key={detail.case.id}
        className={cn(
          "rounded-xl border px-3 py-3",
          theme === "light" ? "border-slate-200 bg-white/70" : "border-slate-800 bg-slate-950/40"
        )}
      >
        <summary className="flex gap-3 text-sm font-semibold">
          <span className="text-slate-100">{detail.case.title}</span>
          <span className="text-[11px] text-slate-400">{detail.steps.length} 手順</span>
        </summary>
        <div className="mt-3 space-y-2 text-xs text-slate-300">
          <p className="text-slate-400">
            <span className="font-semibold text-slate-200">前提: </span>
            {detail.case.preconditions?.trim() ? detail.case.preconditions : "なし"}
          </p>
          <div>
            <p className="font-semibold text-slate-200">初期データ</p>
            {detail.dataSets.length ? (
              <div className="mt-2 space-y-2">
                {detail.dataSets.map((dataSet) => (
                  <details
                    key={dataSet.id}
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      theme === "light" ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-900/50"
                    )}
                  >
                    <summary className="text-sm font-semibold text-slate-200">
                      {dataSet.name}
                      {dataSet.items.length ? ` (${dataSet.items.length}件)` : " (項目なし)"}
                    </summary>
                    <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                      {dataSet.description && (
                        <p className="text-slate-500">{dataSet.description}</p>
                      )}
                      {dataSet.items.length ? (
                        dataSet.items.map((item) => (
                          <div key={`${dataSet.id}-${item.label}`} className="flex flex-wrap gap-2">
                            <span className="font-semibold text-slate-300">{item.label}</span>
                            <span className="text-slate-200">{item.value}</span>
                            {item.note && (
                              <span className="text-slate-500">補足: {item.note}</span>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500">項目がありません。</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">初期データなし</p>
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-200">手順</p>
            <ol className="mt-2 space-y-2 text-[12px]">
              {detail.steps.map((step, index) => (
                <li key={`${detail.case.id}-${index}`} className="space-y-1 rounded-lg bg-slate-900/40 p-2">
                  <p className="text-slate-300 whitespace-pre-wrap">
                    <span className="font-semibold text-slate-100">操作:</span> {step.action || "なし"}
                  </p>
                  <p className="text-slate-400 whitespace-pre-wrap">
                    <span className="font-semibold text-slate-100">期待結果:</span>{" "}
                    {step.expected || "なし"}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          {scenarioId && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-rose-500 px-3 py-1 text-xs font-semibold text-rose-200"
                onClick={async () => {
                  await handleRemoveCaseFromScenario(detail.case.id);
                }}
              >
                シナリオから除外
              </button>
            </div>
          )}
        </div>
      </details>
    );
  };

  const handleCreateProject = async () => {
    setProjectError(null);
    if (!window.api?.project?.create) {
      setProjectError("アプリのAPIが読み込めていません。再起動してください。");
      return;
    }
    try {
      const result = (await window.api.project.create(projectName)) as ProjectInfo | null;
      if (!result) {
        setProjectError("プロジェクトの作成がキャンセルされました。");
        return;
      }
      setProject(result);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "プロジェクトを作成できません。");
    }
  };

  const handleOpenProject = async () => {
    setProjectError(null);
    if (!window.api?.project?.open) {
      setProjectError("アプリのAPIが読み込めていません。再起動してください。");
      return;
    }
    try {
      const result = (await window.api.project.open()) as ProjectInfo | null;
      if (!result) {
        setProjectError("プロジェクトの選択がキャンセルされました。");
        return;
      }
      setProject(result);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "プロジェクトを開けません。");
    }
  };

  const filteredCases = useMemo(() => {
    let items = testCases;
    if (folderFilter !== "all") {
      items = items.filter((item) => (item.folder_id ?? "none") === folderFilter);
    }
    if (tagFilters.length) {
      items = items.filter((item) => {
        const tags = item.tags
          ? item.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [];
        return tagFilters.some((tag) => tags.includes(tag));
      });
    }
    if (!caseQuery.trim()) {
      return items;
    }
    const term = caseQuery.toLowerCase();
    return items.filter((item) => item.title.toLowerCase().includes(term));
  }, [testCases, caseQuery, folderFilter, tagFilters]);

  const caseGroups = useMemo(() => {
    const result: Record<string, TestCase[]> = {};
    filteredCases.forEach((item) => {
      const key = item.folder_id ?? "none";
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
    });
    return result;
  }, [filteredCases]);

  const folderOrder = useMemo(() => {
    const order = caseFolders.map((folder) => folder.id);
    if (!order.includes("none")) {
      order.push("none");
    }
    return order;
  }, [caseFolders]);

  const caseFolderMap = useMemo(() => {
    const map: Record<string, CaseFolder> = {};
    caseFolders.forEach((folder) => {
      map[folder.id] = folder;
    });
    return map;
  }, [caseFolders]);

  const displayFolderKeys = useMemo(() => {
    return folderFilter === "all" ? folderOrder : [folderFilter];
  }, [folderFilter, folderOrder]);

  const hasCasesInView = useMemo(() => {
    return displayFolderKeys.some((key) => (caseGroups[key]?.length ?? 0) > 0);
  }, [displayFolderKeys, caseGroups]);

  const filteredScenarios = useMemo(() => {
    if (!scenarioQuery.trim()) {
      return scenarios;
    }
    const term = scenarioQuery.toLowerCase();
    return scenarios.filter((item) => item.title.toLowerCase().includes(term));
  }, [scenarios, scenarioQuery]);

  const filteredDataSets = useMemo(() => {
    let items = dataSets;
    if (dataScopeFilter !== "all") {
      items = items.filter((item) => item.scope === dataScopeFilter);
    }
    if (!dataQuery.trim()) {
      return items;
    }
    const term = dataQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(term));
  }, [dataSets, dataQuery, dataScopeFilter]);

  const filteredRuns = useMemo(() => {
    if (!runQuery.trim()) {
      return runs;
    }
    const term = runQuery.toLowerCase();
    return runs.filter((item) => item.name.toLowerCase().includes(term));
  }, [runs, runQuery]);

  const addableRunScenarios = useMemo(() => {
    const added = new Set(runScenarios.map((item) => item.scenario_id));
    const candidates = scenarios.filter((item) => !added.has(item.id));
    if (!runScenarioAddQuery.trim()) {
      return candidates;
    }
    const term = runScenarioAddQuery.toLowerCase();
    return candidates.filter((item) => item.title.toLowerCase().includes(term));
  }, [runScenarios, scenarios, runScenarioAddQuery]);

  const runCaseTotals = useMemo(() => {
    const scenarioIds = runScenarios.map((item) => item.id);
    const isLoading = scenarioIds.some((id) => !runScenarioCasesMap[id]);
    const aggregated = scenarioIds.flatMap((id) => runScenarioCasesMap[id] ?? []);
    return { ...summarizeRunCaseStatuses(aggregated), isLoading };
  }, [runScenarios, runScenarioCasesMap]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    testCases.forEach((item) => {
      item.tags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b, "ja"));
  }, [testCases]);

  const caseDataSetOptions = useMemo(
    () =>
      dataSets.filter(
        (item) =>
          item.scope === "common" ||
          item.scope === "case" ||
          item.scope === "scenario" ||
          item.scope === "run"
      ),
    [dataSets]
  );

  const dataScopeLabel = (scope: string) =>
    dataScopes.find((item) => item.value === scope)?.label ?? scope;

  const toggleCaseDataSet = async (dataSetId: string) => {
    if (caseDraft.dataSetIds.includes(dataSetId)) {
      setCaseDraft({
        ...caseDraft,
        dataSetIds: caseDraft.dataSetIds.filter((id) => id !== dataSetId)
      });
      setCaseDataSets((prev) => {
        const next = { ...prev };
        delete next[dataSetId];
        return next;
      });
      return;
    }
    setCaseDraft({ ...caseDraft, dataSetIds: [...caseDraft.dataSetIds, dataSetId] });
    await loadCaseDataSetDetails([dataSetId]);
  };

  const loadCaseDataSetDetails = async (ids: string[]) => {
    const entries = await Promise.all(
      ids.map(async (dataSetId) => {
        const data = (await window.api.dataSets.get(dataSetId)) as {
          dataSet: DataSet;
          items: DataItem[];
        };
        if (!data.dataSet) {
          return null;
        }
        return [dataSetId, { dataSet: data.dataSet, items: data.items }] as const;
      })
    );
    setCaseDataSets((prev) => {
      const next = { ...prev };
      entries.forEach((entry) => {
        if (!entry) {
          return;
        }
        next[entry[0]] = entry[1];
      });
      return next;
    });
  };

  const loadCaseById = async (id: string) => {
    const data = (await window.api.testCases.get(id)) as {
      testCase: TestCase;
      steps: TestStep[];
      dataLinks: CaseDataLink[];
    };
    if (!data.testCase) {
      return;
    }
    const dataSetIds = data.dataLinks?.map((link) => link.data_set_id) ?? [];
    setCaseDraft({
      title: data.testCase.title,
      objective: data.testCase.objective ?? "",
      preconditions: data.testCase.preconditions ?? "",
      priority: data.testCase.priority || priorityOptions[1],
      severity: data.testCase.severity || severityOptions[2],
      tags: data.testCase.tags ?? "",
      steps: data.steps.length
        ? data.steps.map((step) => ({ action: step.action, expected: step.expected }))
        : [{ action: "", expected: "" }],
      dataSetIds,
      folderId: data.testCase.folder_id ?? null
    });
    setCaseDataSets({});
    if (dataSetIds.length) {
      await loadCaseDataSetDetails(dataSetIds);
    }
  };

  const selectCase = (id: string) => {
    setSelectedCaseId(id);
    if (id === selectedCaseId) {
      void loadCaseById(id);
    }
  };

  useEffect(() => {
    if (selectedCaseId) {
      void loadCaseById(selectedCaseId);
    }
  }, [selectedCaseId]);

  const selectScenario = async (id: string) => {
    setSelectedScenarioId(id);
    const data = (await window.api.scenarios.get(id)) as { scenario: Scenario; cases: ScenarioCase[] };
    if (!data.scenario) {
      return;
    }
    setScenarioDraft({
      title: data.scenario.title,
      objective: data.scenario.objective ?? "",
      caseIds: data.cases.map((item) => item.case_id)
    });
    const detail = await refreshScenarioDetail(id);
    setScenarioDetail(detail);
  };

  const selectDataSet = async (id: string) => {
    setSelectedDataSetId(id);
    const data = (await window.api.dataSets.get(id)) as {
      dataSet: DataSet;
      items: DataItem[];
      links: DataLink[];
    };
    if (!data.dataSet) {
      return;
    }
    setDataDraft({
      name: data.dataSet.name,
      scope: data.dataSet.scope,
      description: data.dataSet.description ?? "",
      items: data.items.length
        ? data.items.map((item) => ({
            clientId: item.id ?? createClientId(),
            label: item.label,
            value: item.value,
            note: item.note ?? ""
          }))
        : [{ clientId: createClientId(), label: "", value: "", note: "" }],
      links: data.links
    });
  };

  const selectRun = async (id: string) => {
    setSection("runs");
    setSelectedRunId(id);
    const data = (await window.api.runs.get(id)) as { run: TestRun; runScenarios: RunCase[] };
    if (!data.run) {
      return;
    }
    setRunDraft({
      name: data.run.name,
      environment: data.run.environment ?? "",
      buildVersion: data.run.build_version ?? "",
      tester: data.run.tester ?? "",
      status: data.run.status,
      startedAt: toLocalInput(data.run.started_at ?? ""),
      finishedAt: toLocalInput(data.run.finished_at ?? ""),
      notes: data.run.notes ?? ""
    });
    setRunScenarios(data.runScenarios);
    await loadRunScenarioCasesForIds(
      data.runScenarios.map((item) => item.id),
      { overwrite: true }
    );
    void ensureScenarioDetailsForIds(data.runScenarios.map((item) => item.scenario_id));
    setSelectedRunScenarioId(null);
    setRunScenarioAddQuery("");
    setRunScenarioAddId("");
    setEvidenceList([]);
  };

  const selectRunScenario = async (id: string) => {
    setSelectedRunScenarioId(id);
    const list = (await window.api.evidence.list(id)) as Evidence[];
    setEvidenceList(list);
    void loadRunScenarioCasesForIds([id]);
  };

  const handleSaveCase = async () => {
    setCaseError(null);
    if (!caseDraft.title.trim()) {
      setCaseError("タイトルは必須です。");
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        id: selectedCaseId ?? undefined,
        title: caseDraft.title.trim(),
        objective: caseDraft.objective,
        preconditions: caseDraft.preconditions,
        priority: caseDraft.priority,
        severity: caseDraft.severity,
        tags: caseDraft.tags,
        steps: caseDraft.steps.filter((step) => step.action.trim() || step.expected.trim()),
        dataSetIds: caseDraft.dataSetIds,
        folderId: caseDraft.folderId
      };
      const id = (await window.api.testCases.save(payload)) as string;
      await loadCases();
      setSelectedCaseId(id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      return;
    }
    await window.api.caseFolders.save({ name });
    setNewFolderName("");
    await loadCaseFolders();
  };

  const handleDeleteFolder = async (id: string) => {
    await window.api.caseFolders.delete(id);
    await loadCaseFolders();
    if (folderFilter === id) {
      setFolderFilter("all");
    }
    if (caseDraft.folderId === id) {
      setCaseDraft({ ...caseDraft, folderId: null });
    }
    await loadCases();
  };

  const handleSaveScenario = async () => {
    setScenarioError(null);
    if (!scenarioDraft.title.trim()) {
      setScenarioError("タイトルは必須です。");
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        id: selectedScenarioId ?? undefined,
        title: scenarioDraft.title.trim(),
        objective: scenarioDraft.objective,
        caseIds: scenarioDraft.caseIds
      };
      const id = (await window.api.scenarios.save(payload)) as string;
      await loadScenarios();
      setSelectedScenarioId(id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateScenarioFromFolder = async () => {
    setScenarioError(null);
    if (!scenarioFolderId) {
      setScenarioError("フォルダを選択してください。");
      return;
    }
    try {
      const title = scenarioFromFolderTitle.trim() || undefined;
      const id = (await window.api.scenarios.createFromFolder(scenarioFolderId, title)) as string;
      await loadScenarios();
      await selectScenario(id);
      setScenarioFolderId("");
      setScenarioFromFolderTitle("");
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : "シナリオを作成できません。");
    }
  };

  const handleSaveDataSet = async () => {
    setDataError(null);
    if (!dataDraft.name.trim()) {
      setDataError("データセット名は必須です。");
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        id: selectedDataSetId ?? undefined,
        name: dataDraft.name.trim(),
        scope: dataDraft.scope,
        description: dataDraft.description,
        items: dataDraft.items
          .filter((item) => item.label.trim() || item.value.trim())
          .map((item) => ({ label: item.label, value: item.value, note: item.note })),
        links: dataDraft.links
      };
      const id = (await window.api.dataSets.save(payload)) as string;
      await loadDataSets();
      setSelectedDataSetId(id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRun = async (): Promise<string | null> => {
    setRunError(null);
    if (!runDraft.name.trim()) {
      setRunError("テスト実行名は必須です。");
      return null;
    }
    setIsLoading(true);
    try {
      const payload = {
        id: selectedRunId ?? undefined,
        name: runDraft.name.trim(),
        environment: runDraft.environment,
        buildVersion: runDraft.buildVersion,
        tester: runDraft.tester,
        status: runDraft.status,
        startedAt: toIsoString(runDraft.startedAt),
        finishedAt: toIsoString(runDraft.finishedAt),
        notes: runDraft.notes
      };
      const id = (await window.api.runs.save(payload)) as string;
      await loadRuns();
      await selectRun(id);
      return id;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRunScenario = async (scenarioId: string) => {
    let runId = selectedRunId;
    if (!runId) {
      runId = await handleSaveRun();
    }
    if (!runId) {
      return;
    }
    await window.api.runs.addScenario(runId, scenarioId, runDraft.tester.trim());
    await selectRun(runId);
  };

  const handleUpdateRunScenario = async (payload: {
    id: string;
    status: string;
    assignee: string;
    actualResult: string;
    notes: string;
    executedAt: string;
  }) => {
    setRunError(null);
    try {
      await window.api.runs.updateScenario({
        ...payload,
        executedAt: toIsoString(payload.executedAt)
      });
      if (selectedRunId) {
        await selectRun(selectedRunId);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "シナリオの更新に失敗しました。");
    }
  };

  const updateRunScenarioCaseDraft = (
    runScenarioId: string,
    caseId: string,
    patch: Partial<RunScenarioCase>
  ) => {
    setRunScenarioCasesMap((prev) => {
      const cases = prev[runScenarioId] ?? [];
      if (!cases.length) {
        return prev;
      }
      return {
        ...prev,
        [runScenarioId]: cases.map((entry) =>
          entry.id === caseId ? { ...entry, ...patch } : entry
        )
      };
    });
  };

  const handleSaveRunScenarioCase = async (runScenarioId: string, runCase: RunScenarioCase) => {
    setRunError(null);
    try {
      await window.api.runs.updateScenarioCase({
        id: runCase.id,
        status: runCase.status,
        actualResult: runCase.actual_result ?? "",
        notes: runCase.notes ?? "",
        executedAt: toIsoString(runCase.executed_at ?? "")
      });
      if (selectedRunId) {
        await selectRun(selectedRunId);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "テストケースの更新に失敗しました。");
    }
  };

  const handlePreviewEvidence = async (id: string, fileName: string) => {
    try {
      const result = (await window.api.evidence.preview(id)) as
        | { base64: string; mimeType: string; tooLarge?: boolean; size?: number }
        | null;
      if (!result) {
        setPreviewError("プレビューを読み込めませんでした。");
        setEvidencePreview({
          id,
          fileName,
          dataUrl: "",
          mimeType: "application/octet-stream"
        });
        return;
      }

      if (result.tooLarge) {
        const mb = result.size ? (result.size / 1024 / 1024).toFixed(1) : "";
        setPreviewError(
          `ファイルサイズ${mb ? ` (${mb}MB)` : ""}が大きすぎるためプレビューできません。`
        );
        setEvidencePreview({
          id,
          fileName,
          dataUrl: "",
          mimeType: result.mimeType ?? "application/octet-stream"
        });
        return;
      }

      setPreviewError(null);
      setEvidencePreview({
        id,
        fileName,
        dataUrl: result.base64 ? `data:${result.mimeType};base64,${result.base64}` : "",
        mimeType: result.mimeType
      });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "プレビューに失敗しました。");
    }
  };

  const handlePreviewRunCaseEvidence = async (id: string, fileName: string) => {
    try {
      const result = (await window.api.runCaseEvidence.preview(id)) as
        | { base64: string; mimeType: string; tooLarge?: boolean; size?: number }
        | null;
      if (!result) {
        setPreviewError("プレビューを読み込めませんでした。");
        setEvidencePreview({
          id,
          fileName,
          dataUrl: "",
          mimeType: "application/octet-stream"
        });
        return;
      }

      if (result.tooLarge) {
        const mb = result.size ? (result.size / 1024 / 1024).toFixed(1) : "";
        setPreviewError(
          `ファイルサイズ${mb ? ` (${mb}MB)` : ""}が大きすぎるためプレビューできません。`
        );
        setEvidencePreview({
          id,
          fileName,
          dataUrl: "",
          mimeType: result.mimeType ?? "application/octet-stream"
        });
        return;
      }

      setPreviewError(null);
      setEvidencePreview({
        id,
        fileName,
        dataUrl: result.base64 ? `data:${result.mimeType};base64,${result.base64}` : "",
        mimeType: result.mimeType
      });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "プレビューに失敗しました。");
    }
  };

  const closeEvidencePreview = () => {
    setEvidencePreview(null);
    setPreviewError(null);
  };

  const updateRunScenarioDraft = (id: string, patch: Partial<RunCase>) => {
    setRunScenarios((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleAddEvidence = async () => {
    if (!selectedRunScenarioId) {
      return;
    }
    setRunError(null);
    try {
      await window.api.evidence.add(selectedRunScenarioId);
      await selectRunScenario(selectedRunScenarioId);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "エビデンスを追加できませんでした。");
    }
  };

  const handlePasteEvidence = async () => {
    if (!selectedRunScenarioId) {
      return;
    }
    setRunError(null);
    try {
      await window.api.evidence.pasteImage(selectedRunScenarioId);
      await selectRunScenario(selectedRunScenarioId);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "エビデンスの貼り付けに失敗しました。");
    }
  };

  const handleAddRunCaseEvidence = async (runCaseId: string) => {
    if (!runCaseId) {
      return;
    }
    setRunError(null);
    try {
      const result = (await window.api.runCaseEvidence.add(runCaseId)) as string[] | null;
      if (!result) {
        return;
      }
      await loadRunCaseEvidenceForIds([runCaseId]);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "テストケースのエビデンス追加に失敗しました。");
    }
  };

  const handlePasteRunCaseEvidence = async (runCaseId: string) => {
    if (!runCaseId) {
      return;
    }
    setRunError(null);
    try {
      const result = (await window.api.runCaseEvidence.paste(runCaseId)) as string | null;
      if (!result) {
        return;
      }
      await loadRunCaseEvidenceForIds([runCaseId]);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "テストケースのエビデンス貼り付けに失敗しました。");
    }
  };

  const handleRemoveRunCaseEvidence = async (evidenceId: string, runCaseId: string) => {
    setRunError(null);
    try {
      await window.api.runCaseEvidence.remove(evidenceId);
      await loadRunCaseEvidenceForIds([runCaseId]);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "テストケースのエビデンス削除に失敗しました。");
    }
  };

  const handleExport = async () => {
    setExportNotice(null);
    try {
      const payload = {
        entity: exportType,
        format: exportFormat,
        scope: exportType === "data_sets" ? exportScope : undefined
      };
      const result = (await window.api.export.save(payload)) as string | null;
      if (!result) {
        setExportNotice("エクスポートがキャンセルされました。");
        return;
      }
      setExportNotice(`保存しました: ${result}`);
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : "エクスポートに失敗しました。");
    }
  };

  const handleImport = async () => {
    setImportNotice(null);
    try {
      const payload = {
        entity: importType,
        format: importFormat,
        scopeOverride: importType === "data_sets" ? importScope : undefined,
        content: importStagedFile?.content,
        fileName: importStagedFile?.fileName
      };
      const result = (await window.api.import.run(payload)) as
        | { imported: number; filePath: string }
        | null;
      if (!result) {
        setImportNotice("インポートがキャンセルされました。");
        return;
      }
      setImportNotice(`取り込み完了: ${result.imported} 件 (${result.filePath})`);
      setImportStagedFile(null);
      setImportPreviewData(null);
      setImportPreviewErrorMessage(null);
      await loadAll();
    } catch (err) {
      setImportNotice(err instanceof Error ? err.message : "インポートに失敗しました。");
    }
  };

  const stageImportFile = async (file: File | null) => {
    setImportNotice(null);
    setImportPreviewErrorMessage(null);
    setImportPreviewData(null);
    if (!file) {
      setImportStagedFile(null);
      return;
    }
    try {
      const content = await file.text();
      setImportStagedFile({ fileName: file.name, content });
      const preview = (await window.api.import.preview({
        entity: importType,
        format: importFormat,
        scopeOverride: importType === "data_sets" ? importScope : undefined,
        content
      })) as { total: number; columns: string[]; rows: string[][] };
      setImportPreviewData({ fileName: file.name, ...preview });
    } catch (err) {
      setImportPreviewErrorMessage(
        err instanceof Error ? err.message : "プレビューを作成できませんでした。"
      );
    }
  };

  const handleBackupDatabase = async () => {
    setSettingsNotice(null);
    try {
      const result = (await window.api.project.backup()) as string | null;
      if (!result) {
        setSettingsNotice("バックアップがキャンセルされました。");
        return;
      }
      setSettingsNotice(`バックアップしました: ${result}`);
    } catch (err) {
      setSettingsNotice(err instanceof Error ? err.message : "バックアップに失敗しました。");
    }
  };

  const handleResetDatabase = async () => {
    setSettingsNotice(null);
    try {
      const updated = (await window.api.project.reset()) as ProjectInfo;
      setProject(updated);
      setSelectedCaseId(null);
      setCaseDraft(emptyCase());
      setCaseDataSets({});
      setSelectedScenarioId(null);
      setScenarioDraft(emptyScenario());
      setScenarioDetail(null);
      setScenarioDetailsCache({});
      setSelectedDataSetId(null);
      setDataDraft(emptyDataSet());
      setSelectedRunId(null);
      setRunDraft(emptyRun());
      setRunScenarios([]);
      setSelectedRunScenarioId(null);
      setRunScenarioAddQuery("");
      setRunScenarioAddId("");
      setEvidenceList([]);
      setRunCaseEvidenceMap({});
      setRunScenarioCasesMap({});
      setEvidencePreview(null);
      setPreviewError(null);
      await loadAll();
      setSettingsNotice("データベースをリセットしました。");
    } catch (err) {
      setSettingsNotice(err instanceof Error ? err.message : "リセットに失敗しました。");
    }
  };

  const handleCreateTemplate = async (scope: string) => {
    await window.api.dataSets.template(scope);
    await loadDataSets();
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    if (deleteTarget.type === "case") {
      await window.api.testCases.delete(deleteTarget.id);
      await loadCases();
      setSelectedCaseId(null);
      setCaseDraft(emptyCase());
      setCaseDataSets({});
    }
    if (deleteTarget.type === "scenario") {
      await window.api.scenarios.delete(deleteTarget.id);
      await loadScenarios();
      setSelectedScenarioId(null);
      setScenarioDraft(emptyScenario());
      setScenarioDetail(null);
      setScenarioDetailsCache((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
    }
    if (deleteTarget.type === "data") {
      await window.api.dataSets.delete(deleteTarget.id);
      await loadDataSets();
      setSelectedDataSetId(null);
      setDataDraft(emptyDataSet());
    }
    if (deleteTarget.type === "run") {
      await window.api.runs.delete(deleteTarget.id);
      await loadRuns();
      setSelectedRunId(null);
      setRunDraft(emptyRun());
      setRunScenarios([]);
      setSelectedRunScenarioId(null);
    }
    if (deleteTarget.type === "folder") {
      await handleDeleteFolder(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  if (!project) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 py-12" style={{backgroundColor: theme === "light" ? "#F2F3F0" : "#111111", color: theme === "light" ? "#111111" : "#FAFAFA"}}>
        <div className="w-full max-w-lg rounded-none border p-8 shadow-sm" style={{borderColor: theme === "light" ? "#CBCCC9" : "#27272A", backgroundColor: theme === "light" ? "#FFFFFF" : "#1A1A1A"}}>
          <h1 className="text-balance text-3xl font-semibold">the test</h1>
          <p className="text-pretty mt-3 text-sm text-slate-300">
            ローカルで完結するテスト管理アプリ。SQLite と証跡フォルダで持ち運びできます。
          </p>
          <div className="mt-6 grid gap-4">
            <label htmlFor="project-name" className="text-xs font-semibold uppercase text-slate-400">
              プロジェクト名
            </label>
            <input
              id="project-name"
              className={inputClass}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                onClick={handleCreateProject}
              >
                新規プロジェクトを作成
              </button>
              <button
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100"
                onClick={handleOpenProject}
              >
                既存プロジェクトを開く
              </button>
            </div>
            {projectError && (
              <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                {projectError}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  const handleNavigate = (next: SectionKey) => {
    setSection(next);
    setMobileNavOpen(false);
  };

  const currentMeta = sectionMeta[section];
  const dashboardCardClass = cn(
    "rounded-none border p-4",
    theme === "light" ? "border-[#CBCCC9] bg-white" : "border-[#27272A] bg-[#1A1A1A]"
  );
  const dashboardLinkClass = cn("mt-3 text-sm font-semibold", theme === "light" ? "text-[#FF8400]" : "text-[#FF8400]");
  const dashboardActionButtonClass = cn(
    "rounded-full border px-3 py-2 text-left text-sm font-semibold",
    theme === "light"
      ? "border-[#CBCCC9] bg-[#E7E8E5] text-[#111111] hover:opacity-90"
      : "border-[#27272A] bg-[#2E2E2E] text-white hover:opacity-90"
  );

  return (
    <div className="min-h-dvh" style={{backgroundColor: theme === "light" ? "#F2F3F0" : "#111111", color: theme === "light" ? "#111111" : "#FAFAFA"}}>
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            "hidden h-dvh w-[280px] flex-col border-r px-4 py-6 md:flex",
            theme === "light" ? "border-[#CBCCC9] bg-[#E7E8E5]" : "border-[#27272A] bg-[#18181b]"
          )}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-xl px-2 py-1 text-left",
                theme === "light" ? "text-slate-900" : "text-slate-100"
              )}
              onClick={() => handleNavigate("dashboard")}
            >
              <FlaskConicalIcon className={theme === "light" ? "text-slate-700" : "text-slate-200"} />
              <span className="text-balance text-base font-semibold">the test</span>
            </button>
          </div>

          <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
            {navGroups.map((group) => (
              <div key={group.title} className="grid gap-2">
                <p className="text-xs font-semibold text-slate-500">{group.title}</p>
                <div className="grid gap-1">
                  {group.items.map((item) => {
                    const active = section === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={cn(
                          "w-full rounded-pill px-3 py-2 text-left text-sm font-semibold",
                          theme === "light"
                            ? active
                              ? "bg-[#CBCCC9] text-[#111111]"
                              : "text-[#111111] hover:bg-[#CBCCC9]/50"
                            : active
                              ? "bg-[#27272A] text-[#FAFAFA]"
                              : "text-[#FAFAFA] hover:bg-[#27272A]/50"
                        )}
                        onClick={() => handleNavigate(item.key)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className={cn("mt-6 border-t pt-4 text-xs text-slate-500", theme === "light" ? "border-slate-200" : "border-slate-800")}>
            <p className="text-pretty font-semibold">{project.name}</p>
            <p className="text-pretty mt-1 break-all">{project.path}</p>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            className={cn(
              "border-b px-6 py-5",
              theme === "light" ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-950"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-balance text-[28px] font-semibold leading-tight">
                  {currentMeta.title}
                </h1>
                <p
                  className={cn(
                    "text-pretty mt-1 text-sm",
                    theme === "light" ? "text-slate-500" : "text-slate-400"
                  )}
                >
                  {currentMeta.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold md:hidden",
                    theme === "light"
                      ? "border-slate-200 bg-white text-slate-900"
                      : "border-slate-800 bg-slate-950 text-slate-100"
                  )}
                  aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                  aria-expanded={mobileNavOpen}
                  aria-controls="mobile-navigation"
                  onClick={() => setMobileNavOpen((prev) => !prev)}
                >
                  Menu
                </button>
                <label htmlFor="theme-select" className="text-xs font-semibold uppercase text-slate-400">
                  テーマ
                </label>
                <select
                  id="theme-select"
                  className={cn(inputClass, "w-auto")}
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as "dark" | "light")}
                >
                  <option value="dark">ダーク</option>
                  <option value="light">ライト</option>
                </select>
              </div>
            </div>

            {mobileNavOpen && (
              <div
                id="mobile-navigation"
                className={cn(
                  "mt-5 grid gap-4 rounded-2xl border p-4 md:hidden",
                  theme === "light"
                    ? "border-slate-200 bg-slate-50"
                    : "border-slate-800 bg-slate-900/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <FlaskConicalIcon className={theme === "light" ? "text-slate-700" : "text-slate-200"} />
                  <p className={cn("text-balance text-sm font-semibold", theme === "light" ? "text-slate-900" : "text-slate-100")}>
                    the test
                  </p>
                  <p className="text-pretty text-xs text-slate-500">{project.name}</p>
                </div>
                {navGroups.map((group) => (
                  <div key={group.title} className="grid gap-2">
                    <p className="text-xs font-semibold text-slate-500">{group.title}</p>
                    <div className="grid gap-1">
                      {group.items.map((item) => {
                        const active = section === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className={cn(
                              "w-full rounded-xl px-3 py-2 text-left text-sm font-semibold",
                              theme === "light"
                                ? active
                                  ? "bg-white text-slate-900"
                                  : "text-slate-700 hover:bg-white"
                                : active
                                  ? "bg-slate-900 text-slate-100"
                                  : "text-slate-300 hover:bg-slate-900/40"
                            )}
                            onClick={() => handleNavigate(item.key)}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </header>

          <main className="min-w-0 flex-1 overflow-y-auto px-8 py-8">
            {section === "dashboard" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className={cn(panelClass, "lg:col-span-2")}>
                  <h2 className="text-balance text-lg font-semibold">Overview</h2>
                  <p className="text-pretty mt-1 text-sm text-slate-400">
                    プロジェクト内の件数と、よく使う操作へのショートカットです。
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className={dashboardCardClass}>
                      <p className="text-pretty text-xs font-semibold text-slate-400">Test Cases</p>
                      <p className="mt-2 text-balance text-3xl font-semibold tabular-nums">
                        {testCases.length}
                      </p>
                      <button
                        type="button"
                        className={dashboardLinkClass}
                        onClick={() => handleNavigate("cases")}
                      >
                        Open
                      </button>
                    </div>
                    <div className={dashboardCardClass}>
                      <p className="text-pretty text-xs font-semibold text-slate-400">Scenarios</p>
                      <p className="mt-2 text-balance text-3xl font-semibold tabular-nums">
                        {scenarios.length}
                      </p>
                      <button
                        type="button"
                        className={dashboardLinkClass}
                        onClick={() => handleNavigate("scenarios")}
                      >
                        Open
                      </button>
                    </div>
                    <div className={dashboardCardClass}>
                      <p className="text-pretty text-xs font-semibold text-slate-400">Data Sets</p>
                      <p className="mt-2 text-balance text-3xl font-semibold tabular-nums">
                        {dataSets.length}
                      </p>
                      <button
                        type="button"
                        className={dashboardLinkClass}
                        onClick={() => handleNavigate("data")}
                      >
                        Open
                      </button>
                    </div>
                    <div className={dashboardCardClass}>
                      <p className="text-pretty text-xs font-semibold text-slate-400">Test Runs</p>
                      <p className="mt-2 text-balance text-3xl font-semibold tabular-nums">
                        {runs.length}
                      </p>
                      <button
                        type="button"
                        className={dashboardLinkClass}
                        onClick={() => handleNavigate("runs")}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                </div>

                <div className={panelClass}>
                  <h2 className="text-balance text-lg font-semibold">Quick actions</h2>
                  <div className="mt-4 grid gap-3">
                    <button
                      type="button"
                      className={dashboardActionButtonClass}
                      onClick={() => {
                        handleNavigate("cases");
                        setSelectedCaseId(null);
                        setCaseDraft(emptyCase());
                        setCaseDataSets({});
                        setCaseError(null);
                      }}
                    >
                      New test case
                    </button>
                    <button
                      type="button"
                      className={dashboardActionButtonClass}
                      onClick={() => {
                        handleNavigate("scenarios");
                        setSelectedScenarioId(null);
                        setScenarioDraft(emptyScenario());
                        setScenarioDetail(null);
                        setScenarioError(null);
                      }}
                    >
                      New scenario
                    </button>
                    <button
                      type="button"
                      className={dashboardActionButtonClass}
                      onClick={() => {
                        handleNavigate("runs");
                        setSelectedRunId(null);
                        setRunDraft(emptyRun());
                        setRunError(null);
                      }}
                    >
                      New test run
                    </button>
                    <button
                      type="button"
                      className={dashboardActionButtonClass}
                      onClick={() => handleNavigate("export")}
                    >
                      Export / Import
                    </button>
                  </div>
                </div>
              </div>
            )}

            {section === "cases" && (
              <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className={panelClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-balance text-lg font-semibold">テストケース一覧</h2>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                    onClick={() => {
                      setSelectedCaseId(null);
                      const draft = emptyCase();
                      draft.folderId = folderFilter !== "all" && folderFilter !== "none" ? folderFilter : null;
                      setCaseDraft(draft);
                      setCaseDataSets({});
                      setCaseError(null);
                    }}
                  >
                    新規作成
                  </button>
                </div>
                <input
                  className={cn(inputClass, "mt-4")}
                  placeholder="検索"
                  value={caseQuery}
                  onChange={(event) => setCaseQuery(event.target.value)}
                />
                <div className="mt-3 grid gap-3">
                  <div>
                    <label
                      htmlFor="case-folder-filter"
                      className="text-xs font-semibold uppercase text-slate-400"
                    >
                      フォルダ絞り込み
                    </label>
                    <select
                      id="case-folder-filter"
                      className={cn(inputClass, "mt-2")}
                      value={folderFilter}
                      onChange={(event) => setFolderFilter(event.target.value)}
                    >
                      <option value="all">すべて</option>
                      <option value="none">未分類</option>
                      {caseFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">タグ絞り込み</p>
                    {tagOptions.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-400">タグはまだありません。</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {tagOptions.map((tag) => {
                          const checked = tagFilters.includes(tag);
                          return (
                            <button
                              key={tag}
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs",
                                theme === "light"
                                  ? checked
                                    ? "border-sky-300 bg-sky-50 text-slate-800"
                                    : "border-slate-200 text-slate-600"
                                  : checked
                                    ? "border-sky-400 bg-sky-950/40 text-slate-100"
                                    : "border-slate-800 text-slate-300"
                              )}
                              onClick={() => {
                                setTagFilters((prev) =>
                                  prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
                                );
                              }}
                            >
                              {tag}
                            </button>
                          );
                        })}
                        {tagFilters.length > 0 && (
                          <button
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs",
                              theme === "light"
                                ? "border-slate-200 text-slate-600"
                                : "border-slate-700 text-slate-300"
                            )}
                            onClick={() => setTagFilters([])}
                          >
                            クリア
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="case-folder-name"
                      className="text-xs font-semibold uppercase text-slate-400"
                    >
                      フォルダ管理
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        id="case-folder-name"
                        className={inputClass}
                        placeholder="新しいフォルダ名"
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                      />
                      <button
                        className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold"
                        onClick={handleCreateFolder}
                      >
                        追加
                      </button>
                    </div>
                    {caseFolders.length > 0 && (
                      <div className="mt-2 grid gap-2">
                        {caseFolders.map((folder) => (
                          <div
                            key={folder.id}
                            className={cn(
                              "flex items-center justify-between text-xs",
                              theme === "light" ? "text-slate-600" : "text-slate-300"
                            )}
                          >
                            <span>{folder.name}</span>
                            <button
                              className="rounded-full border border-rose-500 px-2 py-1 text-[10px] font-semibold text-rose-200"
                              onClick={() => setDeleteTarget({ type: "folder", id: folder.id })}
                            >
                              削除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {hasCasesInView ? (
                    displayFolderKeys.map((folderKey) => {
                      const cases = caseGroups[folderKey] ?? [];
                      if (!cases.length) {
                        if (folderFilter === "all") {
                          return null;
                        }
                        return (
                          <div
                            key={folderKey}
                            className={cn(
                              "rounded-xl border px-4 py-3 text-xs text-slate-400",
                              theme === "light" ? "border-slate-200" : "border-slate-800"
                            )}
                          >
                            このフォルダにはまだケースがありません。
                          </div>
                        );
                      }
                      const folderLabel =
                        folderKey === "none" ? "未分類" : caseFolderMap[folderKey]?.name ?? "フォルダ";
                      return (
                        <div
                          key={folderKey}
                          className={cn(
                            "rounded-2xl border p-4",
                            theme === "light"
                              ? "border-slate-200 bg-white/60"
                              : "border-slate-800 bg-slate-950/40"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase text-slate-400">{folderLabel}</p>
                              <p className="text-sm font-semibold text-slate-100">
                                {cases.length} ケース
                              </p>
                            </div>
                            {folderKey !== "none" && (
                              <button
                                className={cn(
                                  "rounded-full border px-3 py-1 text-[11px] font-semibold",
                                  theme === "light" ? "border-slate-300 text-slate-600" : "border-slate-800"
                                )}
                                onClick={() => setFolderFilter(folderKey)}
                              >
                                このフォルダを表示
                              </button>
                            )}
                          </div>
                          <div className="mt-3 grid gap-2">
                        {cases.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={cn(
                              "rounded-xl border px-3 py-2 text-left text-sm",
                                  selectedCaseId === item.id
                                    ? "border-sky-400 bg-slate-900 text-slate-100"
                                    : theme === "light"
                                      ? "border-slate-200 text-slate-900"
                                      : "border-slate-800 text-slate-300"
                                )}
                                onClick={() => selectCase(item.id)}
                              >
                                <div className="text-balance font-semibold">{item.title}</div>
                                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                                  <span className="text-slate-400">{item.updated_at}</span>
                                  {item.tags && (
                                    <span className="rounded-full border px-2 py-0.5 text-xs text-slate-400">
                                      {item.tags}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div
                      className={cn(
                        "rounded-xl border px-4 py-3 text-xs text-slate-400",
                        theme === "light" ? "border-slate-200" : "border-slate-800"
                      )}
                    >
                      表示対象のケースが見つかりません。別のフォルダ/タグで検索してください。
                    </div>
                  )}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">テストケース詳細</h2>
                <div className="mt-4 grid gap-4" aria-busy={isLoading || undefined}>
                  <label htmlFor="case-title" className="text-xs font-semibold uppercase text-slate-400">
                    タイトル
                  </label>
                  <input
                    id="case-title"
                    className={inputClass}
                    value={caseDraft.title}
                    aria-invalid={caseTitleError || undefined}
                    aria-describedby={caseTitleError ? "case-title-error" : undefined}
                    onChange={(event) => setCaseDraft({ ...caseDraft, title: event.target.value })}
                  />
                  {caseTitleError && (
                    <p id="case-title-error" className="text-xs text-rose-200">
                      {caseError}
                    </p>
                  )}
                  <label htmlFor="case-objective" className="text-xs font-semibold uppercase text-slate-400">
                    目的
                  </label>
                  <textarea
                    id="case-objective"
                    className={cn(inputClass, "min-h-[90px]")}
                    value={caseDraft.objective}
                    onChange={(event) => setCaseDraft({ ...caseDraft, objective: event.target.value })}
                  />
                  <label
                    htmlFor="case-preconditions"
                    className="text-xs font-semibold uppercase text-slate-400"
                  >
                    前提条件
                  </label>
                  <textarea
                    id="case-preconditions"
                    className={cn(inputClass, "min-h-[90px]")}
                    value={caseDraft.preconditions}
                    onChange={(event) =>
                      setCaseDraft({ ...caseDraft, preconditions: event.target.value })
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="case-priority"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        優先度
                      </label>
                      <select
                        id="case-priority"
                        className={cn(inputClass, "mt-2")}
                        value={caseDraft.priority}
                        onChange={(event) => setCaseDraft({ ...caseDraft, priority: event.target.value })}
                      >
                        {priorityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="case-severity"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        重大度
                      </label>
                      <select
                        id="case-severity"
                        className={cn(inputClass, "mt-2")}
                        value={caseDraft.severity}
                        onChange={(event) => setCaseDraft({ ...caseDraft, severity: event.target.value })}
                      >
                        {severityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="case-tags" className="text-xs font-semibold uppercase text-slate-400">
                        タグ
                      </label>
                      <input
                        id="case-tags"
                        className={cn(inputClass, "mt-2")}
                        value={caseDraft.tags}
                        onChange={(event) => setCaseDraft({ ...caseDraft, tags: event.target.value })}
                        placeholder="例: ログイン,UI"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="case-folder" className="text-xs font-semibold uppercase text-slate-400">
                      フォルダ
                    </label>
                    <select
                      id="case-folder"
                      className={cn(inputClass, "mt-2")}
                      value={caseDraft.folderId ?? "none"}
                      onChange={(event) =>
                        setCaseDraft({
                          ...caseDraft,
                          folderId: event.target.value === "none" ? null : event.target.value
                        })
                      }
                    >
                      <option value="none">未分類</option>
                      {caseFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={cn(
                      "min-h-0 rounded-2xl border p-4",
                      theme === "light"
                        ? "border-slate-200 bg-slate-50"
                        : "border-slate-800 bg-slate-950/40"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-balance text-sm font-semibold">初期データの選択</h3>
                        <p className="text-pretty mt-1 text-xs text-slate-400">
                          初期データをテストケースに関連付けできます。
                        </p>
                      </div>
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                        onClick={() => setSection("data")}
                      >
                        初期データを作成
                      </button>
                    </div>
                    {caseDataSetOptions.length === 0 ? (
                      <div
                        className={cn(
                          "mt-3 rounded-xl border px-3 py-2 text-xs text-slate-400",
                          theme === "light" ? "border-slate-200" : "border-slate-800"
                        )}
                      >
                        初期データがまだありません。右上のボタンから追加してください。
                      </div>
                    ) : (
                      <div className="mt-3 min-h-0 max-h-[240px] grid gap-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-900/40">
                        {caseDataSetOptions.map((dataSet) => {
                          const checked = caseDraft.dataSetIds.includes(dataSet.id);
                          const inputId = `case-data-set-${dataSet.id}`;
                          return (
                            <label
                              key={dataSet.id}
                              htmlFor={inputId}
                              className={cn(
                                "flex gap-3 rounded-xl border px-3 py-2 text-left text-sm",
                                theme === "light"
                                  ? checked
                                    ? "border-sky-300 bg-sky-50"
                                    : "border-slate-200"
                                  : checked
                                    ? "border-sky-500/60 bg-sky-950/30"
                                    : "border-slate-800"
                              )}
                            >
                              <input
                                id={inputId}
                                type="checkbox"
                                className="mt-1 size-4 accent-sky-400"
                                checked={checked}
                                onChange={() => {
                                  void toggleCaseDataSet(dataSet.id);
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold">{dataSet.name}</span>
                                  <span className="text-[11px] text-slate-500">
                                    {dataScopeLabel(dataSet.scope)}
                                  </span>
                                </div>
                                {dataSet.description && (
                                  <p className="text-pretty mt-1 text-xs text-slate-400">
                                    {dataSet.description}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {caseDraft.dataSetIds.length > 0 && (
                      <div className="mt-4 grid gap-2">
                        <p className="text-xs font-semibold uppercase text-slate-400">
                          選択中のデータ内容
                        </p>
                        {caseDraft.dataSetIds.map((dataSetId) => {
                          const details = caseDataSets[dataSetId];
                          if (!details) {
                            return (
                              <div
                                key={dataSetId}
                                className="rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-400"
                              >
                                読み込み中...
                              </div>
                            );
                          }
                          return (
                            <details
                              key={dataSetId}
                              className={cn(
                                "rounded-xl border px-3 py-2",
                                theme === "light" ? "border-slate-200" : "border-slate-800"
                              )}
                            >
                              <summary className="cursor-pointer text-sm font-semibold">
                                {details.dataSet.name}
                                <span className="ml-2 text-[11px] text-slate-500">
                                  {details.items.length} 件
                                </span>
                              </summary>
                              <div
                                className={cn(
                                  "mt-2 grid gap-2 text-xs",
                                  theme === "light" ? "text-slate-600" : "text-slate-300"
                                )}
                              >
                                {details.items.length === 0 ? (
                                  <p className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
                                    項目がありません。
                                  </p>
                                ) : (
                                  details.items.map((item, index) => (
                                    <div
                                      key={`${dataSetId}-${index}`}
                                      className={cn(
                                        "rounded-lg px-2 py-1",
                                        theme === "light"
                                          ? "bg-slate-100 text-slate-700"
                                          : "bg-slate-900/60 text-slate-300"
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "font-semibold",
                                          theme === "light" ? "text-slate-700" : "text-slate-100"
                                        )}
                                      >
                                        {item.label}
                                      </div>
                                      <div
                                        className={cn(
                                          "text-pretty",
                                          theme === "light" ? "text-slate-600" : "text-slate-300"
                                        )}
                                      >
                                        {item.value}
                                      </div>
                                      {item.note && (
                                        <div className={theme === "light" ? "text-slate-500" : "text-slate-500"}>
                                          補足: {item.note}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-slate-400">手順</p>
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                        onClick={() =>
                          setCaseDraft({
                            ...caseDraft,
                            steps: [...caseDraft.steps, { action: "", expected: "" }]
                          })
                        }
                      >
                        手順を追加
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {caseDraft.steps.map((step, index) => (
                        <div key={`step-${index}`} className="rounded-xl border border-slate-800 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400">Step {index + 1}</span>
                            {caseDraft.steps.length > 1 && (
                              <button
                                className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200"
                                onClick={() =>
                                  setCaseDraft({
                                    ...caseDraft,
                                    steps: caseDraft.steps.filter((_, stepIndex) => stepIndex !== index)
                                  })
                                }
                              >
                                削除
                              </button>
                            )}
                          </div>
                          <label
                            htmlFor={`case-step-action-${index}`}
                            className="mt-2 block text-xs font-semibold uppercase text-slate-400"
                          >
                            操作
                          </label>
                          <textarea
                            id={`case-step-action-${index}`}
                            className={cn(inputClass, "mt-2 min-h-[70px]")}
                            value={step.action}
                            onChange={(event) => {
                              const next = [...caseDraft.steps];
                              next[index] = { ...step, action: event.target.value };
                              setCaseDraft({ ...caseDraft, steps: next });
                            }}
                          />
                          <label
                            htmlFor={`case-step-expected-${index}`}
                            className="mt-2 block text-xs font-semibold uppercase text-slate-400"
                          >
                            期待結果
                          </label>
                          <textarea
                            id={`case-step-expected-${index}`}
                            className={cn(inputClass, "mt-2 min-h-[70px]")}
                            value={step.expected}
                            onChange={(event) => {
                              const next = [...caseDraft.steps];
                              next[index] = { ...step, expected: event.target.value };
                              setCaseDraft({ ...caseDraft, steps: next });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {caseError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {caseError}
                    </div>
                  )}

                  {isLoading && <p className="text-xs text-slate-400">保存中...</p>}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSaveCase}
                      disabled={isLoading}
                    >
                      保存
                    </button>
                    {selectedCaseId && (
                      <button
                        className="rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-200"
                        onClick={() => setDeleteTarget({ type: "case", id: selectedCaseId })}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "scenarios" && (
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className={panelClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-balance text-lg font-semibold">シナリオ一覧</h2>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                    onClick={() => {
                      setSelectedScenarioId(null);
                      setScenarioDraft(emptyScenario());
                      setScenarioError(null);
                      setScenarioDetail(null);
                    }}
                  >
                    新規作成
                  </button>
                </div>
                <input
                  className={cn(inputClass, "mt-4")}
                  placeholder="検索"
                  value={scenarioQuery}
                  onChange={(event) => setScenarioQuery(event.target.value)}
                />
                <div
                  className={cn(
                    "mt-3 rounded-2xl border p-3",
                    theme === "light" ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950/40"
                  )}
                >
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    フォルダから自動生成
                  </p>
                <div className="mt-2 grid gap-2">
                  <select
                    className={inputClass}
                    value={scenarioFolderId}
                    aria-invalid={scenarioFolderError || undefined}
                    aria-describedby={scenarioFolderError ? "scenario-folder-error" : undefined}
                    onChange={(event) => setScenarioFolderId(event.target.value)}
                  >
                    <option value="">フォルダを選択</option>
                    {caseFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  {scenarioFolderError && (
                    <p id="scenario-folder-error" className="text-xs text-rose-200">
                      {scenarioError}
                    </p>
                  )}
                  <input
                    className={inputClass}
                    placeholder="シナリオ名（省略可）"
                    value={scenarioFromFolderTitle}
                    onChange={(event) => setScenarioFromFolderTitle(event.target.value)}
                    />
                    <button
                      className="rounded-pill bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                      onClick={handleCreateScenarioFromFolder}
                    >
                      フォルダから作成
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                      {filteredScenarios.map((item) => (
                        <div key={item.id} className="relative">
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                              selectedScenarioId === item.id
                                ? "border-sky-400 bg-slate-900 text-slate-100"
                                : "border-slate-800 text-slate-300"
                            )}
                            onClick={() => selectScenario(item.id)}
                          >
                            <div className="flex items-start justify-between gap-2 pr-12">
                              <div>
                                <div className="text-balance font-semibold">{item.title}</div>
                                <div className="mt-1 text-xs text-slate-400">{item.updated_at}</div>
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="absolute right-2 top-2 rounded-full border border-rose-500 px-2 py-1 text-[10px] font-semibold text-rose-200"
                            onClick={() => setDeleteTarget({ type: "scenario", id: item.id })}
                          >
                            削除
                          </button>
                        </div>
                      ))}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">シナリオ詳細</h2>
              {scenarioDetail ? (
                <div className="mt-4 space-y-3">
                {scenarioDetail.cases.map((detail) =>
                  renderCaseDetails(detail, scenarioDetail.scenario?.id)
                )}
                </div>
              ) : (
                <div
                  className={cn(
                    "mt-4 rounded-xl border px-3 py-2 text-xs text-slate-400",
                    theme === "light" ? "border-slate-200" : "border-slate-800"
                  )}
                >
                  シナリオを選択すると、各テストケースの前提・初期データ・手順がここに表示されます。
                </div>
              )}
              <div className="mt-4 grid gap-4" aria-busy={isLoading || undefined}>
                  <label
                    htmlFor="scenario-title"
                    className="text-xs font-semibold uppercase text-slate-400"
                  >
                    タイトル
                  </label>
                  <input
                    id="scenario-title"
                    className={inputClass}
                    value={scenarioDraft.title}
                    aria-invalid={scenarioTitleError || undefined}
                    aria-describedby={scenarioTitleError ? "scenario-title-error" : undefined}
                    onChange={(event) => setScenarioDraft({ ...scenarioDraft, title: event.target.value })}
                  />
                  {scenarioTitleError && (
                    <p id="scenario-title-error" className="text-xs text-rose-200">
                      {scenarioError}
                    </p>
                  )}
                  <label
                    htmlFor="scenario-objective"
                    className="text-xs font-semibold uppercase text-slate-400"
                  >
                    目的
                  </label>
                  <textarea
                    id="scenario-objective"
                    className={cn(inputClass, "min-h-[90px]")}
                    value={scenarioDraft.objective}
                    onChange={(event) =>
                      setScenarioDraft({ ...scenarioDraft, objective: event.target.value })
                    }
                  />

                  {scenarioError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {scenarioError}
                    </div>
                  )}

                  {isLoading && <p className="text-xs text-slate-400">保存中...</p>}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSaveScenario}
                      disabled={isLoading}
                    >
                      保存
                    </button>
                    {selectedScenarioId && (
                      <button
                        className="rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-200"
                        onClick={() => setDeleteTarget({ type: "scenario", id: selectedScenarioId })}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "data" && (
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className={panelClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-balance text-lg font-semibold">初期データ一覧</h2>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                    onClick={() => {
                      setSelectedDataSetId(null);
                      setDataDraft(emptyDataSet());
                      setDataError(null);
                    }}
                  >
                    新規作成
                  </button>
                </div>
                <input
                  className={cn(inputClass, "mt-4")}
                  placeholder="検索"
                  value={dataQuery}
                  onChange={(event) => setDataQuery(event.target.value)}
                />
                <div className="mt-3">
                  <label
                    htmlFor="data-scope-filter"
                    className="text-xs font-semibold uppercase text-slate-400"
                  >
                    種別で絞り込み
                  </label>
                  <select
                    id="data-scope-filter"
                    className={cn(inputClass, "mt-2")}
                    value={dataScopeFilter}
                    onChange={(event) => setDataScopeFilter(event.target.value)}
                  >
                    <option value="all">すべて</option>
                    {dataScopes.map((scope) => (
                      <option key={`filter-${scope.value}`} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 grid gap-2">
                  {filteredDataSets.map((item) => (
                    <button
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm",
                        selectedDataSetId === item.id
                          ? "border-sky-400 bg-slate-900 text-slate-100"
                          : "border-slate-800 text-slate-300"
                      )}
                      onClick={() => selectDataSet(item.id)}
                    >
                      <div className="text-balance font-semibold">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.scope}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">初期データ詳細</h2>
                <div className="mt-4 grid gap-4" aria-busy={isLoading || undefined}>
                  <label htmlFor="data-name" className="text-xs font-semibold uppercase text-slate-400">
                    名称
                  </label>
                  <input
                    id="data-name"
                    className={inputClass}
                    value={dataDraft.name}
                    aria-invalid={dataNameError || undefined}
                    aria-describedby={dataNameError ? "data-name-error" : undefined}
                    onChange={(event) => setDataDraft({ ...dataDraft, name: event.target.value })}
                  />
                  {dataNameError && (
                    <p id="data-name-error" className="text-xs text-rose-200">
                      {dataError}
                    </p>
                  )}
                  <label htmlFor="data-scope" className="text-xs font-semibold uppercase text-slate-400">
                    種別
                  </label>
                  <select
                    id="data-scope"
                    className={inputClass}
                    value={dataDraft.scope}
                    onChange={(event) =>
                      setDataDraft({ ...dataDraft, scope: event.target.value, links: [] })
                    }
                  >
                    {dataScopes.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor="data-description"
                    className="text-xs font-semibold uppercase text-slate-400"
                  >
                    説明
                  </label>
                  <textarea
                    id="data-description"
                    className={cn(inputClass, "min-h-[90px]")}
                    value={dataDraft.description}
                    onChange={(event) =>
                      setDataDraft({ ...dataDraft, description: event.target.value })
                    }
                  />

                  {dataDraft.scope !== "common" && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">紐づけ対象</p>
                      <div className="mt-3 grid gap-2">
                        {(dataDraft.scope === "case" ? testCases : dataDraft.scope === "scenario" ? scenarios : runs).map(
                          (item) => {
                            const entityType = dataDraft.scope;
                            const entityId = item.id;
                            const checked = dataDraft.links.some(
                              (link) => link.entity_type === entityType && link.entity_id === entityId
                            );
                            const inputId = `data-link-${entityType}-${entityId}`;
                            return (
                              <label
                                key={item.id}
                                htmlFor={inputId}
                                className="flex items-center gap-2 text-sm text-slate-300"
                              >
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  className="accent-sky-400"
                                  checked={checked}
                                  onChange={(event) => {
                                    const next = dataDraft.links.filter(
                                      (link) => !(link.entity_type === entityType && link.entity_id === entityId)
                                    );
                                    if (event.target.checked) {
                                      next.push({ entity_type: entityType, entity_id: entityId });
                                    }
                                    setDataDraft({ ...dataDraft, links: next });
                                  }}
                                />
                                {"title" in item ? (item as TestCase | Scenario).title : (item as TestRun).name}
                              </label>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-slate-400">Data items</p>
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                        onClick={() =>
                          setDataDraft({
                            ...dataDraft,
                            items: [
                              ...dataDraft.items,
                              { clientId: createClientId(), label: "", value: "", note: "" }
                            ]
                          })
                        }
                      >
                        Add Data Item
                      </button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="text-xs font-semibold uppercase text-slate-400">
                          <tr>
                            <th className="px-3 py-2">Label</th>
                            <th className="px-3 py-2">Value</th>
                            <th className="px-3 py-2">Note</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataDraft.items.length ? (
                            dataDraft.items.map((item) => (
                              <tr
                                key={item.clientId}
                                className={cn(
                                  "border-t",
                                  theme === "light" ? "border-slate-200" : "border-slate-800"
                                )}
                              >
                                <td className="px-3 py-2">
                                  <input
                                    className={inputClass}
                                    value={item.label}
                                    onChange={(event) => {
                                      const next = dataDraft.items.map((entry) =>
                                        entry.clientId === item.clientId
                                          ? { ...entry, label: event.target.value }
                                          : entry
                                      );
                                      setDataDraft({ ...dataDraft, items: next });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    className={inputClass}
                                    value={item.value}
                                    onChange={(event) => {
                                      const next = dataDraft.items.map((entry) =>
                                        entry.clientId === item.clientId
                                          ? { ...entry, value: event.target.value }
                                          : entry
                                      );
                                      setDataDraft({ ...dataDraft, items: next });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    className={inputClass}
                                    value={item.note ?? ""}
                                    onChange={(event) => {
                                      const next = dataDraft.items.map((entry) =>
                                        entry.clientId === item.clientId
                                          ? { ...entry, note: event.target.value }
                                          : entry
                                      );
                                      setDataDraft({ ...dataDraft, items: next });
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded-full border px-3 py-1 text-xs font-semibold",
                                      theme === "light"
                                        ? "border-slate-200 text-slate-700"
                                        : "border-slate-700 text-slate-200"
                                    )}
                                    onClick={() =>
                                      setDataDraft({
                                        ...dataDraft,
                                        items: dataDraft.items.filter((entry) => entry.clientId !== item.clientId)
                                      })
                                    }
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr
                              className={cn(
                                "border-t",
                                theme === "light" ? "border-slate-200" : "border-slate-800"
                              )}
                            >
                              <td colSpan={4} className="px-3 py-8 text-center text-xs text-slate-400">
                                Data items are empty. Click “Add Data Item” to add one.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {dataError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {dataError}
                    </div>
                  )}

                  {isLoading && <p className="text-xs text-slate-400">保存中...</p>}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSaveDataSet}
                      disabled={isLoading}
                    >
                      保存
                    </button>
                    {selectedDataSetId && (
                      <button
                        className="rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-200"
                        onClick={() => setDeleteTarget({ type: "data", id: selectedDataSetId })}
                      >
                        削除
                      </button>
                    )}
                  </div>

                  <div className="mt-6 border-t border-slate-800 pt-4">
                    <h3 className="text-balance text-sm font-semibold">テンプレート作成</h3>
                    <p className="text-pretty mt-1 text-xs text-slate-400">
                      よく使う初期データを一括で登録できます。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dataScopes.map((scope) => (
                        <button
                          key={`template-${scope.value}`}
                          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                          onClick={() => handleCreateTemplate(scope.value)}
                        >
                          {scope.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "runs" && (
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className={panelClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-balance text-lg font-semibold">テスト実行一覧</h2>
	                  <button
	                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
	                    onClick={() => {
	                      setSelectedRunId(null);
	                      setRunDraft(emptyRun());
	                      setRunScenarios([]);
	                      setRunError(null);
	                      setSelectedRunScenarioId(null);
	                      setRunScenarioAddQuery("");
	                      setRunScenarioAddId("");
	                    }}
	                  >
	                    新規作成
	                  </button>
                </div>
                <input
                  className={cn(inputClass, "mt-4")}
                  placeholder="検索"
                  value={runQuery}
                  onChange={(event) => setRunQuery(event.target.value)}
                />
                <div className="mt-4 grid gap-2">
                  {filteredRuns.map((item) => (
                    <button
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm",
                        selectedRunId === item.id
                          ? "border-sky-400 bg-slate-900 text-slate-100"
                          : "border-slate-800 text-slate-300"
                      )}
                      onClick={() => selectRun(item.id)}
                    >
                      <div className="text-balance font-semibold">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.status}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">テスト実行詳細</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "Total",
                      value: runCaseTotals.isLoading ? "…" : runCaseTotals.total,
                      accent: "text-primary"
                    },
                    {
                      label: "Completed",
                      value: runCaseTotals.isLoading ? "…" : runCaseTotals.completed,
                      accent: theme === "light" ? "text-emerald-700" : "text-emerald-300"
                    },
                    {
                      label: "Remaining",
                      value: runCaseTotals.isLoading ? "…" : runCaseTotals.remaining,
                      accent: theme === "light" ? "text-amber-700" : "text-amber-300"
                    }
                  ].map((card) => (
                    <div
                      key={card.label}
                      className={cn(
                        "rounded-2xl border p-4",
                        theme === "light"
                          ? "border-slate-200 bg-white"
                          : "border-slate-800 bg-slate-950/30"
                      )}
                    >
                      <p className="text-pretty text-xs font-semibold text-slate-400">{card.label}</p>
                      <p className={cn("mt-2 text-balance text-3xl font-semibold tabular-nums", card.accent)}>
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-4" aria-busy={isLoading || undefined}>
                  <label htmlFor="run-name" className="text-xs font-semibold uppercase text-slate-400">
                    実行名
                  </label>
                  <input
                    id="run-name"
                    className={inputClass}
                    value={runDraft.name}
                    aria-invalid={runNameError || undefined}
                    aria-describedby={runNameError ? "run-name-error" : undefined}
                    onChange={(event) => setRunDraft({ ...runDraft, name: event.target.value })}
                  />
                  {runNameError && (
                    <p id="run-name-error" className="text-xs text-rose-200">
                      {runError}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="run-environment"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        環境
                      </label>
                      <input
                        id="run-environment"
                        className={cn(inputClass, "mt-2")}
                        value={runDraft.environment}
                        onChange={(event) =>
                          setRunDraft({ ...runDraft, environment: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="run-build"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        ビルド
                      </label>
                      <input
                        id="run-build"
                        className={cn(inputClass, "mt-2")}
                        value={runDraft.buildVersion}
                        onChange={(event) =>
                          setRunDraft({ ...runDraft, buildVersion: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="run-tester"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        担当者
                      </label>
                      <input
                        id="run-tester"
                        className={cn(inputClass, "mt-2")}
                        value={runDraft.tester}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRunDraft({ ...runDraft, tester: value });
                          if (value.trim()) {
                            setRunScenarios((prev) =>
                              prev.map((item) => (item.assignee ? item : { ...item, assignee: value }))
                            );
                          }
                        }}
                      />
                    </div>
                  </div>
                  <label htmlFor="run-status" className="text-xs font-semibold uppercase text-slate-400">
                    ステータス
                  </label>
                  <select
                    id="run-status"
                    className={inputClass}
                    value={runDraft.status}
                    onChange={(event) => setRunDraft({ ...runDraft, status: event.target.value })}
                  >
                    {runStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="run-notes" className="text-xs font-semibold uppercase text-slate-400">
                    メモ
                  </label>
                  <textarea
                    id="run-notes"
                    className={cn(inputClass, "min-h-[90px]")}
                    value={runDraft.notes}
                    onChange={(event) => setRunDraft({ ...runDraft, notes: event.target.value })}
                  />

                  {runError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {runError}
                    </div>
                  )}

                  {isLoading && <p className="text-xs text-slate-400">保存中...</p>}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSaveRun}
                      disabled={isLoading}
                    >
                      保存
                    </button>
                    {selectedRunId && (
                      <button
                        className="rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-200"
                        onClick={() => setDeleteTarget({ type: "run", id: selectedRunId })}
                      >
                        削除
                      </button>
                    )}
                  </div>

		                  <div className="border-t border-slate-800 pt-4">
		                    <div className="flex flex-wrap items-center justify-between gap-3">
		                      <h3 className="text-balance text-sm font-semibold">実行シナリオ</h3>
		                    </div>
		                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400 tabular-nums">
		                      <span
		                        className={cn(
		                          "rounded-full border px-2 py-0.5",
		                          theme === "light" ? "border-slate-200 text-slate-600" : "border-slate-800 text-slate-300"
		                        )}
		                      >
		                        総数: {runCaseTotals.isLoading ? "…" : runCaseTotals.total}
		                      </span>
		                      <span
		                        className={cn(
		                          "rounded-full border px-2 py-0.5",
		                          theme === "light" ? "border-slate-200 text-slate-600" : "border-slate-800 text-slate-300"
		                        )}
		                      >
		                        完了: {runCaseTotals.isLoading ? "…" : runCaseTotals.completed}
		                      </span>
		                      <span
		                        className={cn(
		                          "rounded-full border px-2 py-0.5",
		                          theme === "light" ? "border-slate-200 text-slate-600" : "border-slate-800 text-slate-300"
		                        )}
		                      >
		                        残数: {runCaseTotals.isLoading ? "…" : runCaseTotals.remaining}
		                      </span>
		                    </div>
	
	                    <div
	                      className={cn(
	                        "mt-3 rounded-2xl border p-3",
                        theme === "light" ? "border-slate-200 bg-slate-50" : "border-slate-800 bg-slate-950/30"
                      )}
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                        <div>
                          <label
                            htmlFor="run-scenario-add-query"
                            className="text-xs font-semibold uppercase text-slate-400"
                          >
                            追加するシナリオを検索
                          </label>
                          <input
                            id="run-scenario-add-query"
                            className={cn(inputClass, "mt-2")}
                            placeholder="検索"
                            value={runScenarioAddQuery}
                            onChange={(event) => setRunScenarioAddQuery(event.target.value)}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="run-scenario-add-select"
                            className="text-xs font-semibold uppercase text-slate-400"
                          >
                            追加候補
                          </label>
                          <select
                            id="run-scenario-add-select"
                            className={cn(inputClass, "mt-2")}
                            value={runScenarioAddId}
                            onChange={(event) => setRunScenarioAddId(event.target.value)}
                            disabled={scenarios.length === 0}
                          >
                            <option value="">選択してください</option>
                            {addableRunScenarios.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex lg:justify-end">
                          <button
                            type="button"
                            className="w-full rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
                            onClick={() => {
                              if (!runScenarioAddId) {
                                return;
                              }
                              void handleAddRunScenario(runScenarioAddId);
                              setRunScenarioAddId("");
                            }}
                            disabled={!runScenarioAddId}
                          >
                            シナリオを追加
                          </button>
                        </div>
                      </div>
                      {scenarios.length === 0 && (
                        <p className="text-pretty mt-2 text-xs text-slate-400">
                          先にシナリオを作成してください。
                        </p>
	                      )}
	                      {scenarios.length > 0 && addableRunScenarios.length === 0 && (
	                        <p className="text-pretty mt-2 text-xs text-slate-400">
	                          追加できるシナリオがありません。
	                        </p>
	                      )}
	                    </div>

	                    <div className="mt-4 grid gap-3">
	                      {runScenarios.map((item) => {
	                        const scenarioCasesRaw = runScenarioCasesMap[item.id];
	                        const scenarioCases = scenarioCasesRaw ?? [];
	                        const scenarioTotals = scenarioCasesRaw
	                          ? summarizeRunCaseStatuses(scenarioCasesRaw)
	                          : null;
	                        return (
	                        <div
	                          key={item.id}
	                          className={cn(
	                            "rounded-xl border border-slate-800 p-3",
                            selectedRunScenarioId === item.id && "border-sky-400"
                          )}
                        >
	                          <div className="flex items-center justify-between gap-2">
	                            <button
	                              className="text-left text-sm font-semibold"
	                              onClick={() => selectRunScenario(item.id)}
	                            >
	                              {item.title}
	                            </button>
	                            <button
	                              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200"
	                              onClick={async () => {
	                                await window.api.runs.removeScenario(item.id);
	                                if (selectedRunId) {
	                                  await selectRun(selectedRunId);
	                                }
	                              }}
	                            >
	                              削除
	                            </button>
	                          </div>
	                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400 tabular-nums">
	                            <span
	                              className={cn(
	                                "rounded-full border px-2 py-0.5",
	                                theme === "light"
	                                  ? "border-slate-200 text-slate-600"
	                                  : "border-slate-800 text-slate-300"
	                              )}
	                            >
	                              総数: {scenarioTotals ? scenarioTotals.total : "…"}
	                            </span>
	                            <span
	                              className={cn(
	                                "rounded-full border px-2 py-0.5",
	                                theme === "light"
	                                  ? "border-slate-200 text-slate-600"
	                                  : "border-slate-800 text-slate-300"
	                              )}
	                            >
	                              完了: {scenarioTotals ? scenarioTotals.completed : "…"}
	                            </span>
	                            <span
	                              className={cn(
	                                "rounded-full border px-2 py-0.5",
	                                theme === "light"
	                                  ? "border-slate-200 text-slate-600"
	                                  : "border-slate-800 text-slate-300"
	                              )}
	                            >
	                              残数: {scenarioTotals ? scenarioTotals.remaining : "…"}
	                            </span>
	                          </div>
	                          <div className="mt-3 grid gap-2">
	                            <label
	                              htmlFor={`run-scenario-status-${item.id}`}
	                              className="text-xs font-semibold uppercase text-slate-400"
                            >
                              結果
                            </label>
	                            <select
	                              id={`run-scenario-status-${item.id}`}
	                              className={inputClass}
	                              value={item.status}
	                              onChange={(event) =>
	                                updateRunScenarioDraft(item.id, { status: event.target.value })
	                              }
	                            >
	                              {runCaseStatusOptions.map((option) => (
	                                <option key={option} value={option}>
	                                  {runCaseStatusLabels[option]}
	                                </option>
	                              ))}
	                            </select>
                            <label
                              htmlFor={`run-scenario-assignee-${item.id}`}
                              className="text-xs font-semibold uppercase text-slate-400"
                            >
                              担当者
                            </label>
                            <input
                              id={`run-scenario-assignee-${item.id}`}
                              className={inputClass}
                              value={item.assignee ?? ""}
                              onChange={(event) =>
                                updateRunScenarioDraft(item.id, { assignee: event.target.value })
                              }
                            />
	                            <label
	                              htmlFor={`run-scenario-notes-${item.id}`}
	                              className="text-xs font-semibold uppercase text-slate-400"
	                            >
	                              備考
                            </label>
                            <textarea
                              id={`run-scenario-notes-${item.id}`}
                              className={cn(inputClass, "min-h-[70px]")}
                              value={item.notes ?? ""}
                              onChange={(event) =>
                                updateRunScenarioDraft(item.id, { notes: event.target.value })
                              }
                            />
                            <label
                              htmlFor={`run-scenario-executed-${item.id}`}
                              className="text-xs font-semibold uppercase text-slate-400"
                            >
                              実行日時
                            </label>
                            <input
                              id={`run-scenario-executed-${item.id}`}
                              className={inputClass}
                              type="datetime-local"
                              value={toLocalInput(item.executed_at)}
                              onChange={(event) =>
	                                updateRunScenarioDraft(item.id, { executed_at: event.target.value })
	                              }
	                            />
		                          </div>
		                          <div className="mt-4 rounded-2xl border border-slate-800/70 p-3">
		                            <div className="flex items-center justify-between">
		                              <p className="text-xs font-semibold uppercase text-slate-400">ケース結果</p>
		                            </div>
		                            <div className="mt-3 space-y-3">
                              {scenarioCases.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  {runScenarioCasesMap[item.id]
                                    ? "このシナリオに含まれるケースはありません。"
                                    : "ケース情報を読み込んでいます..."}
                                </p>
                              ) : (
                                scenarioCases.map((runCase) => {
                                  const caseDetail =
                                    scenarioDetailsCache[item.scenario_id]?.cases.find(
                                      (detail) => detail.case.id === runCase.case_id
                                    );
                                  const caseEvidence = runCaseEvidenceMap[runCase.id] ?? [];
                                  return (
                                    <details
                                      key={runCase.id}
                                      className={cn(
                                        "rounded-xl border px-3 py-3",
                                        theme === "light"
                                          ? "border-slate-200 bg-slate-50"
                                          : "border-slate-800 bg-slate-950/40"
                                      )}
                                    >
		                                      <summary className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm font-semibold">
		                                        <div className="min-w-0 space-y-1 text-slate-100">
		                                          <span>{runCase.case_title}</span>
	                                          <p className="text-[11px] text-slate-400">
	                                            前提:{" "}
	                                            {runCase.preconditions?.trim()
	                                              ? runCase.preconditions
	                                              : "なし"}
	                                          </p>
	                                          <p className="break-words text-[11px] text-slate-400">
	                                            初期データ:{" "}
	                                            {caseDetail?.dataSets.length
	                                              ? caseDetail.dataSets
	                                                  .map((dataSet) => dataSet.name)
	                                                  .join(" / ")
	                                              : "初期データなし"}
	                                          </p>
                                          {runCase.tags?.trim() && (
                                            <p className="text-[11px] text-slate-400">
                                              タグ: {runCase.tags}
                                            </p>
                                          )}
	                                        </div>
		                                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-slate-100">
		                                          {runCaseStatusLabels[runCase.status as RunCaseStatus] ?? runCase.status}
		                                        </span>
		                                      </summary>
	                                      <div className="mt-3 grid gap-4 text-xs text-slate-300">
	                                        <div>
	                                          <p className="text-[11px] font-semibold uppercase text-slate-400">
	                                            手順
	                                          </p>
	                                          {caseDetail ? (
	                                            caseDetail.steps.length ? (
	                                              <ol className="mt-2 space-y-2 text-[12px]">
	                                                {caseDetail.steps.map((step, index) => (
	                                                  <li
	                                                    key={`${runCase.id}-step-${index}`}
	                                                    className={cn(
	                                                      "space-y-1 rounded-lg border p-2",
	                                                      theme === "light"
	                                                        ? "border-slate-200 bg-white"
	                                                        : "border-slate-800 bg-slate-900/40"
	                                                    )}
	                                                  >
		                                                    <p
		                                                      className={cn(
		                                                        "whitespace-pre-wrap",
		                                                        theme === "light"
		                                                          ? "text-slate-700"
		                                                          : "text-slate-300"
		                                                      )}
		                                                    >
		                                                      <span
		                                                        className={cn(
		                                                          "font-semibold",
		                                                          theme === "light"
		                                                            ? "text-slate-900"
		                                                            : "text-slate-100"
		                                                        )}
		                                                      >
		                                                        操作:
		                                                      </span>{" "}
		                                                      {step.action || "なし"}
		                                                    </p>
		                                                    <p
		                                                      className={cn(
		                                                        "whitespace-pre-wrap",
		                                                        theme === "light"
		                                                          ? "text-slate-600"
		                                                          : "text-slate-400"
		                                                      )}
		                                                    >
		                                                      <span
		                                                        className={cn(
		                                                          "font-semibold",
		                                                          theme === "light"
		                                                            ? "text-slate-900"
		                                                            : "text-slate-100"
		                                                        )}
		                                                      >
		                                                        期待結果:
		                                                      </span>{" "}
		                                                      {step.expected || "なし"}
		                                                    </p>
	                                                  </li>
	                                                ))}
	                                              </ol>
	                                            ) : (
	                                              <p className="mt-2 text-xs text-slate-500">
	                                                手順がありません。
	                                              </p>
	                                            )
	                                          ) : (
	                                            <p className="mt-2 text-xs text-slate-500">
	                                              手順を読み込んでいます...
	                                            </p>
	                                          )}
	                                        </div>

	                                        <div className="grid gap-2">
	                                          <fieldset className="grid gap-2">
	                                            <legend className="text-[11px] font-semibold uppercase text-slate-400">
	                                              結果詳細
	                                            </legend>
	                                            <div className="flex flex-wrap gap-2">
	                                              {runCaseStatusOptions.map((option) => {
	                                                const checked = runCase.status === option;
	                                                return (
	                                                  <label
	                                                    key={`${runCase.id}-status-${option}`}
	                                                    className={cn(
	                                                      "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold",
	                                                      theme === "light"
	                                                        ? checked
	                                                          ? "border-sky-300 bg-sky-50 text-slate-900"
	                                                          : "border-slate-200 text-slate-600"
	                                                        : checked
	                                                          ? "border-sky-500/60 bg-sky-950/30 text-slate-100"
	                                                          : "border-slate-800 text-slate-200"
	                                                    )}
	                                                  >
	                                                    <input
	                                                      type="radio"
	                                                      name={`run-case-status-${runCase.id}`}
	                                                      value={option}
	                                                      className="sr-only"
	                                                      checked={checked}
	                                                      onChange={() =>
	                                                        updateRunScenarioCaseDraft(item.id, runCase.id, {
	                                                          status: option
	                                                        })
	                                                      }
	                                                    />
	                                                    {runCaseStatusLabels[option]}
	                                                  </label>
	                                                );
	                                              })}
	                                            </div>
	                                          </fieldset>
	                                          <label
	                                            htmlFor={`run-case-executed-${runCase.id}`}
	                                            className="text-[11px] font-semibold uppercase text-slate-400"
	                                          >
	                                            実行日時
	                                          </label>
	                                          <input
	                                            id={`run-case-executed-${runCase.id}`}
	                                            className={inputClass}
	                                            type="datetime-local"
	                                            value={toLocalInput(runCase.executed_at)}
	                                            onChange={(event) =>
	                                              updateRunScenarioCaseDraft(item.id, runCase.id, {
	                                                executed_at: event.target.value
	                                              })
	                                            }
	                                          />
	                                          <label
	                                            htmlFor={`run-case-notes-${runCase.id}`}
	                                            className="text-[11px] font-semibold uppercase text-slate-400"
	                                          >
	                                            備考
	                                          </label>
	                                          <textarea
	                                            id={`run-case-notes-${runCase.id}`}
	                                            className={cn(inputClass, "min-h-[70px]")}
	                                            value={runCase.notes ?? ""}
	                                            onChange={(event) =>
	                                              updateRunScenarioCaseDraft(item.id, runCase.id, {
	                                                notes: event.target.value
	                                              })
	                                            }
	                                          />
	                                          <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/20 p-3">
	                                            <div className="flex items-center justify-between gap-2">
	                                              <p className="text-[11px] font-semibold uppercase text-slate-400">
	                                                証跡
	                                              </p>
	                                              <div className="flex flex-wrap gap-2">
	                                                <button
	                                                  type="button"
	                                                  className="rounded-pill bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
	                                                  onClick={() => handleAddRunCaseEvidence(runCase.id)}
	                                                >
	                                                  Add Evidence
	                                                </button>
	                                                <button
	                                                  type="button"
	                                                  className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-200"
	                                                  onClick={() => handlePasteRunCaseEvidence(runCase.id)}
	                                                >
	                                                  Paste
	                                                </button>
	                                              </div>
	                                            </div>
	                                            <div className="mt-3">
                                                {caseEvidence.length ? (
                                                  <div className="flex flex-wrap gap-3">
                                                    {caseEvidence.map((preview) => (
                                                      <div key={preview.id} className="group relative w-30">
                                                        <button
                                                          type="button"
                                                          aria-label="証跡を削除"
                                                          className={cn(
                                                            "absolute right-1 top-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                                            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                                                            theme === "light"
                                                              ? "border-slate-200 bg-white text-slate-700"
                                                              : "border-slate-700 bg-slate-950/90 text-slate-100"
                                                          )}
                                                          onClick={() =>
                                                            handleRemoveRunCaseEvidence(preview.id, runCase.id)
                                                          }
                                                        >
                                                          Delete
                                                        </button>
                                                        <button
                                                          type="button"
                                                          className={cn(
                                                            "block rounded-xl border",
                                                            theme === "light"
                                                              ? "border-slate-200 bg-white"
                                                              : "border-slate-800 bg-slate-950/60"
                                                          )}
                                                          onClick={() =>
                                                            handlePreviewRunCaseEvidence(
                                                              preview.id,
                                                              preview.fileName
                                                            )
                                                          }
                                                        >
                                                          {preview.dataUrl &&
                                                          preview.mimeType?.startsWith("image/") ? (
                                                            <img
                                                              src={preview.dataUrl}
                                                              alt={preview.fileName}
                                                              className="size-30 rounded-xl object-cover"
                                                            />
                                                          ) : (
                                                            <div className="flex size-30 items-center justify-center p-2 text-center text-[11px] text-slate-400">
                                                              <span className="line-clamp-3">{preview.fileName}</span>
                                                            </div>
                                                          )}
                                                        </button>
                                                        <p className="mt-1 w-30 truncate text-[10px] text-slate-400">
                                                          {preview.fileName}
                                                        </p>
                                                      </div>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="text-pretty text-xs text-slate-400">
                                                    証跡はまだありません。Add Evidence から追加してください。
                                                  </p>
                                                )}
	                                            </div>
	                                          </div>
	                                          <div className="flex flex-wrap gap-2">
	                                            <button
	                                              type="button"
	                                              className="rounded-pill bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
	                                              onClick={() =>
	                                                handleSaveRunScenarioCase(item.id, runCase)
	                                              }
	                                            >
	                                              セーブ
	                                            </button>
	                                            <button
	                                              type="button"
	                                              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
	                                              onClick={() =>
	                                                updateRunScenarioCaseDraft(item.id, runCase.id, {
	                                                  executed_at: nowLocalInput()
	                                                })
	                                              }
	                                            >
	                                              実行日時を今
	                                            </button>
	                                          </div>
	                                        </div>
	                                      </div>
                                    </details>
                                  );
                                })
                              )}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="rounded-pill bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                              onClick={() =>
                                handleUpdateRunScenario({
                                  id: item.id,
                                  status: item.status,
                                  assignee: item.assignee ?? "",
                                  actualResult: item.actual_result ?? "",
                                  notes: item.notes ?? "",
                                  executedAt: item.executed_at ? item.executed_at : nowLocalInput()
                                })
                              }
                            >
                              保存
                            </button>
                            <button
                              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
                              onClick={() => {
                                updateRunScenarioDraft(item.id, { executed_at: nowLocalInput() });
                              }}
                            >
                              実行日時を今にする
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {selectedRunScenarioId && (
                      <div className="mt-4 rounded-xl border border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-balance text-sm font-semibold">証跡</h4>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                              onClick={handleAddEvidence}
                            >
                              ファイルを追加
                            </button>
                            <button
                              className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                              onClick={handlePasteEvidence}
                            >
                              画像を貼り付け
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {evidenceList.map((evidence) => (
                            <div key={evidence.id} className="flex items-center justify-between gap-2 text-sm">
                              <div className="flex min-w-0 items-center gap-2">
                                <button
                                  className="min-w-0 truncate text-left text-sky-300"
                                  onClick={() => window.api.evidence.open(evidence.id)}
                                >
                                  {evidence.file_name}
                                </button>
                                <button
                                  className="shrink-0 rounded-full border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200"
                                  onClick={() => handlePreviewEvidence(evidence.id, evidence.file_name)}
                                >
                                  プレビュー
                                </button>
                              </div>
                              <button
                                className="shrink-0 rounded-full border border-rose-500 px-2 py-1 text-[10px] font-semibold text-rose-200"
                                onClick={async () => {
                                  await window.api.evidence.remove(evidence.id);
                                  if (selectedRunScenarioId) {
                                    await selectRunScenario(selectedRunScenarioId);
                                  }
                                }}
                              >
                                削除
                              </button>
                            </div>
                          ))}
                          {!evidenceList.length && (
                            <p className="text-pretty text-xs text-slate-400">証跡はまだありません。</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "export" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">Export</h2>
                <p className="text-pretty mt-2 text-sm text-slate-400">
                  テスト資産を用途に合わせて出力できます。
                </p>
                <div className="mt-4 grid gap-4">
                  <label htmlFor="export-type" className="text-xs font-semibold uppercase text-slate-400">
                    Type
                  </label>
                  <select
                    id="export-type"
                    className={inputClass}
                    value={exportType}
                    onChange={(event) => setExportType(event.target.value as typeof exportType)}
                  >
                    <option value="test_cases">テストケース</option>
                    <option value="scenarios">シナリオ</option>
                    <option value="data_sets">初期データ</option>
                    <option value="test_runs">テスト実行結果</option>
                  </select>

                  {exportType === "data_sets" && (
                    <>
                      <label
                        htmlFor="export-scope"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        Scope
                      </label>
                      <select
                        id="export-scope"
                        className={inputClass}
                        value={exportScope}
                        onChange={(event) => setExportScope(event.target.value)}
                      >
                        {dataScopes.map((scope) => (
                          <option key={scope.value} value={scope.value}>
                            {scope.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label htmlFor="export-format" className="text-xs font-semibold uppercase text-slate-400">
                    Format
                  </label>
                  <select
                    id="export-format"
                    className={inputClass}
                    value={exportFormat}
                    onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)}
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                    <option value="md">Markdown</option>
                  </select>
                  <button
                    className="w-fit rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    onClick={handleExport}
                  >
                    Export
                  </button>
                  {exportNotice && (
                    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                      {exportNotice}
                    </div>
                  )}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">Import</h2>
                <p className="text-pretty mt-2 text-sm text-slate-400">
                  ドラッグ&ドロップでプレビューし、そのまま取り込めます。
                </p>
                <div className="mt-4 grid gap-4">
                  <label htmlFor="import-type" className="text-xs font-semibold uppercase text-slate-400">
                    Type
                  </label>
                  <select
                    id="import-type"
                    className={inputClass}
                    value={importType}
                    onChange={(event) => {
                      setImportType(event.target.value as typeof importType);
                      setImportNotice(null);
                      setImportStagedFile(null);
                      setImportPreviewData(null);
                      setImportPreviewErrorMessage(null);
                    }}
                  >
                    <option value="test_cases">テストケース</option>
                    <option value="scenarios">シナリオ</option>
                    <option value="data_sets">初期データ</option>
                  </select>

                  {importType === "data_sets" && (
                    <>
                      <label
                        htmlFor="import-scope"
                        className="text-xs font-semibold uppercase text-slate-400"
                      >
                        Scope
                      </label>
                      <select
                        id="import-scope"
                        className={inputClass}
                        value={importScope}
                        onChange={(event) => {
                          setImportScope(event.target.value);
                          setImportNotice(null);
                          setImportStagedFile(null);
                          setImportPreviewData(null);
                          setImportPreviewErrorMessage(null);
                        }}
                      >
                        {dataScopes.map((scope) => (
                          <option key={`import-${scope.value}`} value={scope.value}>
                            {scope.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label htmlFor="import-format" className="text-xs font-semibold uppercase text-slate-400">
                    Format
                  </label>
                  <select
                    id="import-format"
                    className={inputClass}
                    value={importFormat}
                    onChange={(event) => {
                      setImportFormat(event.target.value as typeof importFormat);
                      setImportNotice(null);
                      setImportStagedFile(null);
                      setImportPreviewData(null);
                      setImportPreviewErrorMessage(null);
                    }}
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                    <option value="md">Markdown</option>
                  </select>

                  <input
                    ref={importFileInputRef}
                    type="file"
                    className="sr-only"
                    onChange={(event) => {
                      void stageImportFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                  <div
                    className={cn(
                      "rounded-2xl border border-dashed p-5 text-center",
                      theme === "light"
                        ? "border-slate-200 bg-white text-slate-600"
                        : "border-slate-800 bg-slate-950/30 text-slate-300"
                    )}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files?.[0] ?? null;
                      void stageImportFile(file);
                    }}
                  >
                    <p className="text-pretty text-sm">
                      Drag & drop here, or{" "}
                      <button
                        type="button"
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                        onClick={() => importFileInputRef.current?.click()}
                      >
                        choose a file
                      </button>
                      .
                    </p>
                    <p className="text-pretty mt-2 text-xs text-slate-400">
                      選択中: {importStagedFile?.fileName ?? "なし"}
                    </p>
                  </div>

                  {importPreviewErrorMessage && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {importPreviewErrorMessage}
                    </div>
                  )}

                  {importPreviewData && (
                    <div
                      className={cn(
                        "rounded-2xl border p-4",
                        theme === "light"
                          ? "border-slate-200 bg-white"
                          : "border-slate-800/70 bg-slate-950/20"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            theme === "light" ? "text-slate-900" : "text-slate-300"
                          )}
                        >
                          Preview: {importPreviewData.fileName}
                        </p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          Total: {importPreviewData.total}
                        </p>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="text-[11px] font-semibold uppercase text-slate-400">
                            <tr>
                              {importPreviewData.columns.map((col) => (
                                <th key={col} className="px-2 py-2">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className={cn(theme === "light" ? "text-slate-900" : "text-slate-200")}>
                            {importPreviewData.rows.length ? (
                              importPreviewData.rows.map((row, idx) => (
                                <tr
                                  key={`preview-${idx}`}
                                  className={cn(
                                    "border-t",
                                    theme === "light" ? "border-slate-200" : "border-slate-800"
                                  )}
                                >
                                  {row.map((cell, cellIndex) => (
                                    <td key={`preview-${idx}-${cellIndex}`} className="px-2 py-2 align-top">
                                      <span className="line-clamp-3 text-pretty">{cell}</span>
                                    </td>
                                  ))}
                                </tr>
                              ))
                            ) : (
                              <tr
                                className={cn(
                                  "border-t",
                                  theme === "light" ? "border-slate-200" : "border-slate-800"
                                )}
                              >
                                <td
                                  className="px-2 py-6 text-center text-xs text-slate-400"
                                  colSpan={importPreviewData.columns.length || 1}
                                >
                                  プレビューできるデータがありません。
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <button
                    className="w-fit rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleImport}
                    disabled={isLoading}
                  >
                    Import
                  </button>

                  {importNotice && (
                    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                      {importNotice}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === "settings" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className={cn(panelClass, "lg:col-span-2")}>
                <h2 className="text-balance text-lg font-semibold">Project Settings</h2>
                <div className="mt-4 grid gap-4">
                  <label
                    htmlFor="settings-project-name"
                    className="text-xs font-semibold uppercase text-slate-400"
                  >
                    Project name
                  </label>
                  <input
                    id="settings-project-name"
                    className={inputClass}
                    value={project.name}
                    onChange={(event) => setProject({ ...project, name: event.target.value })}
                    onBlur={async () => {
                      const updated = (await window.api.project.rename(project.name)) as ProjectInfo;
                      setProject(updated);
                      setSettingsNotice("プロジェクト名を保存しました。");
                    }}
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">Path</p>
                    <p className="text-pretty mt-2 break-all text-sm text-slate-300">{project.path}</p>
                  </div>
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">Appearance</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      "rounded-pill border px-4 py-2 text-sm font-semibold",
                      theme === "light"
                        ? "border-slate-200 bg-white text-slate-900"
                        : "border-slate-800 bg-slate-950/30 text-slate-100",
                      theme === "light" && "ring-1 ring-primary"
                    )}
                    onClick={() => setTheme("light")}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-pill border px-4 py-2 text-sm font-semibold",
                      theme === "dark"
                        ? "border-slate-800 bg-slate-950/30 text-slate-100"
                        : "border-slate-200 bg-white text-slate-900",
                      theme === "dark" && "ring-1 ring-primary"
                    )}
                    onClick={() => setTheme("dark")}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">Database</h2>
                <p className="text-pretty mt-2 text-sm text-slate-400">
                  Backup は DB と attachments をフォルダにコピーします。Reset はすべてのデータを削除します。
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    onClick={handleBackupDatabase}
                  >
                    Backup
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-200"
                    onClick={() => setResetDatabaseOpen(true)}
                  >
                    Reset
                  </button>
                </div>
                {settingsNotice && (
                  <div className="mt-4 rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                    {settingsNotice}
                  </div>
                )}
              </div>
            </div>
          )}
          </main>
        </div>
      </div>

      {evidencePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 [padding:calc(env(safe-area-inset-top)+1rem)_calc(env(safe-area-inset-right)+1rem)_calc(env(safe-area-inset-bottom)+1rem)_calc(env(safe-area-inset-left)+1rem)]">
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-100">
              <span>{evidencePreview.fileName}</span>
              <button
                className="text-xs font-semibold uppercase text-slate-400"
                onClick={closeEvidencePreview}
              >
                閉じる
              </button>
            </div>
            {previewError ? (
              <p className="mt-4 text-sm text-rose-200">{previewError}</p>
            ) : evidencePreview.dataUrl && evidencePreview.mimeType.startsWith("image/") ? (
              <img
                src={evidencePreview.dataUrl}
                alt={evidencePreview.fileName}
                className="mt-4 h-[70vh] w-full max-w-full rounded-xl object-contain"
              />
            ) : (
              <p className="mt-4 text-sm text-slate-300">このファイルはプレビューできません。</p>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="削除してもよいですか？"
        description="この操作は取り消せません。"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={resetDatabaseOpen}
        title="DB をリセットしてもよいですか？"
        description="すべてのデータが削除され、この操作は取り消せません。"
        confirmLabel="リセットする"
        onConfirm={async () => {
          setResetDatabaseOpen(false);
          await handleResetDatabase();
        }}
        onCancel={() => setResetDatabaseOpen(false)}
      />
    </div>
  );
}
