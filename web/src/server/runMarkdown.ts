import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { Database } from "./db.js";
import { notFound } from "./errors.js";

type Row = Record<string, unknown>;

export interface RunMarkdownInput {
  run: Row;
  scenarios: Row[];
  cases: Row[];
  steps: Row[];
  evidence: Row[];
  exportedAt?: string;
}

const resultLabels: Record<string, string> = {
  pass: "合格",
  fail: "不合格",
  blocked: "ブロック",
  skip: "スキップ",
  not_run: "未実行",
};

const runStatusLabels: Record<string, string> = {
  draft: "下書き",
  in_progress: "実行中",
  completed: "完了",
};

function raw(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function escaped(value: unknown): string {
  return raw(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function heading(value: unknown, fallback = "名称未設定"): string {
  return escaped(value).replace(/\r?\n/g, " ").trim() || fallback;
}

function paragraph(value: unknown): string {
  return escaped(value).trim() || "—";
}

function cell(value: unknown): string {
  return escaped(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim() || "—";
}

function linkLabel(value: unknown): string {
  return heading(value).replace(/\[/g, "（").replace(/\]/g, "）");
}

function htmlAttribute(value: unknown): string {
  return raw(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeFilename(value: unknown): string {
  return raw(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 100) || "the-test-run";
}

function formatDate(value: unknown): string {
  const text = raw(value).trim();
  if (!text) return "—";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? escaped(text) : date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function renderRunMarkdown(input: RunMarkdownInput): string {
  const activeScenarios = input.scenarios.filter((item) => !item.excluded_at);
  const activeCases = input.cases.filter((item) => !item.excluded_at).map((row, index) => ({
    row,
    anchor: `case-${String(index + 1).padStart(3, "0")}`,
    number: index + 1,
  }));
  const stepsByCase = new Map<string, Row[]>();
  for (const step of input.steps) {
    const key = raw(step.run_case_snapshot_id);
    stepsByCase.set(key, [...(stepsByCase.get(key) ?? []), step]);
  }
  const evidenceByCase = new Map<string, Row[]>();
  for (const item of input.evidence) {
    const key = raw(item.run_case_snapshot_id);
    evidenceByCase.set(key, [...(evidenceByCase.get(key) ?? []), item]);
  }

  const scenarioGroups = activeScenarios.map((scenario, index) => ({
    id: raw(scenario.id),
    title: heading(scenario.title, `シナリオ ${index + 1}`),
    anchor: `scenario-${String(index + 1).padStart(3, "0")}`,
  }));
  const knownScenarioIds = new Set(scenarioGroups.map((item) => item.id));
  const orphanScenarioIds = [...new Set(activeCases.map(({ row }) => raw(row.run_scenario_snapshot_id)).filter((id) => id && !knownScenarioIds.has(id)))];
  orphanScenarioIds.forEach((id, index) => scenarioGroups.push({
    id,
    title: heading(activeCases.find(({ row }) => raw(row.run_scenario_snapshot_id) === id)?.row.scenario_title, `シナリオ ${activeScenarios.length + index + 1}`),
    anchor: `scenario-${String(activeScenarios.length + index + 1).padStart(3, "0")}`,
  }));
  if (activeCases.some(({ row }) => !row.run_scenario_snapshot_id)) {
    scenarioGroups.push({ id: "", title: "単独確認項目", anchor: "scenario-standalone" });
  }

  const resultOrder = ["pass", "fail", "blocked", "skip", "not_run"];
  const counts = new Map(resultOrder.map((status) => [status, 0]));
  activeCases.forEach(({ row }) => counts.set(raw(row.status), (counts.get(raw(row.status)) ?? 0) + 1));

  const lines: string[] = [
    `# ${heading(input.run.name, "テスト実行結果")}`,
    "",
    "<a id=\"summary\"></a>",
    "## 実行概要",
    "",
    "| 項目 | 内容 |",
    "|---|---|",
    `| プロジェクト | ${cell(input.run.project_name)} |`,
    `| 実行名 | ${cell(input.run.name)} |`,
    `| 状態 | ${cell(runStatusLabels[raw(input.run.status)] ?? input.run.status)} |`,
    `| 環境 | ${cell(input.run.environment_name)} |`,
    `| ビルド | ${cell(input.run.build_name)} |`,
    `| 担当者 | ${cell(input.run.assignee_display_name || input.run.assignee_username || "未割当")} |`,
    `| 開始日時 | ${formatDate(input.run.started_at)} |`,
    `| 完了日時 | ${formatDate(input.run.completed_at)} |`,
    `| 出力日時 | ${formatDate(input.exportedAt ?? new Date().toISOString())} |`,
    "",
    "<a id=\"toc\"></a>",
    "## 目次",
    "",
    "- [実行概要](#summary)",
    "- [結果概要](#result-summary)",
  ];

  for (const status of resultOrder) {
    const count = counts.get(status) ?? 0;
    lines.push(`  - [${resultLabels[status]}（${count}件）](#result-${status})`);
  }
  lines.push("- [シナリオ別結果](#scenario-results)");
  for (const scenario of scenarioGroups) {
    const cases = activeCases.filter(({ row }) => raw(row.run_scenario_snapshot_id) === scenario.id);
    lines.push(`  - [${linkLabel(scenario.title)}](#${scenario.anchor})`);
    for (const item of cases) {
      lines.push(`    - [${item.number}. ${linkLabel(item.row.title)} — ${resultLabels[raw(item.row.status)] ?? heading(item.row.status)}](#${item.anchor})`);
    }
  }

  lines.push("", "<a id=\"result-summary\"></a>", "## 結果概要", "", "| 結果 | 件数 |", "|---|---:|");
  for (const status of resultOrder) lines.push(`| [${resultLabels[status]}](#result-${status}) | ${counts.get(status) ?? 0} |`);

  for (const status of resultOrder) {
    const items = activeCases.filter(({ row }) => raw(row.status) === status);
    lines.push("", `<a id=\"result-${status}\"></a>`, `### ${resultLabels[status]}（${items.length}件）`, "");
    if (!items.length) {
      lines.push("該当する確認項目はありません。", "");
    } else {
      for (const item of items) {
        const scenarioTitle = heading(item.row.scenario_title, item.row.run_scenario_snapshot_id ? "シナリオ" : "単独確認項目");
        lines.push(`- [${linkLabel(scenarioTitle)} / ${linkLabel(item.row.title)}](#${item.anchor})`);
      }
      lines.push("");
    }
    lines.push("[目次へ戻る](#toc)");
  }

  lines.push("", "<a id=\"scenario-results\"></a>", "## シナリオ別結果", "");
  for (const scenario of scenarioGroups) {
    const cases = activeCases.filter(({ row }) => raw(row.run_scenario_snapshot_id) === scenario.id);
    lines.push(`<a id=\"${scenario.anchor}\"></a>`, `## ${scenario.title}`, "");
    if (!cases.length) {
      lines.push("対象となる確認項目はありません。", "", "[目次へ戻る](#toc)", "");
      continue;
    }
    lines.push("| No. | 確認項目 | 結果 | 担当者 |", "|---:|---|---|---|");
    for (const item of cases) {
      lines.push(`| ${item.number} | [${linkLabel(item.row.title)}](#${item.anchor}) | ${cell(resultLabels[raw(item.row.status)] ?? item.row.status)} | ${cell(item.row.assignee_display_name || item.row.assignee_username || "未割当")} |`);
    }
    lines.push("");

    for (const item of cases) {
      const row = item.row;
      const steps = stepsByCase.get(raw(row.id)) ?? [];
      const images = (evidenceByCase.get(raw(row.id)) ?? []).filter((evidence) => raw(evidence.image_data_uri).startsWith("data:image/"));
      lines.push(
        `<a id=\"${item.anchor}\"></a>`,
        `### ${item.number}. ${heading(row.title, "確認項目")}`,
        "",
        `**結果：${heading(resultLabels[raw(row.status)] ?? row.status, "未実行")}**`,
        "",
        "| 項目 | 内容 |",
        "|---|---|",
        `| 優先度 | ${cell(row.priority)} |`,
        `| 担当者 | ${cell(row.assignee_display_name || row.assignee_username || "未割当")} |`,
        `| 実行日時 | ${formatDate(row.executed_at)} |`,
        `| 見る場所 | ${cell(row.view_location)} |`,
        "",
        "#### 目的",
        "",
        paragraph(row.objective),
        "",
        "#### 前提条件",
        "",
        paragraph(row.preconditions),
        "",
        "#### 操作と期待結果",
        "",
        "| No. | 操作 | 期待結果 |",
        "|---:|---|---|",
      );
      if (steps.length) {
        for (const step of steps) lines.push(`| ${cell(step.step_no)} | ${cell(step.action_text)} | ${cell(step.expected_result)} |`);
      } else {
        lines.push("| — | — | — |");
      }
      lines.push(
        "",
        "#### 実績結果",
        "",
        paragraph(row.actual_result),
        "",
        "#### 備考",
        "",
        paragraph(row.notes),
        "",
        "#### 証跡",
        "",
      );
      if (!images.length) {
        lines.push("画像証跡はありません。", "");
      } else {
        images.forEach((evidence, imageIndex) => {
          const description = raw(evidence.description).trim() || `証跡画像 ${imageIndex + 1}`;
          lines.push(
            `##### 証跡 ${imageIndex + 1}`,
            "",
            paragraph(description),
            "",
            `<img src=\"${raw(evidence.image_data_uri)}\" alt=\"${htmlAttribute(description)}\" style=\"max-width:100%;height:auto;\">`,
            "",
          );
        });
      }
      lines.push(`[${linkLabel(scenario.title)}へ戻る](#${scenario.anchor}) · [目次へ戻る](#toc)`, "", "---", "");
    }
  }
  return `\uFEFF${lines.join("\n").trimEnd()}\n`;
}

export async function buildRunMarkdown(db: Database, projectId: string, runId: string): Promise<{ filename: string; markdown: string }> {
  const runRows = await db.query<Row>(
    `SELECT r.*, p.name AS project_name, u.username AS assignee_username, u.display_name AS assignee_display_name
       FROM test_runs r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.assignee_id
      WHERE r.id = ? AND r.project_id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [runId, projectId],
  );
  const run = runRows[0];
  if (!run) throw notFound();
  const [scenarios, cases, steps, evidenceRows] = await Promise.all([
    db.query<Row>("SELECT id, title, status, position, excluded_at, exclusion_reason FROM run_scenario_snapshots WHERE test_run_id = ? ORDER BY position, created_at", [runId]),
    db.query<Row>(
      `SELECT c.*, s.title AS scenario_title, u.username AS assignee_username, u.display_name AS assignee_display_name
         FROM run_case_snapshots c
         LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
         LEFT JOIN users u ON u.id = c.assignee_id
        WHERE c.test_run_id = ? ORDER BY COALESCE(s.position, 999999), c.position, c.created_at`,
      [runId],
    ),
    db.query<Row>("SELECT run_case_snapshot_id, step_no, action_text, expected_result FROM run_step_snapshots WHERE run_case_snapshot_id IN (SELECT id FROM run_case_snapshots WHERE test_run_id = ?) ORDER BY run_case_snapshot_id, step_no", [runId]),
    db.query<Row>(
      `SELECT e.id, e.run_case_snapshot_id, e.description, v.content_type, v.stored_path
         FROM evidence_files e
         JOIN evidence_versions v ON v.evidence_file_id = e.id AND v.version_no = e.current_version
         JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id
        WHERE e.project_id = ? AND c.test_run_id = ? AND e.deleted_at IS NULL
        ORDER BY c.position, e.updated_at`,
      [projectId, runId],
    ),
  ]);
  const evidence: Row[] = [];
  for (const item of evidenceRows) {
    if (!raw(item.content_type).toLowerCase().startsWith("image/")) continue;
    let imageDataUri = "";
    try {
      const source = await readFile(raw(item.stored_path));
      const image = await sharp(source)
        .rotate()
        .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      imageDataUri = `data:image/png;base64,${image.toString("base64")}`;
    } catch {
      imageDataUri = "";
    }
    evidence.push({ ...item, image_data_uri: imageDataUri });
  }
  const markdown = renderRunMarkdown({ run, scenarios, cases, steps, evidence, exportedAt: new Date().toISOString() });
  return { filename: `${safeFilename(run.name)}-実行結果.md`, markdown };
}
