from pathlib import Path

path = Path("web/src/server/routes/exports.ts")
text = path.read_text(encoding="utf-8-sig")
old = '''      try {
        const source = await readFile(String(evidence.stored_path));
        const image = await sharp(source).rotate().resize({ width: 900, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        const imageId = workbook.addImage({ base64: `data:image/png;base64,${image.toString("base64")}`, extension: "png" });
        const rowNumber = row.number;
        evidenceSheet.addImage(imageId, `I${rowNumber}:J${rowNumber + 1}`);
        row.height = 190;
      } catch {
        row.getCell(9).value = "画像の埋め込みに失敗しました。証跡メタデータは保持されています。";
      }
'''
new = '''      try {
        const source = await readFile(String(evidence.stored_path));
        const contentType = String(evidence.content_type ?? "").toLowerCase();
        let image = source;
        let extension: "png" | "jpeg" = contentType === "image/jpeg" ? "jpeg" : "png";
        try {
          image = await sharp(source).rotate().resize({ width: 900, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
          extension = "png";
        } catch (conversionError) {
          if (contentType !== "image/png" && contentType !== "image/jpeg") throw conversionError;
        }
        const imageId = workbook.addImage({ base64: `data:image/${extension};base64,${image.toString("base64")}`, extension });
        const rowNumber = row.number;
        evidenceSheet.addImage(imageId, `I${rowNumber}:J${rowNumber + 1}`);
        row.height = 190;
      } catch {
        row.getCell(9).value = "画像の埋め込みに失敗しました。証跡メタデータは保持されています。";
      }
'''
if old not in text:
    raise SystemExit("evidence image block not found")
path.write_text(text.replace(old, new, 1).rstrip() + "\n", encoding="utf-8")

path = Path("web/e2e/requested-improvements.spec.ts")
text = path.read_text(encoding="utf-8")
old = 'import ExcelJS from "exceljs";\nimport { archiveProject, assertE2EConfiguration, createProject, login, pngBase64, unique } from "./helpers.js";\n'
new = 'import ExcelJS from "exceljs";\nimport sharp from "sharp";\nimport { archiveProject, assertE2EConfiguration, createProject, login, unique } from "./helpers.js";\n'
if old not in text:
    raise SystemExit("E2E imports not found")
text = text.replace(old, new, 1)
old = '''  const runName = `証跡出力実行 ${suffix}`;

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
'''
new = '''  const runName = `証跡出力実行 ${suffix}`;
  const validPng = await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 38, g: 105, b: 189, alpha: 1 } } }).png().toBuffer();

  await page.getByRole("button", { name: "＋ 新規", exact: true }).click();
'''
if old not in text:
    raise SystemExit("E2E run setup not found")
text = text.replace(old, new, 1)
text = text.replace('buffer: Buffer.from(pngBase64, "base64")', 'buffer: validPng')
path.write_text(text.rstrip() + "\n", encoding="utf-8")
