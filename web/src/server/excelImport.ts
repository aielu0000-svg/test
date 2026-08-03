import { createReadStream } from "node:fs";
import ExcelJS from "exceljs";
import { badRequest } from "./errors.js";

export type ImportPriority = "high" | "medium" | "low";

export interface ExcelImportStep {
  stepNo: number;
  action: string;
  expected: string;
}

export interface ExcelImportCase {
  caseKey: string;
  scenarioKey: string;
  folderPaths: string[];
  title: string;
  objective: string;
  preconditions: string;
  viewLocation: string;
  priority: ImportPriority;
  tags: string[];
  data: string;
  steps: ExcelImportStep[];
}

export interface ExcelImportDataItem {
  itemNo: number;
  label: string;
  value: string;
  memo: string;
}

export interface ExcelImportScenario {
  scenarioKey: string;
  folderPath: string;
  title: string;
  objective: string;
  preconditions: string;
  commonDataName: string;
  commonDataDescription: string;
  cases: ExcelImportCase[];
  commonDataItems: ExcelImportDataItem[];
}

export interface ExcelImportParseResult {
  scenarios: ExcelImportScenario[];
  errors: string[];
  warnings: string[];
}

type HeaderAliases = Record<string, string>;

const SCENARIO_HEADERS: HeaderAliases = {
  "テストキー": "ScenarioKey",
  "シナリオキー": "ScenarioKey",
  "ScenarioKey": "ScenarioKey",
  "フォルダパス": "FolderPath",
  "FolderPath": "FolderPath",
  "テスト名": "Title",
  "タイトル": "Title",
  "Title": "Title",
  "目的": "Objective",
  "Objective": "Objective",
  "テスト全体の前提条件": "Preconditions",
  "前提条件": "Preconditions",
  "Preconditions": "Preconditions",
  "共通データ名": "CommonDataName",
  "CommonDataName": "CommonDataName",
  "共通データ説明": "CommonDataDescription",
  "CommonDataDescription": "CommonDataDescription",
};

const CASE_HEADERS: HeaderAliases = {
  "テストキー": "ScenarioKey",
  "シナリオキー": "ScenarioKey",
  "ScenarioKey": "ScenarioKey",
  "確認項目キー": "CaseKey",
  "ケースキー": "CaseKey",
  "ケースID": "CaseKey",
  "CaseKey": "CaseKey",
  "所属フォルダパス": "FolderPaths",
  "フォルダパス": "FolderPaths",
  "FolderPaths": "FolderPaths",
  "確認項目名": "Title",
  "タイトル": "Title",
  "Title": "Title",
  "目的": "Objective",
  "Objective": "Objective",
  "前提条件": "Preconditions",
  "Preconditions": "Preconditions",
  "見る場所": "ViewLocation",
  "ViewLocation": "ViewLocation",
  "優先度": "Priority",
  "Priority": "Priority",
  "タグ": "Tags",
  "Tags": "Tags",
  "テストデータ": "Data",
  "Data": "Data",
};

const STEP_HEADERS: HeaderAliases = {
  "確認項目キー": "CaseKey",
  "ケースキー": "CaseKey",
  "ケースID": "CaseKey",
  "CaseKey": "CaseKey",
  "手順番号": "StepNo",
  "StepNo": "StepNo",
  "操作": "Action",
  "Action": "Action",
  "期待結果": "Expected",
  "Expected": "Expected",
};

const COMMON_DATA_HEADERS: HeaderAliases = {
  "テストキー": "ScenarioKey",
  "シナリオキー": "ScenarioKey",
  "ScenarioKey": "ScenarioKey",
  "項目番号": "ItemNo",
  "ItemNo": "ItemNo",
  "項目名": "Label",
  "Label": "Label",
  "値": "Value",
  "Value": "Value",
  "メモ": "Memo",
  "Memo": "Memo",
};

function cellText(cell: ExcelJS.Cell): string {
  if (cell.type === ExcelJS.ValueType.Formula) throw badRequest(`数式セルは使用できません: ${cell.address}`);
  return cell.text.trim();
}

function headerMap(sheet: ExcelJS.Worksheet, aliases: HeaderAliases): Map<string, number> {
  const result = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => {
    const header = cellText(cell);
    result.set(aliases[header] ?? header, column);
  });
  return result;
}

function getCell(row: ExcelJS.Row, headers: Map<string, number>, name: string): string {
  return cellText(row.getCell(headers.get(name)!));
}

