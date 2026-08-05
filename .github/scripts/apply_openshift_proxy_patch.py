from pathlib import Path

path = Path("web/src/server/app.ts")
text = path.read_text(encoding="utf-8")
needle = "    bodyLimit: 25 * 1024 * 1024,\n"
replacement = needle + "    trustProxy: config.trustProxy,\n"
if replacement not in text:
    if needle not in text:
        raise SystemExit("Fastify configuration insertion point not found")
    text = text.replace(needle, replacement, 1)
path.write_text(text, encoding="utf-8")
