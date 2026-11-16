# -*- coding: utf-8 -*-
"""核验线上站点：把 Pages 上的实际文件与本地逐字节比对，并探一次资源。

用法：python tools/check_live.py
退出码 0 = 全部通过；1 = 有差异或缺资源。
只读，不写任何文件，也不需要 token。
"""
import hashlib
import os
import sys
import urllib.parse
import urllib.request

SITE = "https://chengyi-mountain.github.io/taiyi-jinhua/"
ASSETS = ["index.html", "data/errata.json", "assets/logo.svg",
          "assets/seal-chengyi.svg", "LICENSE", "校记.md", "README.md"]

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "taiyi-jinhua-check-live"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read()


def main():
    ok = True

    print("资源探测")
    for name in ASSETS:
        url = SITE + urllib.parse.quote(name)
        try:
            status, body = fetch(url)
            flag = "OK" if status == 200 else "BAD"
            if status != 200:
                ok = False
            print("  %-6s %-22s %8d bytes" % (flag, name, len(body)))
        except Exception as e:  # noqa: BLE001
            ok = False
            print("  FAIL   %-22s %s: %s" % (name, type(e).__name__, e))

    print("逐字节比对 index.html")
    local_path = os.path.join(root, "index.html")
    with open(local_path, "rb") as f:
        local = f.read()
    try:
        _, live = fetch(SITE + "index.html")
    except Exception as e:  # noqa: BLE001
        print("  拉取失败：%s" % e)
        return 1

    lh = hashlib.sha256(local).hexdigest()
    gh = hashlib.sha256(live).hexdigest()
    print("  local %8d bytes %s" % (len(local), lh[:16]))
    print("  live  %8d bytes %s" % (len(live), gh[:16]))
    if lh == gh:
        print("  identical")
    else:
        ok = False
        print("  DIFFERENT：线上不是这一版，等 Pages 构建完再看，或检查是否漏推")

    # 线上是不是能自洽跑起来：几个必须有、且不依赖外部的特征
    text = live.decode("utf-8", errors="ignore")
    probes = {
        "七视图路由": "var ROUTES=" in text,
        "段码与锚点": 'class="seg-no"' in text and 'id="seg-' in text,
        "站内检索": 'id="qInput"' in text and "function buildIndex" in text,
        "竖排开关": 'id="mVert"' in text,
        "打印样式": "@media print" in text,
        "页脚印章": 'class="site-foot"' in text and "澄一 谨录" in text,
        "无外部脚本": "<script src=" not in text,
        "非医疗声明": "不构成医疗建议" in text,
        "未校影印声明": "清刻影印" in text,
    }
    print("内容特征")
    for label, hit in probes.items():
        print("  %-6s %s" % ("OK" if hit else "MISS", label))
        if not hit:
            ok = False

    print("\n全部通过" if ok else "\n有问题，见上")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