function requireHeaders(sheetName: string, headers: Map<string, number>, names: string[], errors: string[]): void {
  for (const name of names) if (!headers.has(name)) errors.push(`${sheetName}シートに必須列 ${name} がありません。`);
}

function priority(value: string): ImportPriority | null {
  const normalized = value.toLowerCase();
  if (["高", "high"].includes(normalized)) return "high";
  if (["中", "medium"].includes(normalized)) return "medium";
  if (["低", "low"].includes(normalized)) return "low";
  return null;
}

function splitTags(value: string): string[] {
  return [...new Set(value.split(/[,、]/).map((item) => item.trim()).filter(Boolean))];
}

function splitFolderPaths(value: string): string[] {
  return [...new Set(value.split(/[|\n;；]+/).map((item) => item.trim()).filter(Boolean))];
}

function styleDataSheet(sheet: ExcelJS.Worksheet, widths: number[]): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

export async function buildCasesTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "THE TEST WEB";
  workbook.subject = "テスト設計Excelインポートテンプレート";

  const guide = workbook.addWorksheet("使い方");
  guide.addRows([
    ["THE TEST WEB Excelインポート"],
    ["Scenarios", "1行を1つのテストとして登録します。テストキーでCasesとCommonDataを関連付けます。"],
    ["Cases", "1行を1つの確認項目として登録します。所属フォルダを複数指定する場合は | で区切ります。"],
    ["Steps", "確認項目の操作手順を登録します。確認項目キーと手順番号の組み合わせは重複不可です。"],
    ["CommonData", "テスト共通データです。不要な場合はデータ行を削除できます。シート自体は残しても削除しても構いません。"],
    ["フォルダパス", "階層は / で区切ります。例: 機能/ログイン"],
    ["注意", "列名やシート名は変更しないでください。数式・結合セルは使用できません。"],
  ]);
  guide.getColumn(1).width = 20;
  guide.getColumn(2).width = 90;
  guide.getRow(1).font = { bold: true, size: 16 };
  guide.getRow(1).height = 28;
  guide.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });

  const scenarios = workbook.addWorksheet("Scenarios");
  scenarios.addRow(["テストキー", "フォルダパス", "テスト名", "目的", "テスト全体の前提条件", "共通データ名", "共通データ説明"]);
  scenarios.addRow(["SCENARIO-001", "機能/ログイン", "ログイン機能の確認", "利用者が正常にログインできること", "テストユーザーが登録済み", "ログイン共通データ", "ログイン確認で共通利用する値"]);
  styleDataSheet(scenarios, [20, 24, 32, 38, 38, 28, 38]);

  const cases = workbook.addWorksheet("Cases");
  cases.addRow(["テストキー", "確認項目キー", "所属フォルダパス", "確認項目名", "目的", "前提条件", "見る場所", "優先度", "タグ", "テストデータ"]);
  cases.addRow(["SCENARIO-001", "CASE-001", "機能/ログイン|回帰", "正常ログイン", "正しい認証情報でログインできること", "ログイン画面を表示済み", "ログイン画面", "高", "smoke,login", "ユーザー: test-user"]);
  styleDataSheet(cases, [20, 20, 28, 30, 38, 38, 28, 14, 24, 30]);

  const steps = workbook.addWorksheet("Steps");
  steps.addRow(["確認項目キー", "手順番号", "操作", "期待結果"]);
  steps.addRow(["CASE-001", 1, "ユーザー名とパスワードを入力する", "入力値が表示される"]);
  steps.addRow(["CASE-001", 2, "ログインボタンを押す", "ダッシュボードが表示される"]);
  styleDataSheet(steps, [20, 14, 48, 48]);

  const commonData = workbook.addWorksheet("CommonData");
  commonData.addRow(["テストキー", "項目番号", "項目名", "値", "メモ"]);
  commonData.addRow(["SCENARIO-001", 1, "共通URL", "https://example.test/login", "テスト環境"]);
  styleDataSheet(commonData, [20, 14, 28, 42, 32]);

  const value = await workbook.xlsx.writeBuffer();
  return Buffer.from(value);
}

