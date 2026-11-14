#!/usr/bin/env python3
"""게임을 HTML 한 파일로 묶는다 → dist/1968-preview.html

서버 없이 파일을 더블클릭해서 열어 볼 때 쓴다(검수·미리보기용). 배포는 폴더 그대로 한다.
사용: python3 tools/build_single.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES = ["engine", "save", "ui", "main"]  # 의존 순서

html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
data = {}
for name in ("meta", "scenes", "scenes.example", "sources"):
    p = ROOT / "data" / f"{name}.json"
    if p.exists():
        data[name] = json.loads(p.read_text(encoding="utf-8"))

# 모듈마다 같은 이름($ 등)을 쓰므로 각각 함수로 감싸고, 내보낸 이름만 밖에 둔다
blocks = []
for m in MODULES:
    src = (ROOT / "js" / f"{m}.js").read_text(encoding="utf-8")
    names = ", ".join(re.findall(r"^export (?:async )?(?:function|class|const) (\w+)", src, flags=re.M))
    src = re.sub(r"^import .*?;\n", "", src, flags=re.M)
    src = re.sub(r"^export ", "", src, flags=re.M)
    blocks.append(f"// ── {m}.js ──\nconst {{ {names} }} = (() => {{\n{src}\nreturn {{ {names} }};\n}})();")

payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
script = f"<script>\nwindow.__DATA__ = {payload};\n(() => {{\n" + "\n".join(blocks) + "\n})();\n</script>"
html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}\n</style>")
html = html.replace('<script type="module" src="js/main.js"></script>', script)

out = ROOT / "dist" / "1968-preview.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"→ {out} ({out.stat().st_size // 1024} KB)")
