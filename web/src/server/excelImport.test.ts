import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { buildCasesTemplate, parseCasesWorkbook } from "./excelImport.js";

const directories: string[] = [];

async function temporaryFile(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "the-test-excel-"));
  directories.push(directory);
  return path.join(directory, name);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Excel test design import", () => {
  it("builds a human-oriented template and infers keys from sequential input", async () => {
    const filePath = await temporaryFile("template.xlsx");
    await writeFile(filePath, await buildCasesTemplate());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["使い方", "入力", "共通データ"]);
    const input = workbook.getWorksheet("入力")!;
    expect(input.getRow(1).values).not.toContain("テストキー");
    expect(input.getRow(1).values).not.toContain("確認項目キー");
    input.getRow(2).values = [
      "ログイン機能の確認", "正常ログイン", "ユーザー名とパスワードを入力する", "入力値が表示される", "高", "ログイン画面",
      "ユーザー: test-user", "smoke,login", "機能/ログイン", "機能/ログイン|回帰", "利用者がログインできること", "テストユーザーが登録済み", "正常系を確認", "ログイン画面を表示済み",
    ];
    input.getRow(3).values = ["", "", "ログインボタンを押す", "ダッシュボードが表示される"];
    const common = workbook.getWorksheet("共通データ")!;
    common.getRow(2).values = ["ログイン機能の確認", "共通URL", "https://example.test/login", "テスト環境", "ログイン共通データ", "ログイン確認で共通利用"];
    await workbook.xlsx.writeFile(filePath);

    const parsed = await parseCasesWorkbook(filePath);

    expect(parsed.errors).toEqual([]);
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0]).toMatchObject({
      scenarioKey: "SCENARIO-001",
      folderPath: "機能/ログイン",
      title: "ログイン機能の確認",
      commonDataName: "ログイン共通データ",
      commonDataItems: [{ itemNo: 1, label: "共通URL", value: "https://example.test/login", memo: "テスト環境" }],
      cases: [{
        caseKey: "CASE-001",
        scenarioKey: "SCENARIO-001",
        folderPaths: ["機能/ログイン", "回帰"],
        title: "正常ログイン",
        data: "ユーザー: test-user",
        priority: "high",
        tags: ["smoke", "login"],
        steps: [
          { stepNo: 1, action: "ユーザー名とパスワードを入力する", expected: "入力値が表示される" },
          { stepNo: 2, action: "ログインボタンを押す", expected: "ダッシュボードが表示される" },
        ],
      }],
    });
  });

  it("keeps accepting the current keyed workbook format for compatibility", async () => {
    const workbook = new ExcelJS.Workbook();
    const scenarios = workbook.addWorksheet("Scenarios");
    scenarios.addRow(["テストキー", "フォルダパス", "テスト名", "目的", "テスト全体の前提条件", "共通データ名", "共通データ説明"]);
    scenarios.addRow(["S-1", "", "互換テスト", "", "", "", ""]);
    const cases = workbook.addWorksheet("Cases");
    cases.addRow(["テストキー", "確認項目キー", "所属フォルダパス", "確認項目名", "目的", "前提条件", "見る場所", "優先度", "タグ", "テストデータ"]);
    cases.addRow(["S-1", "C-1", "", "互換ケース", "", "", "", "中", "", ""]);
    const steps = workbook.addWorksheet("Steps");
    steps.addRow(["確認項目キー", "手順番号", "操作", "期待結果"]);
    steps.addRow(["C-1", 1, "開く", "表示される"]);
    const filePath = await temporaryFile("keyed.xlsx");
    await workbook.xlsx.writeFile(filePath);

    const parsed = await parseCasesWorkbook(filePath);
    expect(parsed.errors).toEqual([]);
    expect(parsed.scenarios[0]?.title).toBe("互換テスト");
  });

  it("rejects the old cases-only template with a migration message", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Cases").addRow(["ケースキー", "タイトル"]);
    workbook.addWorksheet("Steps").addRow(["ケースキー", "手順番号", "操作", "期待結果"]);
    const filePath = await temporaryFile("legacy.xlsx");
    await workbook.xlsx.writeFile(filePath);

    const parsed = await parseCasesWorkbook(filePath);

    expect(parsed.scenarios).toEqual([]);
    expect(parsed.errors).toContain("Scenariosシートがありません。古い公式テンプレートは現在のテスト設計構造に対応していません。最新版を再ダウンロードしてください。");
  });
});
