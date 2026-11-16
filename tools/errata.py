# -*- coding: utf-8 -*-
"""从 校记.md 的异文表生成 data/errata.json。

用法：python tools/errata.py
改 校记.md 的异文表后重跑，不要直接手改 JSON。
"""
import io, json, os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "校记.md")
out = os.path.join(root, "data", "errata.json")

CN = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8,
      "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13}


def main():
    with io.open(src, "r", encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f]

    rows = [l for l in lines if l.startswith("|") and "---" not in l]
    start = None
    for i, l in enumerate(rows):
        if l.replace(" ", "").startswith("|章|本站用字|"):
            start = i + 1
            break
    if start is None:
        raise SystemExit("异文表表头未找到：校记.md 结构变了")

    entries = []
    for l in rows[start:]:
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        note = cells[3] if len(cells) > 3 else ""
        entries.append({
            "chapter": CN.get(cells[0]),
            "chapter_label": cells[0],
            "used": cells[1],
            "variant": cells[2],
            "note": note,
            "affects_meaning": "牵动义解" in note,
        })

    doc = {
        "work": "吕祖太乙金华宗旨",
        "scope": "network-transcription",
        "disclaimer": "本站原文为转录，非校本；本表只记网络通行系统内所见异文，未含清刻影印对照。",
        "source_file": "校记.md",
        "version": 1,
        "updated": "2026-11-16",
        "license": "原文属公有领域；本表整理以 CC BY-SA 4.0 提供，与站内讲解文字同许可。",
        "count": len(entries),
        "entries": entries,
    }

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    with io.open(out, "r", encoding="utf-8") as f:
        back = json.load(f)
    print("errata: %d 条 -> %s" % (back["count"], out))


if __name__ == "__main__":
    main()
