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
  it("adds visible cell borders to the input areas", async () => {
    const workbook = await decoratedWorkbook();
    const input = workbook.getWorksheet("入力")!;
    const common = workbook.getWorksheet("共通データ")!;

    expect(hasThinGrid(input.getCell("A1"))).toBe(true);
    expect(hasThinGrid(input.getCell("N201"))).toBe(true);
    expect(hasThinGrid(common.getCell("A1"))).toBe(true);
    expect(hasThinGrid(common.getCell("F201"))).toBe(true);
  });

  it("adds examples for every input and common-data field", async () => {
    const workbook = await decoratedWorkbook();
    const guide = workbook.getWorksheet("使い方")!;
    const input = workbook.getWorksheet("入力")!;
    const common = workbook.getWorksheet("共通データ")!;
    const guideText = guide.getSheetValues().flat(2).filter(Boolean).join("\n");

    expect(guideText).toContain("入力 / テスト名");
    expect(guideText).toContain("入力 / 確認項目の前提条件");
    expect(guideText).toContain("共通データ / テスト名");
    expect(guideText).toContain("共通データ / 説明（任意）");
    expect(JSON.stringify(input.getCell("A1").note)).toContain("ログイン機能の確認");
    expect(JSON.stringify(input.getCell("N1").note)).toContain("ログイン画面を表示済み");
    expect(JSON.stringify(common.getCell("F1").note)).toContain("ログイン確認で共通利用");
  });
});
