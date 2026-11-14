#!/usr/bin/env python3
"""1968_대사작성양식.xlsx → data/scenes.json, data/sources.json

사용:
  python3 tools/xlsx2json.py                      # source/1968_대사작성양식.xlsx 를 변환
  python3 tools/xlsx2json.py 내파일.xlsx           # 다른 파일을 변환
  python3 tools/xlsx2json.py --no-placeholder     # 빈 줄 자리표시 없이(쓴 대사만)
  python3 tools/xlsx2json.py --example            # '예시' 시트를 PA-2 자리에 넣어 변환(검수용)
"""
import argparse
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ["대사_파리", "대사_프라하", "대사_멕시코", "대사_공통"]
TYPES = {
    "자막": "caption", "내레이션": "narration", "대사": "say", "속마음": "thought",
    "사료": "source", "조사": "inspect", "선택": "choice", "결과": "result",
    "이유태그": "reason", "질문": "question", "일기질문": "diary", "연출": "direction",
}
TEXT_TYPES = {"narration", "say", "thought", "result"}
FLAG_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
warnings = []


def warn(row, msg):
    warnings.append(f"{row['sheet']} {row['n']}행 ({row['scene']}): {msg}")


def cell(v):
    return "" if v is None else str(v).strip()


def read_rows(ws, sheet):
    """시트 → (장면 정보, 줄 목록). ■ 행은 장면 정보로 읽고 줄에서는 뺀다."""
    info, rows, scene = {}, [], ""
    for n, r in enumerate(ws.iter_rows(min_row=2, max_col=9, values_only=True), start=2):
        a, _, c, d, e, f, g, h, i = (cell(v) for v in (list(r) + [None] * 9)[:9])
        if a.startswith("■"):
            parts = [p.strip() for p in a.lstrip("■").split("|")]
            m = re.match(r"(\S+)\s+(.*)", parts[0])
            if not m:
                continue
            scene = m.group(1)
            meta = {"title": m.group(2).strip()}
            for p in parts[1:]:
                k, _, v = p.partition(":")
                key = {"목표": "goal", "감정선": "mood", "필수 사실": "facts", "주의": "note"}.get(k.strip())
                if key:
                    meta[key] = [x.strip() for x in v.split(" / ")] if key == "facts" else v.strip()
            info[scene] = meta
            continue
        scene = a or scene  # 행을 삽입하고 A열을 비워 둔 경우 위 장면을 따른다
        if not scene or not any((c, d, e, f, g, h)):
            continue
        rows.append({"sheet": sheet, "n": n, "scene": scene, "kind": c, "speaker": d,
                     "stage": e, "text": f, "cond": g, "flag": h, "memo": i})
    return info, rows


def placeholder(row, type_):
    memo = row["memo"].split(":")[0].strip()
    if type_ == "diary":
        return f"[{row['scene']} 일기 질문 예정]"
    if type_ == "inspect":
        return f"[{row['scene']} 조사 지점 설명 예정]"
    label = memo if memo and len(memo) <= 24 else row["kind"]
    return f"[{row['scene']} {label}: 대사 예정]"


def parse_set(row, value_flags):
    """H열 → ({플래그: 값}, 값 없이 적힌 '값 플래그' 이름)"""
    out, bare = {}, None
    for tok in filter(None, (t.strip() for t in row["flag"].split(","))):
        name, eq, val = (x.strip() for x in tok.partition("="))
        if not FLAG_RE.match(name) or (eq and not val):
            warn(row, f"플래그 문법 오류: '{tok}'")
        elif name not in known_flags:
            warn(row, f"플래그 시트에 없는 플래그: '{name}'")
        elif eq:
            out[name] = val
        elif name in value_flags:
            bare = name
        else:
            out[name] = True
    return out, bare


def parse_cond(row, groups):
    """G열 → 조건 목록. groups = 이 장면에서 지금까지 나온 묶음 선택의 플래그 이름."""
    out = []
    for tok in filter(None, (t.strip() for t in row["cond"].split(","))):
        m = re.match(r"^(선택|질문)\s*=\s*(\S+)$", tok)
        if m and m.group(1) == "질문":
            v = m.group(2).upper()
            if re.match(r"^Q\d$", v):
                out.append({"question": v})
            elif re.match(r"^[A-F]$", v):  # 양식의 X-O 장면은 질문=A/B로 적혀 있다
                out.append({"question": f"Q{ord(v) - 64}"})
            else:
                warn(row, f"조건 문법 오류: '{tok}'")
        elif m:
            v = m.group(2)
            if re.match(r"^[A-Fa-f]$", v):
                out.append({"choice": v.upper()})
            elif groups:  # 선택=간직 처럼 묶음 선택을 가리키는 조건 → 그 선택을 마친 뒤
                out.append({"flag": groups[-1]})
            else:
                warn(row, f"'{tok}'가 가리키는 선택지 묶음이 없음")
        else:
            m = re.match(r"^([A-Z][A-Z0-9_]*)(?:\s*=\s*(\S+)|\s+(없음))?$", tok)
            if not m:
                warn(row, f"조건 문법 오류: '{tok}'")
            elif m.group(1) not in known_flags:
                warn(row, f"플래그 시트에 없는 플래그: '{m.group(1)}'")
            elif m.group(2):
                out.append({"flag": m.group(1), "eq": m.group(2)})
            elif m.group(3):
                out.append({"flag": m.group(1), "not": True})
            else:
                out.append({"flag": m.group(1)})
    return out


