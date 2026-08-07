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
  "テストキー": "ScenarioKey", "シナリオキー": "ScenarioKey", "ScenarioKey": "ScenarioKey",
  "フォルダパス": "FolderPath", "FolderPath": "FolderPath", "テスト名": "Title", "タイトル": "Title", "Title": "Title",
  "目的": "Objective", "Objective": "Objective", "テスト全体の前提条件": "Preconditions", "前提条件": "Preconditions", "Preconditions": "Preconditions",
  "共通データ名": "CommonDataName", "CommonDataName": "CommonDataName", "共通データ説明": "CommonDataDescription", "CommonDataDescription": "CommonDataDescription",
};
const CASE_HEADERS: HeaderAliases = {
  "テストキー": "ScenarioKey", "シナリオキー": "ScenarioKey", "ScenarioKey": "ScenarioKey",
  "確認項目キー": "CaseKey", "ケースキー": "CaseKey", "ケースID": "CaseKey", "CaseKey": "CaseKey",
  "所属フォルダパス": "FolderPaths", "フォルダパス": "FolderPaths", "FolderPaths": "FolderPaths",
  "確認項目名": "Title", "タイトル": "Title", "Title": "Title", "目的": "Objective", "Objective": "Objective",
  "前提条件": "Preconditions", "Preconditions": "Preconditions", "見る場所": "ViewLocation", "ViewLocation": "ViewLocation",
  "優先度": "Priority", "Priority": "Priority", "タグ": "Tags", "Tags": "Tags", "テストデータ": "Data", "Data": "Data",
};
const STEP_HEADERS: HeaderAliases = {
  "確認項目キー": "CaseKey", "ケースキー": "CaseKey", "ケースID": "CaseKey", "CaseKey": "CaseKey",
  "手順番号": "StepNo", "StepNo": "StepNo", "操作": "Action", "Action": "Action", "期待結果": "Expected", "Expected": "Expected",
};
const COMMON_DATA_HEADERS: HeaderAliases = {
  "テストキー": "ScenarioKey", "シナリオキー": "ScenarioKey", "ScenarioKey": "ScenarioKey",
  "項目番号": "ItemNo", "ItemNo": "ItemNo", "項目名": "Label", "Label": "Label", "値": "Value", "Value": "Value", "メモ": "Memo", "Memo": "Memo",
};
const INPUT_HEADERS: HeaderAliases = {
  "テスト名": "ScenarioTitle", "確認項目名": "CaseTitle", "操作": "Action", "期待結果": "Expected", "優先度": "Priority",
  "見る場所": "ViewLocation", "テストデータ": "Data", "タグ": "Tags", "テストフォルダ": "ScenarioFolder", "確認項目フォルダ": "CaseFolders",
  "テストの目的": "ScenarioObjective", "テスト全体の前提条件": "ScenarioPreconditions", "確認項目の目的": "CaseObjective", "確認項目の前提条件": "CasePreconditions",
};
const FRIENDLY_COMMON_HEADERS: HeaderAliases = {
  "テスト名": "ScenarioTitle", "項目名": "Label", "値": "Value", "メモ": "Memo", "データ名（任意）": "CommonDataName", "説明（任意）": "CommonDataDescription",
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
function optionalCell(row: ExcelJS.Row, headers: Map<string, number>, name: string): string {
  const column = headers.get(name);
  return column ? cellText(row.getCell(column)) : "";
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

function styleFriendlyInput(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  sheet.autoFilter = { from: "A1", to: "N1" };
  const widths = [30, 30, 45, 45, 12, 26, 30, 22, 24, 26, 34, 34, 34, 34];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", wrapText: true };
  for (let column = 1; column <= 4; column += 1) header.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0068A8" } };
  for (let column = 5; column <= 14; column += 1) header.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF526579" } };
  for (let row = 2; row <= 201; row += 1) {
    const priorityCell = sheet.getCell(`E${row}`);
    priorityCell.dataValidation = { type: "list", allowBlank: true, formulae: ['"高,中,低"'] };
    for (let column = 1; column <= 4; column += 1) sheet.getRow(row).getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FBFF" } };
  }
}

export async function buildCasesTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "THE TEST WEB";
  workbook.subject = "テスト設計Excelインポートテンプレート";

  const guide = workbook.addWorksheet("使い方");
  guide.addRows([
    ["THE TEST WEB Excel入力テンプレート"],
    ["最短手順", "1. 「入力」シートのA〜D列へ入力 → 2. 保存 → 3. THE TEST WEBへアップロードして確認 → 4. 追加を確定"],
    ["1行目", "テスト名・確認項目名・操作・期待結果を入力します。優先度などは必要な場合だけ入力します。"],
    ["同じ確認項目の次の手順", "テスト名と確認項目名を空欄にし、操作・期待結果だけ次の行へ入力します。"],
    ["同じテストの次の確認項目", "テスト名を空欄にし、確認項目名・操作・期待結果を入力します。"],
    ["別のテスト", "新しいテスト名を入力した行から自動的に別テストとして扱います。システム用キーは不要です。"],
    ["共通データ", "必要な場合だけ「共通データ」シートへ入力します。同じテストの2行目以降はテスト名を空欄にできます。"],
    ["フォルダ", "階層は / で区切ります。確認項目を複数フォルダへ入れる場合は | で区切ります。"],
    ["注意", "列名とシート名は変更しないでください。数式・結合セルは使用できません。"],
    ["入力例", "ログイン機能の確認 | 正常ログイン | ユーザー名を入力する | 入力値が表示される\n（次行）空欄 | 空欄 | ログインボタンを押す | ダッシュボードが表示される"],
  ]);
  guide.getColumn(1).width = 24;
  guide.getColumn(2).width = 100;
  guide.getRow(1).font = { bold: true, size: 16, color: { argb: "FF17498E" } };
  guide.getRow(1).height = 28;
  guide.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });

  const input = workbook.addWorksheet("入力");
  input.addRow(["テスト名", "確認項目名", "操作", "期待結果", "優先度", "見る場所", "テストデータ", "タグ", "テストフォルダ", "確認項目フォルダ", "テストの目的", "テスト全体の前提条件", "確認項目の目的", "確認項目の前提条件"]);
  styleFriendlyInput(input);
  input.getCell("A1").note = "新しいテストの最初の行だけ入力します。同じテストの続きは空欄で構いません。";
  input.getCell("B1").note = "新しい確認項目の最初の行だけ入力します。同じ確認項目の次の手順では空欄で構いません。";
  input.getCell("C1").note = "操作手順。1行につき1手順です。";
  input.getCell("D1").note = "その操作の期待結果です。";
  input.getCell("E1").note = "空欄の場合は「中」です。";

  const common = workbook.addWorksheet("共通データ");
  common.addRow(["テスト名", "項目名", "値", "メモ", "データ名（任意）", "説明（任意）"]);
  styleDataSheet(common, [30, 28, 42, 32, 28, 40]);
  common.getCell("A1").note = "同じテストの続きは空欄で構いません。";

  const value = await workbook.xlsx.writeBuffer();
  return Buffer.from(value);
}

