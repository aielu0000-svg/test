from pathlib import Path

path = Path("web/e2e/requested-improvements.spec.ts")
text = path.read_text(encoding="utf-8")
old = '  await expect(editor.locator("canvas")).toHaveJSProperty("width", 1);\n'
new = '  await expect(editor.locator("canvas")).toHaveJSProperty("width", 32);\n  await expect(editor.locator("canvas")).toHaveJSProperty("height", 24);\n'
if old not in text:
    raise SystemExit("canvas expectation not found")
path.write_text(text.replace(old, new, 1).rstrip() + "\n", encoding="utf-8")
