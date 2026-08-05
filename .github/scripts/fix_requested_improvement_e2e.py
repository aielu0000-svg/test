from pathlib import Path

path = Path("web/e2e/requested-improvements.spec.ts")
text = path.read_text(encoding="utf-8")
old = '  await expect(page.getByLabel("フォルダ")).toHaveValue(folderId!);'
new = '  await expect(page.locator("label").filter({ hasText: /^フォルダ/ }).locator("select").first()).toHaveValue(folderId!);'
if old not in text:
    raise SystemExit("ambiguous folder selector not found")
path.write_text(text.replace(old, new, 1).rstrip() + "\n", encoding="utf-8")

path = Path("web/src/server/routes/exports.ts")
text = path.read_text(encoding="utf-8-sig")
old = '        evidenceSheet.addImage(imageId, `I${rowNumber}:I${rowNumber}`);'
new = '        evidenceSheet.addImage(imageId, `I${rowNumber}:J${rowNumber + 1}`);'
if old not in text:
    raise SystemExit("zero-area evidence image range not found")
path.write_text(text.replace(old, new, 1).rstrip() + "\n", encoding="utf-8")
