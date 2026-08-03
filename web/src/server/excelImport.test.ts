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
  it("builds a current template that restores a scenario, case, steps and data", async () => {
    const filePath = await temporaryFile("template.xlsx");
    await writeFile(filePath, await buildCasesTemplate());

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

  it("rejects the old cases-only template with a migration message", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Cases").addRow(["ケースキー", "タイトル"]);
    workbook.addWorksheet("Steps").addRow(["ケースキー", "手順番号", "操作", "期待結果"]);
    const filePath = await temporaryFile("legacy.xlsx");
    await writeFile(filePath, Buffer.from(await workbook.xlsx.writeBuffer()));

    const parsed = await parseCasesWorkbook(filePath);

    expect(parsed.scenarios).toEqual([]);
    expect(parsed.errors).toContain("Scenariosシートがありません。古い公式テンプレートは現在のテスト設計構造に対応していません。最新版を再ダウンロードしてください。");
  });
});
