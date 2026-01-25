import { useEffect, useMemo, useState } from "react";
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
  case_id: string;
  title: string;
  status: string;
  actual_result: string;
  evidence_summary: string;
  executed_at: string;
};

type Evidence = {
  id: string;
  run_case_id: string;
  file_name: string;
  stored_path: string;
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
};

type ScenarioDraft = {
  title: string;
  objective: string;
  preconditions: string;
  caseIds: string[];
};

type DataDraft = {
  name: string;
  scope: string;
  description: string;
  items: Array<{ label: string; value: string; note: string }>;
  links: DataLink[];
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

type SectionKey = "cases" | "scenarios" | "data" | "runs" | "export" | "settings";

const priorityOptions = ["高", "中", "低"] as const;
const severityOptions = ["致命的", "高", "中", "低"] as const;
const runStatusOptions = ["draft", "in_progress", "completed"] as const;
const runCaseStatusOptions = ["not_run", "pass", "fail", "blocked", "skip"] as const;
const dataScopes = [
  { value: "common", label: "共通初期データ" },
  { value: "case", label: "テストケース初期データ" },
  { value: "scenario", label: "シナリオ初期データ" },
  { value: "run", label: "実行初期データ" }
];

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: "cases", label: "テストケース" },
  { key: "scenarios", label: "シナリオ" },
  { key: "data", label: "初期データ" },
  { key: "runs", label: "テスト実行" },
  { key: "export", label: "エクスポート" },
  { key: "settings", label: "設定" }
];

const emptyCase = (): CaseDraft => ({
  title: "",
  objective: "",
  preconditions: "",
  priority: String(priorityOptions[1]),
  severity: String(severityOptions[2]),
  tags: "",
  steps: [{ action: "", expected: "" }]
});

const emptyScenario = (): ScenarioDraft => ({
  title: "",
  objective: "",
  preconditions: "",
  caseIds: [] as string[]
});

