# -*- coding: utf-8 -*-
"""把本地 HEAD 推到远端 main（走 GitHub API，不走 git push）。

为什么不用 git push：某些网络环境下 git 到 github.com:443 连不通，只有 api.github.com
可达。本脚本以远端 head 为父提交、按本地 HEAD 的文件逐字节重建 tree，再提交并移动分支。

结果：远端提交的 SHA 与本地不会相同（父提交、时间戳不同），**内容相同**。
判断是否一致要看文件字节：`python tools/check_live.py`。

用法：
    set GITHUB_TOKEN=...        # 需要 repo 权限；不要写进命令行参数或文件
    python tools/push_via_api.py

只读本地 git 对象，不改工作区、不改本地 HEAD。
"""
import base64
import datetime as dt
import json
import os
import subprocess
import urllib.error
import urllib.request

GIT = os.environ.get("GIT_EXE") or "git"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER = os.environ.get("GITHUB_OWNER", "chengyi-mountain")
NAME = os.environ.get("GITHUB_REPO", "taiyi-jinhua")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = "https://api.github.com"

if not TOKEN:
    raise SystemExit("缺 GITHUB_TOKEN 环境变量（需 repo 权限）")


def git(*args, binary=False):
    p = subprocess.run([GIT] + list(args), cwd=REPO, capture_output=True)
    if p.returncode != 0:
        raise SystemExit("git %s: %s" % (" ".join(args), p.stderr.decode("utf-8", "replace")))
    return p.stdout if binary else p.stdout.decode("utf-8")


def call(method, path, payload=None, tries=3):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    last = None
    for _ in range(tries):
        req = urllib.request.Request(API + path, data=data, method=method)
        req.add_header("Authorization", "Bearer " + TOKEN)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("User-Agent", "taiyi-jinhua-push")
        if data:
            req.add_header("Content-Type", "application/json; charset=utf-8")
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read().decode("utf-8")
                return json.loads(body) if body.strip() else {}
        except urllib.error.HTTPError as e:
            raise SystemExit("HTTP %s %s %s -> %s"
                             % (e.code, method, path, e.read().decode("utf-8", "replace")[:400]))
        except Exception as e:  # 网络抖动重试
            last = e
            print("  retry after", type(e).__name__)
    raise SystemExit("network failed: %s" % last)


def iso_to_git(iso):
    d = dt.datetime.fromisoformat(iso)
    off = int(d.utcoffset().total_seconds() // 60)
    sign = "+" if off >= 0 else "-"
    off = abs(off)
    return int(d.timestamp()), "%s%02d%02d" % (sign, off // 60, off % 60)


def main():
    head = git("rev-parse", "HEAD").strip()
    tree = git("rev-parse", "HEAD^{tree}").strip()

    msg = git("log", "-1", "--format=%B").rstrip("\n")
    an = git("log", "-1", "--format=%an").strip()
    ae = git("log", "-1", "--format=%ae").strip()
    ad = git("log", "-1", "--format=%aI").strip()
    cn = git("log", "-1", "--format=%cn").strip()
    ce = git("log", "-1", "--format=%ce").strip()
    cd = git("log", "-1", "--format=%cI").strip()

    remote = call("GET", "/repos/%s/%s/git/ref/heads/main" % (OWNER, NAME))
    rhead = remote["object"]["sha"]
    print("remote head:", rhead[:8], "local head:", head[:8])

    rcommit = call("GET", "/repos/%s/%s/git/commits/%s" % (OWNER, NAME, rhead))
    rtree = call("GET", "/repos/%s/%s/git/trees/%s?recursive=1"
                 % (OWNER, NAME, rcommit["tree"]["sha"]))
    remote_files = {e["path"]: e["sha"] for e in rtree["tree"] if e["type"] == "blob"}

    # core.quotepath=false 必须带：否则 git 会把非 ASCII 路径输出成 "\346\240\241..." 八进制串，
    # 那种串会被当成真文件名建到远端，中文文件名就永远 404。
    entries, uploaded = [], 0
    for line in git("-c", "core.quotepath=false",
                    "ls-tree", "-r", "--full-tree", "HEAD").splitlines():
        meta, path = line.split("\t", 1)
        mode, typ, bsha = meta.split()
        if "\\" in path:
            raise SystemExit("路径里出现反斜杠，疑似转义错名：%r" % path)
        if remote_files.get(path) != bsha:
            content = git("cat-file", "blob", bsha, binary=True)
            b = call("POST", "/repos/%s/%s/git/blobs" % (OWNER, NAME),
                     {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"})
            bsha = b["sha"]
            uploaded += 1
        entries.append({"path": path, "mode": mode, "type": typ, "sha": bsha})
    print("changed files uploaded:", uploaded)

    t = call("POST", "/repos/%s/%s/git/trees" % (OWNER, NAME), {"tree": entries})
    c = call("POST", "/repos/%s/%s/git/commits" % (OWNER, NAME), {
        "message": msg,
        "tree": t["sha"],
        "parents": [rhead],
        "author": {"name": an, "email": ae, "date": ad},
        "committer": {"name": cn, "email": ce, "date": cd},
    })
    print("new commit:", c["sha"][:8])
    call("PATCH", "/repos/%s/%s/git/refs/heads/main" % (OWNER, NAME),
         {"sha": c["sha"], "force": True})
    print("PUSHED", c["sha"])
    print("local tree:", tree)


if __name__ == "__main__":
    main()
