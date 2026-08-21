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
  it("matches the reference visible columns, colors, dropdown and cell borders", async () => {
    const workbook = await decoratedWorkbook();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["使い方", "入力", "共通データ"]);
    const guide = workbook.getWorksheet("使い方")!;
    const input = workbook.getWorksheet("入力")!;
    const common = workbook.getWorksheet("共通データ")!;

    expect(guide.state).toBe("hidden");
    expect(input.getRow(1).cellCount).toBe(8);
    expect(input.getRow(1).values).toEqual([
      undefined,
      "テスト項目（必須）", "確認項目（必須）", "操作（必須）", "確認観点・期待結果（必須）",
      "対象・確認箇所（任意）", "優先度（任意）", "テストデータ（任意）", "タグ（任意）",
    ]);
    expect(input.getCell("I1").value).toBeNull();
    expect(input.getCell("A1").fill).toMatchObject({ fgColor: { argb: "FF0068A8" } });
    expect(input.getCell("E1").fill).toMatchObject({ fgColor: { argb: "FFB35A00" } });
    expect(input.getCell("F2").dataValidation).toMatchObject({ type: "list", allowBlank: true, formulae: ['"高,中,低"'] });

    expect(common.getRow(1).cellCount).toBe(6);
    expect(common.getRow(1).values).toEqual([
      undefined,
      "テスト項目（必須）", "項目名（必須）", "値（任意）", "メモ（任意）", "データ名（任意）", "説明（任意）",
    ]);
    expect(common.getCell("G1").value).toBeNull();
    expect(common.getCell("A1").fill).toMatchObject({ fgColor: { argb: "FF0068A8" } });
    expect(common.getCell("C1").fill).toMatchObject({ fgColor: { argb: "FFB35A00" } });

    expect(hasThinGrid(input.getCell("A1"))).toBe(true);
    expect(hasThinGrid(input.getCell("H201"))).toBe(true);
    expect(hasThinGrid(input.getCell("I1"))).toBe(false);
    expect(hasThinGrid(common.getCell("A1"))).toBe(true);
    expect(hasThinGrid(common.getCell("F201"))).toBe(true);
    expect(hasThinGrid(common.getCell("G1"))).toBe(false);
  });

  it("writes complete examples into the actual input cells", async () => {
    const workbook = await decoratedWorkbook();
    const guide = workbook.getWorksheet("使い方")!;
    const input = workbook.getWorksheet("入力")!;
    const common = workbook.getWorksheet("共通データ")!;

    expect(input.getCell("A2").value).toBe("ログイン機能の確認");
    expect(input.getCell("B2").value).toBe("正常ログイン");
    expect(input.getCell("C2").value).toBe("ユーザー名とパスワードを入力する");
    expect(input.getCell("D2").value).toBe("入力値が表示される");
    expect(input.getCell("E2").value).toBe("ログイン画面");
    expect(input.getCell("F2").value).toBe("高");
    expect(input.getCell("G2").value).toBe("ユーザー: test-user / パスワード: test-pass");
    expect(input.getCell("H2").value).toBe("smoke, login");
    expect(input.getCell("A3").value).toBeNull();
    expect(input.getCell("B3").value).toBeNull();
    expect(input.getCell("C3").value).toBe("ログインボタンを押す");
    expect(input.getCell("D3").value).toBe("ダッシュボードが表示される");
    expect(input.getCell("E3").value).toBeNull();
    expect(input.getCell("H3").value).toBeNull();

    expect(common.getCell("A2").value).toBe("ログイン機能の確認");
    expect(common.getCell("B2").value).toBe("標準ユーザー");
    expect(common.getCell("C2").value).toBe("test-user");
    expect(common.getCell("D2").value).toBe("通常ログイン用");
    expect(common.getCell("E2").value).toBe("ログイン資格情報");
    expect(common.getCell("F2").value).toBe("正常系ログインで使用");
    expect(guide.getCell("B11").text).toContain("記入例を上書きするか削除");
  });
});