const emptyDataSet = (): DataDraft => ({
  name: "",
  scope: "common",
  description: "",
  items: [{ label: "", value: "", note: "" }],
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
  const [section, setSection] = useState<SectionKey>("cases");

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [caseQuery, setCaseQuery] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDraft, setCaseDraft] = useState<CaseDraft>(emptyCase());
  const [caseError, setCaseError] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDraft>(emptyScenario());
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [dataQuery, setDataQuery] = useState("");
  const [selectedDataSetId, setSelectedDataSetId] = useState<string | null>(null);
  const [dataDraft, setDataDraft] = useState<DataDraft>(emptyDataSet());
  const [dataError, setDataError] = useState<string | null>(null);

  const [runs, setRuns] = useState<TestRun[]>([]);
  const [runQuery, setRunQuery] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDraft, setRunDraft] = useState<RunDraft>(emptyRun());
  const [runCases, setRunCases] = useState<RunCase[]>([]);
  const [selectedRunCaseId, setSelectedRunCaseId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "case"; id: string }
    | { type: "scenario"; id: string }
    | { type: "data"; id: string }
    | { type: "run"; id: string }
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

  const panelClass = cn(
    "rounded-2xl border p-5 shadow-sm",
    theme === "light"
      ? "border-slate-200 bg-white text-slate-900"
      : "border-slate-800 bg-slate-900/60 text-slate-100"
  );

  const inputClass = cn(
    "w-full rounded-xl border px-3 py-2 text-sm",
    theme === "light"
      ? "border-slate-200 bg-white text-slate-900"
      : "border-slate-800 bg-slate-950 text-slate-100"
  );

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
    await Promise.all([loadCases(), loadScenarios(), loadDataSets(), loadRuns()]);
  };

  const loadCases = async () => {
    const list = (await window.api.testCases.list()) as TestCase[];
    setTestCases(list);
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
    if (!caseQuery.trim()) {
      return testCases;
    }
    const term = caseQuery.toLowerCase();
    return testCases.filter((item) => item.title.toLowerCase().includes(term));
  }, [testCases, caseQuery]);

  const filteredScenarios = useMemo(() => {
    if (!scenarioQuery.trim()) {
      return scenarios;
    }
    const term = scenarioQuery.toLowerCase();
    return scenarios.filter((item) => item.title.toLowerCase().includes(term));
  }, [scenarios, scenarioQuery]);

  const filteredDataSets = useMemo(() => {
    if (!dataQuery.trim()) {
      return dataSets;
    }
    const term = dataQuery.toLowerCase();
    return dataSets.filter((item) => item.name.toLowerCase().includes(term));
  }, [dataSets, dataQuery]);

  const filteredRuns = useMemo(() => {
    if (!runQuery.trim()) {
      return runs;
    }
    const term = runQuery.toLowerCase();
    return runs.filter((item) => item.name.toLowerCase().includes(term));
  }, [runs, runQuery]);

  const selectCase = async (id: string) => {
    setSelectedCaseId(id);
    const data = (await window.api.testCases.get(id)) as { testCase: TestCase; steps: TestStep[] };
    if (!data.testCase) {
      return;
    }
    setCaseDraft({
      title: data.testCase.title,
      objective: data.testCase.objective ?? "",
      preconditions: data.testCase.preconditions ?? "",
      priority: data.testCase.priority || priorityOptions[1],
      severity: data.testCase.severity || severityOptions[2],
      tags: data.testCase.tags ?? "",
      steps: data.steps.length ? data.steps.map((step) => ({ action: step.action, expected: step.expected })) : [{ action: "", expected: "" }]
    });
  };

  const selectScenario = async (id: string) => {
    setSelectedScenarioId(id);
    const data = (await window.api.scenarios.get(id)) as { scenario: Scenario; cases: ScenarioCase[] };
    if (!data.scenario) {
      return;
    }
    setScenarioDraft({
      title: data.scenario.title,
      objective: data.scenario.objective ?? "",
      preconditions: data.scenario.preconditions ?? "",
      caseIds: data.cases.map((item) => item.case_id)
    });
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
        ? data.items.map((item) => ({ label: item.label, value: item.value, note: item.note ?? "" }))
        : [{ label: "", value: "", note: "" }],
      links: data.links
    });
  };

  const selectRun = async (id: string) => {
    setSelectedRunId(id);
    const data = (await window.api.runs.get(id)) as { run: TestRun; runCases: RunCase[] };
    if (!data.run) {
      return;
    }
    setRunDraft({
      name: data.run.name,
      environment: data.run.environment ?? "",
      buildVersion: data.run.build_version ?? "",
      tester: data.run.tester ?? "",
      status: data.run.status,
      startedAt: data.run.started_at ?? "",
      finishedAt: data.run.finished_at ?? "",
      notes: data.run.notes ?? ""
    });
    setRunCases(data.runCases);
    setSelectedRunCaseId(null);
    setEvidenceList([]);
  };

  const selectRunCase = async (id: string) => {
    setSelectedRunCaseId(id);
    const list = (await window.api.evidence.list(id)) as Evidence[];
    setEvidenceList(list);
  };

  const handleSaveCase = async () => {
    setCaseError(null);
    if (!caseDraft.title.trim()) {
      setCaseError("タイトルは必須です。");
      return;
    }
    const payload = {
      id: selectedCaseId ?? undefined,
      title: caseDraft.title.trim(),
      objective: caseDraft.objective,
      preconditions: caseDraft.preconditions,
      priority: caseDraft.priority,
      severity: caseDraft.severity,
      tags: caseDraft.tags,
      steps: caseDraft.steps.filter((step) => step.action.trim() || step.expected.trim())
    };
    const id = (await window.api.testCases.save(payload)) as string;
    await loadCases();
    setSelectedCaseId(id);
  };

  const handleSaveScenario = async () => {
    setScenarioError(null);
    if (!scenarioDraft.title.trim()) {
      setScenarioError("タイトルは必須です。");
      return;
    }
    const payload = {
      id: selectedScenarioId ?? undefined,
      title: scenarioDraft.title.trim(),
      objective: scenarioDraft.objective,
      preconditions: scenarioDraft.preconditions,
      caseIds: scenarioDraft.caseIds
    };
    const id = (await window.api.scenarios.save(payload)) as string;
    await loadScenarios();
    setSelectedScenarioId(id);
  };

  const handleSaveDataSet = async () => {
    setDataError(null);
    if (!dataDraft.name.trim()) {
      setDataError("データセット名は必須です。");
      return;
    }
    const payload = {
      id: selectedDataSetId ?? undefined,
      name: dataDraft.name.trim(),
      scope: dataDraft.scope,
      description: dataDraft.description,
      items: dataDraft.items.filter((item) => item.label.trim() || item.value.trim()),
      links: dataDraft.links
    };
    const id = (await window.api.dataSets.save(payload)) as string;
    await loadDataSets();
    setSelectedDataSetId(id);
  };

  const handleSaveRun = async () => {
    setRunError(null);
    if (!runDraft.name.trim()) {
      setRunError("テスト実行名は必須です。");
      return;
    }
    const payload = {
      id: selectedRunId ?? undefined,
      name: runDraft.name.trim(),
      environment: runDraft.environment,
      buildVersion: runDraft.buildVersion,
      tester: runDraft.tester,
      status: runDraft.status,
      startedAt: runDraft.startedAt,
      finishedAt: runDraft.finishedAt,
      notes: runDraft.notes
    };
    const id = (await window.api.runs.save(payload)) as string;
    await loadRuns();
    setSelectedRunId(id);
  };

  const handleAddRunCase = async (caseId: string) => {
    if (!selectedRunId) {
      return;
    }
    await window.api.runs.addCase(selectedRunId, caseId);
    await selectRun(selectedRunId);
  };

  const handleUpdateRunCase = async (payload: {
    id: string;
    status: string;
    actualResult: string;
    evidenceSummary: string;
    executedAt: string;
  }) => {
    await window.api.runs.updateCase(payload);
    if (selectedRunId) {
      await selectRun(selectedRunId);
    }
  };

  const handleAddEvidence = async () => {
    if (!selectedRunCaseId) {
      return;
    }
    await window.api.evidence.add(selectedRunCaseId);
    await selectRunCase(selectedRunCaseId);
  };

  const handleExport = async () => {
    setExportNotice(null);
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
  };

  const handleImport = async () => {
    setImportNotice(null);
    const payload = {
      entity: importType,
      format: importFormat,
      scopeOverride: importType === "data_sets" ? importScope : undefined
    };
    const result = (await window.api.import.run(payload)) as
      | { imported: number; filePath: string }
      | null;
    if (!result) {
      setImportNotice("インポートがキャンセルされました。");
      return;
    }
    setImportNotice(`取り込み完了: ${result.imported} 件 (${result.filePath})`);
    await loadAll();
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
    }
    if (deleteTarget.type === "scenario") {
      await window.api.scenarios.delete(deleteTarget.id);
      await loadScenarios();
      setSelectedScenarioId(null);
      setScenarioDraft(emptyScenario());
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
      setRunCases([]);
    }
    setDeleteTarget(null);
  };

  if (!project) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
        <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-sm">
          <h1 className="text-balance text-3xl font-semibold">the test</h1>
          <p className="text-pretty mt-3 text-sm text-slate-300">
            ローカルで完結するテスト管理アプリ。SQLite と証跡フォルダで持ち運びできます。
          </p>
          <div className="mt-6 grid gap-4">
            <label className="text-xs font-semibold uppercase text-slate-400">プロジェクト名</label>
            <input
              className={inputClass}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
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

  return (
    <div className={cn("min-h-dvh", theme === "light" ? "bg-slate-50" : "bg-slate-950")}>
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-[240px_minmax(0,1fr)] gap-6 px-6 py-8">
        <aside className={cn("flex flex-col gap-4", panelClass)}>
          <div>
            <h2 className="text-balance text-lg font-semibold">the test</h2>
            <p className="text-pretty mt-1 text-xs text-slate-400">{project.name}</p>
            <p className="text-pretty mt-1 text-[11px] text-slate-500">{project.path}</p>
          </div>
          <nav className="mt-4 grid gap-2">
            {sections.map((item) => (
              <button
                key={item.key}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left text-sm font-semibold",
                  section === item.key
                    ? "bg-slate-800 text-slate-100"
                    : "border border-slate-800 text-slate-300"
                )}
                onClick={() => setSection(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex flex-col gap-6">
          <header className={cn("flex flex-wrap items-center justify-between gap-4", panelClass)}>
            <div>
              <h1 className="text-balance text-2xl font-semibold">テスト管理</h1>
              <p className="text-pretty mt-1 text-sm text-slate-400">
                テストケース、シナリオ、初期データ、実行結果を一元管理します。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold uppercase text-slate-400">テーマ</label>
              <select
                className={inputClass}
                value={theme}
                onChange={(event) => setTheme(event.target.value as "dark" | "light")}
              >
                <option value="dark">ダーク</option>
                <option value="light">ライト</option>
              </select>
            </div>
          </header>

          {section === "cases" && (
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className={panelClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-balance text-lg font-semibold">テストケース一覧</h2>
                  <button
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                    onClick={() => {
                      setSelectedCaseId(null);
                      setCaseDraft(emptyCase());
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
                <div className="mt-4 grid gap-2">
                  {filteredCases.map((item) => (
                    <button
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm",
                        selectedCaseId === item.id
                          ? "border-sky-400 bg-slate-900 text-slate-100"
                          : "border-slate-800 text-slate-300"
                      )}
                      onClick={() => selectCase(item.id)}
                    >
                      <div className="text-balance font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.updated_at}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">テストケース詳細</h2>
                <div className="mt-4 grid gap-4">
                  <label className="text-xs font-semibold uppercase text-slate-400">タイトル</label>
                  <input
                    className={inputClass}
                    value={caseDraft.title}
                    onChange={(event) => setCaseDraft({ ...caseDraft, title: event.target.value })}
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">目的</label>
                  <textarea
                    className={cn(inputClass, "min-h-[90px]")}
                    value={caseDraft.objective}
                    onChange={(event) => setCaseDraft({ ...caseDraft, objective: event.target.value })}
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">前提条件</label>
                  <textarea
                    className={cn(inputClass, "min-h-[90px]")}
                    value={caseDraft.preconditions}
                    onChange={(event) =>
                      setCaseDraft({ ...caseDraft, preconditions: event.target.value })
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-400">優先度</label>
                      <select
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
                      <label className="text-xs font-semibold uppercase text-slate-400">重大度</label>
                      <select
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
                      <label className="text-xs font-semibold uppercase text-slate-400">タグ</label>
                      <input
                        className={cn(inputClass, "mt-2")}
                        value={caseDraft.tags}
                        onChange={(event) => setCaseDraft({ ...caseDraft, tags: event.target.value })}
                        placeholder="例: ログイン,UI"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase text-slate-400">手順</label>
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
                        <div key={`${index}-${step.action}`} className="rounded-xl border border-slate-800 p-3">
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
                          <label className="mt-2 block text-xs font-semibold uppercase text-slate-400">
                            操作
                          </label>
                          <textarea
                            className={cn(inputClass, "mt-2 min-h-[70px]")}
                            value={step.action}
                            onChange={(event) => {
                              const next = [...caseDraft.steps];
                              next[index] = { ...step, action: event.target.value };
                              setCaseDraft({ ...caseDraft, steps: next });
                            }}
                          />
                          <label className="mt-2 block text-xs font-semibold uppercase text-slate-400">
                            期待結果
                          </label>
                          <textarea
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

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                      onClick={handleSaveCase}
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
                <div className="mt-4 grid gap-2">
                  {filteredScenarios.map((item) => (
                    <button
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm",
                        selectedScenarioId === item.id
                          ? "border-sky-400 bg-slate-900 text-slate-100"
                          : "border-slate-800 text-slate-300"
                      )}
                      onClick={() => selectScenario(item.id)}
                    >
                      <div className="text-balance font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.updated_at}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={panelClass}>
                <h2 className="text-balance text-lg font-semibold">シナリオ詳細</h2>
                <div className="mt-4 grid gap-4">
                  <label className="text-xs font-semibold uppercase text-slate-400">タイトル</label>
                  <input
                    className={inputClass}
                    value={scenarioDraft.title}
                    onChange={(event) => setScenarioDraft({ ...scenarioDraft, title: event.target.value })}
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">目的</label>
                  <textarea
                    className={cn(inputClass, "min-h-[90px]")}
                    value={scenarioDraft.objective}
                    onChange={(event) =>
                      setScenarioDraft({ ...scenarioDraft, objective: event.target.value })
                    }
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">前提条件</label>
                  <textarea
                    className={cn(inputClass, "min-h-[90px]")}
                    value={scenarioDraft.preconditions}
                    onChange={(event) =>
                      setScenarioDraft({ ...scenarioDraft, preconditions: event.target.value })
                    }
                  />
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-400">含めるテストケース</label>
                    <div className="mt-3 grid gap-2">
                      {testCases.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            className="accent-sky-400"
                            checked={scenarioDraft.caseIds.includes(item.id)}
                            onChange={(event) => {
                              const next = new Set(scenarioDraft.caseIds);
                              if (event.target.checked) {
                                next.add(item.id);
                              } else {
                                next.delete(item.id);
                              }
                              setScenarioDraft({ ...scenarioDraft, caseIds: Array.from(next) });
                            }}
                          />
                          {item.title}
                        </label>
                      ))}
                    </div>
                  </div>

                  {scenarioError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {scenarioError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                      onClick={handleSaveScenario}
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
                <div className="mt-4 grid gap-4">
                  <label className="text-xs font-semibold uppercase text-slate-400">名称</label>
                  <input
                    className={inputClass}
                    value={dataDraft.name}
                    onChange={(event) => setDataDraft({ ...dataDraft, name: event.target.value })}
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">種別</label>
                  <select
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
                  <label className="text-xs font-semibold uppercase text-slate-400">説明</label>
                  <textarea
                    className={cn(inputClass, "min-h-[90px]")}
                    value={dataDraft.description}
                    onChange={(event) =>
                      setDataDraft({ ...dataDraft, description: event.target.value })
                    }
                  />

                  {dataDraft.scope !== "common" && (
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-400">
                        紐づけ対象
                      </label>
                      <div className="mt-3 grid gap-2">
                        {(dataDraft.scope === "case" ? testCases : dataDraft.scope === "scenario" ? scenarios : runs).map(
                          (item) => {
                            const entityType = dataDraft.scope;
                            const entityId = item.id;
                            const checked = dataDraft.links.some(
                              (link) => link.entity_type === entityType && link.entity_id === entityId
                            );
                            return (
                              <label key={item.id} className="flex items-center gap-2 text-sm text-slate-300">
                                <input
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
                      <label className="text-xs font-semibold uppercase text-slate-400">項目</label>
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                        onClick={() =>
                          setDataDraft({
                            ...dataDraft,
                            items: [...dataDraft.items, { label: "", value: "", note: "" }]
                          })
                        }
                      >
                        項目を追加
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {dataDraft.items.map((item, index) => (
                        <div key={`${index}-${item.label}`} className="rounded-xl border border-slate-800 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400">項目 {index + 1}</span>
                            {dataDraft.items.length > 1 && (
                              <button
                                className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200"
                                onClick={() =>
                                  setDataDraft({
                                    ...dataDraft,
                                    items: dataDraft.items.filter((_, itemIndex) => itemIndex !== index)
                                  })
                                }
                              >
                                削除
                              </button>
                            )}
                          </div>
                          <label className="mt-2 block text-xs font-semibold uppercase text-slate-400">キー</label>
                          <input
                            className={cn(inputClass, "mt-2")}
                            value={item.label}
                            onChange={(event) => {
                              const next = [...dataDraft.items];
                              next[index] = { ...item, label: event.target.value };
                              setDataDraft({ ...dataDraft, items: next });
                            }}
                          />
                          <label className="mt-2 block text-xs font-semibold uppercase text-slate-400">値</label>
                          <input
                            className={cn(inputClass, "mt-2")}
                            value={item.value}
                            onChange={(event) => {
                              const next = [...dataDraft.items];
                              next[index] = { ...item, value: event.target.value };
                              setDataDraft({ ...dataDraft, items: next });
                            }}
                          />
                          <label className="mt-2 block text-xs font-semibold uppercase text-slate-400">メモ</label>
                          <input
                            className={cn(inputClass, "mt-2")}
                            value={item.note ?? ""}
                            onChange={(event) => {
                              const next = [...dataDraft.items];
                              next[index] = { ...item, note: event.target.value };
                              setDataDraft({ ...dataDraft, items: next });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {dataError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {dataError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                      onClick={handleSaveDataSet}
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
                      setRunCases([]);
                      setRunError(null);
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
                <div className="mt-4 grid gap-4">
                  <label className="text-xs font-semibold uppercase text-slate-400">実行名</label>
                  <input
                    className={inputClass}
                    value={runDraft.name}
                    onChange={(event) => setRunDraft({ ...runDraft, name: event.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-400">環境</label>
                      <input
                        className={cn(inputClass, "mt-2")}
                        value={runDraft.environment}
                        onChange={(event) =>
                          setRunDraft({ ...runDraft, environment: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-400">ビルド</label>
                      <input
                        className={cn(inputClass, "mt-2")}
                        value={runDraft.buildVersion}
                        onChange={(event) =>
                          setRunDraft({ ...runDraft, buildVersion: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-400">担当者</label>
                      <input
                        className={cn(inputClass, "mt-2")}
                        value={runDraft.tester}
                        onChange={(event) => setRunDraft({ ...runDraft, tester: event.target.value })}
                      />
                    </div>
                  </div>
                  <label className="text-xs font-semibold uppercase text-slate-400">ステータス</label>
                  <select
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
                  <label className="text-xs font-semibold uppercase text-slate-400">開始日時</label>
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={runDraft.startedAt}
                    onChange={(event) => setRunDraft({ ...runDraft, startedAt: event.target.value })}
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">終了日時</label>
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={runDraft.finishedAt}
                    onChange={(event) => setRunDraft({ ...runDraft, finishedAt: event.target.value })}
                  />
                  <label className="text-xs font-semibold uppercase text-slate-400">メモ</label>
                  <textarea
                    className={cn(inputClass, "min-h-[90px]")}
                    value={runDraft.notes}
                    onChange={(event) => setRunDraft({ ...runDraft, notes: event.target.value })}
                  />

                  {runError && (
                    <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                      {runError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                      onClick={handleSaveRun}
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
                    <h3 className="text-balance text-sm font-semibold">実行ケース</h3>
                    <div className="mt-3 grid gap-2">
                      {testCases.map((item) => (
                        <button
                          key={item.id}
                          className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-300"
                          onClick={() => handleAddRunCase(item.id)}
                        >
                          {item.title} を追加
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {runCases.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "rounded-xl border border-slate-800 p-3",
                            selectedRunCaseId === item.id && "border-sky-400"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              className="text-left text-sm font-semibold"
                              onClick={() => selectRunCase(item.id)}
                            >
                              {item.title}
                            </button>
                            <button
                              className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200"
                              onClick={async () => {
                                await window.api.runs.removeCase(item.id);
                                if (selectedRunId) {
                                  await selectRun(selectedRunId);
                                }
                              }}
                            >
                              削除
                            </button>
                          </div>
                          <div className="mt-3 grid gap-2">
                            <label className="text-xs font-semibold uppercase text-slate-400">結果</label>
                            <select
                              className={inputClass}
                              value={item.status}
                              onChange={(event) =>
                                handleUpdateRunCase({
                                  id: item.id,
                                  status: event.target.value,
                                  actualResult: item.actual_result ?? "",
                                  evidenceSummary: item.evidence_summary ?? "",
                                  executedAt: item.executed_at ?? ""
                                })
                              }
                            >
                              {runCaseStatusOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            <label className="text-xs font-semibold uppercase text-slate-400">実際結果</label>
                            <textarea
                              className={cn(inputClass, "min-h-[70px]")}
                              value={item.actual_result ?? ""}
                              onChange={(event) =>
                                handleUpdateRunCase({
                                  id: item.id,
                                  status: item.status,
                                  actualResult: event.target.value,
                                  evidenceSummary: item.evidence_summary ?? "",
                                  executedAt: item.executed_at ?? ""
                                })
                              }
                            />
                            <label className="text-xs font-semibold uppercase text-slate-400">証跡サマリー</label>
                            <textarea
                              className={cn(inputClass, "min-h-[70px]")}
                              value={item.evidence_summary ?? ""}
                              onChange={(event) =>
                                handleUpdateRunCase({
                                  id: item.id,
                                  status: item.status,
                                  actualResult: item.actual_result ?? "",
                                  evidenceSummary: event.target.value,
                                  executedAt: item.executed_at ?? ""
                                })
                              }
                            />
                            <label className="text-xs font-semibold uppercase text-slate-400">実行日時</label>
                            <input
                              className={inputClass}
                              type="datetime-local"
                              value={item.executed_at ?? ""}
                              onChange={(event) =>
                                handleUpdateRunCase({
                                  id: item.id,
                                  status: item.status,
                                  actualResult: item.actual_result ?? "",
                                  evidenceSummary: item.evidence_summary ?? "",
                                  executedAt: event.target.value
                                })
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedRunCaseId && (
                      <div className="mt-4 rounded-xl border border-slate-800 p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-balance text-sm font-semibold">証跡</h4>
                          <button
                            className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold"
                            onClick={handleAddEvidence}
                          >
                            証跡を追加
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {evidenceList.map((evidence) => (
                            <div key={evidence.id} className="flex items-center justify-between text-sm">
                              <button
                                className="text-left text-sky-300"
                                onClick={() => window.api.evidence.open(evidence.id)}
                              >
                                {evidence.file_name}
                              </button>
                              <button
                                className="rounded-full border border-rose-500 px-2 py-1 text-[10px] font-semibold text-rose-200"
                                onClick={async () => {
                                  await window.api.evidence.remove(evidence.id);
                                  if (selectedRunCaseId) {
                                    await selectRunCase(selectedRunCaseId);
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
            <div className={panelClass}>
              <h2 className="text-balance text-lg font-semibold">エクスポート</h2>
              <p className="text-pretty mt-2 text-sm text-slate-400">
                テストケース / シナリオ / 初期データを用途に合わせて出力できます。
              </p>
              <div className="mt-4 grid gap-4">
                <label className="text-xs font-semibold uppercase text-slate-400">対象</label>
                <select
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
                    <label className="text-xs font-semibold uppercase text-slate-400">初期データ種別</label>
                    <select
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

                <label className="text-xs font-semibold uppercase text-slate-400">形式</label>
                <select
                  className={inputClass}
                  value={exportFormat}
                  onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="md">Markdown</option>
                </select>
                <button
                  className="w-fit rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                  onClick={handleExport}
                >
                  エクスポートする
                </button>
                {exportNotice && (
                  <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                    {exportNotice}
                  </div>
                )}
              </div>

              <div className="mt-8 border-t border-slate-800 pt-6">
                <h2 className="text-balance text-lg font-semibold">インポート</h2>
                <p className="text-pretty mt-2 text-sm text-slate-400">
                  CSV / JSON / Markdown からデータを追加できます。
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="text-xs font-semibold uppercase text-slate-400">対象</label>
                  <select
                    className={inputClass}
                    value={importType}
                    onChange={(event) => setImportType(event.target.value as typeof importType)}
                  >
                    <option value="test_cases">テストケース</option>
                    <option value="scenarios">シナリオ</option>
                    <option value="data_sets">初期データ</option>
                  </select>

                  {importType === "data_sets" && (
                    <>
                      <label className="text-xs font-semibold uppercase text-slate-400">初期データ種別</label>
                      <select
                        className={inputClass}
                        value={importScope}
                        onChange={(event) => setImportScope(event.target.value)}
                      >
                        {dataScopes.map((scope) => (
                          <option key={`import-${scope.value}`} value={scope.value}>
                            {scope.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label className="text-xs font-semibold uppercase text-slate-400">形式</label>
                  <select
                    className={inputClass}
                    value={importFormat}
                    onChange={(event) => setImportFormat(event.target.value as typeof importFormat)}
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                    <option value="md">Markdown</option>
                  </select>
                  <button
                    className="w-fit rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                    onClick={handleImport}
                  >
                    ファイルを選択して取り込む
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
            <div className={panelClass}>
              <h2 className="text-balance text-lg font-semibold">設定</h2>
              <div className="mt-4 grid gap-4">
                <label className="text-xs font-semibold uppercase text-slate-400">プロジェクト名</label>
                <input
                  className={inputClass}
                  value={project.name}
                  onChange={(event) => setProject({ ...project, name: event.target.value })}
                  onBlur={async () => {
                    const updated = (await window.api.project.rename(project.name)) as ProjectInfo;
                    setProject(updated);
                  }}
                />
                <div>
                  <p className="text-pretty text-sm text-slate-400">
                    プロジェクトフォルダをコピーすると、他PCでも同じデータで開けます。
                    <br />
                    DB と attachments フォルダがセットです。
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="削除してもよいですか？"
        description="この操作は取り消せません。"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