def build_scene(sid, rows, meta, src_ids, use_ph):
    typed = []
    for r in rows:
        t = TYPES.get(r["kind"])
        if r["kind"] and not t:
            warn(r, f"모르는 유형: '{r['kind']}'")
            continue
        ph = False
        if not r["text"]:
            if not (use_ph and t):  # 내용이 빈 줄은 무시. 자리표시 모드에서는 유형이 있는 줄만 채운다
                continue
            r = {**r, "text": placeholder(r, t)}
            ph = True
        typed.append((t or ("say" if r["speaker"] else "narration"), r, ph))

    # 질문 줄 사이에 답(질문=Q1 조건) 줄이 끼어 있는 양식 구조 → 질문끼리 한 묶음으로 모은다
    ordered, i = [], 0
    while i < len(typed):
        if typed[i][0] != "question":
            ordered.append(typed[i]); i += 1; continue
        qs, answers = [], []
        while i < len(typed) and (typed[i][0] == "question" or "질문" in typed[i][1]["cond"]):
            (qs if typed[i][0] == "question" else answers).append(typed[i]); i += 1
        ordered += qs + answers

    lines, pending, groups, i = [], [], [], 0
    value_flags = set(meta.get("valueFlags", []))
    spot_meta = meta.get("inspect", {}).get(sid, {})

    def flush():
        lines.extend(pending); pending.clear()

    def add(line, r, ph, conds):
        if conds:
            line["if"] = conds
        if ph:
            line["ph"] = True
        if r["stage"] and line["type"] in ("say", "thought"):
            line["stage"] = r["stage"]
        lines.append(line)

    while i < len(ordered):
        t, r, ph = ordered[i]
        if t in ("choice", "question"):
            opts = []
            while i < len(ordered) and ordered[i][0] == t:
                opts.append(ordered[i][1]); i += 1
            main = []
            for o in opts:
                sets, bare = parse_set(o, value_flags)
                m = re.match(r"^(.*?):\s*(.+ / .+)$", o["text"])
                preset = meta.get("optionSets", {}).get(sid, {}).get(bare or "")
                if t == "choice" and bare and (m or preset):  # 한 줄에 여러 선택지가 묶인 줄
                    items = [x.strip() for x in m.group(2).split(" / ")] if m else preset["items"]
                    keys = preset["keys"] if preset else [chr(65 + k) for k in range(len(items))]
                    pending.append({"type": "choice", "group": bare,
                                    "prompt": m.group(1).strip() if m else o["text"],
                                    "options": [{"key": k, "text": x, "set": {bare: k}} for k, x in zip(keys, items)]})
                    groups.append(bare)
                    continue
                if bare:
                    warn(o, f"'{bare}'는 값이 필요한 플래그 (예: {bare}=A)")
                key = (f"Q{len(main) + 1}" if t == "question" else chr(65 + len(main)))
                opt = {"key": key, "text": o["text"]}
                if sets:
                    opt["set"] = sets
                main.append(opt)
                if t == "choice" and len(o["text"]) > 15:
                    long_choices.append(f"{sid} {key} ({len(o['text'])}자): {o['text']}")
            if main:
                lines.append({"type": t, "options": main})
            continue
        if t == "inspect":
            spots = []
            while i < len(ordered) and ordered[i][0] == "inspect":
                _, s, sph = ordered[i]; i += 1
                names = spot_meta.get("spots", [])
                name = s["stage"] or (names[len(spots)] if len(spots) < len(names) else f"[지점 {len(spots) + 1}]")
                spots.append({"name": name, "text": s["text"], **({"ph": True} if sph else {})})
            for name in spot_meta.get("spots", [])[len(spots):] if all(s.get("ph") for s in spots) else []:
                spots.append({"name": name, "text": f"[{sid} 조사 지점 설명 예정]", "ph": True})
            line = {"type": "inspect", "spots": spots}
            for k in ("layout", "left", "right"):
                if k in spot_meta:
                    line[k] = spot_meta[k]
            lines.append(line)
            continue
        i += 1
        conds = parse_cond(r, groups)
        if t == "reason" or any(c.get("flag") in {p["group"] for p in pending} for c in conds):
            flush()
        if t in TEXT_TYPES:
            line = {"type": t, "text": r["text"]}
            if r["speaker"]:
                line["speaker"] = r["speaker"]
            add(line, r, ph, conds)
            if not ph and len(r["text"]) > 50:
                long_lines.append(f"{sid} {r['sheet']} {r['n']}행 ({len(r['text'])}자): {r['text'][:30]}…")
        elif t == "source":
            if src_ids.get(sid):
                add({"type": "source", "sourceId": src_ids[sid].pop(0)}, r, False, conds)
            else:
                warn(r, "사료목록 시트에 이 장면의 사료가 (더) 없음 → 내용 열을 그대로 카드에 표시")
                add({"type": "source", "inline": r["text"]}, r, False, conds)
        elif t == "reason":
            add({"type": "reason", "tags": [x.strip() for x in r["text"].split("/") if x.strip()]}, r, False, conds)
        else:  # caption, diary, direction
            add({"type": t, "text": r["text"]}, r, ph, conds)
    flush()
    return lines