function parseFriendlyWorkbook(workbook: ExcelJS.Workbook, inputSheet: ExcelJS.Worksheet): ExcelImportParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const commonSheet = workbook.getWorksheet("共通データ");
  for (const sheet of [inputSheet, commonSheet].filter((item): item is ExcelJS.Worksheet => Boolean(item))) {
    if ((sheet.model.merges?.length ?? 0) > 0) errors.push(`${sheet.name}シートで結合セルは使用できません。`);
  }
  const headers = headerMap(inputSheet, INPUT_HEADERS);
  requireHeaders("入力", headers, ["ScenarioTitle", "CaseTitle", "Action", "Expected"], errors);
  if (errors.length) return { scenarios: [], errors, warnings };

  const scenarios: ExcelImportScenario[] = [];
  let currentScenario: ExcelImportScenario | null = null;
  let currentCase: ExcelImportCase | null = null;
  let scenarioNo = 0;
  let caseNo = 0;
  inputSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) warnings.push(`入力 ${rowNumber}行目は非表示行です。`);
    try {
      const scenarioTitle = optionalCell(row, headers, "ScenarioTitle");
      const caseTitle = optionalCell(row, headers, "CaseTitle");
      const action = optionalCell(row, headers, "Action");
      const expected = optionalCell(row, headers, "Expected");
      const optionalValues = ["Priority", "ViewLocation", "Data", "Tags", "ScenarioFolder", "CaseFolders", "ScenarioObjective", "ScenarioPreconditions", "CaseObjective", "CasePreconditions"].map((name) => optionalCell(row, headers, name));
      if (![scenarioTitle, caseTitle, action, expected, ...optionalValues].some(Boolean)) return;

      if (scenarioTitle) {
        scenarioNo += 1;
        currentScenario = {
          scenarioKey: `SCENARIO-${String(scenarioNo).padStart(3, "0")}`,
          folderPath: optionalCell(row, headers, "ScenarioFolder"),
          title: scenarioTitle,
          objective: optionalCell(row, headers, "ScenarioObjective"),
          preconditions: optionalCell(row, headers, "ScenarioPreconditions"),
          commonDataName: "", commonDataDescription: "", cases: [], commonDataItems: [],
        };
        scenarios.push(currentScenario);
        currentCase = null;
      }
      if (!currentScenario) { errors.push(`入力 ${rowNumber}行目: 最初の行にはテスト名を入力してください。`); return; }

      if (caseTitle) {
        caseNo += 1;
        const rawPriority = optionalCell(row, headers, "Priority");
        const parsedPriority = rawPriority ? priority(rawPriority) : "medium";
        if (!parsedPriority) { errors.push(`入力 ${rowNumber}行目: 優先度は高・中・低のいずれか、または空欄にしてください。`); return; }
        currentCase = {
          caseKey: `CASE-${String(caseNo).padStart(3, "0")}`,
          scenarioKey: currentScenario.scenarioKey,
          folderPaths: splitFolderPaths(optionalCell(row, headers, "CaseFolders")),
          title: caseTitle,
          objective: optionalCell(row, headers, "CaseObjective"),
          preconditions: optionalCell(row, headers, "CasePreconditions"),
          viewLocation: optionalCell(row, headers, "ViewLocation"),
          priority: parsedPriority,
          tags: splitTags(optionalCell(row, headers, "Tags")),
          data: optionalCell(row, headers, "Data"),
          steps: [],
        };
        currentScenario.cases.push(currentCase);
      }
      if (!currentCase) { errors.push(`入力 ${rowNumber}行目: テストの最初の手順には確認項目名を入力してください。`); return; }
      if (!action || !expected) { errors.push(`入力 ${rowNumber}行目: 操作と期待結果を入力してください。`); return; }
      currentCase.steps.push({ stepNo: currentCase.steps.length + 1, action, expected });
    } catch (error) {
      errors.push(`入力 ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (!scenarios.length) errors.push("入力シートにテストがありません。");

  if (commonSheet) {
    const commonHeaders = headerMap(commonSheet, FRIENDLY_COMMON_HEADERS);
    requireHeaders("共通データ", commonHeaders, ["ScenarioTitle", "Label", "Value", "Memo"], errors);
    if (errors.length) return { scenarios, errors, warnings };
    let currentTitle = "";
    commonSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.hidden) warnings.push(`共通データ ${rowNumber}行目は非表示行です。`);
      try {
        const title = optionalCell(row, commonHeaders, "ScenarioTitle");
        const label = optionalCell(row, commonHeaders, "Label");
        const value = optionalCell(row, commonHeaders, "Value");
        const memo = optionalCell(row, commonHeaders, "Memo");
        if (![title, label, value, memo].some(Boolean)) return;
        if (title) currentTitle = title;
        if (!currentTitle) { errors.push(`共通データ ${rowNumber}行目: 最初の行にはテスト名を入力してください。`); return; }
        if (!label) { errors.push(`共通データ ${rowNumber}行目: 項目名を入力してください。`); return; }
        const matches = scenarios.filter((scenario) => scenario.title === currentTitle);
        if (matches.length !== 1) {
          errors.push(`共通データ ${rowNumber}行目: テスト名「${currentTitle}」を1件に特定できません。入力シートのテスト名を確認してください。`);
          return;
        }
        const scenario = matches[0]!;
        if (!scenario.commonDataName) scenario.commonDataName = optionalCell(row, commonHeaders, "CommonDataName");
        if (!scenario.commonDataDescription) scenario.commonDataDescription = optionalCell(row, commonHeaders, "CommonDataDescription");
        scenario.commonDataItems.push({ itemNo: scenario.commonDataItems.length + 1, label, value, memo });
      } catch (error) {
        errors.push(`共通データ ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  const warnedFolders = new Set<string>();
  for (const scenario of scenarios) {
    if (!scenario.cases.length) errors.push(`テスト「${scenario.title}」: 確認項目がありません。`);
    if (scenario.folderPath) warnedFolders.add(scenario.folderPath);
    for (const item of scenario.cases) item.folderPaths.forEach((folderPath) => warnedFolders.add(folderPath));
  }
  for (const folderPath of warnedFolders) warnings.push(`フォルダ ${folderPath} が存在しない場合は確定時に作成します。`);
  return { scenarios, errors, warnings };
}

export async function parseCasesWorkbook(filePath: string): Promise<ExcelImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(createReadStream(filePath));
  const friendlyInput = workbook.getWorksheet("入力");
  if (friendlyInput) return parseFriendlyWorkbook(workbook, friendlyInput);

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
        cases: [], commonDataItems: [],
      });
    } catch (error) { errors.push(`Scenarios ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`); }
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
        caseKey, scenarioKey, folderPaths: splitFolderPaths(getCell(row, caseHeaders, "FolderPaths")), title,
        objective: getCell(row, caseHeaders, "Objective"), preconditions: getCell(row, caseHeaders, "Preconditions"),
        viewLocation: getCell(row, caseHeaders, "ViewLocation"), priority: parsedPriority, tags: splitTags(getCell(row, caseHeaders, "Tags")),
        data: getCell(row, caseHeaders, "Data"), steps: [],
      };
      casesByKey.set(caseKey, item); scenario.cases.push(item);
    } catch (error) { errors.push(`Cases ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`); }
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
      stepNumbers.add(unique); item.steps.push({ stepNo, action, expected });
    } catch (error) { errors.push(`Steps ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`); }
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
        scenario.commonDataItems.push({ itemNo, label, value: getCell(row, commonDataHeaders, "Value"), memo: getCell(row, commonDataHeaders, "Memo") });
      } catch (error) { errors.push(`CommonData ${rowNumber}行目: ${error instanceof Error ? error.message : String(error)}`); }
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
