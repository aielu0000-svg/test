import ExcelJS from "exceljs";

const GRID_COLOR = "FFD0D7E2";
const GRID_SIDE = { style: "thin" as const, color: { argb: GRID_COLOR } };
const GRID_BORDER = { top: GRID_SIDE, left: GRID_SIDE, bottom: GRID_SIDE, right: GRID_SIDE };

const INPUT_EXAMPLES = [
  ["テスト名", "ログイン機能の確認", "新しいテストの最初の行だけ入力します。"],
  ["確認項目名", "正常ログイン", "新しい確認項目の最初の行だけ入力します。"],
  ["操作", "ログイン画面を開く", "1行につき1手順を入力します。"],
  ["期待結果", "ユーザー名入力欄とログインボタンが表示される", "同じ行の操作に対する期待結果です。"],
  ["優先度", "高", "高・中・低から選択。空欄は中として扱います。"],
  ["見る場所", "ログイン画面のユーザー名入力欄", "確認時に注目する画面や場所を入力します。"],
  ["テストデータ", "テストユーザー: user001", "この確認項目だけで使うデータを入力します。"],
  ["タグ", "smoke,login", "複数指定はカンマ区切りです。"],
  ["テストフォルダ", "機能/認証", "階層は / で区切ります。"],
  ["確認項目フォルダ", "機能/認証|回帰", "複数フォルダは | で区切ります。"],
  ["テストの目的", "利用者が正常にログインできること", "テスト全体で確認したい目的です。"],
  ["テスト全体の前提条件", "テストユーザーが登録済み", "テスト全体に共通する前提条件です。"],
  ["確認項目の目的", "正常系のログインを確認する", "この確認項目で確認する目的です。"],
  ["確認項目の前提条件", "ログイン画面を表示済み", "この確認項目だけの前提条件です。"],
] as const;

const COMMON_EXAMPLES = [
  ["テスト名", "ログイン機能の確認", "入力シートのテスト名と同じ名前を指定します。"],
  ["項目名", "ベースURL", "共通利用するデータの名前です。"],
  ["値", "https://example.test/login", "共通利用する値です。"],
  ["メモ", "テスト環境", "用途や補足を任意で記入します。"],
  ["データ名（任意）", "ログイン共通データ", "共通データセットの名前です。"],
  ["説明（任意）", "ログイン確認で共通利用", "共通データセットの説明です。"],
] as const;

function applyGrid(sheet: ExcelJS.Worksheet, lastColumn: number, lastRow = 201): void {
  for (let row = 1; row <= lastRow; row += 1) {
    for (let column = 1; column <= lastColumn; column += 1) {
      sheet.getRow(row).getCell(column).border = GRID_BORDER;
    }
  }
}

function addHeaderExamples(sheet: ExcelJS.Worksheet, examples: readonly (readonly [string, string, string])[]): void {
  examples.forEach(([, example, help], index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    const existing = typeof cell.note === "string" ? `${cell.note}\n` : "";
    cell.note = `${existing}記入例: ${example}\n${help}`;
  });
}

function addGuideExamples(guide: ExcelJS.Worksheet): void {
  const startRow = guide.rowCount + 2;
  guide.getCell(startRow, 1).value = "項目別の記入例";
  guide.getCell(startRow, 1).font = { bold: true, size: 14, color: { argb: "FF17498E" } };
  const headerRow = startRow + 1;
  guide.getRow(headerRow).values = ["シート / 項目", "記入例", "補足"];
  guide.getRow(headerRow).font = { bold: true, color: { argb: "FFFFFFFF" } };
  guide.getRow(headerRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF526579" } };
  const rows = [
    ...INPUT_EXAMPLES.map(([field, example, help]) => [`入力 / ${field}`, example, help]),
    ...COMMON_EXAMPLES.map(([field, example, help]) => [`共通データ / ${field}`, example, help]),
  ];
  guide.addRows(rows);
  guide.getColumn(1).width = 32;
  guide.getColumn(2).width = 48;
  guide.getColumn(3).width = 72;
  for (let row = headerRow; row <= headerRow + rows.length; row += 1) {
    guide.getRow(row).alignment = { vertical: "top", wrapText: true };
    for (let column = 1; column <= 3; column += 1) guide.getRow(row).getCell(column).border = GRID_BORDER;
  }
}

export async function decorateCasesTemplate(buffer: Buffer): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS expects Buffer<ArrayBuffer> while Node currently exposes Buffer<ArrayBufferLike>.
  // The runtime representation is the same; this cast keeps the boundary explicit.
  await workbook.xlsx.load(buffer as unknown as Buffer<ArrayBuffer>);
  const guide = workbook.getWorksheet("使い方");
  const input = workbook.getWorksheet("入力");
  const common = workbook.getWorksheet("共通データ");
  if (!guide || !input || !common) throw new Error("公式Excelテンプレートのシート構成が不正です。");

  applyGrid(input, 14);
  applyGrid(common, 6);
  addHeaderExamples(input, INPUT_EXAMPLES);
  addHeaderExamples(common, COMMON_EXAMPLES);
  addGuideExamples(guide);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