def main():
    global known_flags, long_lines, long_choices
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx", nargs="?", default=str(ROOT / "source" / "1968_대사작성양식.xlsx"))
    ap.add_argument("--out", default=str(ROOT / "data"))
    ap.add_argument("--no-placeholder", action="store_true", help="빈 줄에 자리표시 문구를 넣지 않는다")
    ap.add_argument("--example", action="store_true", help="'예시' 시트 줄로 PA-2를 바꿔 scenes.example.json 을 만든다")
    args = ap.parse_args()

    meta = json.loads((ROOT / "data" / "meta.json").read_text(encoding="utf-8"))
    wb = openpyxl.load_workbook(args.xlsx, data_only=True)
    known_flags = {cell(r[0]) for r in wb["플래그"].iter_rows(min_row=2, values_only=True) if r[0]}
    long_lines, long_choices = [], []

    sources, src_ids = {}, {}
    for r in wb["사료목록"].iter_rows(min_row=2, max_col=7, values_only=True):
        num, sid, cand, ok, cite, text, desc = (cell(v) for v in r)
        if not num:
            continue
        key = f"S{int(float(num)):02d}"
        sources[key] = {"scene": sid, "candidate": cand, "verified": ok.upper() == "O",
                        "cite": cite, "text": text, "desc": desc}
        src_ids.setdefault(sid, []).append(key)

    info, by_scene, order = {}, {}, []
    for sheet in SHEETS:
        if sheet not in wb.sheetnames:
            warnings.append(f"시트 없음: {sheet}")
            continue
        i, rows = read_rows(wb[sheet], sheet)
        info.update(i)
        order += [s for s in i if s not in order]
        for r in rows:
            by_scene.setdefault(r["scene"], []).append(r)
    if args.example:
        _, rows = read_rows(wb["예시"], "예시")
        for sid in {r["scene"] for r in rows}:
            by_scene[sid] = [r for r in rows if r["scene"] == sid]

    scenes = {}
    for sid in order:
        city = sid.split("-")[0]
        kind = "common" if city == "FR" else "interview" if sid[-1] in "IO" else "scene"
        lines = build_scene(sid, by_scene.get(sid, []), meta, src_ids, not args.no_placeholder)
        scenes[sid] = {"id": sid, "city": city, "kind": kind, "bg": sid, **info[sid], "lines": lines}
    for sid in by_scene:
        if sid not in scenes:
            warnings.append(f"장면 정보(■ 행)가 없는 장면ID: {sid}")

    out = Path(args.out)
    name = "scenes.example.json" if args.example else "scenes.json"
    (out / name).write_text(json.dumps({"order": order, "scenes": scenes}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=1), encoding="utf-8")

    def written(s):
        return sum(1 for l in s["lines"] if l["type"] in TEXT_TYPES | {"diary"} and not l.get("ph")) + \
            sum(1 for l in s["lines"] if l["type"] == "inspect" for sp in l["spots"] if not sp.get("ph"))

    print(f"→ {out / name}, {out / 'sources.json'}")
    print(f"\n장면 {len(scenes)}개, 사료 {len(sources)}개")
    print("\n[장면별 줄 수] 전체(그중 선생님이 쓴 대사)")
    print("  " + "  ".join(f"{sid} {len(s['lines'])}({written(s)})" for sid, s in scenes.items()))
    empty = [sid for sid, s in scenes.items() if not written(s)]
    print(f"\n[대사가 아직 없는 장면] {len(empty)}개: {' '.join(empty) or '없음'}")
    for title, items in (("조건·플래그 경고", warnings), ("50자 넘는 대사창", long_lines), ("15자 넘는 선택지", long_choices)):
        print(f"\n[{title}] {len(items)}건")
        for x in items:
            print("  - " + x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
