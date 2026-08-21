import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { buildCasesTemplate } from "./excelImport.js";
import { decorateCasesTemplate } from "./excelTemplatePresentation.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function decoratedWorkbook(): Promise<ExcelJS.Workbook> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "the-test-excel-style-"));
  directories.push(directory);
  const filePath = path.join(directory, "template.xlsx");
  await writeFile(filePath, await decorateCasesTemplate(await buildCasesTemplate()));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

function hasThinGrid(cell: ExcelJS.Cell): boolean {
  return [cell.border.top, cell.border.right, cell.border.bottom, cell.border.left]
    .every((side) => side?.style === "thin");
}

describe("Excel template presentation", () => {
  it("keeps the simplified three-sheet template and visible cell borders", async () => {
    const workbook = await decoratedWorkbook();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["使い方", "入力", "共通データ"]);
    const input = workbook.getWorksheet("入力")!;
    const common = workbook.getWorksheet("共通データ")!;

    expect(input.getRow(1).values).not.toContain("テストキー");
    expect(input.getRow(1).values).not.toContain("確認項目キー");
    expect(hasThinGrid(input.getCell("A1"))).toBe(true);
    expect(hasThinGrid(input.getCell("N201"))).toBe(true);
    expect(hasThinGrid(common.getCell("A1"))).toBe(true);
    expect(hasThinGrid(common.getCell("F201"))).toBe(true);
  });

  it("writes examples into the actual input cells", async () => {
    const workbook = await decoratedWorkbook();
    const guide = workbook.getWorksheet("使い方")!;
    const input = workbook.getWorksheet("入力")!;
    const common = workbook.getWorksheet("共通データ")!;

    expect(input.getCell("A2").value).toBe("ログイン機能の確認");
    expect(input.getCell("B2").value).toBe("正常ログイン");
    expect(input.getCell("C2").value).toBe("ユーザー名とパスワードを入力する");
    expect(input.getCell("N2").value).toBe("ログイン画面を表示済み");
    expect(input.getCell("A3").value).toBeNull();
    expect(input.getCell("B3").value).toBeNull();
    expect(input.getCell("C3").value).toBe("ログインボタンを押す");
    expect(input.getCell("D3").value).toBe("ダッシュボードが表示される");
    expect(common.getCell("A2").value).toBe("ログイン機能の確認");
    expect(common.getCell("F2").value).toBe("ログイン確認で共通利用");
    expect(guide.getCell("B10").text).toContain("記入例を上書きするか削除");
  });
});
