import ExcelJS from "exceljs";

const GRID_COLOR = "FFD0D7E2";
const GRID_SIDE = { style: "thin" as const, color: { argb: GRID_COLOR } };
const GRID_BORDER = { top: GRID_SIDE, left: GRID_SIDE, bottom: GRID_SIDE, right: GRID_SIDE };
const EXAMPLE_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF7E0" } };

const INPUT_EXAMPLE_ROWS: readonly (readonly (string | null)[])[] = [
  [
    "ログイン機能の確認",
    "正常ログイン",
    "ユーザー名とパスワードを入力する",
    "入力値が表示される",
  ],
  [null, null, "ログインボタンを押す", "ダッシュボードが表示される"],
];

const COMMON_EXAMPLE_ROW = [
  "ログイン機能の確認",
  "ベースURL",
  "https://example.test/login",
] as const;

function applyGrid(sheet: ExcelJS.Worksheet, lastColumn: number, lastRow = 201): void {
  for (let row = 1; row <= lastRow; row += 1) {
    for (let column = 1; column <= lastColumn; column += 1) {
      sheet.getRow(row).getCell(column).border = GRID_BORDER;
    }
  }
}

function writeExampleRows(input: ExcelJS.Worksheet, common: ExcelJS.Worksheet): void {
  INPUT_EXAMPLE_ROWS.forEach((values, index) => {
    const row = input.getRow(index + 2);
    row.values = [...values];
    for (let column = 1; column <= 4; column += 1) row.getCell(column).fill = EXAMPLE_FILL;
  });

  const commonRow = common.getRow(2);
  commonRow.values = [...COMMON_EXAMPLE_ROW];
  for (let column = 1; column <= 3; column += 1) commonRow.getCell(column).fill = EXAMPLE_FILL;
}

function pointGuideToExampleRows(guide: ExcelJS.Worksheet): void {
  guide.getCell("A10").value = "記入例";
  guide.getCell("B10").value = "「入力」シート2〜3行目と「共通データ」シート2行目に実際の記入例があります。利用時は記入例を上書きするか削除してからアップロードしてください。";
}

export async function decorateCasesTemplate(buffer: Buffer): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS defines its own buffer input type, which differs structurally from the generic Node Buffer type.
  const excelJsBuffer = buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(excelJsBuffer);
  const guide = workbook.getWorksheet("使い方");
  const input = workbook.getWorksheet("入力");
  const common = workbook.getWorksheet("共通データ");
  if (!guide || !input || !common) throw new Error("公式Excelテンプレートのシート構成が不正です。");

  writeExampleRows(input, common);
  pointGuideToExampleRows(guide);
  applyGrid(input, 4);
  applyGrid(common, 3);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