export async function parseCasesWorkbook(filePath: string): Promise<ExcelImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(createReadStream(filePath));
  const errors: string[] = [];
  const warnings: string[] = [];
  const scenariosSheet = workbook.getWorksheet("Scenarios");
  const casesSheet = workbook.getWorksheet("Cases");
  const stepsSheet = workbook.getWorksheet("Steps");
  const commonDataSheet = workbook.getWorksheet("CommonData");

  if (!scenariosSheet) errors.push("Scenariosシートがありません。古い公式テンプレートは現在のテスト設計構造に対応していません。最新版を再ダウンロードしてください。");
  if (!casesSheet) errors.push("Casesシートがありません。");
  if (!stepsSheet) errors.push("Stepsシートがありません。");
  if (!scenariosSheet || !casesSheet || !stepsSheet) return { scenarios: [], errors, warnings };

  for (const sheet of [scenariosSheet, casesSheet, stepsSheet, commonDataSheet].filter((item): item is ExcelJS.Worksheet => Boolean(item))) {
    if ((sheet.model.merges?.length ?? 0) > 0) errors.push(`${sheet.name}シートで結合セルは使用できません。`);
  }

  const scenarioHeaders = headerMap(scenariosSheet, SCENARIO_HEADERS);
  const caseHeaders = headerMap(casesSheet, CASE_HEADERS);
  const stepHeaders = headerMap(stepsSheet, STEP_HEADERS);
  const commonDataHeaders = commonDataSheet ? headerMap(commonDataSheet, COMMON_DATA_HEADERS) : null;
  requireHeaders("Scenarios", scenarioHeaders, ["ScenarioKey", "FolderPath", "Title", "Objective", "Preconditions", "CommonDataName", "CommonDataDescription"], errors);
  requireHeaders("Cases", caseHeaders, ["ScenarioKey", "CaseKey", "FolderPaths", "Title", "Objective", "Preconditions", "ViewLocation", "Priority", "Tags", "Data"], errors);
  requireHeaders("Steps", stepHeaders, ["CaseKey", "StepNo", "Action", "Expected"], errors);
  if (commonDataHeaders) requireHeaders("CommonData", commonDataHeaders, ["ScenarioKey", "ItemNo", "Label", "Value", "Memo"], errors);
  if (errors.length) return { scenarios: [], errors, warnings };

  const scenariosByKey = new Map<string, ExcelImportScenario>();
  scenariosSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) warnings.push(`Scenarios ${rowNumber}行目は非表示行です。`);
    try {
      const scenarioKey = getCell(row, scenarioHeaders, "ScenarioKey");
      const title = getCell(row, scenarioHeaders, "Title");
      if (!scenarioKey && !title) return;
      if (!scenarioKey) { errors.push(`Scenarios ${rowNumber}行目: テストキーが空です。`); return; }
      if (!title) { errors.push(`Scenarios ${rowNumber}行目: テスト名が空です。`); return; }
      if (scenariosByKey.has(scenarioKey)) { errors.push(`Scenarios ${rowNumber}行目: テストキー ${scenarioKey} が重複しています。`); return; }
      scenariosByKey.set(scenarioKey, {
        scenarioKey,
        folderPath: getCell(row, scenarioHeaders, "FolderPath"),
        title,
        objective: getCell(row, scenarioHeaders, "Objective"),
        preconditions: getCell(row, scenarioHeaders, "Preconditions"),
        commonDataName: getCell(row, scenarioHeaders, "CommonDataName"),
        commonDataDescription: getCell(row, scenarioHeaders, "CommonDataDescription"),
        cases: [],
        commonDataItems: [],
      });
    } catch (error) {
      errors.push(`Scenarios ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (!scenariosByKey.size) errors.push("Scenariosシートにテストがありません。");

  const casesByKey = new Map<string, ExcelImportCase>();
  casesSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) warnings.push(`Cases ${rowNumber}行目は非表示行です。`);
    try {
      const scenarioKey = getCell(row, caseHeaders, "ScenarioKey");
      const caseKey = getCell(row, caseHeaders, "CaseKey");
      const title = getCell(row, caseHeaders, "Title");
      if (!scenarioKey && !caseKey && !title) return;
      if (!scenarioKey) { errors.push(`Cases ${rowNumber}行目: テストキーが空です。`); return; }
      const scenario = scenariosByKey.get(scenarioKey);
      if (!scenario) { errors.push(`Cases ${rowNumber}行目: 存在しないテストキー ${scenarioKey} です。`); return; }
      if (!caseKey) { errors.push(`Cases ${rowNumber}行目: 確認項目キーが空です。`); return; }
      if (!title) { errors.push(`Cases ${rowNumber}行目: 確認項目名が空です。`); return; }
      if (casesByKey.has(caseKey)) { errors.push(`Cases ${rowNumber}行目: 確認項目キー ${caseKey} が重複しています。`); return; }
      const parsedPriority = priority(getCell(row, caseHeaders, "Priority"));
      if (!parsedPriority) { errors.push(`Cases ${rowNumber}行目: 優先度は高・中・低のいずれかです。`); return; }
      const item: ExcelImportCase = {
        caseKey,
        scenarioKey,
        folderPaths: splitFolderPaths(getCell(row, caseHeaders, "FolderPaths")),
        title,
        objective: getCell(row, caseHeaders, "Objective"),
        preconditions: getCell(row, caseHeaders, "Preconditions"),
        viewLocation: getCell(row, caseHeaders, "ViewLocation"),
        priority: parsedPriority,
        tags: splitTags(getCell(row, caseHeaders, "Tags")),
        data: getCell(row, caseHeaders, "Data"),
        steps: [],
      };
      casesByKey.set(caseKey, item);
      scenario.cases.push(item);
    } catch (error) {
      errors.push(`Cases ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const stepNumbers = new Set<string>();
  stepsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) warnings.push(`Steps ${rowNumber}行目は非表示行です。`);
    try {
      const caseKey = getCell(row, stepHeaders, "CaseKey");
      const action = getCell(row, stepHeaders, "Action");
      const expected = getCell(row, stepHeaders, "Expected");
      if (!caseKey && !action && !expected) return;
      const item = casesByKey.get(caseKey);
      if (!item) { errors.push(`Steps ${rowNumber}行目: 存在しない確認項目キー ${caseKey} です。`); return; }
      const stepNo = Number(getCell(row, stepHeaders, "StepNo"));
      if (!Number.isInteger(stepNo) || stepNo < 1) { errors.push(`Steps ${rowNumber}行目: 手順番号が不正です。`); return; }
      const unique = `${caseKey}:${stepNo}`;
      if (stepNumbers.has(unique)) { errors.push(`Steps ${rowNumber}行目: 確認項目キー ${caseKey} の手順番号 ${stepNo} が重複しています。`); return; }
      if (!action || !expected) { errors.push(`Steps ${rowNumber}行目: 操作と期待結果は必須です。`); return; }
      stepNumbers.add(unique);
      item.steps.push({ stepNo, action, expected });
    } catch (error) {
      errors.push(`Steps ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  if (commonDataSheet && commonDataHeaders) {
    const itemNumbers = new Set<string>();
    commonDataSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.hidden) warnings.push(`CommonData ${rowNumber}行目は非表示行です。`);
      try {
        const scenarioKey = getCell(row, commonDataHeaders, "ScenarioKey");
        const label = getCell(row, commonDataHeaders, "Label");
        if (!scenarioKey && !label) return;
        const scenario = scenariosByKey.get(scenarioKey);
        if (!scenario) { errors.push(`CommonData ${rowNumber}行目: 存在しないテストキー ${scenarioKey} です。`); return; }
        const itemNo = Number(getCell(row, commonDataHeaders, "ItemNo"));
        if (!Number.isInteger(itemNo) || itemNo < 1) { errors.push(`CommonData ${rowNumber}行目: 項目番号が不正です。`); return; }
        if (!label) { errors.push(`CommonData ${rowNumber}行目: 項目名が空です。`); return; }
        const unique = `${scenarioKey}:${itemNo}`;
        if (itemNumbers.has(unique)) { errors.push(`CommonData ${rowNumber}行目: テストキー ${scenarioKey} の項目番号 ${itemNo} が重複しています。`); return; }
        itemNumbers.add(unique);
        scenario.commonDataItems.push({
          itemNo,
          label,
          value: getCell(row, commonDataHeaders, "Value"),
          memo: getCell(row, commonDataHeaders, "Memo"),
        });
      } catch (error) {
        errors.push(`CommonData ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  const warnedFolders = new Set<string>();
  for (const scenario of scenariosByKey.values()) {
    if (!scenario.cases.length) errors.push(`テストキー ${scenario.scenarioKey}: 確認項目がありません。`);
    if (scenario.folderPath) warnedFolders.add(scenario.folderPath);
    scenario.commonDataItems.sort((left, right) => left.itemNo - right.itemNo);
    for (const item of scenario.cases) {
      item.steps.sort((left, right) => left.stepNo - right.stepNo);
      if (!item.steps.length) errors.push(`確認項目キー ${item.caseKey}: 操作手順がありません。`);
      item.folderPaths.forEach((folderPath) => warnedFolders.add(folderPath));
    }
  }
  for (const folderPath of warnedFolders) warnings.push(`フォルダ ${folderPath} が存在しない場合は確定時に作成します。`);

  return { scenarios: [...scenariosByKey.values()], errors, warnings };
}
